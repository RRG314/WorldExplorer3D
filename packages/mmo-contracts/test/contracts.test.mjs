import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITIES,
  COMMAND_TYPES,
  MISSION_DEFINITIONS,
  WEAPON_DEFINITIONS,
  levelForXp,
  normalizeRoomBudget,
  normalizeRoomCommand,
  normalizeWorldProfile,
  roleHasCapability,
  worldAtLocalOffset,
  worldCellKey,
  worldCellNeighborhood
} from '../src/index.js';

test('roles expose explicit least-privilege capabilities', () => {
  assert.equal(roleHasCapability('visitor', CAPABILITIES.BUILD), false);
  assert.equal(roleHasCapability('player', CAPABILITIES.COMBAT), true);
  assert.equal(roleHasCapability('builder', CAPABILITIES.DEMOLISH), true);
  assert.equal(roleHasCapability('builder', CAPABILITIES.MANAGE_CLAIMS), false);
  assert.equal(roleHasCapability('administrator', CAPABILITIES.MANAGE_CLAIMS), true);
  assert.equal(roleHasCapability('administrator', CAPABILITIES.DELETE_ROOM), false);
  assert.equal(roleHasCapability('owner', CAPABILITIES.DELETE_ROOM), true);
});

test('Earth cells are stable and different locations do not share a global patch key', () => {
  const baltimore = worldCellKey({ kind: 'earth', lat: 39.2904, lon: -76.6122 });
  const monaco = worldCellKey({ kind: 'earth', lat: 43.7384, lon: 7.4246 });
  assert.match(baltimore, /^earth:16:/);
  assert.notEqual(baltimore, monaco);
});

test('planetary cells preserve the body identity', () => {
  assert.equal(
    worldCellKey({ kind: 'mars', bodyId: 'mars', x: 512, z: -1 }),
    'mars:mars:2:-1'
  );
  assert.equal(
    worldCellKey({ kind: 'custom_planet', bodyId: 'Blue World', x: 0, z: 0 }),
    'custom_planet:blue-world:0:0'
  );
});

test('known worlds keep real physics while creator worlds remain bounded data', () => {
  assert.equal(normalizeWorldProfile({ kind: 'moon', gravityMps2: 99 }).gravityMps2, 1.62);
  assert.equal(normalizeWorldProfile({ kind: 'mars' }).dayLengthSeconds, 88775.244);
  const custom = normalizeWorldProfile({
    kind: 'custom_planet',
    label: 'Blue World',
    gravityMps2: 500,
    radiusMeters: 20,
    atmosphereRelative: -1
  });
  assert.equal(custom.gravityMps2, 50);
  assert.equal(custom.radiusMeters, 100);
  assert.equal(custom.atmosphereRelative, 0);
  assert.equal(normalizeWorldProfile({ kind: 'custom_space' }).terrainSource, 'room-authored');
});

test('authoritative local offsets produce bounded world-cell neighborhoods', () => {
  const origin = { kind: 'earth', lat: 39.2904, lon: -76.6122 };
  const moved = worldAtLocalOffset(origin, 2000, 2000);
  assert.ok(moved.lat > origin.lat);
  assert.ok(moved.lon > origin.lon);
  const neighborhood = worldCellNeighborhood(moved, 2);
  assert.equal(neighborhood.length, 25);
  assert.ok(neighborhood.includes(worldCellKey(moved)));

  const mars = worldAtLocalOffset({ kind: 'mars', bodyId: 'mars', x: 250, z: 250 }, 20, 20);
  assert.equal(worldCellKey(mars), 'mars:mars:1:1');
  assert.equal(worldCellNeighborhood(mars, 1).length, 9);
});

test('room budgets clamp unsafe creator values', () => {
  const budget = normalizeRoomBudget({
    maxPlayers: 5000,
    maxLightsPerCell: -20,
    maxCommandBytes: 999999
  });
  assert.equal(budget.maxPlayers, 64);
  assert.equal(budget.maxLightsPerCell, 0);
  assert.equal(budget.maxCommandBytes, 32768);
});

test('durable commands require idempotency and carry authority metadata', () => {
  const command = normalizeRoomCommand({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'client-1:00000001',
    expectedRevision: 4,
    assetId: 'blocks:cube',
    world: { kind: 'moon', bodyId: 'moon', x: 10, z: 20 },
    position: { x: 10, y: 2, z: 20 }
  });
  assert.equal(command.durable, true);
  assert.equal(command.requiredCapability, CAPABILITIES.BUILD);
  assert.equal(command.cellKey, 'moon:moon:0:0');
  assert.equal(command.expectedRevision, 4);
  assert.throws(() => normalizeRoomCommand({ type: COMMAND_TYPES.PLACE_OBJECT }), /commandId/);
});

test('game content has bounded progression and server-readable commands', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(1000), 3);
  assert.equal(WEAPON_DEFINITIONS['weapon.sword'].category, 'melee');
  assert.equal(MISSION_DEFINITIONS['mission.drive.route'].metric, 'distanceDrivenM');
  assert.equal(MISSION_DEFINITIONS['mission.drive.route'].cadence, 'daily');
  assert.equal(MISSION_DEFINITIONS['mission.combat.first'].cadence, 'once');
  const accept = normalizeRoomCommand({
    type: COMMAND_TYPES.ACCEPT_MISSION,
    commandId: 'mission-accept-0001',
    assetId: 'mission.explore.local'
  });
  assert.equal(accept.durable, false);
  assert.equal(accept.requiredCapability, CAPABILITIES.INTERACT);
});
