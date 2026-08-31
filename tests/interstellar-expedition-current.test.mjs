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
  startExpedition,
  VOYAGE_MILESTONES
} from '../app/js/expedition/simulation.js';
import { applyShipOperation, getShipStationView } from '../app/js/expedition/ship-operations.js';
import { createExpeditionStore } from '../app/js/expedition/store.js';
import { deriveCrewOperations, summarizeCrewOperations } from '../app/js/expedition/crew-operations.js';
import { SHIP_CREW_POSTS, SHIP_DECKS, SHIP_DOORS, SHIP_ROOMS, SHIP_STATIONS, validateShipLayout } from '../app/js/expedition/ship-layout.js';
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

test('catalog black holes are valid Expedition targets without being treated as landable worlds', () => {
  const ship = getShipProfile('long-range-research-vessel');
  const propulsion = getPropulsionProfile('radiant-plasma-field-drive');
  const calculation = calculateExpeditionTravel({ destinationId: 'sagittarius-a-star', ship, propulsion, crewCount: DEFAULT_CREW.length });
  assert.ok(calculation.distanceLy > 26000);
  assert.equal(calculation.destinationId, 'sagittarius-a-star');
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

test('one complete strategic journey crosses every voyage phase, changes state, preserves contacts, and arrives', () => {
  let expedition = createExpeditionPlan({
    destinationId: 'proxima-centauri',
    crew: DEFAULT_CREW,
    createdAtMs: 1000,
    id: 'expedition-current-contract'
  });
  const initialFood = expedition.resources.foodKg;
  const initialMaintenance = expedition.resources.maintenanceKg;
  const initialAge = expedition.crew[0].ageYears;
  const initialEngineeringExperience = expedition.crew.find((member) => member.id === 'crew-eng').experienceYears;
  expedition = startExpedition(expedition, 1100);

  const choices = ['review-course', 'replace', 'service-converter', 'inspect-hull', 'survey', 'rotate-watch', 'mark-stop', 'take-shelter', 'calibrate-arrival'];
  const kinds = [];
  const progress = [];
  for (const choice of choices) {
    expedition = advanceToNextMilestone(expedition);
    assert.ok(expedition.pendingEvent, `expected an event before ${choice}`);
    kinds.push(expedition.pendingEvent.kind);
    progress.push(expedition.progress);
    expedition = resolveExpeditionEvent(expedition, choice);
    assert.equal(expedition.pendingEvent, null);
  }
  assert.deepEqual(kinds, VOYAGE_MILESTONES.map((milestone) => milestone.kind));
  assert.ok(progress.every((value, index) => index === 0 || value > progress[index - 1]));
  expedition = advanceToNextMilestone(expedition);
  assert.equal(expedition.state, 'arrived');
  assert.equal(expedition.progress, 1);
  assert.ok(expedition.crew[0].ageYears > initialAge + 20);
  assert.ok(expedition.resources.foodKg < initialFood);
  assert.ok(expedition.resources.maintenanceKg < initialMaintenance - 179);
  assert.ok(expedition.crew.find((member) => member.id === 'crew-eng').experienceYears >= initialEngineeringExperience);
  assert.ok(expedition.log.some((entry) => entry.kind === 'repair'));
  assert.ok(expedition.log.some((entry) => entry.kind === 'science'));
  assert.ok(expedition.log.some((entry) => entry.kind === 'arrival'));
  assert.equal(expedition.routeContacts.length, 2);
  assert.ok(expedition.routeContacts.some((contact) => contact.status === 'route-stop' && contact.localOperationState === 'available'));
  assert.ok(expedition.routeContacts.every((contact) => contact.truthClass === 'modeled-uncharted-system' && Number.isInteger(contact.stableSeed)));
});

test('crew work, support, rest, and emergency assignments derive from the persistent Expedition state', () => {
  let expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 1500 });
  const routine = deriveCrewOperations(expedition);
  const summary = summarizeCrewOperations(routine);
  assert.equal(summary.total, 7);
  assert.equal(summary.active, 5);
  assert.equal(summary.resting, 2);
  assert.ok(routine.every((operation) => operation.roomId && operation.assignmentId && operation.task));
  assert.ok(DEFAULT_CREW.every((member) => Number.isFinite(member.health) && Number.isFinite(member.fatigue) && Number.isFinite(member.experienceYears)));

  expedition = startExpedition(expedition, 1600);
  expedition = advanceToNextMilestone(expedition);
  expedition = resolveExpeditionEvent(expedition, 'review-course');
  expedition = advanceToNextMilestone(expedition);
  const response = deriveCrewOperations(expedition);
  assert.equal(response.find((operation) => operation.crewId === 'crew-eng').assignmentId, 'thermal-response');
  assert.equal(response.find((operation) => operation.crewId === 'crew-eng').roomId, 'engineering');
  assert.ok(response.some((operation) => operation.status === 'responding'));
});

test('room operations use the persistent expedition record and conserve bounded inputs', () => {
  let expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 1750 });
  const feedstockBefore = expedition.resources.feedstockKg;
  const partsBefore = expedition.resources.maintenanceKg;
  const powerBefore = expedition.resources.powerMWh;
  const fabrication = getShipStationView(expedition, 'fabricator-status');
  assert.equal(fabrication.actions[0].id, 'fabricate-parts');
  assert.equal(fabrication.actions[0].enabled, true);
  const result = applyShipOperation(expedition, 'fabricate-parts');
  assert.equal(result.changed, true);
  expedition = result.expedition;
  assert.equal(expedition.resources.feedstockKg, feedstockBefore - 25);
  assert.equal(expedition.resources.maintenanceKg, partsBefore + 18);
  assert.equal(expedition.resources.powerMWh, powerBefore - 0.35);
  assert.match(expedition.log.at(-1).message, /25 kg.+18 kg/i);
  const repeated = applyShipOperation(expedition, 'fabricate-parts');
  assert.equal(repeated.changed, false);
  assert.match(repeated.message, /completed during this voyage segment/i);
  const processing = getShipStationView(expedition, 'resource-processor-status');
  assert.equal(processing.actions[0].enabled, false);
  assert.match(processing.actions[0].reason, /acquire and load a sample/i);
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

test('the current store fills crew-state fields in an earlier compatible Expedition save', () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key)
  };
  const expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 2500 });
  const earlier = structuredClone(expedition);
  earlier.crew = earlier.crew.map(({ health, fatigue, experienceYears, assignment, ...member }) => member);
  const store = createExpeditionStore(storage);
  storage.setItem(store.storageKey, JSON.stringify(earlier));
  const restored = store.load();
  assert.equal(restored.id, expedition.id);
  assert.ok(restored.crew.every((member) => Number.isFinite(member.health) && Number.isFinite(member.fatigue) && Number.isFinite(member.experienceYears)));
  assert.ok(restored.crew.every((member) => typeof member.assignment === 'string' && member.assignment.length > 0));
});

test('Surveyor publishes three bounded mapped decks and retains every required ship-class room', () => {
  const validation = validateShipLayout();
  assert.equal(validation.valid, true);
  assert.equal(validation.deckCount, 3);
  assert.equal(validation.roomCount, 25);
  assert.equal(validation.stationCount, 30);
  assert.equal(validation.doorCount, 25);
  assert.equal(validation.crewPostCount, 7);
  const roomIds = new Set(SHIP_ROOMS.map((room) => room.id));
  assert.ok(getShipProfile('long-range-research-vessel').requiredRooms.every((roomId) => roomIds.has(roomId)));
  assert.deepEqual(new Set(SHIP_DECKS.map((deck) => deck.id)), new Set(['command', 'habitat', 'engineering']));
  assert.ok(SHIP_DECKS.every((deck) => deck.rooms.length >= 8 && deck.stations.length >= 9));
  assert.ok(SHIP_DOORS.every((door) => roomIds.has(door.roomId)));
  assert.ok(SHIP_STATIONS.filter((station) => station.id.startsWith('deck-lift:')).length === 3);
  assert.ok(SHIP_STATIONS.some((station) => station.id === 'science-survey'));
  assert.ok(SHIP_CREW_POSTS.every((post) => DEFAULT_CREW.some((crew) => crew.id === post.crewId)));
});
