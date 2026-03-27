import { ctx as appCtx } from '../shared-context.js?v=55';
import { currentMapReferenceGeoPosition, currentMapReferenceWorldPosition } from '../map-coordinates.js?v=2';
import { listenPublishedOverlayFeatures, overlayBackendReady } from './store.js?v=1';
import { buildOverlayFeatureObject, disposeObject3D } from './renderer.js?v=2';
import { computeOverlayAreaKey } from './schema.js?v=1';
import { featureWorldCenter, geometryToWorldData } from './geometry.js?v=1';

const PUBLISHED_RENDER_RANGE = 3600;
const PUBLISHED_POLL_MS = 2600;

const state = {
  areaSignature: '',
  unsub: null,
  group: null,
  pollId: 0,
  hiddenBaseBuildingMeshes: new Map(),
  retryAfterMs: 0
};

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function shouldShowOverlayRuntime() {
  return appCtx.gameStarted === true && overlayBackendReady() && !appCtx.onMoon;
}

function getReferencePoint() {
  const ref = currentMapReferenceWorldPosition();
  if (ref && Number.isFinite(ref.x) && Number.isFinite(ref.z)) {
    return { x: ref.x, z: ref.z };
  }
  return {
    x: finiteNumber(appCtx.car?.x, 0),
    z: finiteNumber(appCtx.car?.z, 0)
  };
}

function currentAreaKeys() {
  const ref = getReferencePoint();
  const ll = currentMapReferenceGeoPosition() || (typeof appCtx.worldToLatLon === 'function'
    ? appCtx.worldToLatLon(ref.x, ref.z)
    : { lat: appCtx.LOC?.lat || 0, lon: appCtx.LOC?.lon || 0 });
  const lat = Number.isFinite(ll?.lat) ? ll.lat : 0;
  const lon = Number.isFinite(ll?.lon) ? ll.lon : 0;
  const baseKey = computeOverlayAreaKey(lat, lon, 'earth').split(':');
  const latBucket = Number.parseInt(baseKey[1], 10);
  const lonBucket = Number.parseInt(baseKey[2], 10);
  const areaKeys = [];
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      areaKeys.push(`earth:${latBucket + y}:${lonBucket + x}`);
    }
  }
  return [...new Set(areaKeys)];
}

function ensureGroup() {
  if (typeof THREE === 'undefined' || !appCtx.scene) return null;
  if (!state.group) {
    state.group = new THREE.Group();
    state.group.name = 'overlayPublishedGroup';
  }
  if (state.group.parent !== appCtx.scene) appCtx.scene.add(state.group);
  appCtx.overlayPublishedGroup = state.group;
  return state.group;
}

function restoreBaseBuildingVisibility() {
  state.hiddenBaseBuildingMeshes.forEach((wasVisible, mesh) => {
    if (mesh) mesh.visible = wasVisible;
  });
  state.hiddenBaseBuildingMeshes.clear();
}

function clearPublishedObjects() {
  restoreBaseBuildingVisibility();
  if (state.group) {
    while (state.group.children.length > 0) {
      const child = state.group.children[state.group.children.length - 1];
      state.group.remove(child);
      disposeObject3D(child);
    }
  }
  appCtx.overlayPublishedFeatures = [];
  appCtx.editorApprovedSubmissions = [];
  appCtx.overlayRuntimeRoads = [];
  appCtx.overlayRuntimeLinearFeatures = [];
  appCtx.overlayRuntimeBuildingColliders = [];
  appCtx.overlayRuntimePois = [];
  appCtx.overlaySuppression = {
    roadIds: new Set(),
    buildingIds: new Set()
  };
  appCtx.overlayPublishedGroup = state.group || null;
}

function worldPointsBounds(points = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  return { minX, maxX, minZ, maxZ };
}

function featureWorldPoints(feature = {}) {
  const world = geometryToWorldData(feature.geometry || {});
  if (world.type === 'Point') return [world.coordinates];
  if (world.type === 'LineString') return world.coordinates || [];
  return Array.isArray(world.coordinates) ? world.coordinates[0] || [] : [];
}

function roadRuntimeWidth(feature = {}) {
  const base = Number(feature?.tags?.width);
  if (Number.isFinite(base) && base > 0) return base;
  if (feature.featureClass === 'road') return 8;
  if (feature.featureClass === 'railway') return 3.2;
  if (feature.featureClass === 'cycleway') return 2.8;
  return 2.4;
}

function buildingRuntimeHeight(feature = {}) {
  const height = Number(feature?.threeD?.height);
  if (Number.isFinite(height) && height > 0) return height;
  const levels = Number(feature?.threeD?.buildingLevels);
  if (Number.isFinite(levels) && levels > 0) return levels * 3.3;
  return 9;
}

function buildDynamicBuildingCollider(feature = {}) {
  const points = featureWorldPoints(feature);
  if (points.length < 3) return null;
  const bounds = worldPointsBounds(points);
  const center = featureWorldCenter(feature);
  return {
    pts: points,
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    height: buildingRuntimeHeight(feature),
    centerX: center.x,
    centerZ: center.z,
    colliderDetail: 'full',
    sourceBuildingId: `overlay:${feature.featureId}`,
    overlayFeatureId: feature.featureId,
    name: String(feature?.tags?.name || '').trim(),
    buildingType: String(feature?.tags?.building || 'yes').toLowerCase(),
    levels: Number.isFinite(Number(feature?.threeD?.buildingLevels)) ? Number(feature.threeD.buildingLevels) : null,
    baseY: finiteNumber(feature?.threeD?.minHeight, 0)
  };
}

function suppressBaseBuildings(features = []) {
  const ids = new Set();
  features.forEach((feature) => {
    if (feature.featureClass !== 'building') return;
    if (!feature.baseFeatureRef?.featureId) return;
    if (!(feature.mergeMode === 'render_override' || feature.mergeMode === 'local_replace')) return;
    ids.add(String(feature.baseFeatureRef.featureId));
  });
  if (!ids.size || !Array.isArray(appCtx.buildingMeshes)) return ids;

  appCtx.buildingMeshes.forEach((mesh) => {
    const sourceId = String(mesh?.userData?.sourceBuildingId || '');
    if (!sourceId || !ids.has(sourceId)) return;
    if (!state.hiddenBaseBuildingMeshes.has(mesh)) {
      state.hiddenBaseBuildingMeshes.set(mesh, mesh.visible);
    }
    mesh.visible = false;
  });
  return ids;
}

function featureWithinPublishedRenderRange(center = null) {
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return false;
  const ref = getReferencePoint();
  return Math.hypot(center.x - Number(ref.x || 0), center.z - Number(ref.z || 0)) <= PUBLISHED_RENDER_RANGE;
}

function applyPublishedFeatures(features = []) {
  clearPublishedObjects();
  const group = ensureGroup();
  if (!group) return;

  const visible = appCtx.mapLayers?.contributions !== false;
  group.visible = visible;
  const runtimeRoads = [];
  const runtimeLinear = [];
  const runtimePois = [];
  const runtimeColliders = [];
  const suppressionRoadIds = new Set();
  const suppressionBuildingIds = suppressBaseBuildings(features);

  features.forEach((feature) => {
    const points = featureWorldPoints(feature);
    if (!points.length) return;
    const center = featureWorldCenter(feature);
    if (!featureWithinPublishedRenderRange(center)) return;

    const object = buildOverlayFeatureObject(feature, { published: true });
    if (object) {
      object.visible = visible;
      group.add(object);
    }

    if (feature.featureClass === 'building') {
      const collider = buildDynamicBuildingCollider(feature);
      if (collider) runtimeColliders.push(collider);
    } else if (feature.geometryType === 'LineString') {
      const record = {
        sourceFeatureId: `overlay:${feature.featureId}`,
        name: String(feature?.tags?.name || '').trim(),
        type: feature.featureClass,
        networkKind: feature.featureClass,
        width: roadRuntimeWidth(feature),
        walkable: true,
        driveable: feature.featureClass === 'road',
        pts: points,
        overlayFeatureId: feature.featureId
      };
      if (feature.featureClass === 'road') runtimeRoads.push(record);
      else runtimeLinear.push(record);
      if (feature.mergeMode === 'local_replace' && feature.baseFeatureRef?.featureId) {
        suppressionRoadIds.add(String(feature.baseFeatureRef.featureId));
      }
    } else if (feature.geometryType === 'Point') {
      runtimePois.push({
        x: points[0].x,
        z: points[0].z,
        type: feature.featureClass,
        name: String(feature?.tags?.name || feature.summary || 'Overlay feature'),
        overlayFeatureId: feature.featureId,
        color: getComputedStyle(document.documentElement).getPropertyValue('--overlay-poi-color') || '#f97316'
      });
    }
  });

  appCtx.overlayPublishedFeatures = features.slice();
  appCtx.editorApprovedSubmissions = features.slice();
  appCtx.overlayRuntimeRoads = runtimeRoads;
  appCtx.overlayRuntimeLinearFeatures = runtimeLinear;
  appCtx.overlayRuntimeBuildingColliders = runtimeColliders;
  appCtx.overlayRuntimePois = runtimePois;
  appCtx.overlaySuppression = {
    roadIds: suppressionRoadIds,
    buildingIds: suppressionBuildingIds
  };
  if (typeof appCtx.invalidateTraversalNetworks === 'function') {
    appCtx.invalidateTraversalNetworks('overlay_published_changed');
  }
}

function updateListener() {
  if (state.retryAfterMs > Date.now()) return;
  if (!shouldShowOverlayRuntime()) {
    clearPublishedObjects();
    state.unsub?.();
    state.unsub = null;
    state.areaSignature = '';
    return;
  }
  const areaKeys = currentAreaKeys();
  const signature = areaKeys.join('|');
  if (signature === state.areaSignature && state.unsub) return;
  state.unsub?.();
  state.areaSignature = signature;
  state.unsub = listenPublishedOverlayFeatures(
    {
      worldKind: 'earth',
      areaKeys,
      onError(error) {
        const message = String(error?.message || '');
        const code = String(error?.code || '');
        state.retryAfterMs =
          code.includes('permission-denied') || /insufficient permissions/i.test(message)
            ? Date.now() + 60000
            : Date.now() + 12000;
      }
    },
    (items) => applyPublishedFeatures(items)
  );
}

function syncApprovedEditorContributionVisibility() {
  const visible = appCtx.mapLayers?.contributions !== false;
  if (state.group) {
    state.group.visible = visible;
    state.group.children.forEach((child) => {
      child.visible = visible;
    });
  }
  return visible;
}

function getApprovedEditorContributionSnapshot() {
  return {
    activeAreaSignature: state.areaSignature,
    publishedCount: Array.isArray(appCtx.overlayPublishedFeatures) ? appCtx.overlayPublishedFeatures.length : 0,
    runtimeRoadCount: Array.isArray(appCtx.overlayRuntimeRoads) ? appCtx.overlayRuntimeRoads.length : 0,
    runtimeLinearCount: Array.isArray(appCtx.overlayRuntimeLinearFeatures) ? appCtx.overlayRuntimeLinearFeatures.length : 0,
    runtimePoiCount: Array.isArray(appCtx.overlayRuntimePois) ? appCtx.overlayRuntimePois.length : 0,
    runtimeBuildingCount: Array.isArray(appCtx.overlayRuntimeBuildingColliders) ? appCtx.overlayRuntimeBuildingColliders.length : 0,
    visible: syncApprovedEditorContributionVisibility()
  };
}

function refreshApprovedEditorContributions() {
  updateListener();
  return getApprovedEditorContributionSnapshot();
}

function initEditorPublicLayer() {
  clearPublishedObjects();
  updateListener();
  if (state.pollId) clearInterval(state.pollId);
  state.pollId = window.setInterval(() => {
    updateListener();
    if (state.group) {
      const visible = appCtx.mapLayers?.contributions !== false;
      state.group.visible = visible;
      state.group.children.forEach((child) => {
        child.visible = visible;
      });
    }
  }, PUBLISHED_POLL_MS);

  Object.assign(appCtx, {
    getApprovedEditorContributionSnapshot,
    refreshApprovedEditorContributions,
    refreshOverlayRuntimeLayer: updateListener,
    syncApprovedEditorContributionVisibility
  });
}

export {
  initEditorPublicLayer
};
