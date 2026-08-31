import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CREW,
  getPropulsionProfile,
  getShipProfile,
  PROPULSION_CLASS
} from '../app/js/expedition/catalog.js';
import {
  assessExpeditionReadiness,
  createExpeditionPlan
} from '../app/js/expedition/model.js';
import {
  advanceToNextMilestone,
  resolveExpeditionEvent,
  startExpedition
} from '../app/js/expedition/simulation.js';
import { createExpeditionStore } from '../app/js/expedition/store.js';
import { SHIP_CREW_POSTS, SHIP_ROOMS, SHIP_STATIONS, validateShipLayout } from '../app/js/expedition/ship-layout.js';
import {
  calculateExpeditionTravel,
  LIGHT_SPEED_MPS,
  relativisticLeg,
  routeDistanceLy
} from '../app/js/expedition/travel-calculator.js';

test('the catalog distance remains physical and separate from compressed player time', () => {
  const ship = getShipProfile('long-range-research-vessel');
  const propulsion = getPropulsionProfile('radiant-plasma-field-drive');
  const calculation = calculateExpeditionTravel({
    destinationId: 'proxima-centauri',
    ship,
    propulsion,
    crewCount: DEFAULT_CREW.length,
    expectedPlayerMinutes: 24
  });
  assert.ok(Math.abs(routeDistanceLy('sol', 'proxima-centauri') - 4.2439092564) < 1e-9);
  assert.ok(Math.abs(calculation.distanceLy - 4.2439092564) < 1e-9);
  assert.ok(calculation.externalYears > calculation.properYears);
  assert.ok(calculation.properYears > 20 && calculation.properYears < 30);
  assert.equal(calculation.expectedPlayerMinutes, 24);
  assert.equal(calculation.classification, PROPULSION_CLASS.FICTIONAL);
});

test('relativistic legs reproduce Lorentz factors at representative capped velocities', () => {
  for (const beta of [0.1, 0.5, 0.8, 0.9, 0.99]) {
    const expectedGamma = 1 / Math.sqrt(1 - beta ** 2);
    const acceleration = 9.80665;
    const accelerationDistance = LIGHT_SPEED_MPS ** 2 / acceleration * (expectedGamma - 1);
    const result = relativisticLeg(accelerationDistance * 4, acceleration, beta);
    assert.equal(result.reachesCruise, true);
    assert.ok(Math.abs(result.peakVelocityFractionC - beta) < 1e-12);
    assert.ok(Math.abs(result.peakLorentzFactor - expectedGamma) < 1e-12);
    assert.ok(result.externalElapsedS > result.properElapsedS);
  }
});

test('readiness is derived from role coverage, supplies, compatibility, and capacity', () => {
  const ready = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW });
  assert.equal(ready.readiness.status, 'ready');
  assert.deepEqual(ready.readiness.failures, []);

  const missingMedical = DEFAULT_CREW.filter((member) => !member.roles.includes('medical'));
  const ship = getShipProfile(ready.ship.profileId);
  const propulsion = getPropulsionProfile(ready.propulsionId);
  const readiness = assessExpeditionReadiness({
    ship,
    propulsion,
    crew: missingMedical,
    resources: ready.resources,
    calculation: ready.calculation
  });
  assert.equal(readiness.status, 'insufficient');
  assert.ok(readiness.failures.includes('Crew coverage is missing: medical.'));
});

test('one complete strategic journey consumes supplies, changes ship state, logs repair and discovery, ages crew, and arrives', () => {
  let expedition = createExpeditionPlan({
    destinationId: 'proxima-centauri',
    crew: DEFAULT_CREW,
    createdAtMs: 1000,
    id: 'expedition-current-contract'
  });
  const initialFood = expedition.resources.foodKg;
  const initialMaintenance = expedition.resources.maintenanceKg;
  const initialAge = expedition.crew[0].ageYears;
  expedition = startExpedition(expedition, 1100);

  expedition = advanceToNextMilestone(expedition);
  assert.equal(expedition.pendingEvent.kind, 'maintenance');
  assert.equal(expedition.systems.thermal.status, 'degraded');
  assert.ok(expedition.resources.foodKg < initialFood);

  expedition = resolveExpeditionEvent(expedition, 'replace');
  assert.equal(expedition.systems.thermal.status, 'optimal');
  assert.ok(expedition.resources.maintenanceKg < initialMaintenance - 179);

  expedition = advanceToNextMilestone(expedition);
  assert.equal(expedition.pendingEvent.kind, 'discovery');
  assert.equal(expedition.discoveries[0].id, 'expedition-current-contract-object-01');
  assert.equal(expedition.discoveries[0].truthClass, 'procedural-game-object');

  expedition = resolveExpeditionEvent(expedition, 'observe');
  expedition = advanceToNextMilestone(expedition);
  assert.equal(expedition.state, 'arrived');
  assert.equal(expedition.progress, 1);
  assert.ok(expedition.crew[0].ageYears > initialAge + 20);
  assert.ok(expedition.log.some((entry) => entry.kind === 'repair'));
  assert.ok(expedition.log.some((entry) => entry.kind === 'discovery'));
  assert.ok(expedition.log.some((entry) => entry.kind === 'arrival'));
});

test('save, overwrite, and rollback preserve the complete versioned Expedition record', () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key)
  };
  const expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 2000 });
  const store = createExpeditionStore(storage);
  store.save(expedition);
  const traveling = startExpedition(expedition, 2100);
  store.save(traveling);
  assert.equal(store.load().state, 'traveling');
  assert.equal(store.restoreBackup().state, 'planned');
  assert.equal(store.load().id, expedition.id);
});

test('Surveyor publishes every required room through one bounded walkable deck contract', () => {
  const validation = validateShipLayout();
  assert.equal(validation.valid, true);
  assert.equal(validation.roomCount, 8);
  assert.equal(validation.stationCount, 8);
  assert.equal(validation.crewPostCount, 7);
  assert.deepEqual(
    new Set(SHIP_ROOMS.map((room) => room.id)),
    new Set(getShipProfile('long-range-research-vessel').requiredRooms)
  );
  assert.ok(SHIP_STATIONS.some((station) => station.id === 'return-to-flight'));
  assert.ok(SHIP_STATIONS.some((station) => station.id === 'science-survey'));
  assert.ok(SHIP_CREW_POSTS.every((post) => DEFAULT_CREW.some((crew) => crew.id === post.crewId)));
});
