import { ctx as appCtx } from "./shared-context.js?v=55";
import { createBlockBuilderInteraction } from "./block-builder/interaction.js?v=2";
import {
  BLOCK_MATERIALS,
  BLOCK_LIMIT_PER_LOCATION,
  createBlockShapeGeometry,
  normalizeBlockMaterial,
  normalizeBlockRotation,
  normalizeBlockShape
} from "./block-builder/catalog.js?v=4";
import { createBuildCollisionQueries } from "./block-builder/collision.js?v=2";
import { createBlockLocalStore } from './block-builder/local-store.js?v=2';
import { createSharedBlockSync } from './block-builder/shared-sync.js?v=2';
// ============================================================================
// blocks.js - Lightweight voxel-style builder (place/stack/remove brick blocks)
// ============================================================================

const BUILD_BLOCK_SIZE = 1;
const BUILD_HALF = BUILD_BLOCK_SIZE * 0.5;
const BUILD_MAX_DISTANCE = 260;
const BUILD_TOOLS = new Set(['place', 'remove']);
const BUILD_HISTORY_LIMIT = 50;

const BUILD_STORAGE_KEY = 'worldExplorer3D.buildBlocks.v1';
const BUILD_STORAGE_BACKUP_KEY = 'worldExplorer3D.buildBlocks.backup.v1';
const BUILD_STORAGE_TEST_KEY = 'worldExplorer3D.buildBlocks.test';
const BUILD_STORAGE_MIGRATION_KEY = 'worldExplorer3D.buildBlocks.migrated.v2';
const LEGACY_BUILD_STORAGE_KEYS = Object.freeze([]);
const BUILD_LOCATION_PRECISION = 5;
const BUILD_MAX_PER_LOCATION = BLOCK_LIMIT_PER_LOCATION;
const BUILD_MAX_TOTAL = 5000;

let buildModeEnabled = false;
let buildGroup = null;
const buildGeometries = new Map();

let buildTool = 'place';
let buildMaterialIndex = 0;
let buildShape = 'cube';
let buildRotation = 0;
let buildActionHistory = [];
const buildBlocks = new Map();
const buildColumns = new Map();
const buildMaterials = [];

const {
  getBuildCollisionAtWorldXZ,
  getBuildTopSurfaceAtWorldXZ,
  getBuildVehicleContact,
  getBuildVehicleSurfaceAtWorldXZ
} = createBuildCollisionQueries({
  blockKey,
  buildBlocks,
  buildColumns,
  columnKey,
  toGridCoord,
  toWorldCoord
});

function emitTutorialEvent(eventName, payload = {}) {
  if (typeof appCtx.tutorialOnEvent === 'function') {
    appCtx.tutorialOnEvent(eventName, payload);
  }
}

function isFiniteNumber(v) {
  return Number.isFinite(v);
}

function toGridCoord(v) {
  return Math.round(v / BUILD_BLOCK_SIZE);
}

function toVerticalGridCoord(v) {
  return Math.round(v / (BUILD_BLOCK_SIZE * 0.5)) * 0.5;
}

function toWorldCoord(g) {
  return g * BUILD_BLOCK_SIZE;
}

function blockKey(gx, gy, gz) {
  return `${gx}|${gy}|${gz}`;
}

function columnKey(gx, gz) {
  return `${gx}|${gz}`;
}

const sharedBuildSync = createSharedBlockSync({
  blockKey,
  toVerticalGridCoord,
  onRefresh: () => refreshBlockBuilderForCurrentLocation()
});

const isSharedBuildSyncActive = () => sharedBuildSync.isActive();
const normalizeSharedBlockEntry = (entry) => sharedBuildSync.normalizeEntry(entry);
const setSharedBuildEntries = (entries = []) => sharedBuildSync.setEntries(entries);
const configureSharedBuildSync = (config = {}) => sharedBuildSync.configure(config);
const getSharedBuildSyncStatus = () => sharedBuildSync.getStatus();

function getLocRef() {
  const loc = appCtx.LOC;
  if (!loc || !isFiniteNumber(loc.lat) || !isFiniteNumber(loc.lon)) return null;
  return loc;
}

function getCurrentLocationKey() {
  const loc = getLocRef();
  if (!loc) return null;
  return `${loc.lat.toFixed(BUILD_LOCATION_PRECISION)},${loc.lon.toFixed(BUILD_LOCATION_PRECISION)}`;
}

function worldToLatLonSafe(x, z) {
  if (typeof appCtx.worldToLatLon === 'function') {
    const ll = appCtx.worldToLatLon(x, z);
    if (ll && isFiniteNumber(ll.lat) && isFiniteNumber(ll.lon)) return ll;
  }
  const loc = getLocRef();
  if (!loc || !isFiniteNumber(appCtx.SCALE) || appCtx.SCALE === 0) return null;
  const lat = loc.lat - z / appCtx.SCALE;
  const lon = loc.lon + x / (appCtx.SCALE * Math.cos(loc.lat * Math.PI / 180));
  return { lat, lon };
}

function latLonToWorldSafe(lat, lon) {
  const loc = getLocRef();
  if (!loc || !isFiniteNumber(appCtx.SCALE) || appCtx.SCALE === 0) return { x: NaN, z: NaN };
  const x = (lon - loc.lon) * appCtx.SCALE * Math.cos(loc.lat * Math.PI / 180);
  const z = -(lat - loc.lat) * appCtx.SCALE;
  return { x, z };
}

function getBuildPersistenceStatus() {
  return {
    ...blockLocalStore.getStatus(),
    shared: getSharedBuildSyncStatus()
  };
}

function getBuildLimits() {
  if (isSharedBuildSyncActive()) {
    const sharedStatus = getSharedBuildSyncStatus();
    return {
      maxPerLocation: BUILD_MAX_PER_LOCATION,
      maxTotal: BUILD_MAX_TOTAL,
      currentLocationCount: sharedStatus.totalCount,
      totalCount: sharedStatus.totalCount
    };
  }
  const locationKey = getCurrentLocationKey();
  const localStatus = blockLocalStore.getStatus();
  return {
    maxPerLocation: BUILD_MAX_PER_LOCATION,
    maxTotal: BUILD_MAX_TOTAL,
    currentLocationCount: locationKey ? blockLocalStore.countForLocation(locationKey) : 0,
    totalCount: localStatus.totalCount
  };
}

function getBlockBuilderSnapshot() {
  const limits = getBuildLimits();
  return {
    enabled: buildModeEnabled,
    tool: buildTool,
    materialIndex: buildMaterialIndex,
    shape: buildShape,
    rotation: buildRotation,
    canUndo: buildActionHistory.length > 0,
    count: limits.currentLocationCount,
    maxCount: limits.maxPerLocation,
    shared: isSharedBuildSyncActive()
  };
}

function syncBlockBuilderUi() {
  if (typeof appCtx.syncBlockBuilderUi === 'function') {
    appCtx.syncBlockBuilderUi(getBlockBuilderSnapshot());
  }
}

function rememberBuildAction(action) {
  if (!action) return;
  buildActionHistory.push(action);
  if (buildActionHistory.length > BUILD_HISTORY_LIMIT) buildActionHistory.shift();
  showBuildTransientMessage('');
  syncBlockBuilderUi();
}

function showBuildTransientMessage(text) {
  appCtx.showBlockBuilderStatus?.(String(text || '').slice(0, 160));
}

function canPersistBuildBlocks() {
  if (typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined') {
    return appCtx.isEnv(appCtx.ENV.EARTH);
  }
  return !appCtx.onMoon;
}

function normalizeBuildEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const locationKey = String(raw.locationKey || '');
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const gy = Number(raw.gy);
  const gx = Number(raw.gx);
  const gz = Number(raw.gz);

  if (!locationKey) return null;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
  if (!isFiniteNumber(gy)) return null;

  return {
    id: String(raw.id || `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    locationKey,
    lat: Number(lat.toFixed(7)),
    lon: Number(lon.toFixed(7)),
    gx: Number.isInteger(gx) ? gx : null,
    gy: toVerticalGridCoord(gy),
    gz: Number.isInteger(gz) ? gz : null,
    materialIndex: normalizeBlockMaterial(raw.materialIndex),
    shape: normalizeBlockShape(raw.shape),
    rotation: normalizeBlockRotation(raw.rotation),
    createdAt: String(raw.createdAt || new Date().toISOString())
  };
}

const blockLocalStore = createBlockLocalStore({
  backupKey: BUILD_STORAGE_BACKUP_KEY,
  legacyKeys: LEGACY_BUILD_STORAGE_KEYS,
  maxPerLocation: BUILD_MAX_PER_LOCATION,
  maxTotal: BUILD_MAX_TOTAL,
  migrationKey: BUILD_STORAGE_MIGRATION_KEY,
  normalizeEntry: normalizeBuildEntry,
  storageKey: BUILD_STORAGE_KEY,
  testKey: BUILD_STORAGE_TEST_KEY
});

function getBuildEntriesForCurrentLocation() {
  const locationKey = getCurrentLocationKey();
  return locationKey ? blockLocalStore.listForLocation(locationKey) : [];
}

function addBuildColumnEntry(gx, gy, gz) {
  const key = columnKey(gx, gz);
  let ys = buildColumns.get(key);
  if (!ys) {
    ys = new Set();
    buildColumns.set(key, ys);
  }
  ys.add(gy);
}

function removeBuildColumnEntry(gx, gy, gz) {
  const key = columnKey(gx, gz);
  const ys = buildColumns.get(key);
  if (!ys) return;
  ys.delete(gy);
  if (ys.size === 0) buildColumns.delete(key);
}

function ensureBuildMaterials() {
  if (buildMaterials.length > 0 || typeof THREE === 'undefined') return;
  BLOCK_MATERIALS.forEach((material) => {
    buildMaterials.push(new THREE.MeshStandardMaterial({
      color: material.color,
      roughness: Number.isFinite(material.roughness) ? material.roughness : 0.82,
      metalness: Number.isFinite(material.metalness) ? material.metalness : 0.02,
      transparent: Number.isFinite(material.opacity) && material.opacity < 1,
      opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
      depthWrite: !(Number.isFinite(material.opacity) && material.opacity < 1)
    }));
  });
}

function getBuildGeometry(shape) {
  const normalizedShape = normalizeBlockShape(shape);
  if (buildGeometries.has(normalizedShape)) return buildGeometries.get(normalizedShape);
  const created = createBlockShapeGeometry(globalThis.THREE, normalizedShape);
  if (created) buildGeometries.set(normalizedShape, created);
  return created;
}

function ensureBuildGroup() {
  if (!appCtx.scene || typeof THREE === 'undefined') return null;
  if (!buildGroup) {
    buildGroup = new THREE.Group();
    buildGroup.name = 'buildBlocksGroup';
  }
  if (buildGroup.parent !== appCtx.scene) {
    appCtx.scene.add(buildGroup);
  }
  return buildGroup;
}

function getBuildReferencePosition() {
  if (appCtx.droneMode) {
    return { x: appCtx.drone.x, y: appCtx.drone.y, z: appCtx.drone.z };
  }
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker) {
    return {
      x: appCtx.Walk.state.walker.x,
      y: appCtx.Walk.state.walker.y,
      z: appCtx.Walk.state.walker.z
    };
  }
  return { x: appCtx.car.x, y: appCtx.car.y || 0, z: appCtx.car.z };
}

function getSurfaceYAt(x, z) {
  if (appCtx.activeInterior) {
    const interiorY = appCtx.SurfaceQuery?.walkAt?.(x, z)?.position?.y;
    if (Number.isFinite(interiorY)) return interiorY;
  }
  if (appCtx.onMoon && appCtx.moonSurface && typeof appCtx._getPhysRaycaster === 'function' && appCtx._physRayStart && appCtx._physRayDir) {
    const raycaster = appCtx._getPhysRaycaster();
    appCtx._physRayStart.set(x, 2000, z);
    raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
    const hits = raycaster.intersectObject(appCtx.moonSurface, false);
    if (hits.length > 0) return hits[0].point.y;
  }
  return appCtx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y ?? 0;
}

function persistPlacedBuildBlock(gx, gy, gz, materialIndex, shape, rotation) {
  if (isSharedBuildSyncActive()) {
    const entry = sharedBuildSync.upsert({ gx, gy, gz, materialIndex, shape, rotation }, (err, failedEntry) => {
      console.warn('[blocks] Failed to save room block:', err);
      removeBuildBlock(failedEntry.gx, failedEntry.gy, failedEntry.gz, { persist: false });
      showBuildTransientMessage('Could not save block to this room.');
    });
    if (!entry) return false;
    return true;
  }

  if (!canPersistBuildBlocks()) return true;
  const locationKey = getCurrentLocationKey();
  if (!locationKey || !getLocRef()) return false;

  const worldX = toWorldCoord(gx);
  const worldZ = toWorldCoord(gz);
  const latLon = worldToLatLonSafe(worldX, worldZ);
  if (!latLon || !isFiniteNumber(latLon.lat) || !isFiniteNumber(latLon.lon)) return false;

  return blockLocalStore.upsert({
    locationKey,
    lat: latLon.lat,
    lon: latLon.lon,
    gx,
    gy,
    gz,
    materialIndex: normalizeBlockMaterial(materialIndex),
    shape: normalizeBlockShape(shape),
    rotation: normalizeBlockRotation(rotation)
  });
}

function persistRemovedBuildBlock(gx, gy, gz) {
  if (isSharedBuildSyncActive()) {
    const entry = sharedBuildSync.remove({ gx, gy, gz }, (err, previous) => {
      console.warn('[blocks] Failed to remove room block:', err);
      if (previous) {
        placeBuildBlock(previous.gx, previous.gy, previous.gz, previous.materialIndex, {
          persist: false,
          enforceLimit: false,
          shape: previous.shape,
          rotation: previous.rotation
        });
      }
      showBuildTransientMessage('Could not remove block from this room.');
    });
    if (!entry) return false;
    return true;
  }

  if (!canPersistBuildBlocks()) return true;
  const locationKey = getCurrentLocationKey();
  return locationKey ? blockLocalStore.removeAt(locationKey, gx, gy, gz) : false;
}

function clearPersistedBuildBlocksForCurrentLocation() {
  if (isSharedBuildSyncActive()) {
    const clearRequest = sharedBuildSync.clearMine();
    if (clearRequest) {
      clearRequest.then((count) => {
        const removed = Number.isFinite(Number(count)) ? Number(count) : 0;
        showBuildTransientMessage(`Removed ${removed} of your room blocks.`);
      }).catch((err) => {
        console.warn('[blocks] Failed to clear my room blocks:', err);
        showBuildTransientMessage('Could not clear your room blocks.');
      });
      return true;
    }
    showBuildTransientMessage('Shared room blocks can be removed block-by-block.');
    return false;
  }

  if (!canPersistBuildBlocks()) return true;
  const locationKey = getCurrentLocationKey();
  return locationKey ? blockLocalStore.clearLocation(locationKey) : false;
}

function placeBuildBlock(gx, gy, gz, materialIndex = null, options = {}) {
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) return false;
  const group = ensureBuildGroup();
  if (!group) return false;
  ensureBuildMaterials();
  const shape = normalizeBlockShape(options.shape);
  const rotation = normalizeBlockRotation(options.rotation);
  const shapeGeometry = getBuildGeometry(shape);
  if (!shapeGeometry?.geometry) return false;

  const key = blockKey(gx, gy, gz);
  if (buildBlocks.has(key)) return false;

  const enforceLimit = options.enforceLimit !== false;
  if (enforceLimit) {
    const limits = getBuildLimits();
    if (buildBlocks.size >= BUILD_MAX_PER_LOCATION ||
    limits.currentLocationCount >= BUILD_MAX_PER_LOCATION ||
    limits.totalCount >= BUILD_MAX_TOTAL) {
      showBuildTransientMessage(`Limit reached (${BUILD_MAX_PER_LOCATION} blocks max). Remove some blocks to continue.`);
      return false;
    }
  }

  const idx = normalizeBlockMaterial(materialIndex);

  const mesh = new THREE.Mesh(shapeGeometry.geometry, buildMaterials[idx]);
  mesh.position.set(toWorldCoord(gx), toWorldCoord(gy) + shapeGeometry.yOffset, toWorldCoord(gz));
  mesh.rotation.y = rotation * Math.PI * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    isBuildBlock: true,
    buildBlock: true,
    materialIndex: idx,
    shape,
    rotation,
    gx, gy, gz,
    blockKey: key
  };

  group.add(mesh);
  buildBlocks.set(key, mesh);
  addBuildColumnEntry(gx, gy, gz);

  if (options.persist !== false) {
    if (!persistPlacedBuildBlock(gx, gy, gz, idx, shape, rotation)) {
      if (mesh.parent) mesh.parent.remove(mesh);
      buildBlocks.delete(key);
      removeBuildColumnEntry(gx, gy, gz);
      showBuildTransientMessage(`Limit reached (${BUILD_MAX_PER_LOCATION} blocks max). Remove some blocks to continue.`);
      return false;
    }
    emitTutorialEvent('artifact_placed', { source: 'build_block', gx, gy, gz });
  }
  return true;
}

function removeBuildBlock(gx, gy, gz, options = {}) {
  const key = blockKey(gx, gy, gz);
  const mesh = buildBlocks.get(key);
  if (!mesh) return false;
  if (mesh.parent) mesh.parent.remove(mesh);
  buildBlocks.delete(key);
  removeBuildColumnEntry(gx, gy, gz);

  if (options.persist !== false) {
    persistRemovedBuildBlock(gx, gy, gz);
  }
  return true;
}

function clearRenderedBuildBlocks() {
  buildBlocks.clear();
  buildColumns.clear();
  if (!buildGroup) return;
  while (buildGroup.children.length > 0) {
    const child = buildGroup.children[buildGroup.children.length - 1];
    buildGroup.remove(child);
  }
}

function clearAllBuildBlocks(options = {}) {
  if (isSharedBuildSyncActive()) {
    if (options.persist !== false) {
      clearPersistedBuildBlocksForCurrentLocation();
    }
    refreshBlockBuilderForCurrentLocation();
    return;
  }
  if (options.persist !== false) {
    clearPersistedBuildBlocksForCurrentLocation();
  }
  clearRenderedBuildBlocks();
}

function updateBuildModeUI() {
  syncBlockBuilderUi();
}

function setBlockBuildTool(tool) {
  buildTool = BUILD_TOOLS.has(tool) ? tool : 'place';
  updateBuildModeUI();
  return buildTool;
}

function setBlockBuildMaterial(materialIndex) {
  buildMaterialIndex = normalizeBlockMaterial(materialIndex);
  syncBlockBuilderUi();
  return buildMaterialIndex;
}

function setBlockBuildShape(shape) {
  buildShape = normalizeBlockShape(shape);
  syncBlockBuilderUi();
  return buildShape;
}

function rotateBlockBuildShape() {
  buildRotation = normalizeBlockRotation(buildRotation + 1);
  syncBlockBuilderUi();
  return buildRotation;
}

function setBuildModeEnabled(nextState) {
  const wasEnabled = buildModeEnabled;
  buildModeEnabled = !!nextState;
  if (buildModeEnabled) {
    ensureBuildGroup();
    if (typeof appCtx.clearStarSelection === 'function') appCtx.clearStarSelection();
  }
  if (!wasEnabled && buildModeEnabled) showBuildTransientMessage('');
  updateBuildModeUI();
  if (!wasEnabled && buildModeEnabled) {
    emitTutorialEvent('build_mode_entered', { source: 'build_mode_toggle' });
  }
  return buildModeEnabled;
}

function toggleBlockBuildMode(forceState) {
  if (!appCtx.gameStarted) return false;
  if (typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) {
    return false;
  }
  const next = typeof forceState === 'boolean' ? forceState : !buildModeEnabled;
  return setBuildModeEnabled(next);
}

function undoLastBuildAction() {
  const action = buildActionHistory.pop();
  if (!action) return false;
  const changed = action.kind === 'place'
    ? removeBuildBlock(action.gx, action.gy, action.gz)
    : placeBuildBlock(action.gx, action.gy, action.gz, action.materialIndex, {
      shape: action.shape,
      rotation: action.rotation
    });
  if (!changed) buildActionHistory.push(action);
  syncBlockBuilderUi();
  return changed;
}

function clearBlockBuilderForWorldReload() {
  buildActionHistory = [];
  clearRenderedBuildBlocks();
  syncBlockBuilderUi();
}

function refreshBlockBuilderForCurrentLocation() {
  buildActionHistory = [];
  ensureBuildGroup();
  clearRenderedBuildBlocks();

  if (isSharedBuildSyncActive()) {
    sharedBuildSync.getEntries().forEach((entry) => {
      const normalized = normalizeSharedBlockEntry(entry);
      if (!normalized) return;
      placeBuildBlock(normalized.gx, normalized.gy, normalized.gz, normalized.materialIndex, {
        persist: false,
        enforceLimit: false,
        shape: normalized.shape,
        rotation: normalized.rotation
      });
    });
    syncBlockBuilderUi();
    return;
  }

  const entries = getBuildEntriesForCurrentLocation();
  entries.forEach((entry) => {
    if (!isFiniteNumber(entry.lat) || !isFiniteNumber(entry.lon) || !isFiniteNumber(entry.gy)) return;
    const worldPos = latLonToWorldSafe(entry.lat, entry.lon);
    if (!isFiniteNumber(worldPos.x) || !isFiniteNumber(worldPos.z)) return;
    const gx = toGridCoord(worldPos.x);
    const gz = toGridCoord(worldPos.z);
    placeBuildBlock(gx, toVerticalGridCoord(entry.gy), gz, entry.materialIndex, {
      persist: false,
      enforceLimit: false,
      shape: entry.shape,
      rotation: entry.rotation
    });
  });
  syncBlockBuilderUi();
}

const { handleBlockBuilderClick } = createBlockBuilderInteraction({
  appCtx,
  blockHalf: BUILD_HALF,
  getBuildGroup: () => buildGroup,
  getBuildReferencePosition,
  getBuildShape: () => buildShape,
  getBuildTool: () => buildTool,
  getMaterialIndex: () => buildMaterialIndex,
  getRotation: () => buildRotation,
  getSurfaceYAt,
  isEnabled: () => buildModeEnabled,
  maxDistance: BUILD_MAX_DISTANCE,
  onAction: rememberBuildAction,
  placeBuildBlock,
  removeBuildBlock,
  toGridCoord,
  toVerticalGridCoord,
  toWorldCoord
});

blockLocalStore.initialize();

Object.assign(appCtx, {
  clearAllBuildBlocks,
  clearBlockBuilderForWorldReload,
  configureSharedBuildSync,
  getBuildCollisionAtWorldXZ,
  getBuildLimits,
  getBlockBuilderSnapshot,
  getBuildPersistenceStatus,
  getSharedBuildSyncStatus,
  getBuildTopSurfaceAtWorldXZ,
  getBuildVehicleContact,
  getBuildVehicleSurfaceAtWorldXZ,
  handleBlockBuilderClick,
  placeBuildBlock,
  refreshBlockBuilderForCurrentLocation,
  setSharedBuildEntries,
  setBuildModeEnabled,
  setBlockBuildMaterial,
  setBlockBuildShape,
  setBlockBuildTool,
  rotateBlockBuildShape,
  undoLastBuildAction,
  toggleBlockBuildMode
});

export {
  clearAllBuildBlocks,
  clearBlockBuilderForWorldReload,
  configureSharedBuildSync,
  getBuildCollisionAtWorldXZ,
  getBuildLimits,
  getBlockBuilderSnapshot,
  getBuildPersistenceStatus,
  getSharedBuildSyncStatus,
  getBuildTopSurfaceAtWorldXZ,
  getBuildVehicleContact,
  getBuildVehicleSurfaceAtWorldXZ,
  handleBlockBuilderClick,
  placeBuildBlock,
  refreshBlockBuilderForCurrentLocation,
  setSharedBuildEntries,
  setBuildModeEnabled,
  setBlockBuildMaterial,
  setBlockBuildShape,
  setBlockBuildTool,
  rotateBlockBuildShape,
  undoLastBuildAction,
  toggleBlockBuildMode };
