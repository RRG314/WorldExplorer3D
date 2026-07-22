import assert from 'node:assert/strict';
import test from 'node:test';
import { MapSchema } from '@colyseus/schema';
import { COMMAND_TYPES, normalizeRoomBudget, normalizeWorldProfile } from '@we3d/mmo-contracts';
import { AuthoritativeGamePlatform } from '../src/game/platform.js';
import { MemoryRoomStore } from '../src/persistence/memory-store.js';
import { PlayerState, ProjectileState } from '../src/state.js';

function player(uid, x = 0, z = 0) {
  const value = new PlayerState();
  value.uid = uid;
  value.displayName = uid;
  value.connected = true;
  value.x = x;
  value.y = 0;
  value.z = z;
  value.yaw = 0;
  value.health = 100;
  return value;
}

function command(type, overrides = {}) {
  return { type, assetId: '', targetId: '', payload: {}, ...overrides };
}

test('game platform derives missions, combat, projectiles, rewards, and leaderboards on the server', async () => {
  let now = 1000;
  const store = new MemoryRoomStore();
  const manifest = store.seedRoom({
    id: 'GAME-TEST',
    ownerUid: 'alpha',
    members: { beta: 'player' },
    world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
    rules: { allowCombat: true }
  });
  manifest.budget = normalizeRoomBudget({ maxProjectilesPerActor: 2 });
  manifest.worldProfile = normalizeWorldProfile({ kind: 'earth' });
  const state = {
    players: new MapSchema(),
    projectiles: new MapSchema()
  };
  const events = [];
  const platform = new AuthoritativeGamePlatform({
    state,
    store,
    manifest,
    now: () => now,
    emit: (event) => events.push(event),
    cellKeyForPosition: () => 'earth:16:1:1'
  });
  const alpha = player('alpha');
  const beta = player('beta', 0, 2);
  state.players.set(alpha.uid, alpha);
  state.players.set(beta.uid, beta);
  await platform.addPlayer(alpha);
  await platform.addPlayer(beta);

  const catalog = platform.catalog(alpha.uid);
  assert.equal(catalog.version, 2);
  assert.ok(catalog.missions.some((entry) => entry.id === 'mission.build.foundation'));
  assert.ok(catalog.weapons.some((entry) => entry.id === 'weapon.sword'));
  assert.equal(catalog.activityResults.authoritativeRewards, false);

  platform.execute(alpha, command(COMMAND_TYPES.ACCEPT_MISSION, {
    assetId: 'mission.build.foundation'
  }));
  for (let i = 0; i < 5; i += 1) platform.recordObjectPlaced(alpha.uid);
  assert.equal(alpha.activeMissionId, '');
  assert.equal(platform.snapshot(alpha.uid).stats.missionsCompleted, 1);
  assert.equal(alpha.xp, 140);
  assert.throws(() => platform.execute(alpha, command(COMMAND_TYPES.ACCEPT_MISSION, {
    assetId: 'mission.build.foundation'
  })), (error) => error.code === 'mission_not_available');

  for (let hit = 0; hit < 3; hit += 1) {
    platform.execute(alpha, command(COMMAND_TYPES.USE_WEAPON, {
      assetId: 'weapon.sword',
      targetId: beta.uid
    }));
    now += 700;
  }
  assert.equal(platform.snapshot(alpha.uid).stats.eliminations, 1);
  assert.equal(platform.snapshot(beta.uid).stats.deaths, 1);
  assert.equal(beta.health, 100);
  assert.ok(events.some((event) => event.type === 'combat.respawn'));

  platform.execute(alpha, command(COMMAND_TYPES.ACCEPT_MISSION, {
    assetId: 'mission.explore.local'
  }));
  platform.recordMetric(alpha.uid, 'distanceWalkedM', 250);
  assert.equal(alpha.level, 2);
  assert.throws(() => platform.execute(alpha, command(COMMAND_TYPES.ACCEPT_MISSION, {
    assetId: 'mission.explore.local'
  })), (error) => error.code === 'mission_not_available');
  now += 86400000;
  platform.execute(alpha, command(COMMAND_TYPES.ACCEPT_MISSION, {
    assetId: 'mission.explore.local'
  }));
  assert.equal(platform.snapshot(alpha.uid).activeMission.id, 'mission.explore.local');
  platform.execute(alpha, command(COMMAND_TYPES.EQUIP_WEAPON, { assetId: 'weapon.bow' }));
  now += 1000;
  const fired = platform.execute(alpha, command(COMMAND_TYPES.USE_WEAPON, {
    assetId: 'weapon.bow',
    payload: { pitch: 0 }
  }));
  assert.match(fired.combat.projectileId, /^projectile-alpha-/);
  assert.equal(state.projectiles.size, 1);
  assert.ok(state.projectiles.values().next().value instanceof ProjectileState);
  platform.tick(4);
  assert.equal(state.projectiles.size, 0);

  await platform.savePlayer(alpha.uid);
  const leaderboard = await platform.leaderboard();
  assert.equal(leaderboard[0].uid, 'alpha');
  assert.ok((await store.loadPlayerProgression('GAME-TEST', 'alpha')).xp >= 215);
});
