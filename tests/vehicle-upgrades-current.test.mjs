import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VEHICLE_UPGRADE_SERVICES,
  createVehicleUpgradeStore,
  vehicleUpgradeDynamics
} from '../app/js/transport/vehicle-upgrades.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) };
}

test('mechanic upgrades require sequential levels and persist per stable vehicle', () => {
  const storage = memoryStorage();
  const vehicle = { vehicleIdentity: 'player-default:sedan' };
  const upgrades = createVehicleUpgradeStore({ storage });
  assert.equal(upgrades.canApply(vehicle, 'vehicle-upgrade:engine-tune:1'), true);
  assert.equal(upgrades.canApply(vehicle, 'vehicle-upgrade:engine-tune:2'), false);
  assert.equal(upgrades.apply(vehicle, 'vehicle-upgrade:engine-tune:1').ok, true);
  assert.equal(createVehicleUpgradeStore({ storage }).levels(vehicle)['engine-tune'], 1);
});

test('every mechanic upgrade has a price and changes a real driving factor', () => {
  assert.equal(VEHICLE_UPGRADE_SERVICES.length, 12);
  assert.ok(VEHICLE_UPGRADE_SERVICES.every((service) => service.price > 0 && service.capability === 'service.vehicleUpgrade'));
  const tuned = vehicleUpgradeDynamics({
    'engine-tune': 2,
    'street-brakes': 1,
    'all-road-tires': 3,
    'reinforced-suspension': 2
  });
  assert.ok(tuned.accelerationScale > 1);
  assert.ok(tuned.brakeScale > 1);
  assert.ok(tuned.gripScale > 1);
  assert.ok(tuned.recoveryScale > 1);
  assert.ok(tuned.suspensionResistance > 0);
});

test('signed-in vehicle upgrades hydrate every owned vehicle identity', () => {
  const storage = memoryStorage();
  const upgrades = createVehicleUpgradeStore({ storage });
  upgrades.hydrate({
    'player-default:sedan': { 'engine-tune': 2, 'street-brakes': 1 },
    'owned:suv:42': { 'all-road-tires': 3 }
  });
  assert.equal(upgrades.levels({ vehicleIdentity: 'player-default:sedan' })['engine-tune'], 2);
  assert.equal(upgrades.levels({ vehicleIdentity: 'owned:suv:42' })['all-road-tires'], 3);
  assert.equal(createVehicleUpgradeStore({ storage }).levels({ vehicleIdentity: 'owned:suv:42' })['all-road-tires'], 3);
});
