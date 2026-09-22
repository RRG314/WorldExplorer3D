import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFarWaterGeometry } from '../app/js/terrain/far-field-water.js';

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
