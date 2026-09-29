import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadOwnedLandmarkModel,retireReplacedHistoricVisuals} from '../app/js/world/landmark-lifetime.js';

test('aborted landmark completion releases its model and shared texture once',async()=>{
 let complete;class Loader{load(url,done){complete=done;return {};}}
 const controller=new AbortController();
 const pending=loadOwnedLandmarkModel({...THREE,GLTFLoader:Loader},'model.glb',controller.signal);
 controller.abort();await assert.rejects(pending,{name:'AbortError'});
 const texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture}),geometry=new THREE.BoxGeometry();
 const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
 const counts=[0,0,0];[geometry,material,texture].forEach((v,i)=>v.addEventListener('dispose',()=>counts[i]++));
 complete({scene:root});assert.deepEqual(counts,[1,1,1]);
});
test('replacement retires only matching historic visuals and preserves nearby walls and buildings',()=>{
 const scene=new THREE.Scene();
 const make=(kind,x)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.userData={landmarkKind:kind,footprint:[{x,z:0},{x:x+1,z:0},{x,z:1}]};scene.add(mesh);return mesh;};
 const pyramid=make('pyramid',0),wall=make('wall',0),distant=make('pyramid',300),building=make('building',0);
 const ctx={historicMarkers:[pyramid,wall,distant],buildingMeshes:[building],buildingColliders:[{sourceBuildingId:'pyramid'}]};
 assert.equal(retireReplacedHistoricVisuals(ctx,{builder:'measured-khufu-pyramid',hideRadiusMeters:126},{x:0,z:0}),1);
 assert.equal(pyramid.parent,null);assert.deepEqual(ctx.historicMarkers,[wall,distant]);
 assert.equal(building.visible,true);assert.equal(wall.parent,scene);assert.equal(ctx.buildingColliders.length,1);
 assert.equal(retireReplacedHistoricVisuals(ctx,{builder:'measured-khufu-pyramid',hideRadiusMeters:126},{x:0,z:0}),0);
});
