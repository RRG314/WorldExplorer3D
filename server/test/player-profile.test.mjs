import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlayerProfile,
  missionEligibility,
  profileForStorage,
  recordMissionCompletion
} from '../src/game/player-profile.js';

test('legacy progression upgrades additively without losing earned state', () => {
  const legacy = {
    version: 1,
    uid: 'existing-player',
    xp: 640,
    credits: 275,
    equippedWeapon: 'weapon.bow',
    stats: {
      distanceWalkedM: 820,
      distanceDrivenM: 4100,
      objectsPlaced: 17,
      eliminations: 3,
      deaths: 2,
      missionsCompleted: 5
    },
    activeMission: {
      id: 'mission.drive.route',
      baseline: 4000,
      progress: 100
    },
    updatedAtMs: 123456
  };
  const upgraded = createPlayerProfile('existing-player', legacy);
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.xp, legacy.xp);
  assert.equal(upgraded.credits, legacy.credits);
  assert.equal(upgraded.equippedWeapon, legacy.equippedWeapon);
  assert.deepEqual(upgraded.stats, legacy.stats);
  assert.deepEqual(upgraded.activeMission, legacy.activeMission);
  assert.deepEqual(upgraded.missionCompletions, {});
  assert.equal(profileForStorage(upgraded).uid, 'existing-player');
});

test('mission completion history survives persistence and controls cadence', () => {
  const now = Date.UTC(2026, 6, 21, 12);
  const profile = createPlayerProfile('returning-player');
  recordMissionCompletion(profile, 'mission.explore.local', now);
  recordMissionCompletion(profile, 'mission.build.foundation', now);
  const restored = createPlayerProfile('returning-player', profileForStorage(profile));
  assert.equal(missionEligibility(restored, 'mission.explore.local', now).reason, 'daily_complete');
  assert.equal(missionEligibility(restored, 'mission.explore.local', now + 86400000).available, true);
  assert.equal(missionEligibility(restored, 'mission.build.foundation', now + 86400000).reason, 'completed');
});
