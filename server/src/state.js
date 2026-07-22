import { MapSchema, schema } from '@colyseus/schema';

const PlayerState = schema({
  uid: 'string',
  displayName: 'string',
  role: 'string',
  mode: 'string',
  x: 'float64',
  y: 'float64',
  z: 'float64',
  yaw: 'float32',
  vx: 'float32',
  vy: 'float32',
  vz: 'float32',
  inputX: 'float32',
  inputZ: 'float32',
  inputSequence: 'uint32',
  vehicleId: 'string',
  connected: 'boolean',
  health: 'float32',
  maxHealth: 'float32',
  level: 'uint16',
  xp: 'uint32',
  credits: 'uint32',
  equippedWeapon: 'string',
  activeMissionId: 'string',
  missionProgress: 'float64'
});

const PlacedObjectState = schema({
  id: 'string',
  assetId: 'string',
  cellKey: 'string',
  ownerUid: 'string',
  shape: 'string',
  color: 'string',
  x: 'float64',
  y: 'float64',
  z: 'float64',
  rx: 'float32',
  ry: 'float32',
  rz: 'float32',
  revision: 'uint32'
});

const SuppressedFeatureState = schema({
  id: 'string',
  sourceId: 'string',
  cellKey: 'string',
  actorUid: 'string',
  revision: 'uint32'
});

const VehicleState = schema({
  id: 'string',
  assetId: 'string',
  cellKey: 'string',
  ownerUid: 'string',
  driverUid: 'string',
  x: 'float64',
  y: 'float64',
  z: 'float64',
  yaw: 'float32',
  vx: 'float32',
  vy: 'float32',
  vz: 'float32',
  revision: 'uint32'
});

const ClaimState = schema({
  id: 'string',
  cellKey: 'string',
  ownerUid: 'string',
  access: 'string',
  revision: 'uint32'
});

const ProjectileState = schema({
  id: 'string',
  weaponId: 'string',
  ownerUid: 'string',
  cellKey: 'string',
  x: 'float64',
  y: 'float64',
  z: 'float64',
  vx: 'float32',
  vy: 'float32',
  vz: 'float32',
  ttl: 'float32'
});

const WorldRoomState = schema({
  roomId: 'string',
  worldKind: 'string',
  bodyId: 'string',
  gravityMps2: 'float32',
  radiusMeters: 'float64',
  atmosphereRelative: 'float32',
  dayLengthSeconds: 'float64',
  terrainSource: 'string',
  revision: 'uint32',
  tick: 'uint32',
  serverTimeMs: 'float64',
  players: { map: PlayerState },
  objects: { map: PlacedObjectState, view: true },
  suppressions: { map: SuppressedFeatureState, view: true },
  vehicles: { map: VehicleState, view: true },
  claims: { map: ClaimState, view: true },
  projectiles: { map: ProjectileState, view: true }
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function patchIntoState(state, patch) {
  if (!patch) return null;
  if (patch.kind === 'removed') {
    const item = state.objects.get(patch.id) || state.vehicles.get(patch.id) || null;
    state.objects.delete(patch.id);
    state.vehicles.delete(patch.id);
    return item;
  }
  if (patch.kind === 'restored') {
    const item = state.suppressions.get(patch.id) || null;
    state.suppressions.delete(patch.id);
    return item;
  }
  if (patch.kind === 'claim_released') {
    const item = state.claims.get(patch.id) || null;
    state.claims.delete(patch.id);
    return item;
  }
  if (patch.kind === 'claim') {
    const item = new ClaimState();
    item.id = patch.id;
    item.cellKey = patch.cellKey;
    item.ownerUid = patch.ownerUid;
    item.access = patch.access;
    item.revision = patch.revision;
    state.claims.set(item.id, item);
    return item;
  }
  if (patch.kind === 'suppression') {
    const item = new SuppressedFeatureState();
    item.id = patch.id;
    item.sourceId = patch.sourceId;
    item.cellKey = patch.cellKey;
    item.actorUid = patch.actorUid;
    item.revision = patch.revision;
    state.suppressions.set(item.id, item);
    return item;
  }
  if (patch.kind === 'vehicle') {
    const item = new VehicleState();
    item.id = patch.id;
    item.assetId = patch.assetId;
    item.cellKey = patch.cellKey;
    item.ownerUid = patch.ownerUid;
    item.driverUid = '';
    item.x = finite(patch.position?.x);
    item.y = finite(patch.position?.y);
    item.z = finite(patch.position?.z);
    item.yaw = finite(patch.rotation?.y);
    item.vx = 0;
    item.vy = 0;
    item.vz = 0;
    item.revision = patch.revision;
    state.vehicles.set(item.id, item);
    return item;
  }
  if (patch.kind === 'object') {
    const item = new PlacedObjectState();
    item.id = patch.id;
    item.assetId = patch.assetId;
    item.cellKey = patch.cellKey;
    item.ownerUid = patch.ownerUid;
    item.shape = String(patch.metadata?.shape || 'cube');
    item.color = String(patch.metadata?.color || 'red');
    item.x = finite(patch.position?.x);
    item.y = finite(patch.position?.y);
    item.z = finite(patch.position?.z);
    item.rx = finite(patch.rotation?.x);
    item.ry = finite(patch.rotation?.y);
    item.rz = finite(patch.rotation?.z);
    item.revision = patch.revision;
    state.objects.set(item.id, item);
    return item;
  }
  return null;
}

function createWorldRoomState(manifest) {
  const state = new WorldRoomState();
  state.roomId = String(manifest.id || '');
  state.worldKind = String(manifest.world?.kind || 'earth');
  state.bodyId = String(manifest.world?.bodyId || state.worldKind);
  state.gravityMps2 = finite(manifest.worldProfile?.gravityMps2, 9.80665);
  state.radiusMeters = finite(manifest.worldProfile?.radiusMeters);
  state.atmosphereRelative = finite(manifest.worldProfile?.atmosphereRelative);
  state.dayLengthSeconds = finite(manifest.worldProfile?.dayLengthSeconds);
  state.terrainSource = String(manifest.worldProfile?.terrainSource || 'room-authored');
  state.revision = Math.max(0, Number(manifest.revision) || 0);
  state.tick = 0;
  state.serverTimeMs = Date.now();
  state.players = new MapSchema();
  state.objects = new MapSchema();
  state.suppressions = new MapSchema();
  state.vehicles = new MapSchema();
  state.claims = new MapSchema();
  state.projectiles = new MapSchema();
  return state;
}

export {
  ClaimState,
  PlacedObjectState,
  PlayerState,
  ProjectileState,
  SuppressedFeatureState,
  VehicleState,
  WorldRoomState,
  createWorldRoomState,
  patchIntoState
};
