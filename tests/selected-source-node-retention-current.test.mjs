import assert from 'node:assert/strict';
import test from 'node:test';
import {adaptSelectedLocationSource} from '../app/js/world/compiler/selected-location-source-adapter.js';
function fixture(){
 const nodes=Object.fromEntries(Array.from({length:20000},(_,i)=>[i+1,{type:'node',id:i+1,lat:51.5,lon:-.1+(i%100)*.00001}]));
 nodes[7].tags={highway:'traffic_signals'};nodes[8].tags={amenity:'waste_basket'};
 return {nodes,location:{lat:51.5,lon:-.1},selection:{roadWays:[{type:'way',id:1,nodes:[1,2,3],tags:{highway:'residential'}}],treeRowWays:[{type:'way',id:2,nodes:[4,5],tags:{natural:'tree_row'}}],poiNodes:[nodes[6]]}};
}
test('selected district normalization does not duplicate nodes belonging only to discarded provider ways',()=>{
 const f=fixture(),r=adaptSelectedLocationSource(f);
 assert.equal(Object.keys(r.selection.nodes).length,8);
 assert.equal(r.diagnostics.districtSource.nodeCount,8);
 assert.equal(Object.keys(f.nodes).length,20000,'raw provider input remains untouched');
});
test('retention preserves selected topology, point features, tree rows and mapped street furniture',()=>{
 const r=adaptSelectedLocationSource(fixture());
 assert.deepEqual(r.selection.roadWays[0].nodes,['1','2','3']);
 assert.deepEqual(r.selection.treeRowWays[0].nodes,['4','5']);
 assert.equal(r.selection.poiNodes[0].id,'6');
 assert.equal(r.selection.nodes['7'].tags.highway,'traffic_signals');
 assert.equal(r.selection.nodes['8'].tags.amenity,'waste_basket');
 for(const id of ['1','2','3','4','5','6'])assert.ok(r.selection.nodes[id]);
});
test('retention still rejects a missing node referenced by selected geometry',()=>{
 const f=fixture();delete f.nodes[2];assert.throws(()=>adaptSelectedLocationSource(f),/missing nodes: 2/);
});
