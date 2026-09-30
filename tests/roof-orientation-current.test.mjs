import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMappedRoofMesh, resolveMappedRoof} from '../app/js/world/mapped-roof-geometry.js';
globalThis.THREE = THREE;
const points = [{x:-6,z:-4},{x:6,z:-4},{x:6,z:4},{x:-6,z:4}];
function roof(shape, extra = {}) {
  const tags = {building:'house', 'roof:shape':shape, 'roof:height':2, ...extra};
  const spec = resolveMappedRoof(tags, 7, null, points);
  const mesh = createMappedRoofMesh(points, 0, spec.wallHeight, spec, tags);
  mesh.updateMatrixWorld();
  return mesh;
}
function heightAt(mesh, x, z) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0,-1,0));
  return ray.intersectObject(mesh)[0]?.point.y;
}
function dispose(mesh) {mesh.geometry.dispose(); mesh.material.dispose();}
test('mapped runoff compass and degree bearings orient the same gable', () => {
  for (const [bearing, value] of [['N',0],['E',90],['SW',225],['NNW',337.5]]) {
    const named = roof('gabled', {'roof:direction':bearing});
    const numeric = roof('gabled', {'roof:direction':value});
    assert.deepEqual(named.geometry.attributes.position.array, numeric.geometry.attributes.position.array);
    if (bearing === 'N') assert.ok(heightAt(named, 3, 0) > heightAt(named, 0, 3));
    if (bearing === 'E') assert.ok(heightAt(named, 0, 3) > heightAt(named, 3, 0));
    dispose(named); dispose(numeric);
  }
});
test('across rotates a ridge and an explicit runoff bearing takes precedence', () => {
  const along = roof('gabled');
  const across = roof('gabled', {'roof:orientation':'across'});
  assert.equal(heightAt(along, 3, 0), 7);
  assert.equal(heightAt(across, 0, 3), 7);
  assert.ok(heightAt(across, 3, 0) < 7);
  const direction = roof('gabled', {'roof:direction':'N','roof:orientation':'across'});
  assert.equal(heightAt(direction, 3, 0), 7);
  for(const mesh of [along,across,direction]) dispose(mesh);
});
test('single-slope roofs drain toward the mapped direction and close raised walls', () => {
  const north = roof('skillion', {'roof:direction':'N'});
  assert.ok(heightAt(north, 0, -3) < heightAt(north, 0, 3));
  for(const [origin, direction] of [
    [[0,6,8],[0,0,-1]], [[8,5.8,2],[-1,0,0]], [[-8,5.8,2],[1,0,0]]
  ]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
    assert.ok(ray.intersectObject(north).length, 'raised roof perimeter must be closed');
  }
  const south = roof('skillion', {'roof:direction':'S'});
  assert.ok(heightAt(south, 0, 3) < heightAt(south, 0, -3));
  dispose(north); dispose(south);
});
test('mapped height and named colour survive inference of a missing roof shape', () => {
  const spec = resolveMappedRoof({building:'dwelling_house','roof:height':1}, 7, null, points);
  assert.equal(spec.roofHeight,1);
  assert.equal(spec.wallHeight,6);
  assert.equal(spec.roofHeightSource,'mapped');
  const mesh = roof('gabled', {'roof:colour':'red'});
  assert.equal(mesh.material.color.getHex(),0xff0000);
  dispose(mesh);
});
