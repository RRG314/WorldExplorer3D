import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PEDESTRIAN_ARCHETYPES, POPULATION_BUDGET_BY_TIER, POPULATION_VISIBILITY_POLICY } from '../app/js/living-world/population.js';
import {
  NPC_VEHICLE_CATALOG,
  selectNpcVehicleVariant
} from '../app/js/living-world/vehicle-catalog.js';

assert.deepEqual(NPC_VEHICLE_CATALOG.map((entry) => entry.id), [
  'compact', 'sedan', 'suv', 'pickup', 'van', 'delivery_van', 'taxi', 'box_truck', 'city_bus'
]);
assert.ok(NPC_VEHICLE_CATALOG.every((entry) => entry.width > 0 && entry.length > 0 && entry.weight > 0));
assert.ok(POPULATION_BUDGET_BY_TIER.low.vehicles < POPULATION_BUDGET_BY_TIER.balanced.vehicles);
assert.ok(POPULATION_BUDGET_BY_TIER.performance.pedestrians < POPULATION_BUDGET_BY_TIER.quality.pedestrians);
assert.ok(PEDESTRIAN_ARCHETYPES.length >= 10, 'ambient character variety regressed');
assert.ok(POPULATION_VISIBILITY_POLICY.exitDistance > POPULATION_VISIBILITY_POLICY.enterDistance, 'population visibility needs distance hysteresis');
assert.ok(POPULATION_VISIBILITY_POLICY.fadeInPerSecond > 0 && POPULATION_VISIBILITY_POLICY.fadeOutPerSecond > 0);
assert.ok(NPC_VEHICLE_CATALOG.every((entry) => entry.bodyStyle && entry.wheelRadius > 0), 'vehicle visual profiles are incomplete');

let state = 123456789;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 0x100000000;
};
const localRoadVariants = new Set();
const majorRoadVariants = new Set();
for (let index = 0; index < 1200; index += 1) {
  localRoadVariants.add(selectNpcVehicleVariant(random, { majorRoad: false }).id);
  majorRoadVariants.add(selectNpcVehicleVariant(random, { majorRoad: true }).id);
}
assert.equal(localRoadVariants.has('city_bus'), false, 'city buses spawned indiscriminately on local roads');
assert.equal(majorRoadVariants.has('city_bus'), true, 'major-road catalog never produced a city bus');
assert.equal(localRoadVariants.size, 8, 'local-road vehicle variety regressed');

const source = fs.readFileSync(new URL('../app/js/living-world/population.js', import.meta.url), 'utf8');
assert.match(source, /accumulator < \.1/, 'population simulation lost its 10 Hz cap');
assert.match(source, /distance > 900 \? 8 : distance > 480 \? 4 : distance > 220 \? 2 : 1/, 'distance-aware update LOD is missing');
assert.match(source, /crossingBlocked/, 'pedestrian crossing occupancy check is missing');
assert.match(source, /leader\.progress - agent\.progress < 7\.5/, 'vehicle spacing check is missing');
assert.match(source, /virtualizedEntries/, 'building entry virtualization is missing');
assert.match(source, /phase === 'night' \? \.58/, 'time-of-day population scaling is missing');
assert.match(source, /frustumCulled = false/, 'moving instance bounds can still pop traffic unexpectedly');
assert.match(source, /Living World Pedestrian Arms/, 'articulated pedestrian presentation is missing');
assert.match(source, /Living World Traffic Wheels/, 'complete vehicle presentation is missing');

console.log(JSON.stringify({
  ok: true,
  contract: 'living-world-population-v1',
  vehicleCatalog: NPC_VEHICLE_CATALOG.length,
  localRoadVariety: localRoadVariants.size,
  majorRoadVariety: majorRoadVariants.size,
  lowTier: POPULATION_BUDGET_BY_TIER.low,
  qualityTier: POPULATION_BUDGET_BY_TIER.quality,
  simulationHz: 10,
  distanceLod: true,
  crossingOccupancy: true,
  entranceVirtualization: true
}, null, 2));
