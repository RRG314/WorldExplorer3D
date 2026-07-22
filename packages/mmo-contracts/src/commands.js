import { CAPABILITIES } from './capabilities.js';
import { worldCellKey } from './world-cell.js';

const COMMAND_TYPES = Object.freeze({
  INPUT: 'player.input',
  PLACE_OBJECT: 'world.object.place',
  REMOVE_OBJECT: 'world.object.remove',
  SUPPRESS_BASE: 'world.base.suppress',
  RESTORE_BASE: 'world.base.restore',
  CLAIM_CELL: 'world.claim.create',
  RELEASE_CLAIM: 'world.claim.release',
  KICK_PLAYER: 'room.player.kick',
  BAN_PLAYER: 'room.player.ban',
  UNBAN_PLAYER: 'room.player.unban',
  SPAWN_VEHICLE: 'vehicle.spawn',
  ENTER_VEHICLE: 'vehicle.enter',
  EXIT_VEHICLE: 'vehicle.exit',
  INTERACT: 'world.interact',
  ACCEPT_MISSION: 'progression.mission.accept',
  EQUIP_WEAPON: 'combat.weapon.equip',
  USE_WEAPON: 'combat.weapon.use'
});

const COMMAND_CAPABILITIES = Object.freeze({
  [COMMAND_TYPES.INPUT]: CAPABILITIES.ENTER,
  [COMMAND_TYPES.PLACE_OBJECT]: CAPABILITIES.BUILD,
  [COMMAND_TYPES.REMOVE_OBJECT]: CAPABILITIES.BUILD,
  [COMMAND_TYPES.SUPPRESS_BASE]: CAPABILITIES.DEMOLISH,
  [COMMAND_TYPES.RESTORE_BASE]: CAPABILITIES.DEMOLISH,
  [COMMAND_TYPES.CLAIM_CELL]: CAPABILITIES.MANAGE_CLAIMS,
  [COMMAND_TYPES.RELEASE_CLAIM]: CAPABILITIES.MANAGE_CLAIMS,
  [COMMAND_TYPES.KICK_PLAYER]: CAPABILITIES.MODERATE,
  [COMMAND_TYPES.BAN_PLAYER]: CAPABILITIES.MODERATE,
  [COMMAND_TYPES.UNBAN_PLAYER]: CAPABILITIES.MODERATE,
  [COMMAND_TYPES.SPAWN_VEHICLE]: CAPABILITIES.SPAWN_VEHICLE,
  [COMMAND_TYPES.ENTER_VEHICLE]: CAPABILITIES.DRIVE,
  [COMMAND_TYPES.EXIT_VEHICLE]: CAPABILITIES.DRIVE,
  [COMMAND_TYPES.INTERACT]: CAPABILITIES.INTERACT,
  [COMMAND_TYPES.ACCEPT_MISSION]: CAPABILITIES.INTERACT,
  [COMMAND_TYPES.EQUIP_WEAPON]: CAPABILITIES.COMBAT,
  [COMMAND_TYPES.USE_WEAPON]: CAPABILITIES.COMBAT
});

const DURABLE_COMMANDS = new Set([
  COMMAND_TYPES.PLACE_OBJECT,
  COMMAND_TYPES.REMOVE_OBJECT,
  COMMAND_TYPES.SUPPRESS_BASE,
  COMMAND_TYPES.RESTORE_BASE,
  COMMAND_TYPES.CLAIM_CELL,
  COMMAND_TYPES.RELEASE_CLAIM,
  COMMAND_TYPES.BAN_PLAYER,
  COMMAND_TYPES.UNBAN_PLAYER,
  COMMAND_TYPES.SPAWN_VEHICLE
]);

function text(value, max) {
  return String(value || '').trim().slice(0, max);
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeVector(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return { x: finite(source.x), y: finite(source.y), z: finite(source.z) };
}

function normalizeRoomCommand(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const type = text(source.type, 64);
  if (!Object.values(COMMAND_TYPES).includes(type)) {
    throw new Error(`Unsupported room command: ${type || 'missing'}`);
  }
  const commandId = text(source.commandId, 80);
  if (!/^[a-zA-Z0-9._:-]{8,80}$/.test(commandId)) {
    throw new Error('A valid idempotency commandId is required.');
  }
  const world = source.world && typeof source.world === 'object' ? source.world : {};
  const expectedRevision = Math.max(0, Math.floor(finite(source.expectedRevision, 0)));
  return Object.freeze({
    type,
    commandId,
    expectedRevision,
    durable: DURABLE_COMMANDS.has(type),
    requiredCapability: COMMAND_CAPABILITIES[type],
    cellKey: text(source.cellKey, 140) || worldCellKey(world),
    targetId: text(source.targetId, 180),
    assetId: text(source.assetId, 120),
    position: normalizeVector(source.position),
    rotation: normalizeVector(source.rotation),
    payload: source.payload && typeof source.payload === 'object' ? structuredClone(source.payload) : {}
  });
}

export {
  COMMAND_CAPABILITIES,
  COMMAND_TYPES,
  DURABLE_COMMANDS,
  normalizeRoomCommand
};
