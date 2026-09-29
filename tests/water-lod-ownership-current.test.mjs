import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFarWaterGeometry, publishedWaterDetailAreas } from '../app/js/terrain/far-field-water.js';

globalThis.THREE = THREE;
const context = { geoToWorld: (lat, lon) => ({ x: lon, z: lat }), WORLD_UNITS_PER_METER: 1 };
const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const square = (r) => [[-r,-r],[r,-r],[r,r],[-r,r],[-r,-r]];
function build(outer, holes = [], exclusion = bounds) {
  return buildFarWaterGeometry(context, { waterAreas: [{ identity: 'river', outer, holes, surfaceMeters: 1100 }] }, exclusion);
}
function surfaceArea(geometry) {
  const p = geometry.attributes.position, indices = geometry.index.array;
  let area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a,b,c] = indices.slice(i,i+3);
    area += Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a)) - (p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))) / 2;
  }
  return area;
}
function waterAt(geometry, x, z) {
  const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const hits = new THREE.Raycaster(new THREE.Vector3(x,2000,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh);
  material.dispose();
  return hits.length > 0;
}
test('regional river cannot publish a second surface anywhere over the detailed world', () => {
  const {geometry} = build(square(100));
  for (let x = -19.5; x < 20; x += 3) for (let z = -19.5; z < 20; z += 3) {
    assert.equal(waterAt(geometry,x,z),false,`unexpected ceiling at ${x},${z}`);
  }
  for (const [x,z] of [[-70,0],[70,0],[0,-70],[0,70]]) assert.equal(waterAt(geometry,x,z),true);
  assert.equal(surfaceArea(geometry),40000-1600,'clipping must retain every square metre outside the detailed world');
  geometry.dispose();
});
test('regional water clipping retains islands and concave shorelines', () => {
  const outer = [[-100,-100],[100,-100],[100,100],[40,100],[40,40],[-100,40],[-100,-100]];
  const hole = [[50,-50],[70,-50],[70,-30],[50,-30],[50,-50]];
  const {geometry} = build(outer,[hole]);
  assert.equal(waterAt(geometry,60,-40),false,'island stays dry');
  assert.equal(waterAt(geometry,0,70),false,'concavity stays dry');
  assert.equal(waterAt(geometry,80,70),true);
  assert.equal(surfaceArea(geometry),40000-140*60-400-1600);
  geometry.dispose();
});
test('fully detailed polygons are not published; absent detail retains regional fallback', () => {
  assert.equal(build(square(10)),null);
  assert.equal(build(square(20)),null,'exact boundary must not leave degenerate sheets');
  const {geometry,publishedAreaIdentities} = build(square(10),[],null);
  assert.equal(waterAt(geometry,0,0),true);
  assert.equal(surfaceArea(geometry),400);
  assert.deepEqual([...publishedAreaIdentities],['river']);
  geometry.dispose();
});

test('distant water fills unowned parts of the terrain rectangle without overlapping published water',()=>{
 const near={pts:[{x:-20,z:-20},{x:0,z:-20},{x:0,z:20},{x:-20,z:20}],holes:[],bounds:{minX:-20,maxX:0,minZ:-20,maxZ:20}};
 const {geometry}=buildFarWaterGeometry(context,{waterAreas:[{identity:'river',outer:square(100),surfaceMeters:1100}]},null,{detailedAreas:[near]});
 assert.equal(waterAt(geometry,-10,0),false,'actual detailed water remains the only surface');
 assert.equal(waterAt(geometry,10,0),true,'terrain coverage is not evidence that detailed water exists');
 assert.equal(surfaceArea(geometry),40000-800);
 geometry.dispose();
});
test('detailed islands are not refilled by a coarser regional water polygon',()=>{
 const near={pts:square(20).map(([x,z])=>({x,z})),holes:[square(5).map(([x,z])=>({x,z}))],bounds};
 const {geometry}=buildFarWaterGeometry(context,{waterAreas:[{identity:'river',outer:square(100),surfaceMeters:1100}]},null,{detailedAreas:[near]});
 assert.equal(waterAt(geometry,10,0),false);assert.equal(waterAt(geometry,0,0),false);
 assert.equal(surfaceArea(geometry),40000-1600);geometry.dispose();
});

test('a published sloping river ribbon excludes a coarse water ceiling over its exact triangles',()=>{
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-4,20,-90,4,20,-90,-4,8,90,4,8,90],3));
 geometry.setIndex([0,1,2,1,3,2]);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.userData.waterwayRef={structureSemantics:{terrainMode:'at_grade'}};
 const detailedAreas=publishedWaterDetailAreas({waterAreas:[],landuseMeshes:[mesh]});assert.equal(detailedAreas.length,2);
 const built=buildFarWaterGeometry(context,{waterAreas:[{identity:'river',outer:square(100),surfaceMeters:1100}]},null,{detailedAreas});
 for(const z of [-80,0,80]){assert.equal(waterAt(built.geometry,0,z),false);assert.equal(waterAt(built.geometry,6,z),true);}
 for(let i=0;i<built.geometry.attributes.normal.count;i++)assert.equal(built.geometry.attributes.normal.getY(i),1);
 built.geometry.dispose();geometry.dispose();mesh.material.dispose();
});
