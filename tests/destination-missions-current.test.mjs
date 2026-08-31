import assert from 'node:assert/strict';
import test from 'node:test';

import { assessPlanetHabitability } from '../app/js/universe/habitability.js';
import { getDestinationMission, listDestinationMissions, missionCoverage } from '../app/js/universe/mission-catalog.js';
import {
  advanceDestinationMission,
  createDestinationMissionState,
  createDestinationMissionStore
} from '../app/js/universe/mission-authority.js';

test('every current catalog star, exoplanet, and featured Solar System body has one authored mission', () => {
  const coverage = missionCoverage();
  assert.equal(coverage.requiredCount, 66);
  assert.equal(coverage.missionCount, 66);
  assert.deepEqual(coverage.missing, []);
  assert.deepEqual(coverage.duplicates, []);
  assert.equal(coverage.complete, true);
  const missions = listDestinationMissions();
  assert.equal(new Set(missions.map((mission) => mission.title)).size, missions.length);
  for (const mission of missions) {
    assert.ok(mission.premise.length >= 45, mission.destinationId);
    assert.equal(mission.stages.length, 4, mission.destinationId);
    assert.ok(!/procedural/i.test(`${mission.title} ${mission.premise}`), mission.destinationId);
  }
});

test('habitable-zone screening preserves uncertainty and never claims confirmed life', () => {
  const sun = { physical: { hostMassSolar: 1, hostTemperatureK: 5780, hostLuminositySolar: 1 } };
  const earth = assessPlanetHabitability({ id: 'earth-test', radiusEarth: 1, massEarth: 1, semiMajorAxisAu: 1 }, sun);
  const venus = assessPlanetHabitability({ id: 'venus-test', radiusEarth: 0.95, massEarth: 0.815, semiMajorAxisAu: 0.723 }, sun);
  const jupiter = assessPlanetHabitability({ id: 'giant-test', radiusEarth: 11.2, massEarth: 317.8, semiMajorAxisAu: 1 }, sun);
  assert.equal(earth.zone, 'conservative-zone-candidate');
  assert.equal(earth.candidate, true);
  assert.equal(earth.lifeEvidence, 'none-confirmed');
  assert.equal(venus.zone, 'interior-hot');
  assert.equal(venus.candidate, false);
  assert.equal(jupiter.candidate, false);
  assert.match(earth.caveat, /not evidence/i);
});

test('mission state rejects skipped objectives and persists one ordered record across modes', () => {
  const mission = getDestinationMission('proxima-centauri-b');
  let state = createDestinationMissionState(mission, 100);
  assert.equal(advanceDestinationMission(state, 'complete_fieldwork', { atMs: 110 }).accepted, false);
  for (const [event, atMs] of [['review_briefing', 120], ['arrive', 130], ['complete_fieldwork', 140], ['complete_analysis', 150]]) {
    const result = advanceDestinationMission(state, event, { atMs, evidenceId: `${event}-evidence` });
    assert.equal(result.accepted, true);
    state = result.state;
  }
  assert.equal(state.phase, 'complete');
  assert.equal(state.history.length, 4);

  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  let store = createDestinationMissionStore(storage);
  store.activate(mission);
  store.advance(mission, 'review_briefing', { atMs: 200 });
  store = createDestinationMissionStore(storage);
  assert.equal(store.get(mission).phase, 'approach');
  assert.equal(store.load().activeMissionId, mission.id);
});
