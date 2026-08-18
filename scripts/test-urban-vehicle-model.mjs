import assert from 'node:assert/strict';
import {
  parkedVehicleAnchors,
  stableVehicleDefinition,
  vehicleDoorPosition,
  vehicleExitCandidates
} from '../app/js/urban-sandbox/vehicle-model.js';

const edges = Array.from({ length: 10 }, (_, index) => ({
  p1: { x: 12 + index * 12, y: 4, z: -8 },
  p2: { x: 12 + index * 12, y: 4, z: 20 },
  length: 28,
  width: 7,
  roadClass: index === 9 ? 'motorway' : 'residential'
}));
const graph = { edges };

const first = parkedVehicleAnchors(graph, { x: 0, z: 0 }, {
  count: 4,
  minDistance: 10,
  maxDistance: 100,
  worldIdentity: 'baltimore-test'
});
const second = parkedVehicleAnchors(graph, { x: 0, z: 0 }, {
  count: 4,
  minDistance: 10,
  maxDistance: 100,
  worldIdentity: 'baltimore-test'
});

assert.equal(first.length, 4);
assert.deepEqual(first, second, 'parked vehicle identities and poses are not deterministic');
assert.equal(new Set(first.map((vehicle) => vehicle.id)).size, first.length);
assert.ok(first.every((vehicle) => !/motorway/.test(edges[vehicle.edgeIndex].roadClass)));
assert.ok(first.every((vehicle, index) => first.every((other, otherIndex) => (
  index === otherIndex || Math.hypot(vehicle.x - other.x, vehicle.z - other.z) >= 8
))));

const definition = stableVehicleDefinition('baltimore-test', 3, 1);
assert.deepEqual(definition, stableVehicleDefinition('baltimore-test', 3, 1));
assert.ok(definition.id.startsWith('urban-vehicle:'));
assert.ok(definition.variant.width > 1.5 && definition.variant.length > 3.5);

const vehicle = first[0];
const door = vehicleDoorPosition(vehicle);
assert.ok(Math.hypot(door.x - vehicle.x, door.z - vehicle.z) > vehicle.variant.width * 0.45);
const exits = vehicleExitCandidates(vehicle);
assert.equal(exits.length, 2);
assert.equal(exits[0].side, -exits[1].side);
assert.ok(exits.every((exit) => Math.hypot(exit.x - vehicle.x, exit.z - vehicle.z) > vehicle.variant.width * 0.5));

console.log(JSON.stringify({
  ok: true,
  vehicles: first.map((vehicle) => ({ id: vehicle.id, style: vehicle.variant.bodyStyle, x: vehicle.x, z: vehicle.z })),
  exitCandidates: exits
}, null, 2));
