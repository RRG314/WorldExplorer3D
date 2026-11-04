import test from 'node:test';
import assert from 'node:assert/strict';
import {appendRoadCenterMarkings} from '../app/js/terrain/rebuild.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {roadMarkingJunctionClearance,markingSpansOutsideJunctions} from '../app/js/terrain/road-marking-clearance.js';
import {normalizeTransportSource} from '../app/js/world/compiler/transport-source-normalizer.js?v=4';
const area=vertices=>{let total=0;for(let i=0;i<vertices.length;i+=9)total+=Math.abs((vertices[i+3]-vertices[i])*(vertices[i+8]-vertices[i+2])-(vertices[i+5]-vertices[i+2])*(vertices[i+6]-vertices[i]))/2;return total;};
function heightAt(vertices,x,z){
 for(let i=0;i<vertices.length;i+=9){
  const ax=vertices[i],az=vertices[i+2],bx=vertices[i+3],bz=vertices[i+5],cx=vertices[i+6],cz=vertices[i+8];
  const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
  const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)return u*vertices[i+1]+v*vertices[i+4]+(1-u-v)*vertices[i+7];
 }return null;
}
test('ordinary two-lane city streets retain paint at their physical width without painting narrow single-track roads', () => {
  for (const metersPerWorldUnit of [1, 1.11, 2]) {
    const road = {
      type: 'secondary',
      width: 6.9 / metersPerWorldUnit,
      metersPerWorldUnit,
      transportRecord: { crossSection: { lanes: 2 } },
      structureSemantics: { terrainMode: 'at_grade' },
    };
    const points = [
      { x: 0, z: 0 },
      { x: 40, z: 0 },
    ];
    const vertices = [],
      indices = [];
    appendRoadCenterMarkings(road, points, vertices, indices, null, (x) => 3 + x * 0.05);
    assert.ok(indices.length > 0, 'an admitted 6.9 m street has its center paint');
    for (let i = 0; i < vertices.length; i += 3) {
      assert.ok(Math.abs(vertices[i + 2]) <= 0.151);
      assert.ok(Math.abs(vertices[i + 1] - (3 + vertices[i] * 0.05 + 0.012)) < 1e-9);
    }
    for (const rejected of [
      { ...road, width: 4 / metersPerWorldUnit },
      { ...road, transportRecord: { crossSection: { lanes: 1 } } },
      { ...road, structureSemantics: { terrainMode: 'elevated' } },
    ]) {
      const skipped = [];
      appendRoadCenterMarkings(rejected, points, skipped, [], null, () => 3);
      assert.equal(skipped.length, 0);
    }
  }
});
test('city paint clears the published intersection rather than drawing a fork across it', () => {
  const branch = {
    pts: [
      { x: 30, z: -20 },
      { x: 30, z: 20 },
    ],
    width: 6,
    driveable: true,
  };
  const road = {
    type: 'secondary',
    width: 6.9,
    pts: [
      { x: 0, z: 0 },
      { x: 60, z: 0 },
    ],
    transportRecord: { crossSection: { lanes: 2 } },
    transportGraphRef: { stations: [{ nodeId: 'join', segmentIndex: 0, distanceAlong: 30 }] },
    transportConnections: [
      { graphConnectionId: 'join', segmentIndex: 0, distanceAlong: 20, feature: branch },
    ],
  };
  const intervals = roadMarkingJunctionClearance(road);
  assert.deepEqual(
    intervals,
    [[23.05, 36.95]],
    'clearance uses this road station, not the branch distance'
  );
  assert.equal(
    roadMarkingJunctionClearance(road),
    intervals,
    'regions borrow one cached numeric projection'
  );
  assert.deepEqual(markingSpansOutsideJunctions(20, 40, intervals), [
    [20, 23.05],
    [36.95, 40],
  ]);
  const vertices = [],
    indices = [];
  appendRoadCenterMarkings(road, road.pts, vertices, indices, null, () => 3);
  assert.ok(indices.length > 0);
  for (let i = 0; i < vertices.length; i += 3)
    assert.ok(vertices[i] <= 23.05 || vertices[i] >= 36.95);
  branch.structureSemantics = { terrainMode: 'elevated', layer: 1 };
  road.transportGraphRef = { ...road.transportGraphRef };
  assert.deepEqual(
    roadMarkingJunctionClearance(road),
    [],
    'another deck never clears ground paint'
  );
  branch.structureSemantics = { terrainMode: 'at_grade' };
  branch.pts = [
    { x: 30, z: 0 },
    { x: 80, z: 0 },
  ];
  road.transportGraphRef = { ...road.transportGraphRef };
  assert.deepEqual(
    roadMarkingJunctionClearance(road),
    [],
    'straight source continuations keep their paint'
  );
});
test('major one-way streets keep their road-class lane estimate without overriding source lane counts', () => {
  for (const highway of ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']) {
    for (const oneway of ['yes', '-1']) {
      const record = normalizeTransportSource({ id: 1 }, { highway, oneway });
      assert.equal(record.crossSection.lanes, 2);
      assert.equal(record.crossSection.lanesSource, 'fallback:road-class');
      assert.equal(record.crossSection.inferredLanes, true);
      assert.equal(record.direction, oneway === '-1' ? 'reverse' : 'forward');
      assert.ok(record.crossSection.widthMeters >= 6);
      const explicit = normalizeTransportSource({ id: 1 }, { highway, oneway, lanes: '1' });
      assert.equal(explicit.crossSection.lanes, 1);
      assert.equal(explicit.crossSection.lanesSource, 'source:lanes');
    }
  }
  for (const highway of ['service', 'residential', 'secondary_link'])
    assert.equal(
      normalizeTransportSource({ id: 1 }, { highway, oneway: 'yes' }).crossSection.lanes,
      1
    );
  assert.equal(
    normalizeTransportSource({ id: 1 }, { highway: 'secondary', junction: 'roundabout' })
      .crossSection.lanes,
    1
  );
  for (const tags of [
    { highway: 'secondary', oneway: 'yes', width: '3.8' },
    { highway: 'primary', oneway: 'yes', width: '7.9', 'parking:both': 'lane' },
  ])
    assert.equal(
      normalizeTransportSource({ id: 1 }, tags).crossSection.lanes,
      1,
      'measured usable width bounds a lane estimate'
    );
});
test('whole dashes retain coverage, winding and support height across a fold and an unsupported gap',()=>{
 const positions=[],indices=[],height=x=>.05*x+Math.max(0,x-14)*.15;
 for(const [a,b]of [[0,8],[12,14],[14,30]]){
  const base=positions.length/3;positions.push(a,height(a),-6,a,height(a),6,b,height(b),-6,b,height(b),6);indices.push(base,base+1,base+2,base+2,base+1,base+3);
 }
 const index=createRoadContactIndex([{geometry:{attributes:{position:{array:new Float32Array(positions)}},getIndex:()=>({array:indices})},userData:{terrainMode:'at_grade'}}]);
 try{
  const road={type:'primary',width:12},points=[{x:-2,z:0},{x:32,z:0}],old=[],next=[];
  const legacy={projectTriangle:index.projectTriangle};
  appendRoadCenterMarkings(road,points,old,[],null,(x,z)=>index.sampleAt(x,z),legacy);
  appendRoadCenterMarkings(road,points,next,[],null,(x,z)=>index.sampleAt(x,z),index);
  assert.ok(next.length<old.length,'remove only redundant internal triangulation');
  assert.ok(Math.abs(area(next)-4.2)<1e-7);assert.ok(Math.abs(area(old)-area(next))<1e-7);
  for(let x=-2;x<=32;x+=.137)for(const z of [-.151,-.149,0,.149,.151]){
   const a=heightAt(old,x,z),b=heightAt(next,x,z);assert.equal(a===null,b===null,`coverage at ${x},${z}`);
   if(a!==null)assert.ok(Math.abs(a-b)<1e-7);
  }
  for(let i=0;i<next.length;i+=9){
   const x=(next[i]+next[i+3]+next[i+6])/3,z=(next[i+2]+next[i+5]+next[i+8])/3,y=(next[i+1]+next[i+4]+next[i+7])/3;
   assert.ok(Math.abs(y-index.sampleAt(x,z)-.012)<1e-7);
   assert.ok((next[i+3]-next[i])*(next[i+8]-next[i+2])-(next[i+5]-next[i+2])*(next[i+6]-next[i])<0,'all triangles face upward');
  }
  assert.equal(index.projectPolygon([{x:0,z:0},{x:1,z:0},{x:1,z:1},{x:0,z:1}],.012,'elevated').length,0);
 }finally{index.dispose();}
});
