import test from 'node:test';
import assert from 'node:assert/strict';
import { parkedVehicleAnchors, sweptVehicleFootprintContact } from '../app/js/urban-sandbox/vehicle-model.js';
import { VEHICLE_CATALOG } from '../app/js/engine/vehicle-catalog.js';

const edge = (name, x, z = 0) => ({
  id: `traffic:${name}:0:forward:0`, sourceFeatureId: name,
  sourceSegIndex: 0, sourceTStart: 0, sourceTEnd: 1, direction: 'forward',
  p1: { x, y: 0, z: z - 8 }, p2: { x, y: 0, z: z + 8 }, length: 16,
  roadClass: 'residential', roadWidth: 12, laneOffset: 2,
  curbNormalX: 1, curbNormalZ: 0
});
const options = { worldIdentity: 'same-shared-world', count: 3, minDistance: 8, maxDistance: 80 };
const anchors = (edges, extra = {}, reference = { x: 0, z: 0 }) =>
  parkedVehicleAnchors({ edges }, reference, { ...options, ...extra });
const visibleIdentity = vehicle => ({
  id: vehicle.id, catalogId: vehicle.variant.id, color: vehicle.color,
  x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw
});

test('a shared parked car keeps its identity when another client orders road edges differently', () => {
  const first = edge('osm:road:A', 20), second = edge('osm:road:B', 40);
  const a = anchors([first, second]);
  const b = anchors([second, first]);
  assert.equal(a.length, 2);
  assert.deepEqual(a.map(visibleIdentity), b.map(visibleIdentity));
});

test('filtering an unrelated parked car does not change another car model, ID or curb pose', () => {
  const first = edge('osm:road:A', 20), second = edge('osm:road:B', 40);
  const all = anchors([first, second]);
  const filtered = anchors([first, second], { isBlocked: x => x < 30 });
  assert.equal(filtered.length, 1);
  assert.deepEqual(visibleIdentity(all[1]), visibleIdentity(filtered[0]));
});

test('opposite lanes and separate source spans have distinct parked-car identities', () => {
  const first = edge('osm:road:A', 20);
  const reverse = { ...first, direction: 'reverse', p1: first.p2, p2: first.p1, curbNormalX: -1 };
  const otherSpan = { ...first, p1: { ...first.p1, z: 30 }, p2: { ...first.p2, z: 46 }, sourceTStart: .4, sourceTEnd: .8 };
  const ids = [first, reverse, otherSpan].map(e => anchors([e])[0].id);
  assert.equal(new Set(ids).size, 3);
});

test('parking never overlaps a passing vehicle even when it clears the lane centerline', () => {
  // Actual London/Baltimore diagnostic geometry: the old check accepted a
  // compact whose inner edge was only 2 cm beyond the traffic centerline.
  const narrow = { ...edge('narrow-road', 20), roadWidth: 7.117117117117117, laneOffset: 1.708108108108108 };
  for (let seed = 0; seed < 32; seed++) {
    assert.equal(anchors([narrow], { worldIdentity: `world-${seed}` }).length, 0);
  }
});

test('parking chooses a fitting car and reserves the full traffic envelope plus clearance', () => {
  const limited = { ...edge('limited-curb', 20), roadWidth: 11.3, laneOffset: 2.25 };
  const trafficHalfWidth = Math.max(...VEHICLE_CATALOG.map(variant => variant.width)) / 2;
  for (let seed = 0; seed < 32; seed++) {
    const result = anchors([limited], { worldIdentity: `world-${seed}` });
    assert.equal(result.length, 1, 'A fitting compact must not disappear because a wider car was randomly chosen first');
    const car = result[0];
    assert.equal(car.variant.id, 'compact');
    assert.ok(car.curbOffset - car.variant.width / 2 >= car.laneOffset + trafficHalfWidth + .25 - 1e-9);
    assert.ok(car.curbOffset + car.variant.width / 2 <= car.roadHalfWidth - .18 + 1e-9);
  }
});


test('vehicle collision covers the overhang, rotated sides and high-speed sweeps', () => {
  const target = { kind: 'vehicle', x: 0, z: 0, yaw: 0, ref: { variant: { width: 1.78, length: 4.45 } } };
  // This path misses the old width-only circle but intersects the visible body.
  assert.ok(sweptVehicleFootprintContact({ x: -3, z: 1.8 }, { x: 3, z: 1.8 }, target));
  assert.ok(sweptVehicleFootprintContact({ x: 0, z: -20 }, { x: 0, z: 20 }, target));
  assert.equal(sweptVehicleFootprintContact({ x: -3, z: 3 }, { x: 3, z: 3 }, target), null);
  target.yaw = Math.PI / 2;
  assert.ok(sweptVehicleFootprintContact({ x: 1.8, z: -3 }, { x: 1.8, z: 3 }, target));
  assert.equal(sweptVehicleFootprintContact({ x: 3, z: -3 }, { x: 3, z: 3 }, target), null);
});

test('vehicle collision permits overlap escape and tangent sliding but rejects deeper entry', () => {
  const target = { kind: 'vehicle', x: 0, z: 0, yaw: 0, ref: { variant: { width: 2, length: 5 } } };
  assert.equal(sweptVehicleFootprintContact({ x: -1.2, z: 0 }, { x: -1.4, z: 0 }, target), null);
  assert.ok(sweptVehicleFootprintContact({ x: -1.2, z: 0 }, { x: -.8, z: 0 }, target));
  assert.equal(sweptVehicleFootprintContact({ x: -1.31, z: 0 }, { x: -1.31, z: 1 }, target), null);
  assert.equal(sweptVehicleFootprintContact({ x: -3, z: 0 }, { x: 3, z: 0 }, { ...target, kind: 'npc' }), undefined);
});
