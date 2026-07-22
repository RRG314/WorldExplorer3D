import { ctx as appCtx } from '../shared-context.js?v=55';

const PROVENANCE_ID = /^(osm|overture|we3d):[a-zA-Z0-9._:/-]{3,160}$/;
const state = {
  signature: '',
  suppressedIds: new Set(),
  hiddenMeshes: new Map(),
  colliderStates: new Map(),
  reloadTimer: null,
  reloadPending: false
};

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBaseFeatureId(building = {}) {
  const direct = String(building.sourceBuildingId || '').trim();
  if (PROVENANCE_ID.test(direct)) return direct;
  const overture = String(building.overtureBuildingId || '').trim();
  if (overture) return `overture:${overture}`.slice(0, 180);
  if (/^\d+$/.test(direct)) return `osm:way/${direct}`;
  const osmMatch = direct.match(/^(?:osm[-:]?)?(?:way[-:/]?)?(\d+)$/i);
  if (osmMatch) return `osm:way/${osmMatch[1]}`;
  const stableLocalId = direct.replace(/[^a-zA-Z0-9._/-]+/g, '_').replace(/^[_/-]+|[_/-]+$/g, '').slice(0, 140);
  if (stableLocalId.length >= 3) return `we3d:building/${stableLocalId}`;
  return '';
}

function currentActorPosition() {
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker) {
    return { x: finite(appCtx.Walk.state.walker.x), z: finite(appCtx.Walk.state.walker.z) };
  }
  if (appCtx.planeMode?.active) return { x: finite(appCtx.planeMode.x), z: finite(appCtx.planeMode.z) };
  if (appCtx.droneMode) return { x: finite(appCtx.drone?.x), z: finite(appCtx.drone?.z) };
  if (appCtx.boatMode?.active) return { x: finite(appCtx.boat?.x), z: finite(appCtx.boat?.z) };
  return { x: finite(appCtx.car?.x), z: finite(appCtx.car?.z) };
}

function inspectNearestRoomBuilding(radius = 14) {
  const actor = currentActorPosition();
  const nearby = typeof appCtx.getNearbyBuildings === 'function'
    ? appCtx.getNearbyBuildings(actor.x, actor.z, radius + 16)
    : appCtx.buildings || [];
  let best = null;
  nearby.forEach((building) => {
    if (!building || building.roomSuppressed === true) return;
    const sourceId = normalizeBaseFeatureId(building);
    if (!sourceId) return;
    const hit = appCtx.distanceToFootprint?.(actor.x, actor.z, building);
    const distance = finite(hit?.dist, Infinity);
    if (distance > radius) return;
    if (!best || distance < best.distance) {
      best = {
        sourceId,
        label: appCtx.buildingLabel?.(building) || String(building.name || building.buildingType || 'Mapped building'),
        distance,
        building
      };
    }
  });
  return best;
}

function restoreRuntimeVisibility() {
  state.hiddenMeshes.forEach((visible, mesh) => {
    if (mesh) mesh.visible = visible;
  });
  state.colliderStates.forEach((previous, collider) => {
    if (!collider) return;
    collider.collisionDisabled = previous.collisionDisabled;
    collider.roomSuppressed = previous.roomSuppressed;
  });
  state.hiddenMeshes.clear();
  state.colliderStates.clear();
}

function applyRuntimeVisibility() {
  restoreRuntimeVisibility();
  if (!state.suppressedIds.size) return;
  const activeInteriorSourceId = normalizeBaseFeatureId(appCtx.activeInterior?.building || {});
  if (activeInteriorSourceId && state.suppressedIds.has(activeInteriorSourceId)) {
    appCtx.clearActiveInterior?.({ restorePlayer: true, preserveCache: true });
  }
  (appCtx.buildingMeshes || []).forEach((mesh) => {
    const sourceId = normalizeBaseFeatureId(mesh?.userData || {});
    if (!sourceId || !state.suppressedIds.has(sourceId)) return;
    state.hiddenMeshes.set(mesh, mesh.visible);
    mesh.visible = false;
  });
  (appCtx.buildings || []).forEach((building) => {
    const sourceId = normalizeBaseFeatureId(building);
    if (!sourceId || !state.suppressedIds.has(sourceId)) return;
    state.colliderStates.set(building, {
      collisionDisabled: building.collisionDisabled,
      roomSuppressed: building.roomSuppressed
    });
    building.collisionDisabled = true;
    building.roomSuppressed = true;
  });
}

function scheduleWorldReload() {
  if (state.reloadTimer || state.reloadPending || appCtx.getEnv?.() !== appCtx.ENV?.EARTH || !appCtx.gameStarted) return;
  state.reloadTimer = globalThis.setTimeout(async () => {
    state.reloadTimer = null;
    if (appCtx.worldLoading || typeof appCtx.loadRoads !== 'function') {
      scheduleWorldReload();
      return;
    }
    state.reloadPending = true;
    appCtx.showLoad?.('Applying room world changes...', { transition: true, overlay: 0.3 });
    try {
      await appCtx.loadRoads();
      applyRuntimeVisibility();
    } finally {
      state.reloadPending = false;
      appCtx.hideLoad?.();
    }
  }, 120);
}

function applyRoomBaseSuppressions(entries = [], options = {}) {
  const ids = new Set((Array.isArray(entries) ? entries : [])
    .map((entry) => String(entry?.sourceId || entry || '').trim())
    .filter((entry) => PROVENANCE_ID.test(entry)));
  const signature = Array.from(ids).sort().join('|');
  const changed = signature !== state.signature;
  state.signature = signature;
  state.suppressedIds = ids;
  appCtx.roomBaseSuppressionIds = new Set(ids);
  applyRuntimeVisibility();
  if (changed && options.reload !== false) scheduleWorldReload();
  return getRoomWorldPatchSnapshot();
}

function clearRoomBaseSuppressions(options = {}) {
  return applyRoomBaseSuppressions([], options);
}

function getRoomWorldPatchSnapshot() {
  return {
    suppressedIds: Array.from(state.suppressedIds),
    suppressedCount: state.suppressedIds.size,
    reloadPending: state.reloadPending || Boolean(state.reloadTimer)
  };
}

Object.assign(appCtx, {
  applyRoomBaseSuppressions,
  clearRoomBaseSuppressions,
  getRoomWorldPatchSnapshot,
  inspectNearestRoomBuilding,
  normalizeRoomBaseFeatureId: normalizeBaseFeatureId
});

export {
  applyRoomBaseSuppressions,
  clearRoomBaseSuppressions,
  getRoomWorldPatchSnapshot,
  inspectNearestRoomBuilding,
  normalizeBaseFeatureId
};
