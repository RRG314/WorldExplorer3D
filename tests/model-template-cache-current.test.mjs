import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createModelTemplateCache, modelTemplateResources} from '../app/js/assets/model-template-cache.js';
function template() {
 const root=new THREE.Group(), texture=new THREE.Texture({width:1024,height:1024});
 const material=new THREE.MeshStandardMaterial({map:texture}), geometry=new THREE.BoxGeometry();
 root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
 const disposed={geometry:0,material:0,texture:0};
 for(const [name,object] of Object.entries({geometry,material,texture}))object.addEventListener('dispose',()=>disposed[name]++);
 return {root,disposed};
}
test('concurrent acquisitions share one decode and eviction waits for the final instance',async()=>{
 const cache=createModelTemplateCache({idleByteLimit:0}),value=template();let loads=0,resolve;
 const pending=new Promise(r=>resolve=r),load=()=>{loads++;return pending;};
 const a=cache.acquire('ship',load),b=cache.acquire('ship',load);resolve(value);
 const [one,two]=await Promise.all([a,b]);assert.equal(loads,1);
 one.release();one.release();assert.deepEqual(value.disposed,{geometry:0,material:0,texture:0});
 assert.equal(cache.snapshot().entries[0].leases,1);
 two.release();assert.deepEqual(value.disposed,{geometry:1,material:1,texture:1});
 assert.equal(cache.snapshot().entries.length,0);
});
test('idle budget evicts the least recently released template and retains active assets',async()=>{
 const first=template(),second=template(),third=template();
 const size=modelTemplateResources(first.root).bytes;
 const cache=createModelTemplateCache({idleByteLimit:size});
 const a=await cache.acquire('active',()=>first),b=await cache.acquire('old',()=>second);
 b.release();const c=await cache.acquire('recent',()=>third);c.release();
 assert.equal(second.disposed.texture,1);assert.equal(first.disposed.texture,0);assert.equal(third.disposed.texture,0);
 assert.deepEqual(cache.snapshot().entries.map(e=>e.id),['active','recent']);
 a.release();assert.equal(third.disposed.texture,1);assert.equal(first.disposed.texture,0);
});
test('failed decodes can retry without stale leases or failed cache entries',async()=>{
 const cache=createModelTemplateCache({idleByteLimit:0});
 await assert.rejects(cache.acquire('bad',()=>Promise.reject(Error('network'))),/network/);
 assert.equal(cache.snapshot().entries.length,0);
 const value=template(),lease=await cache.acquire('bad',()=>value);
 lease.release();assert.equal(value.disposed.texture,1);
});

test('derived vegetation keeps borrowed textures alive after the source instance releases',async()=>{
 const cache=createModelTemplateCache({idleByteLimit:0}),value=template();
 const source=await cache.acquire('tree',()=>value),derived=source.retain();
 source.release();assert.equal(value.disposed.texture,0);
 assert.throws(()=>source.retain(),/released/);
 derived.release();assert.equal(value.disposed.texture,1);
});
