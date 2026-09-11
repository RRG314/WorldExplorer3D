const WORLD_MODIFICATION_SCHEMA_VERSION = 1;
const WORLD_MODIFICATION_HISTORY_LIMIT = 80;
const WORLD_MODIFICATION_SUPPRESSION_LIMIT = 160;
const WORLD_MODIFICATION_OBJECT_LIMIT = 320;
const WORLD_MODIFICATION_RADIUS = 4000;

const ALLOWED_OBJECT_TYPES = new Set([
  'wall', 'floor', 'roof', 'window', 'door', 'storefront', 'stairs', 'ramp',
  'column', 'fence', 'glass_wall', 'sign', 'decorative_facade'
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedText(value, maximum = 160) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, maximum);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function worldModificationIdentityForLocation(location = {}) {
  const lat = finite(location.lat, NaN);
  const lon = finite(location.lon, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return '';
  return `earth:v1:${Math.round(lat * 1e7)}:${Math.round(lon * 1e7)}`;
}

function normalizeTransform(transform = {}) {
  const position = transform.position || {};
  const rotation = transform.rotation || {};
  const scale = transform.scale || {};
  const x = finite(position.x, NaN);
  const y = finite(position.y, NaN);
  const z = finite(position.z, NaN);
  if (![x, y, z].every(Number.isFinite) || Math.hypot(x, z) > WORLD_MODIFICATION_RADIUS || Math.abs(y) > 1200) return null;
  return {
    position: { x, y, z },
    rotation: {
      x: Math.max(-Math.PI * 2, Math.min(Math.PI * 2, finite(rotation.x, 0))),
      y: Math.max(-Math.PI * 2, Math.min(Math.PI * 2, finite(rotation.y, 0))),
      z: Math.max(-Math.PI * 2, Math.min(Math.PI * 2, finite(rotation.z, 0)))
    },
    scale: {
      x: Math.max(0.1, Math.min(20, finite(scale.x, 1))),
      y: Math.max(0.1, Math.min(20, finite(scale.y, 1))),
      z: Math.max(0.1, Math.min(20, finite(scale.z, 1)))
    }
  };
}

function normalizeObject(raw = {}) {
  const type = boundedText(raw.type, 40).toLowerCase();
  const transform = normalizeTransform(raw.transform);
  if (!ALLOWED_OBJECT_TYPES.has(type) || !transform) return null;
  const id = boundedText(raw.id, 120);
  if (!id) return null;
  return {
    id,
    type,
    catalogId: boundedText(raw.catalogId || type, 80),
    materialId: boundedText(raw.materialId || 'default', 60),
    transform,
    creatorId: boundedText(raw.creatorId || 'local', 120),
    revision: Math.max(1, Math.floor(finite(raw.revision, 1))),
    createdAt: boundedText(raw.createdAt || new Date().toISOString(), 40),
    updatedAt: boundedText(raw.updatedAt || raw.createdAt || new Date().toISOString(), 40)
  };
}

function normalizeSuppression(raw = {}) {
  const sourceFeatureId = boundedText(raw.sourceFeatureId, 180);
  if (!sourceFeatureId) return null;
  return {
    id: `suppression:${sourceFeatureId}`,
    sourceFeatureId,
    source: boundedText(raw.source || 'mapped', 40),
    sourceProvenance: boundedText(raw.sourceProvenance || '', 120),
    action: 'hidden',
    creatorId: boundedText(raw.creatorId || 'local', 120),
    revision: Math.max(1, Math.floor(finite(raw.revision, 1))),
    createdAt: boundedText(raw.createdAt || new Date().toISOString(), 40),
    updatedAt: boundedText(raw.updatedAt || raw.createdAt || new Date().toISOString(), 40)
  };
}

function emptyWorld(worldId) {
  return {
    schemaVersion: WORLD_MODIFICATION_SCHEMA_VERSION,
    worldId,
    revision: 0,
    suppressions: [],
    objects: [],
    history: [],
    updatedAt: ''
  };
}

function normalizeWorld(raw, worldId) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    schemaVersion: WORLD_MODIFICATION_SCHEMA_VERSION,
    worldId,
    revision: Math.max(0, Math.floor(finite(source.revision, 0))),
    suppressions: (Array.isArray(source.suppressions) ? source.suppressions : [])
      .map(normalizeSuppression).filter(Boolean).slice(-WORLD_MODIFICATION_SUPPRESSION_LIMIT),
    objects: (Array.isArray(source.objects) ? source.objects : [])
      .map(normalizeObject).filter(Boolean).slice(-WORLD_MODIFICATION_OBJECT_LIMIT),
    history: (Array.isArray(source.history) ? source.history : [])
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: boundedText(entry.id, 120),
        revision: Math.max(1, Math.floor(finite(entry.revision, 1))),
        action: boundedText(entry.action, 40),
        targetId: boundedText(entry.targetId, 180),
        actorId: boundedText(entry.actorId || 'local', 120),
        at: boundedText(entry.at, 40)
      }))
      .slice(-WORLD_MODIFICATION_HISTORY_LIMIT),
    updatedAt: boundedText(source.updatedAt, 40)
  };
}

function historyEntry(world, action, targetId, actorId, now) {
  return {
    id: `history:${world.revision}:${boundedText(action, 40)}:${boundedText(targetId, 80)}`,
    revision: world.revision,
    action: boundedText(action, 40),
    targetId: boundedText(targetId, 180),
    actorId: boundedText(actorId || 'local', 120),
    at: now
  };
}

export function applyWorldModificationOperation(rawWorld, operation = {}, options = {}) {
  const worldId = boundedText(options.worldId || rawWorld?.worldId, 180);
  if (!worldId) throw new TypeError('World modifications require a stable world identity.');
  const world = normalizeWorld(rawWorld, worldId);
  const expectedRevision = Number(options.expectedRevision);
  if (Number.isSafeInteger(expectedRevision) && expectedRevision !== world.revision) {
    return deepFreeze({ committed: false, reason: 'revision-conflict', current: world });
  }
  const action = boundedText(operation.action, 40);
  const now = boundedText(options.now || new Date().toISOString(), 40);
  const actorId = boundedText(options.actorId || operation.actorId || 'local', 120);
  let targetId = '';

  if (action === 'suppress_base_building') {
    const next = normalizeSuppression({ ...operation.suppression, creatorId: actorId, createdAt: now, updatedAt: now, revision: world.revision + 1 });
    if (!next) return deepFreeze({ committed: false, reason: 'invalid-suppression', current: world });
    const existingIndex = world.suppressions.findIndex((entry) => entry.sourceFeatureId === next.sourceFeatureId);
    if (existingIndex >= 0) world.suppressions[existingIndex] = { ...world.suppressions[existingIndex], ...next };
    else if (world.suppressions.length < WORLD_MODIFICATION_SUPPRESSION_LIMIT) world.suppressions.push(next);
    else return deepFreeze({ committed: false, reason: 'suppression-limit', current: world });
    targetId = next.sourceFeatureId;
  } else if (action === 'restore_base_building') {
    targetId = boundedText(operation.sourceFeatureId, 180);
    const before = world.suppressions.length;
    world.suppressions = world.suppressions.filter((entry) => entry.sourceFeatureId !== targetId);
    if (!targetId || before === world.suppressions.length) return deepFreeze({ committed: false, reason: 'not-found', current: world });
  } else if (action === 'upsert_object') {
    const candidate = normalizeObject({ ...operation.object, creatorId: operation.object?.creatorId || actorId, updatedAt: now });
    if (!candidate) return deepFreeze({ committed: false, reason: 'invalid-object', current: world });
    const existingIndex = world.objects.findIndex((entry) => entry.id === candidate.id);
    if (existingIndex >= 0) {
      const existing = world.objects[existingIndex];
      if (Number(operation.expectedObjectRevision) !== existing.revision) {
        return deepFreeze({ committed: false, reason: 'object-revision-conflict', current: world });
      }
      world.objects[existingIndex] = { ...candidate, createdAt: existing.createdAt, revision: existing.revision + 1 };
    } else if (world.objects.length < WORLD_MODIFICATION_OBJECT_LIMIT) world.objects.push(candidate);
    else return deepFreeze({ committed: false, reason: 'object-limit', current: world });
    targetId = candidate.id;
  } else if (action === 'delete_object') {
    targetId = boundedText(operation.objectId, 120);
    const existing = world.objects.find((entry) => entry.id === targetId);
    if (!existing) return deepFreeze({ committed: false, reason: 'not-found', current: world });
    if (Number(operation.expectedObjectRevision) !== existing.revision) {
      return deepFreeze({ committed: false, reason: 'object-revision-conflict', current: world });
    }
    world.objects = world.objects.filter((entry) => entry.id !== targetId);
  } else if (action === 'reset_world') {
    world.suppressions = [];
    world.objects = [];
    targetId = worldId;
  } else {
    return deepFreeze({ committed: false, reason: 'unsupported-operation', current: world });
  }

  world.revision += 1;
  world.updatedAt = now;
  world.history.push(historyEntry(world, action, targetId, actorId, now));
  world.history = world.history.slice(-WORLD_MODIFICATION_HISTORY_LIMIT);
  return deepFreeze({ committed: true, reason: null, current: world });
}

export {
  ALLOWED_OBJECT_TYPES,
  WORLD_MODIFICATION_HISTORY_LIMIT,
  WORLD_MODIFICATION_OBJECT_LIMIT,
  WORLD_MODIFICATION_RADIUS,
  WORLD_MODIFICATION_SCHEMA_VERSION,
  WORLD_MODIFICATION_SUPPRESSION_LIMIT,
  normalizeWorld
};
