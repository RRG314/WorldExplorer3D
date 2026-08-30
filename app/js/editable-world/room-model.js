const ROOM_MODIFICATION_HISTORY_LIMIT = 20;
const ROOM_MODIFICATION_RESULT_LIMIT = 320;
const ROOM_OBJECT_TYPES = new Set([
  'wall', 'floor', 'roof', 'window', 'door', 'storefront', 'stairs', 'ramp',
  'column', 'fence', 'glass_wall', 'sign', 'decorative_facade'
]);

function clean(value, max = 160) {
  return String(value || '').replace(/[^A-Za-z0-9:._-]/g, '_').slice(0, max);
}

function hashText(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function roomWorldModificationIdentity(room = {}) {
  const roomId = clean(room.id || room.code, 32);
  const kind = clean(room.world?.kind || 'earth', 16);
  const seed = clean(room.world?.seed || 'world', 100);
  return `room-world:${roomId}:${kind}:${seed}`;
}

export function roomModificationDocumentId(kind, targetId) {
  const prefix = kind === 'suppression' ? 's' : 'o';
  const normalizedTarget = clean(targetId, 180);
  return `${prefix}_${hashText(normalizedTarget)}_${clean(normalizedTarget, 34)}`.slice(0, 64);
}

export function resolveEditableRoomRole(room = {}, uid = '') {
  const userId = String(uid || '');
  if (!userId) return 'visitor';
  if (String(room.ownerUid || '') === userId) return 'owner';
  if (room.mods && room.mods[userId] === true) return 'moderator';
  return 'builder';
}

export function editableRoomPermissions(role) {
  const normalized = String(role || 'visitor');
  return Object.freeze({
    role: normalized,
    read: true,
    placeObjects: normalized === 'owner' || normalized === 'moderator' || normalized === 'builder',
    editOwnObjects: normalized === 'owner' || normalized === 'moderator' || normalized === 'builder',
    editOtherObjects: normalized === 'owner' || normalized === 'moderator',
    suppressBaseStructures: normalized === 'owner' || normalized === 'moderator',
    resetWorld: normalized === 'owner' || normalized === 'moderator'
  });
}

function defaultTransform() {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  };
}

export function createRoomModificationRecord(options = {}) {
  const kind = options.kind === 'object' ? 'object' : 'suppression';
  const sourceFeatureId = kind === 'suppression' ? clean(options.sourceFeatureId, 180) : '';
  const objectId = kind === 'object' ? clean(options.objectId, 120) : '';
  const targetId = sourceFeatureId || objectId;
  if (!targetId) throw new TypeError('Room modifications require a stable target identity.');
  const objectType = kind === 'object' ? clean(options.objectType, 40) : 'none';
  if (kind === 'object' && !ROOM_OBJECT_TYPES.has(objectType)) throw new TypeError('Unsupported room object type.');
  const actorId = clean(options.actorId, 128);
  const nowMs = Math.max(0, Math.floor(Number(options.nowMs) || Date.now()));
  const revision = Math.max(1, Math.floor(Number(options.revision) || 1));
  const action = options.active === false ? 'restore' : kind === 'suppression' ? 'suppress' : 'upsert';
  return Object.freeze({
    id: roomModificationDocumentId(kind, targetId),
    worldId: clean(options.worldId, 220),
    worldSeed: clean(options.worldSeed, 100),
    kind,
    sourceFeatureId,
    objectId,
    objectType,
    catalogId: kind === 'object' ? clean(options.catalogId || objectType, 80) : 'none',
    materialId: kind === 'object' ? clean(options.materialId || 'default', 60) : 'none',
    transform: options.transform || defaultTransform(),
    active: options.active !== false,
    createdBy: actorId,
    updatedBy: actorId,
    revision,
    history: Object.freeze([Object.freeze({ revision, action, actorId, atMs: nowMs })])
  });
}

export function reviseRoomModificationRecord(current, options = {}) {
  if (!current || !Number.isInteger(current.revision)) throw new TypeError('A current room modification revision is required.');
  const expectedRevision = Number(options.expectedRevision);
  if (expectedRevision !== current.revision) return Object.freeze({ committed: false, reason: 'revision-conflict', current });
  const revision = current.revision + 1;
  const actorId = clean(options.actorId, 128);
  const active = options.active ?? current.active;
  const action = options.action || (active ? 'update' : 'restore');
  const next = Object.freeze({
    ...current,
    ...(options.transform ? { transform: options.transform } : {}),
    active,
    updatedBy: actorId,
    revision,
    history: Object.freeze([
      ...(Array.isArray(current.history) ? current.history : []),
      Object.freeze({ revision, action: clean(action, 40), actorId, atMs: Math.max(0, Math.floor(Number(options.nowMs) || Date.now())) })
    ].slice(-ROOM_MODIFICATION_HISTORY_LIMIT))
  });
  return Object.freeze({ committed: true, reason: null, current: next });
}

export { ROOM_MODIFICATION_HISTORY_LIMIT, ROOM_MODIFICATION_RESULT_LIMIT, ROOM_OBJECT_TYPES };
