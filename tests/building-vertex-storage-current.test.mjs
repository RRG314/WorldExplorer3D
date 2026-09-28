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
