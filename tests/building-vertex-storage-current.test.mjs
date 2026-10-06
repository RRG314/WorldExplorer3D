import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {compactBuildingVertices} from '../app/js/world/building-vertex-storage.js';
function fixture(){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,1,1,0,0,1,0,0,0,0,1,1,0,1],3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:6},()=>[0,1,0]).flat(),3));
 g.setAttribute('facadeOpening',new THREE.Float32BufferAttribute(Array.from({length:6},()=>[.2,.3,2.05,-1]).flat(),4));
 g.setIndex([0,1,2,3,4,5]);return g;
}
const expanded=g=>Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>{const bits=new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length);return [name,Array.from(g.index.array).flatMap(i=>Array.from(bits.slice(i*a.itemSize,(i+1)*a.itemSize)))];}));
test('building storage preserves every triangle attribute bit and editing boundaries',()=>{
 const g=fixture(),before=expanded(g),stats=compactBuildingVertices(g,[{start:0,count:6}]);
 assert.equal(stats.afterVertices,4);assert.ok(stats.savedBytes>0);assert.deepEqual(expanded(g),before);g.dispose();
 const adjacent=fixture();compactBuildingVertices(adjacent,[{start:0,count:3},{start:3,count:3}]);
 assert.equal(adjacent.attributes.position.count,6);
 const first=new Set(adjacent.index.array.slice(0,3));assert.ok([...adjacent.index.array.slice(3)].every(i=>!first.has(i)));adjacent.dispose();
});
test('facade differences and signed zero are never welded away',()=>{
 const g=fixture();g.attributes.facadeOpening.setX(3,.4);g.attributes.position.setY(4,-0);
 const before=expanded(g);compactBuildingVertices(g,[{start:0,count:6}]);
 assert.equal(g.attributes.position.count,6);assert.deepEqual(expanded(g),before);g.dispose();
});

test('only an exclusively owned unpublished batch releases replaced attributes',()=>{
 for(const consumeSource of [false,true]){
  const g=fixture(),before=expanded(g),old=[...Object.values(g.attributes).map(a=>a.array.buffer),g.index.array.buffer];
  compactBuildingVertices(g,[{start:0,count:6}],{consumeSource});
  assert.deepEqual(expanded(g),before);
  assert.ok(old.every(buffer=>(buffer.byteLength===0)===consumeSource));
  assert.ok([...Object.values(g.attributes),g.index].every(a=>a.array.byteLength>0));
  g.dispose();
 }
 const untouched=fixture(),arrays=Object.values(untouched.attributes).map(a=>a.array);
 compactBuildingVertices(untouched,[{start:0,count:3},{start:3,count:3}],{consumeSource:true});
 assert.ok(arrays.every(a=>a.byteLength>0),'no replacement must keep all original attributes');
 untouched.dispose();
});

test('large compacted batches retain their adopted 32-bit index scratch buffer',()=>{
 const g=new THREE.BufferGeometry(),count=66000,positions=new Float32Array(count*3);
 for(let i=0;i<count-3;i++)positions[i*3]=i;
 positions.set(positions.subarray(0,9),(count-3)*3);
 g.setAttribute('position',new THREE.BufferAttribute(positions,3));
 g.setIndex(new THREE.BufferAttribute(Uint32Array.from({length:count},(_,i)=>i),1));
 const before=expanded(g);
 const result=compactBuildingVertices(g,[{start:0,count}],{consumeSource:true});
 assert.equal(result.afterVertices,count-3);assert.ok(g.index.array instanceof Uint32Array);
 assert.equal(g.index.array.byteLength,count*4);assert.deepEqual(expanded(g),before);
 g.dispose();
});
