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
  advanceExpedition,
  advanceToNextMilestone,
  resolveExpeditionEvent,
  startExpedition,
  VOYAGE_MILESTONES
} from '../app/js/expedition/simulation.js';
import { appendSystemTransitions, assessCausalFailure, resolveSystemFailure, shipAlertState } from '../app/js/expedition/failure-authority.js';
import { availabilityForResponse } from '../app/js/expedition/voyage-director.js';
import { VOYAGE_EVENT_COUNTS, VOYAGE_EVENT_FAMILIES } from '../app/js/expedition/voyage-events.js';
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
import { getUniverseDestinations, getUniverseFrame, registerUniverseRuntimeDestination, resolveUniverseAddress } from '../app/js/universe/catalog.js';
import {
  createPlanetarySurfaceAuthority,
  getPlanetarySurfaceRegion,
  registerModeledSurfaceRegion
} from '../app/js/planetary/runtime/surface-authority.js';

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

test('a stable Expedition contact can join the existing universe address and frame authority', () => {
  const system = registerUniverseRuntimeDestination({
    id: 'test-expedition-contact', name: 'Survey Contact Test', objectClass: 'planetary_system', parentId: 'milky-way',
    address: 'universe/local-group/milky-way/expedition/test-expedition-contact',
    accuracy: 'model-derived expedition contact', canonicalPosition: { frame: 'expedition-route', distanceLy: 2.1 },
    physical: { hostMassSolar: 0.22, hostTemperatureK: 3200 }, visualProfile: { kind: 'red-dwarf', color: 0xff8b65, seed: 421 },
    children: [{ id: 'test-expedition-contact-i', name: 'Survey Contact Test I', objectClass: 'exoplanet', radiusEarth: 1.1, massEarth: 1.3, orbitDays: 44, semiMajorAxisAu: 0.19 }]
  });
  const world = resolveUniverseAddress('test-expedition-contact-i');
  assert.equal(resolveUniverseAddress(system.id).id, system.id);
  assert.equal(world.parentFrameId, system.id);
  assert.equal(getUniverseFrame(world).id, system.id);
  assert.equal(getUniverseDestinations().filter((entry) => entry.id === system.id).length, 1);
});

test('a modeled Expedition world publishes through the existing surface authority without impersonating observed terrain', async () => {
  const manifest = registerModeledSurfaceRegion({
    bodyId: 'test-expedition-contact-i',
    systemId: 'test-expedition-contact',
    regionId: 'test-expedition-contact-i-survey-site',
    displayName: 'Survey Contact Test I survey site',
    localBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    modelInputs: { seed: 421, radiusEarth: 1.1, massEarth: 1.3 }
  });
  assert.equal(manifest.truthClass, 'modeled');
  assert.equal(manifest.assets.length, 0);
  assert.match(manifest.source.processing, /no observed surface imagery/i);
  assert.equal(getPlanetarySurfaceRegion(manifest.regionId), manifest);
  const authority = createPlanetarySurfaceAuthority({ now: () => 42 });
  const publication = await authority.prepare(manifest.regionId, async () => ({
    sampleHeight: (x, z) => x * 0.1 + z * 0.05,
    readyAssetIds: []
  }));
  assert.equal(publication.status, 'accepted');
  const sample = authority.sampleAtLocalXZ(20, -10, { regionId: manifest.regionId });
  assert.equal(sample.status, 'available');
  assert.equal(sample.truthClass, 'modeled');
  assert.equal(sample.local.y, 1.5);
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

test('the Voyage Director publishes 36 authored families with the required category budget and response contract', () => {
  assert.equal(VOYAGE_EVENT_FAMILIES.length, 36);
  assert.deepEqual(VOYAGE_EVENT_COUNTS, { navigation: 6, engineering: 8, crew: 7, science: 6, hazard: 5, stop: 4 });
  assert.equal(new Set(VOYAGE_EVENT_FAMILIES.map((entry) => entry.id)).size, 36);
  assert.ok(VOYAGE_EVENT_FAMILIES.every((entry) => entry.title && entry.evidence && entry.roomId && entry.roles.length >= 1));
  assert.ok(VOYAGE_EVENT_FAMILIES.every((entry) => entry.choices.length >= 2 && entry.choices.length <= 5));
  assert.ok(VOYAGE_EVENT_FAMILIES.flatMap((entry) => entry.choices).every((choice) => choice.label && choice.results.length === 3));
});

test('response availability is derived from current stores and prior voyage decisions', () => {
  const expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 900 });
  const pump = VOYAGE_EVENT_FAMILIES.find((entry) => entry.id === 'coolant-pump-wear');
  const replace = pump.choices.find((choice) => choice.id === 'replace-pump');
  assert.equal(availabilityForResponse(expedition, pump, replace).enabled, true);
  const depleted = { ...expedition, resources: { ...expedition.resources, maintenanceKg: 10 } };
  const unavailable = availabilityForResponse(depleted, pump, replace);
  assert.equal(unavailable.enabled, false);
  assert.match(unavailable.reason, /requires 120/i);
});

test('one seeded strategic journey selects varied families, records outcomes and consequences, and arrives', () => {
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
  const families = [];
  const categories = [];
  const outcomes = [];
  const progress = [];
  while (expedition.state === 'traveling') {
    expedition = advanceToNextMilestone(expedition);
    if (!expedition.pendingEvent) break;
    const event = expedition.pendingEvent;
    assert.ok(event.options.some((option) => option.enabled));
    assert.ok(event.options.some((option) => typeof option.reason === 'string'));
    families.push(event.familyId);
    categories.push(event.kind);
    progress.push(expedition.progress);
    const choice = event.options.find((option) => option.enabled).id;
    expedition = resolveExpeditionEvent(expedition, choice);
    assert.equal(expedition.pendingEvent, null);
    outcomes.push(expedition.voyageDirector.history.at(-1).outcome);
  }
  if (expedition.state === 'traveling') expedition = advanceToNextMilestone(expedition);
  assert.equal(families.length, VOYAGE_MILESTONES.length);
  assert.equal(families[0], 'departure-handoff');
  assert.equal(families.at(-1), 'final-approach');
  assert.equal(new Set(families).size, families.length);
  assert.ok(['navigation', 'engineering', 'crew', 'science', 'hazard', 'stop'].every((category) => categories.includes(category)));
  assert.ok(outcomes.every((outcome) => ['success', 'partial', 'setback'].includes(outcome)));
  assert.ok(progress.every((value, index) => index === 0 || value > progress[index - 1]));
  assert.equal(expedition.state, 'arrived');
  assert.equal(expedition.progress, 1);
  assert.ok(expedition.crew[0].ageYears > initialAge + 20);
  assert.ok(expedition.resources.foodKg < initialFood);
  assert.ok(expedition.resources.maintenanceKg <= initialMaintenance);
  assert.ok(expedition.crew.find((member) => member.id === 'crew-eng').experienceYears >= initialEngineeringExperience);
  assert.equal(expedition.voyageDirector.history.length, VOYAGE_MILESTONES.length);
  assert.ok(expedition.log.some((entry) => entry.kind === 'science' || entry.kind === 'engineering'));
  assert.ok(expedition.log.some((entry) => entry.kind === 'arrival'));
  assert.ok(expedition.routeContacts.some((contact) => ['available', 'returned'].includes(contact.localOperationState)));
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
  const response = deriveCrewOperations(expedition);
  assert.ok(response.some((operation) => operation.assignmentId === 'event-response'));
  assert.ok(response.some((operation) => operation.roomId === expedition.pendingEvent.roomId));
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
  assert.equal(expedition.resources.processingResidueKg, 7);
  assert.equal(expedition.resources.powerMWh, powerBefore - 0.35);
  assert.match(expedition.log.at(-1).message, /25 kg.+18 kg.+7 kg/i);
  const repeated = applyShipOperation(expedition, 'fabricate-parts');
  assert.equal(repeated.changed, false);
  assert.match(repeated.message, /completed during this voyage segment/i);
  const processing = getShipStationView(expedition, 'resource-processor-status');
  assert.equal(processing.actions[0].enabled, false);
  assert.match(processing.actions[0].reason, /acquire and transfer a sample/i);

  const loaded = {
    ...expedition,
    scienceSamples: [{ id: 'sample-1', label: 'Survey sample', massKg: 4, processed: false }],
    resources: { ...expedition.resources, scienceCargoKg: expedition.resources.scienceCargoKg + 4 }
  };
  const cargoBefore = loaded.resources.scienceCargoKg;
  const loadedView = getShipStationView(loaded, 'resource-processor-status');
  assert.equal(loadedView.actions[0].enabled, true);
  const processed = applyShipOperation(loaded, 'process-resource-sample');
  assert.equal(processed.changed, true);
  assert.equal(processed.expedition.scienceSamples[0].processed, true);
  assert.equal(processed.expedition.resources.scienceCargoKg, cargoBefore);
  assert.match(processed.message, /4 kg remains in science cargo/i);
});

test('a surface recovery sample becomes conserved feedstock, fabricated parts, and an installed repair', () => {
  let expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 1800 });
  expedition = {
    ...expedition,
    systems: { ...expedition.systems, thermal: { condition: 0.5, status: 'degraded' } },
    resources: { ...expedition.resources, feedstockKg: 22, maintenanceKg: 0, scienceCargoKg: 4, processingResidueKg: 0 },
    scienceSamples: [{
      id: 'repair-sample', label: 'Survey Contact repair sample', massKg: 4, processed: false,
      recoveryRequirement: { kind: 'repair-feedstock', systemId: 'thermal', recoveredFeedstockKg: 3, processingResidueKg: 1 }
    }]
  };
  const initialTrackedMass = expedition.resources.feedstockKg + expedition.resources.maintenanceKg
    + expedition.resources.scienceCargoKg + expedition.resources.processingResidueKg
    + expedition.materialLedger.installedRepairKg;

  const processed = applyShipOperation(expedition, 'process-resource-sample');
  assert.equal(processed.changed, true);
  expedition = processed.expedition;
  assert.equal(expedition.resources.scienceCargoKg, 0);
  assert.equal(expedition.resources.feedstockKg, 25);
  assert.equal(expedition.resources.processingResidueKg, 1);

  const fabricated = applyShipOperation(expedition, 'fabricate-parts');
  assert.equal(fabricated.changed, true);
  expedition = fabricated.expedition;
  assert.equal(expedition.resources.feedstockKg, 0);
  assert.equal(expedition.resources.maintenanceKg, 18);
  assert.equal(expedition.resources.processingResidueKg, 8);

  const repaired = applyShipOperation(expedition, 'repair-priority-system');
  assert.equal(repaired.changed, true);
  expedition = repaired.expedition;
  assert.equal(expedition.resources.maintenanceKg, 6);
  assert.equal(expedition.materialLedger.installedRepairKg, 12);
  assert.equal(expedition.systems.thermal.condition, 0.58);
  const finalTrackedMass = expedition.resources.feedstockKg + expedition.resources.maintenanceKg
    + expedition.resources.scienceCargoKg + expedition.resources.processingResidueKg
    + expedition.materialLedger.installedRepairKg;
  assert.equal(finalTrackedMass, initialTrackedMass);
});

test('system thresholds form a causal chain, preserve recovery options, and produce an explicit mission-loss report', () => {
  let expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 1850 });
  const priorSystems = structuredClone(expedition.systems);
  const failedSystems = structuredClone(expedition.systems);
  failedSystems['life-support'] = { condition: 0, status: 'critical' };
  const failureChain = appendSystemTransitions([], priorSystems, failedSystems, 600);
  assert.deepEqual(failureChain.map((entry) => entry.stage), ['degraded', 'critical', 'offline']);
  expedition = {
    ...expedition,
    systems: failedSystems,
    resources: { ...expedition.resources, maintenanceKg: 0, feedstockKg: 0 },
    failureChain
  };
  const failure = assessCausalFailure(expedition);
  assert.equal(failure.systemId, 'life-support');
  assert.match(failure.summary, /life support became unrecoverable/i);
  assert.ok(failure.causes.length >= 5);
  assert.equal(shipAlertState(expedition).level, 'critical');

  const recovered = resolveSystemFailure(failureChain, 'life-support', 0.58, 700, 'Life support repair verified.');
  assert.equal(recovered.filter((entry) => entry.status === 'active').length, 0);
  assert.match(recovered.at(-1).message, /repair verified/i);
});

test('strategic simulation ends only after an essential offline chain has exhausted real recovery capacity', () => {
  let expedition = startExpedition(createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, createdAtMs: 1875 }), 1880);
  expedition = {
    ...expedition,
    systems: { ...expedition.systems, 'life-support': { condition: 0.002, status: 'critical' } },
    resources: { ...expedition.resources, maintenanceKg: 0, feedstockKg: 0 },
    failureChain: [
      { id: 'life-support:degraded:1', systemId: 'life-support', stage: 'degraded', status: 'active', message: 'life support became degraded.' },
      { id: 'life-support:critical:2', systemId: 'life-support', stage: 'critical', status: 'active', message: 'life support became critical.' }
    ]
  };
  const failed = advanceExpedition(expedition, expedition.calculation.properElapsedS * 0.1);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.failureReport.systemId, 'life-support');
  assert.equal(failed.pendingEvent, null);
  assert.match(failed.log.at(-1).message, /Surveyor was lost/i);

  const recoverable = advanceExpedition({
    ...expedition,
    resources: { ...expedition.resources, maintenanceKg: 1000 }
  }, expedition.calculation.properElapsedS * 0.1);
  assert.notEqual(recoverable.state, 'failed');
  assert.equal(recoverable.failureReport, null);
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
  delete earlier.voyageDirector;
  earlier.progress = 0.26;
  earlier.pendingEvent = { milestoneId: 'legacy-power', choices: ['old-choice'] };
  const store = createExpeditionStore(storage);
  storage.setItem(store.storageKey, JSON.stringify(earlier));
  const restored = store.load();
  assert.equal(restored.id, expedition.id);
  assert.ok(restored.crew.every((member) => Number.isFinite(member.health) && Number.isFinite(member.fatigue) && Number.isFinite(member.experienceYears)));
  assert.ok(restored.crew.every((member) => typeof member.assignment === 'string' && member.assignment.length > 0));
  assert.equal(restored.pendingEvent, null);
  assert.equal(restored.voyageDirector.nextSlotIndex, 4);
  assert.equal(restored.voyageDirector.tags.migratedFromRepresentativeVoyage, true);
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
