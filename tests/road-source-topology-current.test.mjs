import assert from 'node:assert/strict';
import test from 'node:test';
import {publishedRoadSourceTopology} from '../app/js/world/road-source-topology.js';
import {sanitizeWorldPathPoints} from '../app/js/world/world-geometry.js';
import {detectRoadIntersections} from '../app/js/terrain/intersections.js';

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
