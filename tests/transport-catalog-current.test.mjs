import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  VEHICLE_CATALOG,
  ROAD_FLEET_REFERENCE,
  vehicleDefinitionById
} from '../app/js/engine/vehicle-catalog.js';
import {
  TRANSPORT_CATALOG_SCHEMA_VERSION,
  transportCatalogEntryIsPlayable
} from '../app/js/transport/catalog-contract.js';
import { applyTransportDamage, transportDamagePresentation } from '../app/js/transport/damage-model.js';
import { roadVehicleVisualRecipe } from '../app/js/transport/road-vehicle-visual-recipe.js';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('every current road family uses the shared playable transport contract', () => {
  assert.equal(VEHICLE_CATALOG.length, 9);
  assert.deepEqual(VEHICLE_CATALOG.map(({ id }) => id), [
    'compact', 'sedan', 'suv', 'pickup', 'van', 'delivery_van', 'taxi', 'box_truck', 'city_bus'
  ]);
  for (const vehicle of VEHICLE_CATALOG) {
    assert.equal(vehicle.schemaVersion, TRANSPORT_CATALOG_SCHEMA_VERSION, vehicle.id);
    assert.equal(vehicle.domain, 'road', vehicle.id);
    assert.equal(transportCatalogEntryIsPlayable(vehicle), true, vehicle.id);
    assert.ok(vehicle.interaction.seatCount >= 1, vehicle.id);
    assert.ok(vehicle.interaction.boardingPoints.includes('driver-door'), vehicle.id);
    assert.ok(vehicle.damage.resistance > 0, vehicle.id);
    assert.ok(vehicle.damage.zones.includes('running-gear'), vehicle.id);
    assert.equal(vehicle.visual.referenceEvidence, ROAD_FLEET_REFERENCE, vehicle.id);
    assert.equal(vehicle.rights.kind, 'original-generic-design', vehicle.id);
    assert.equal(vehicle.rights.brand, 'unbranded', vehicle.id);
  }
});

test('one visual recipe owns the dimensions and wheel contact layout for all road LODs', async () => {
  for (const vehicle of VEHICLE_CATALOG) {
    const recipe = roadVehicleVisualRecipe(vehicle);
    assert.equal(recipe.width, vehicle.width, vehicle.id);
    assert.equal(recipe.height, vehicle.height, vehicle.id);
    assert.equal(recipe.length, vehicle.length, vehicle.id);
    assert.ok(recipe.bodyBottom < recipe.bodyTop, vehicle.id);
    assert.ok(recipe.cabinBottom < recipe.roofY, vehicle.id);
    assert.ok(recipe.wheelLayout.halfWheelbase < vehicle.length / 2, vehicle.id);
  }
  const population = await source('../app/js/living-world/population.js');
  const detailed = await source('../app/js/urban-sandbox/vehicle-visuals.js');
  assert.match(population, /roadVehicleVisualRecipe\(agent\.variant\)/);
  assert.match(detailed, /roadVehicleVisualRecipe\(variant\)/);
  assert.doesNotMatch(population, /function vehicleWheelContactLayout/);
});

test('the always-available exploration car cannot strand the player, while world vehicles can degrade visibly', () => {
  const defaultCar = { condition: .4, resistance: 175, durabilityPolicy: 'exploration_unlimited' };
  const protectedResult = applyTransportDamage(defaultCar, 500);
  assert.equal(protectedResult.after, 1);
  assert.equal(protectedResult.disabled, false);
  assert.equal(defaultCar.condition, 1);
  assert.ok(defaultCar.cosmeticImpact > 0);

  const sedan = vehicleDefinitionById('sedan');
  const worldCar = { condition: 1, resistance: sedan.resistance, durabilityPolicy: sedan.durabilityPolicy };
  const firstHit = applyTransportDamage(worldCar, 80);
  assert.ok(firstHit.after < 1);
  assert.equal(transportDamagePresentation(firstHit.after).band, 'damaged');
  const finalHit = applyTransportDamage(worldCar, 500);
  assert.equal(finalHit.disabled, true);
  assert.equal(transportDamagePresentation(worldCar.condition).smoke, true);
});

test('all current road spawn paths preserve catalog playability, durability, and shared damage authority', async () => {
  const state = await source('../app/js/state.js');
  const parked = await source('../app/js/urban-sandbox/vehicle-model.js');
  const runtime = await source('../app/js/urban-sandbox/runtime.js');
  const equipment = await source('../app/js/urban-sandbox/equipment-runtime.js');
  const walls = await source('../app/js/physics/building-collision-response.js');
  assert.match(state, /durabilityPolicy: 'exploration_unlimited'/);
  assert.match(parked, /playable: variant\.playable/);
  assert.match(runtime, /playable: promoted\.variant\.playable/g);
  assert.doesNotMatch(runtime, /applyConditionImpact\(vehicle,/);
  assert.match(equipment, /applyTransportDamage\(vehicle, force\)/);
  assert.match(walls, /applyTransportDamage\(appCtx\.car, response\.moverDamageForce\)/);
});
