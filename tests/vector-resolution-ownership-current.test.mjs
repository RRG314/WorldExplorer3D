import test from 'node:test';
import assert from 'node:assert/strict';
import {findCoveredCoarseRoadIds,retireCoveredRegionalRoads} from '../app/js/world/vector-resolution-ownership.js';
const road=(id,points,level=14,key='bridge',directed=false)=>({id,points:points.map(([x,z])=>({x,z})),level,key,directed});
test('complete higher-resolution continuation owns one physical road including quantized seams',()=>{
 const primary=[road('a',[[0,.4],[50,.4]]),road('b',[[50,-.4],[100,-.4]])];
 assert.deepEqual([...findCoveredCoarseRoadIds(primary,[road('coarse',[[0,0],[100,0]],13)])],['coarse']);
});
test('an uncovered tail, interior source gap, differing level/access or parallel carriageway never disappears',()=>{
 const primary=[road('a',[[0,0],[100,0]])];
 for(const other of [road('x',[[0,0],[105,0]],13),road('x',[[0,2],[100,2]],13),road('x',[[0,0],[100,0]],13,'tunnel'),road('x',[[0,0],[100,0]],14)])assert.equal(findCoveredCoarseRoadIds(primary,[other]).size,0);
 assert.equal(findCoveredCoarseRoadIds([road('a',[[0,0],[40,0]]),road('b',[[45,0],[100,0]])],[road('x',[[0,0],[100,0]],13)]).size,0);
});
test('direction is preserved and mere endpoint agreement cannot erase an excursion',()=>{
 const primary=[road('a',[[0,0],[100,0]],14,'bridge',true)];
 assert.equal(findCoveredCoarseRoadIds(primary,[road('x',[[100,0],[0,0]],13,'bridge',true)]).size,0);
 assert.equal(findCoveredCoarseRoadIds(primary,[road('x',[[0,0],[50,5],[100,0]],13)]).size,0);
});
test('source adapter retires only proved redundant generalized road records and their unused geometry',()=>{
 const node=(id,lon)=>({type:'node',id,lat:0,lon});
 const way=(id,z,tags={})=>({type:'way',id,nodes:[1,2],vectorRoadTile:{z},tags:{highway:'primary',bridge:'yes',_sourceCompleteness:'generalized',...tags}});
 const primary=[node(1,0),node(2,.001),way(3,14)];
 const building={type:'way',id:7,nodes:[1,2],tags:{building:'yes'}};
 const regional=[node(1,0),node(2,.001),way(3,13),building];
 const result=retireCoveredRegionalRoads(primary,regional);
 assert.equal(result.retiredRoadCount,1);assert.ok(result.elements.includes(building));assert.equal(result.elements.filter(e=>e.type==='node').length,2);
 assert.equal(retireCoveredRegionalRoads(primary,[node(1,0),node(2,.001),way(3,13,{access:'private'})]).retiredRoadCount,0);
 const directed=[node(1,0),node(2,.001),way(3,14,{oneway:'yes'})];
 assert.equal(retireCoveredRegionalRoads(directed,regional).retiredRoadCount,1,'z13 missing direction is not a competing two-way road');
 assert.equal(retireCoveredRegionalRoads(directed,[node(1,0),node(2,.001),way(3,13,{oneway:'no'})]).retiredRoadCount,0);
 assert.equal(retireCoveredRegionalRoads(directed,[node(1,0),way(3,13)]).retiredRoadCount,0,'incomplete input cannot prove coverage');
});
