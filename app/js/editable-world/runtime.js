import { createLocalWorldModificationStore } from './local-store.js?v=1';
import { worldModificationIdentityForLocation } from './model.js?v=1';
import { createEditableWorldPresentation } from './presentation.js?v=1';

let store = null;
let selectedBuilding = null;
let lastSelectedSourceId = '';
let presentation = null;
const sharedState = {
  enabled: false,
  roomId: '',
  worldId: '',
  canManage: false,
  rows: [],
  signature: '',
  suppress: null,
  restore: null,
  reset: null
};

function currentWorldId(appCtx) {
  return worldModificationIdentityForLocation(appCtx?.LOC || {});
}

function actorPosition(appCtx) {
  if (appCtx?.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker) {
    return appCtx.Walk.state.walker;
  }
  return appCtx?.droneMode ? appCtx.drone : appCtx?.car;
}

function distanceToBuilding(position, building) {
  const x = Math.max(Number(building.minX), Math.min(Number(position.x), Number(building.maxX)));
  const z = Math.max(Number(building.minZ), Math.min(Number(position.z), Number(building.maxZ)));
  return Math.hypot(position.x - x, position.z - z);
}

function emitChange(appCtx, detail) {
  globalThis.dispatchEvent?.(new CustomEvent('we3d:editable-world-change', { detail }));
  appCtx?.invalidateTraversalNetworks?.('editable_world_change');
}

function setBatchedBuildingSuppressed(mesh, sourceFeatureId, suppressed) {
  const index = mesh?.geometry?.index;
  const ranges = mesh?.userData?.editableBuildingIndexRanges;
  if (!index?.array || !Array.isArray(ranges) || ranges.length === 0) return false;
  const matching = ranges.filter((range) => range.sourceBuildingId === sourceFeatureId);
  if (matching.length === 0) return false;
  let savedBySource = mesh.userData.editableBuildingSavedIndices;

  if (suppressed) {
    savedBySource ||= mesh.userData.editableBuildingSavedIndices = new Map();
    if (savedBySource.has(sourceFeatureId)) return false;
    const saved = matching.map((range) => ({
      start: range.start,
      values: index.array.slice(range.start, range.start + range.count)
    }));
    saved.forEach((entry) => {
      const end = entry.start + entry.values.length;
      for (let offset = entry.start; offset < end; offset += 3) {
        const anchor = index.array[offset];
        index.array[offset + 1] = anchor;
        index.array[offset + 2] = anchor;
      }
    });
    savedBySource.set(sourceFeatureId, saved);
  } else {
    if (!savedBySource) return false;
    const saved = savedBySource.get(sourceFeatureId);
    if (!saved) return false;
    saved.forEach((entry) => index.array.set(entry.values, entry.start));
    savedBySource.delete(sourceFeatureId);
  }
  index.needsUpdate = true;
  return true;
}

export function refreshEditableBuildingVisibility(appCtx) {
  const suppressedIds = new Set(getSuppressedEditableBuildingIds(appCtx));
  let directMeshes = 0;
  let batchUpdates = 0;
  const editableMeshes = [
    ...(Array.isArray(appCtx?.buildingMeshes) ? appCtx.buildingMeshes : []),
    ...(Array.isArray(appCtx?.landuseMeshes) ? appCtx.landuseMeshes : [])
  ];
  for (const mesh of editableMeshes) {
    if (!mesh) continue;
    const ranges = mesh.userData?.editableBuildingIndexRanges || [];
    if (ranges.length > 0) {
      const sourceIds = new Set(ranges.map((range) => range.sourceBuildingId).filter(Boolean));
      sourceIds.forEach((sourceFeatureId) => {
        if (setBatchedBuildingSuppressed(mesh, sourceFeatureId, suppressedIds.has(sourceFeatureId))) {
          batchUpdates += 1;
        }
      });
      continue;
    }
    const sourceFeatureId = String(mesh.userData?.sourceBuildingId || '');
    if (!sourceFeatureId) continue;
    mesh.visible = !suppressedIds.has(sourceFeatureId);
    directMeshes += 1;
  }
  appCtx.invalidateTraversalNetworks?.('editable_building_visibility');
  const result = Object.freeze({
    suppressed: suppressedIds.size,
    directMeshes,
    batchUpdates,
    loadSequence: Number(appCtx._worldLoadSequence || 0),
    updatedAt: performance.now()
  });
  appCtx.lastEditableBuildingRefresh = result;
  return result;
}

export function getLocalWorldModificationSnapshot(appCtx) {
  const worldId = currentWorldId(appCtx);
  if (!store || !worldId) return Object.freeze({ worldId, revision: 0, suppressions: [], objects: [], history: [] });
  return store.snapshot(worldId);
}

export function isLocalBuildingSuppressed(appCtx, sourceFeatureId) {
  const id = String(sourceFeatureId || '');
  if (!id) return false;
  if (sharedState.enabled) {
    return sharedState.rows.some((entry) => entry.kind === 'suppression' && entry.active === true && entry.sourceFeatureId === id);
  }
  return getLocalWorldModificationSnapshot(appCtx).suppressions.some((entry) => entry.sourceFeatureId === id);
}

export function getSuppressedEditableBuildingIds(appCtx) {
  const ids = sharedState.enabled
    ? sharedState.rows
        .filter((entry) => entry.kind === 'suppression' && entry.active === true)
        .map((entry) => String(entry.sourceFeatureId || ''))
    : getLocalWorldModificationSnapshot(appCtx).suppressions.map((entry) => String(entry.sourceFeatureId || ''));
  return Object.freeze(ids.filter(Boolean));
}

export function selectNearestEditableBuilding(appCtx, radius = 34) {
  const position = actorPosition(appCtx);
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  const buildings = typeof appCtx.getNearbyBuildings === 'function'
    ? appCtx.getNearbyBuildings(position.x, position.z, radius)
    : appCtx.buildings;
  let best = null;
  for (const building of Array.isArray(buildings) ? buildings : []) {
    const sourceFeatureId = String(building?.sourceBuildingId || '');
    if (!sourceFeatureId || sourceFeatureId.startsWith('overlay:') || building.collisionKind === 'barrier') continue;
    const distance = distanceToBuilding(position, building);
    if (distance > radius || (best && distance >= best.distance)) continue;
    best = { building, sourceFeatureId, distance };
  }
  selectedBuilding = best;
  if (best) lastSelectedSourceId = best.sourceFeatureId;
  return best ? Object.freeze({
    sourceFeatureId: best.sourceFeatureId,
    label: String(best.building.name || best.building.buildingType || 'Mapped building'),
    distance: Number(best.distance.toFixed(2)),
    sourceProvenance: String(best.building.geometrySource || best.building.buildingProvenance?.identity?.source || 'mapped')
  }) : null;
}

function commit(appCtx, operation) {
  const worldId = currentWorldId(appCtx);
  if (!store || !worldId) return Object.freeze({ committed: false, reason: 'world-unavailable' });
  const current = store.snapshot(worldId);
  const result = store.commit(worldId, operation, {
    expectedRevision: current.revision,
    actorId: 'local'
  });
  if (result.committed) {
    emitChange(appCtx, { action: operation.action, worldId, revision: result.current.revision });
    refreshEditableWorldPresentation(appCtx);
    refreshEditableBuildingVisibility(appCtx);
  }
  return result;
}

export function placeDiscoveryWorldObject(appCtx, input = {}) {
  if (sharedState.enabled) {
    return Object.freeze({ committed: false, reason: 'use-room-editing-tools' });
  }
  const position = input.position || actorPosition(appCtx) || {};
  const x = Number(position.x);
  const z = Number(position.z);
  const sampledY = Number(appCtx.sampleFeatureSurfaceY?.(x, z));
  const y = Number.isFinite(Number(position.y)) ? Number(position.y) : Number.isFinite(sampledY) ? sampledY : 0;
  if (![x, y, z].every(Number.isFinite)) return Object.freeze({ committed: false, reason: 'invalid-position' });
  const result = commit(appCtx, {
    action: 'upsert_object',
    object: {
      id: String(input.id || ''),
      type: String(input.type || 'sign'),
      catalogId: String(input.catalogId || 'world-discovery'),
      materialId: String(input.materialId || 'wood'),
      transform: {
        position: { x, y: y + Number(input.heightOffset || 0), z },
        rotation: { x: 0, y: Number(input.rotationY || 0), z: 0 },
        scale: input.scale || { x: 1, y: 1, z: 1 }
      }
    }
  });
  if (result.committed) refreshEditableWorldPresentation(appCtx);
  return result;
}

export async function suppressSelectedEditableBuilding(appCtx) {
  const target = selectedBuilding || (lastSelectedSourceId ? { sourceFeatureId: lastSelectedSourceId, building: {} } : null);
  if (!target) return Object.freeze({ committed: false, reason: 'no-building-selected' });
  if (sharedState.enabled) {
    if (!sharedState.canManage || typeof sharedState.suppress !== 'function') {
      return Object.freeze({ committed: false, reason: 'room-manager-permission-required' });
    }
    try {
      await sharedState.suppress(target.sourceFeatureId);
      return Object.freeze({ committed: true, reason: null, scope: 'room' });
    } catch (error) {
      return Object.freeze({ committed: false, reason: String(error?.message || error) });
    }
  }
  const result = commit(appCtx, {
    action: 'suppress_base_building',
    suppression: {
      sourceFeatureId: target.sourceFeatureId,
      source: 'mapped',
      sourceProvenance: target.building?.geometrySource || target.building?.buildingProvenance?.identity?.source || ''
    }
  });
  return result;
}

export async function restoreSelectedEditableBuilding(appCtx, explicitSourceFeatureId = '') {
  const sourceFeatureId = String(explicitSourceFeatureId || selectedBuilding?.sourceFeatureId || lastSelectedSourceId || '').trim();
  if (!sourceFeatureId) return Object.freeze({ committed: false, reason: 'no-building-selected' });
  if (sharedState.enabled) {
    if (!sharedState.canManage || typeof sharedState.restore !== 'function') {
      return Object.freeze({ committed: false, reason: 'room-manager-permission-required' });
    }
    try {
      await sharedState.restore(sourceFeatureId);
      return Object.freeze({ committed: true, reason: null, scope: 'room' });
    } catch (error) {
      return Object.freeze({ committed: false, reason: String(error?.message || error) });
    }
  }
  const result = commit(appCtx, { action: 'restore_base_building', sourceFeatureId });
  if (result.committed) {
    lastSelectedSourceId = sourceFeatureId;
  }
  return result;
}

export async function resetLocalEditableWorld(appCtx) {
  if (sharedState.enabled) {
    if (!sharedState.canManage || typeof sharedState.reset !== 'function') {
      return Object.freeze({ committed: false, reason: 'room-manager-permission-required' });
    }
    try {
      const count = await sharedState.reset();
      return Object.freeze({ committed: true, reason: null, scope: 'room', count });
    } catch (error) {
      return Object.freeze({ committed: false, reason: String(error?.message || error) });
    }
  }
  const result = commit(appCtx, { action: 'reset_world' });
  if (result.committed) {
    appCtx.clearAllBuildBlocks?.();
    selectedBuilding = null;
    lastSelectedSourceId = '';
  }
  return result;
}

export function refreshEditableWorldPresentation(appCtx) {
  presentation?.dispose?.();
  presentation = null;
  const snapshot = getLocalWorldModificationSnapshot(appCtx);
  const objects = sharedState.enabled
    ? sharedState.rows.filter((entry) => entry.kind === 'object' && entry.active === true).map((entry) => ({
        id: entry.objectId,
        type: entry.objectType,
        catalogId: entry.catalogId,
        materialId: entry.materialId,
        transform: entry.transform
      }))
    : snapshot.objects;
  if (typeof THREE === 'undefined' || !appCtx?.scene || objects.length === 0) return snapshot;
  presentation = createEditableWorldPresentation(objects);
  appCtx.addEarthWorldObject?.(presentation.group);
  return snapshot;
}

export function disposeEditableWorldPresentation() {
  presentation?.dispose?.();
  presentation = null;
}

export function editableWorldRuntimeSnapshot(appCtx) {
  const snapshot = getLocalWorldModificationSnapshot(appCtx);
  return Object.freeze({
    active: !!snapshot.worldId,
    worldId: snapshot.worldId,
    scope: sharedState.enabled ? 'room' : 'local',
    roomId: sharedState.roomId,
    revision: sharedState.enabled ? Math.max(0, ...sharedState.rows.map((entry) => Number(entry.revision) || 0)) : snapshot.revision,
    suppressions: sharedState.enabled
      ? sharedState.rows.filter((entry) => entry.kind === 'suppression' && entry.active === true).length
      : snapshot.suppressions.length,
    objects: sharedState.enabled
      ? sharedState.rows.filter((entry) => entry.kind === 'object' && entry.active === true).length
      : snapshot.objects.length,
    history: snapshot.history.length,
    selectedSourceFeatureId: selectedBuilding?.sourceFeatureId || lastSelectedSourceId || '',
    persistence: store?.status?.() || { enabled: false },
    presentation: presentation?.diagnostics || { objects: 0, drawCalls: 0 }
  });
}

export function configureSharedEditableWorld(appCtx, config = {}) {
  const hadActiveRoomChanges = sharedState.enabled && sharedState.rows.some((entry) => entry.active === true);
  const nextEnabled = config.enabled === true && !!config.roomId && !!config.worldId;
  const nextRoomId = nextEnabled ? String(config.roomId) : '';
  const nextWorldId = nextEnabled ? String(config.worldId) : '';
  const scopeChanged = sharedState.enabled !== nextEnabled || sharedState.roomId !== nextRoomId || sharedState.worldId !== nextWorldId;
  sharedState.enabled = nextEnabled;
  sharedState.roomId = nextRoomId;
  sharedState.worldId = nextWorldId;
  sharedState.canManage = sharedState.enabled && config.canManage === true;
  sharedState.suppress = sharedState.enabled && typeof config.suppress === 'function' ? config.suppress : null;
  sharedState.restore = sharedState.enabled && typeof config.restore === 'function' ? config.restore : null;
  sharedState.reset = sharedState.enabled && typeof config.reset === 'function' ? config.reset : null;
  if (scopeChanged) {
    sharedState.rows = [];
    sharedState.signature = '';
  }
  refreshEditableWorldPresentation(appCtx);
  if (scopeChanged && hadActiveRoomChanges && appCtx.initialEarthWorldReady && !appCtx.worldLoading) {
    refreshEditableBuildingVisibility(appCtx);
  }
}

export function setSharedEditableWorldRows(appCtx, rows = []) {
  if (!sharedState.enabled) return false;
  const next = (Array.isArray(rows) ? rows : []).filter((entry) => entry?.worldId === sharedState.worldId);
  const signature = next.map((entry) => `${entry.id}:${entry.revision}:${entry.active ? 1 : 0}`).join('|');
  if (signature === sharedState.signature) return false;
  sharedState.rows = next;
  sharedState.signature = signature;
  refreshEditableWorldPresentation(appCtx);
  appCtx.invalidateTraversalNetworks?.('room_world_modifications_changed');
  if (appCtx.initialEarthWorldReady && !appCtx.worldLoading) refreshEditableBuildingVisibility(appCtx);
  return true;
}

export function initEditableWorldRuntime(appCtx) {
  if (!store) {
    store = createLocalWorldModificationStore();
    store.initialize();
  }
  Object.assign(appCtx, {
    editableWorldRuntimeSnapshot: () => editableWorldRuntimeSnapshot(appCtx),
    configureSharedEditableWorld: (config) => configureSharedEditableWorld(appCtx, config),
    disposeEditableWorldPresentation: () => disposeEditableWorldPresentation(),
    exportLocalEditableWorld: () => store.exportWorld(currentWorldId(appCtx)),
    getSuppressedEditableBuildingIds: () => getSuppressedEditableBuildingIds(appCtx),
    getLocalWorldModificationSnapshot: () => getLocalWorldModificationSnapshot(appCtx),
    isLocalBuildingSuppressed: (sourceFeatureId) => isLocalBuildingSuppressed(appCtx, sourceFeatureId),
    placeDiscoveryWorldObject: (input) => placeDiscoveryWorldObject(appCtx, input),
    refreshEditableWorldPresentation: () => refreshEditableWorldPresentation(appCtx),
    refreshEditableBuildingVisibility: () => refreshEditableBuildingVisibility(appCtx),
    resetLocalEditableWorld: () => resetLocalEditableWorld(appCtx),
    restoreSelectedEditableBuilding: () => restoreSelectedEditableBuilding(appCtx),
    restoreEditableBuildingById: (sourceFeatureId) => restoreSelectedEditableBuilding(appCtx, sourceFeatureId),
    selectNearestEditableBuilding: (radius) => selectNearestEditableBuilding(appCtx, radius),
    setSharedEditableWorldRows: (rows) => setSharedEditableWorldRows(appCtx, rows),
    suppressSelectedEditableBuilding: () => suppressSelectedEditableBuilding(appCtx)
  });
  return store.status();
}
