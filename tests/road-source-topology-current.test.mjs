import assert from 'node:assert/strict';
import test from 'node:test';
import {publishedRoadSourceTopology} from '../app/js/world/road-source-topology.js';
import {sanitizeWorldPathPoints} from '../app/js/world/world-geometry.js';
import {detectRoadIntersections,createAtGradeIntersectionLookup} from '../app/js/terrain/intersections.js';

test('clipped source nodes cannot create junctions outside published road geometry', () => {
  const makeRoad = (prefix,z) => {
    const raw=[{x:0,z},{x:10,z},{x:33,z:0}];
    const records=[{id:prefix+'0'},{id:prefix+'1'},{id:'outside-shared'}];
    const pts=sanitizeWorldPathPoints(raw,{maxDistanceFromOrigin:32});
    const retained=publishedRoadSourceTopology(records,raw,pts);
    const rawTopology=records.map((r,i)=>({...r,...raw[i]}));
    return {pts,width:4,structureSemantics:{terrainMode:'at_grade'},retained,rawTopology};
  };
  const roads=[makeRoad('a',0),makeRoad('b',10)];
  const withTopology = (road,nodes) => ({...road,sourceTopologyNodes:nodes,sourceNodeIds:nodes.map(n=>n.id)});
  assert.ok(detectRoadIntersections(roads.map(r=>withTopology(r,r.rawTopology))).some(p=>p.x===33));
  assert.equal(detectRoadIntersections(roads.map(r=>withTopology(r,r.retained))).length,0);
  assert.deepEqual(roads[0].retained.map(n=>n.id),['a0','a1']);
});
test('subdivision keeps canonical identities without inventing IDs for inserted vertices', () => {
  const raw=[{x:0,z:0},{x:40,z:0}],records=[{id:'start'},{id:'end'}];
  const pts=sanitizeWorldPathPoints(raw,{maxSegmentLength:12});
  assert.ok(pts.length>raw.length);
  const topology=publishedRoadSourceTopology(records,raw,pts);
  assert.deepEqual(topology,[{id:'start',x:0,z:0},{id:'end',x:40,z:0}]);
  assert.ok(Object.isFrozen(topology)&&Object.isFrozen(topology[0]));
});

test('spatial junction lookup preserves first-match identity across boundaries, moves and grade changes',()=>{
 const rows=[{x:4.1,z:0,hasGradeSeparatedRoad:false},{x:3.9,z:0,hasGradeSeparatedRoad:false},{x:-4.1,z:-4.1,hasGradeSeparatedRoad:true}];
 const lookup=createAtGradeIntersectionLookup(rows);
 assert.equal(lookup.find(4,0),rows[0],'Insertion order wins over bucket traversal or nearest distance');
 rows[0].hasGradeSeparatedRoad=true;
 assert.equal(lookup.find(4,0),rows[1]);
 rows[1].x=-4.2;rows[1].z=-4;lookup.update(rows[1]);
 assert.equal(lookup.find(4,0),null);assert.equal(lookup.find(-4,-4),rows[1]);
 rows[2].hasGradeSeparatedRoad=false;
 assert.equal(lookup.find(-4,-4),rows[1]);
 const added={x:8,z:8,hasGradeSeparatedRoad:false};lookup.update(added);
 assert.equal(lookup.find(8,8),added);assert.equal(lookup.find(9.200001,8),null);
});

test('spatial junction lookup matches exhaustive results on a deterministic regional workload',()=>{
 let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const rows=Array.from({length:5000},()=>({x:random()*1000-500,z:random()*1000-500,hasGradeSeparatedRoad:random()<.2}));
 const lookup=createAtGradeIntersectionLookup(rows);
 for(let i=0;i<1000;i++){
  const anchor=rows[i*5],x=anchor.x+random()*2-1,z=anchor.z+random()*2-1;
  const expected=rows.find(row=>!row.hasGradeSeparatedRoad&&Math.hypot(row.x-x,row.z-z)<=1.2)||null;
  assert.equal(lookup.find(x,z),expected);
 }
});
