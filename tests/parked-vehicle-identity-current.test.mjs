import test from 'node:test';
import assert from 'node:assert/strict';
import { parkedVehicleAnchors } from '../app/js/urban-sandbox/vehicle-model.js';

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
