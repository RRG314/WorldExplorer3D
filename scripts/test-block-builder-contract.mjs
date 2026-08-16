import assert from 'node:assert/strict';
import {
  BLOCK_LIMIT_PER_LOCATION,
  BLOCK_MATERIALS,
  BLOCK_SHAPES,
  blockDocumentIdFromCoords,
  getBlockShapeSurface,
  normalizeBlockMaterial,
  normalizeBlockRotation,
  normalizeBlockShape,
  normalizeBlockVerticalGrid
} from '../app/js/block-builder/catalog.js';
import { createBuildCollisionQueries } from '../app/js/block-builder/collision.js';
import { createSharedBlockSync } from '../app/js/block-builder/shared-sync.js';

assert.equal(BLOCK_LIMIT_PER_LOCATION, 200, 'builder must allow 200 blocks per location');
assert.deepEqual(BLOCK_SHAPES.map((shape) => shape.id), ['cube', 'slab', 'ramp', 'column']);
assert.equal(new Set(BLOCK_MATERIALS.map((material) => material.color)).size, BLOCK_MATERIALS.length);
assert.equal(normalizeBlockShape(undefined), 'cube', 'old records must default to cube');
assert.equal(normalizeBlockShape('unknown'), 'cube');
assert.equal(normalizeBlockRotation(-1), 3);
assert.equal(normalizeBlockRotation(5), 1);
assert.equal(normalizeBlockMaterial(999), BLOCK_MATERIALS.length - 1);
assert.equal(normalizeBlockVerticalGrid(2.26), 2.5);
assert.equal(blockDocumentIdFromCoords(10, 2.5, 4), '10_2.5_4');
assert.notEqual(blockDocumentIdFromCoords(10, 2.5, 4), blockDocumentIdFromCoords(10, 3, 4));

const sharedSync = createSharedBlockSync({
  blockKey: (gx, gy, gz) => `${gx}|${gy}|${gz}`,
  onRefresh: () => {},
  toVerticalGridCoord: normalizeBlockVerticalGrid
});
const sharedHalfBlock = sharedSync.normalizeEntry({ gx: 10, gy: 2.5, gz: 4, shape: 'slab', rotation: 1 });
assert.equal(sharedHalfBlock.id, '10_2.5_4');
assert.equal(sharedHalfBlock.gy, 2.5);

const rampLow = getBlockShapeSurface('ramp', 0, 0, 0, 0, 0, -0.49);
const rampHigh = getBlockShapeSurface('ramp', 0, 0, 0, 0, 0, 0.49);
const rampRotatedHigh = getBlockShapeSurface('ramp', 1, 0, 0, 0, 0.49, 0);
assert.ok(rampLow && rampHigh && rampHigh.topY > rampLow.topY);
assert.ok(rampRotatedHigh && rampRotatedHigh.topY > 0.45, 'rotation must rotate the ramp rise direction');
assert.equal(getBlockShapeSurface('column', 0, 0, 0, 0, 0.49, 0), null);

const blockKey = (gx, gy, gz) => `${gx}|${gy}|${gz}`;
const columnKey = (gx, gz) => `${gx}|${gz}`;
const buildBlocks = new Map();
const buildColumns = new Map();
const addBlock = (gx, gy, gz, shape = 'cube', rotation = 0) => {
  buildBlocks.set(blockKey(gx, gy, gz), { userData: { shape, rotation } });
  const key = columnKey(gx, gz);
  if (!buildColumns.has(key)) buildColumns.set(key, new Set());
  buildColumns.get(key).add(gy);
};
const queries = createBuildCollisionQueries({
  blockKey,
  buildBlocks,
  buildColumns,
  columnKey,
  toGridCoord: Math.round,
  toWorldCoord: (value) => value
});

for (const [index, shape] of BLOCK_SHAPES.map((entry) => entry.id).entries()) {
  buildBlocks.clear();
  buildColumns.clear();
  const gx = index * 3;
  addBlock(gx, 0, 0, shape, 0);
  const baseTop = queries.getBuildTopSurfaceAtWorldXZ(gx, 0);
  assert.ok(Number.isFinite(baseTop), `${shape} must expose a walkable top surface`);
  const stackedCenterY = normalizeBlockVerticalGrid(baseTop + 0.5);
  addBlock(gx, stackedCenterY, 0, 'cube', 0);
  assert.equal(
    queries.getBuildTopSurfaceAtWorldXZ(gx, 0),
    stackedCenterY + 0.5,
    `${shape} must accept a directly stacked block on its center surface`
  );
}

buildBlocks.clear();
buildColumns.clear();
addBlock(0, 0, 0, 'cube');
assert.equal(queries.getBuildTopSurfaceAtWorldXZ(0, 0), 0.5);
assert.equal(queries.getBuildCollisionAtWorldXZ(0, 0, -0.5, 0.3, 1.9).blocked, true);
assert.equal(queries.getBuildVehicleContact(-6, 0, 6, 0, -0.5, Math.PI / 2).blocked, true,
  'swept car collision must not skip a one-meter cube');

buildBlocks.clear();
buildColumns.clear();
addBlock(0, 0, 0, 'ramp');
const rampContact = queries.getBuildVehicleContact(0, -0.45, 0, 0.45, -0.5, 0);
assert.equal(rampContact.blocked, false, 'ramps must be driveable');
assert.ok(Number.isFinite(rampContact.supportTopY));
assert.ok(queries.getBuildVehicleSurfaceAtWorldXZ(0, 0.4, -0.1) > 0.35);

console.log(JSON.stringify({
  ok: true,
  blockLimit: BLOCK_LIMIT_PER_LOCATION,
  shapes: BLOCK_SHAPES.length,
  colors: BLOCK_MATERIALS.length,
  sweptCubeCollision: true,
  rampDriveable: true,
  legacyShapeDefault: normalizeBlockShape(undefined)
}, null, 2));
