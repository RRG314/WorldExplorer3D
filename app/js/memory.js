import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import { createMemoryMarkersApi } from "./memory-markers.js?v=1";
import { createMemoryUiApi } from "./memory-ui.js?v=1";
// memory.js - Persistent memory markers (pin/flower + short note)
// ============================================================================

const MEMORY_STORAGE_KEY = 'worldExplorer3D.memories.v1';
const MEMORY_STORAGE_BACKUP_KEY = 'worldExplorer3D.memories.backup.v1';
const MEMORY_STORAGE_TEST_KEY = 'worldExplorer3D.memories.test';
const MEMORY_MAX_MESSAGE_LENGTH = 200;
const MEMORY_MAX_LOCATION_LABEL_LENGTH = 120;
const MEMORY_MAX_PER_LOCATION = 300;
const MEMORY_MAX_TOTAL = 1500;
const MEMORY_MAX_STORAGE_BYTES = 1500000;
const MEMORY_LOCATION_PRECISION = 5;

let memoryEntries = [];
let memoryGroup = null;
let memoryHitboxes = [];
let memoryUIBound = false;
let memoryClickBound = false;
let selectedMemoryType = 'pin';
let selectedMemoryEntryId = null;
let memoryPersistenceEnabled = false;
let memoryPersistenceDetail = 'Not initialized.';

const memoryRaycaster = new THREE.Raycaster();
const memoryMouse = new THREE.Vector2();

function isFiniteNumber(v) {
  return Number.isFinite(v);
}

function isValidLatLon(lat, lon) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function clampMessage(raw) {
  return String(raw || '').
  replace(/\r\n?/g, '\n').
  replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').
  trim().
  slice(0, MEMORY_MAX_MESSAGE_LENGTH);
}

function clampLocationLabel(raw) {
  const cleaned = String(raw || '').
  replace(/[\u0000-\u001F\u007F]/g, ' ').
  trim().
  slice(0, MEMORY_MAX_LOCATION_LABEL_LENGTH);
  return cleaned || 'Unknown';
}

function parseDateSafe(iso) {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return new Date().toISOString();
  return dt.toISOString();
}

function detectPersistentStorage() {
  try {
    if (!globalThis.localStorage) {
      return { enabled: false, detail: 'localStorage is unavailable in this environment.' };
    }
    localStorage.setItem(MEMORY_STORAGE_TEST_KEY, 'ok');
    const probe = localStorage.getItem(MEMORY_STORAGE_TEST_KEY);
    localStorage.removeItem(MEMORY_STORAGE_TEST_KEY);
    if (probe !== 'ok') {
      return { enabled: false, detail: 'Storage round-trip check failed.' };
    }
    return { enabled: true, detail: 'Storage round-trip check passed.' };
  } catch (err) {
    return { enabled: false, detail: `Storage access blocked: ${err && err.message ? err.message : String(err)}` };
  }
}

function getMemoryPersistenceStatus() {
  return {
    enabled: memoryPersistenceEnabled,
    detail: memoryPersistenceDetail,
    storageKey: MEMORY_STORAGE_KEY
  };
}

function getCurrentLocationKey() {
  if (!appCtx.LOC || !isFiniteNumber(appCtx.LOC.lat) || !isFiniteNumber(appCtx.LOC.lon)) return null;
  return `${appCtx.LOC.lat.toFixed(MEMORY_LOCATION_PRECISION)},${appCtx.LOC.lon.toFixed(MEMORY_LOCATION_PRECISION)}`;
}

function getCurrentLocationLabel() {
  if (appCtx.selLoc === 'custom') return appCtx.customLoc && appCtx.customLoc.name ? appCtx.customLoc.name : 'Custom Location';
  if (appCtx.LOCS && appCtx.selLoc && appCtx.LOCS[appCtx.selLoc]) return appCtx.LOCS[appCtx.selLoc].name;
  return 'Current Location';
}

function worldToLatLonSafe(x, z) {
  if (typeof appCtx.worldToLatLon === 'function') {
    const ll = appCtx.worldToLatLon(x, z);
    if (ll && isFiniteNumber(ll.lat) && isFiniteNumber(ll.lon)) return ll;
  }
  const lat = appCtx.LOC.lat - z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  return { lat, lon };
}

function latLonToWorldSafe(lat, lon) {
  const x = (lon - appCtx.LOC.lon) * appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  const z = -(lat - appCtx.LOC.lat) * appCtx.SCALE;
  return { x, z };
}

function getGroundYAt(x, z) {
  return appCtx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y ?? 0;
}

function isInsideFootprintSafe(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 3) return false;
  if (typeof appCtx.pointInPolygon === 'function') {
    return !!appCtx.pointInPolygon(x, z, pts);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x,zi = pts[i].z;
    const xj = pts[j].x,zj = pts[j].z;
    const intersect = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function getBuildingRoofYAt(x, z, groundY) {
  if (!Array.isArray(appCtx.buildings) || appCtx.buildings.length === 0) return null;
  const candidates = typeof appCtx.getNearbyBuildings === 'function' ?
  appCtx.getNearbyBuildings(x, z, 28) || [] : appCtx.buildings;

  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  let bestRoofY = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    if (!b) continue;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (!isInsideFootprintSafe(x, z, b.pts)) continue;
    const height = Number(b.height);
    if (!isFiniteNumber(height) || height <= 0) continue;
    const roofY = groundY + height;
    if (roofY > bestRoofY) bestRoofY = roofY;
  }

  return Number.isFinite(bestRoofY) ? bestRoofY : null;
}

function getTopSurfaceYAt(x, z) {
  const groundY = getGroundYAt(x, z);
  let topY = groundY;

  const roofY = getBuildingRoofYAt(x, z, groundY);
  if (isFiniteNumber(roofY) && roofY > topY) topY = roofY;

  if (typeof appCtx.getBuildTopSurfaceAtWorldXZ === 'function') {
    const blockY = appCtx.getBuildTopSurfaceAtWorldXZ(x, z, Infinity);
    if (isFiniteNumber(blockY) && blockY > topY) topY = blockY;
  }

  return topY;
}

function normalizeMemoryEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const message = clampMessage(raw.message);
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!message || !isFiniteNumber(lat) || !isFiniteNumber(lon) || !isValidLatLon(lat, lon)) return null;
  return {
    id: String(raw.id || `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    type: raw.type === 'flower' ? 'flower' : 'pin',
    message,
    lat,
    lon,
    locationKey: String(raw.locationKey || ''),
    locationLabel: clampLocationLabel(raw.locationLabel),
    createdAt: parseDateSafe(raw.createdAt)
  };
}

function parseMemoryRows(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function loadMemoryEntriesFromStorage() {
  if (!memoryPersistenceEnabled) return [];
  try {
    const primary = parseMemoryRows(localStorage.getItem(MEMORY_STORAGE_KEY));
    const backup = Array.isArray(primary) ? null : parseMemoryRows(localStorage.getItem(MEMORY_STORAGE_BACKUP_KEY));
    const rows = Array.isArray(primary) ? primary : Array.isArray(backup) ? backup : [];
    if (!Array.isArray(primary) && Array.isArray(backup)) {
      try {
        localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(backup));
      } catch {
        // Best effort only.
      }
    }
    const normalized = rows.map(normalizeMemoryEntry).filter(Boolean);
    if (normalized.length <= MEMORY_MAX_TOTAL) return normalized;
    return normalized.slice(normalized.length - MEMORY_MAX_TOTAL);
  } catch (err) {
    console.warn('[memory] Failed to read storage:', err);
    return [];
  }
}

function saveMemoryEntriesToStorage() {
  if (!memoryPersistenceEnabled) return false;
  try {
    const payload = JSON.stringify(memoryEntries);
    if (payload.length > MEMORY_MAX_STORAGE_BYTES) {
      memoryPersistenceDetail = `Storage limit reached (${Math.round(MEMORY_MAX_STORAGE_BYTES / 1024)}KB). Remove some memories and try again.`;
      updatePersistenceHint();
      return false;
    }
    localStorage.setItem(MEMORY_STORAGE_BACKUP_KEY, payload);
    localStorage.setItem(MEMORY_STORAGE_KEY, payload);
    return true;
  } catch (err) {
    memoryPersistenceEnabled = false;
    memoryPersistenceDetail = `Storage write failed: ${err && err.message ? err.message : String(err)}`;
    console.warn('[memory] Failed to save storage:', err);
    updatePersistenceHint();
    return false;
  }
}

function updatePersistenceHint() {
  const hint = document.getElementById('memoryPersistenceHint');
  if (!hint) return;
  if (memoryPersistenceEnabled) {
    hint.textContent = 'Saved persistently in this browser (local storage).';
    hint.classList.remove('warn');
  } else {
    hint.textContent = memoryPersistenceDetail || 'Persistent browser storage is unavailable. Marker placement is disabled.';
    hint.classList.add('warn');
  }
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((m) => m && typeof m.dispose === 'function' && m.dispose());
    return;
  }
  if (typeof material.dispose === 'function') material.dispose();
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry && typeof child.geometry.dispose === 'function') {
      child.geometry.dispose();
    }
    if (child.material) disposeMaterial(child.material);
  });
}
const memoryMarkersApi = createMemoryMarkersApi({
  appCtx,
  helpers: {
    disposeObject3D,
    getCurrentLocationKey,
    getTopSurfaceYAt,
    isFiniteNumber,
    latLonToWorldSafe
  },
  state: {
    getMemoryEntries: () => memoryEntries,
    getMemoryGroup: () => memoryGroup,
    getMemoryHitboxes: () => memoryHitboxes,
    getSelectedMemoryEntryId: () => selectedMemoryEntryId,
    setMemoryGroup: (group) => { memoryGroup = group; },
    setMemoryHitboxes: (hitboxes) => { memoryHitboxes = hitboxes; },
    setSelectedMemoryEntryId: (id) => { selectedMemoryEntryId = id; }
  }
});
const {
  clearMemoryMarkersForWorldReload,
  clearRenderedMemoryMarkers,
  ensureMemoryGroup,
  getEntriesForCurrentLocation,
  getMemoryEntriesForCurrentLocation,
  refreshMemoryMarkersForCurrentLocation
} = memoryMarkersApi;
const memoryUiApi = createMemoryUiApi({
  appCtx,
  constants: { MEMORY_MAX_MESSAGE_LENGTH },
  helpers: {
    getCurrentLocationLabel,
    updatePersistenceHint
  },
  state: {
    getMemoryPersistenceEnabled: () => memoryPersistenceEnabled,
    getSelectedMemoryType: () => selectedMemoryType,
    setSelectedMemoryEntryId: (id) => { selectedMemoryEntryId = id; },
    setSelectedMemoryType: (type) => { selectedMemoryType = type; }
  }
});
const {
  closeMemoryComposer,
  getPlacementReferencePosition,
  hideMemoryInfo,
  openMemoryComposer,
  setComposerStatus,
  setComposerType,
  showMemoryInfo,
  updateComposerCharCount
} = memoryUiApi;

function removeMemoryById(id) {
  if (!memoryPersistenceEnabled) return false;
  const next = memoryEntries.filter((entry) => entry.id !== id);
  if (next.length === memoryEntries.length) return false;
  const previous = memoryEntries;
  memoryEntries = next;
  if (!saveMemoryEntriesToStorage()) {
    memoryEntries = previous;
    return false;
  }
  refreshMemoryMarkersForCurrentLocation();
  return true;
}

function removeAllMemories() {
  if (memoryEntries.length === 0) return true;
  const previous = memoryEntries;
  memoryEntries = [];
  if (memoryPersistenceEnabled && !saveMemoryEntriesToStorage()) {
    memoryEntries = previous;
    return false;
  }
  hideMemoryInfo();
  refreshMemoryMarkersForCurrentLocation();
  return true;
}

function placeMemoryFromComposer() {
  if (!appCtx.gameStarted) return;
  if (!memoryPersistenceEnabled) {
    setComposerStatus('Persistent storage unavailable. Marker placement is disabled.', true);
    return;
  }
  if (!appCtx.isEnv || !appCtx.ENV || !appCtx.isEnv(appCtx.ENV.EARTH)) {
    setComposerStatus('Memories can only be placed while in Earth mode.', true);
    return;
  }

  const input = document.getElementById('memoryMessageInput');
  if (!input) return;

  const message = clampMessage(input.value);
  if (!message) {
    setComposerStatus('Add a short message before placing.', true);
    return;
  }

  const locationKey = getCurrentLocationKey();
  if (!locationKey) {
    setComposerStatus('Location is not ready yet.', true);
    return;
  }

  if (memoryEntries.length >= MEMORY_MAX_TOTAL) {
    setComposerStatus(`Total memory limit reached (${MEMORY_MAX_TOTAL}). Remove some memories first.`, true);
    return;
  }

  const currentCount = memoryEntries.reduce((count, entry) => count + (entry.locationKey === locationKey ? 1 : 0), 0);
  if (currentCount >= MEMORY_MAX_PER_LOCATION) {
    setComposerStatus(`Limit reached (${MEMORY_MAX_PER_LOCATION}) for this location. Remove one first.`, true);
    return;
  }

  const refPos = getPlacementReferencePosition();
  if (!refPos) {
    setComposerStatus('Could not resolve your current position.', true);
    return;
  }

  const latLon = worldToLatLonSafe(refPos.x, refPos.z);
  if (!latLon || !isFiniteNumber(latLon.lat) || !isFiniteNumber(latLon.lon)) {
    setComposerStatus('Could not convert marker position.', true);
    return;
  }

  const nowIso = new Date().toISOString();
  const entry = {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: selectedMemoryType === 'flower' ? 'flower' : 'pin',
    message,
    lat: Number(latLon.lat.toFixed(7)),
    lon: Number(latLon.lon.toFixed(7)),
    locationKey,
    locationLabel: clampLocationLabel(getCurrentLocationLabel()),
    createdAt: nowIso
  };

  memoryEntries.push(entry);
  if (!saveMemoryEntriesToStorage()) {
    memoryEntries.pop();
    setComposerStatus('Failed to persist marker. Check browser storage permissions.', true);
    return;
  }
  refreshMemoryMarkersForCurrentLocation();
  closeMemoryComposer();
}

function onMemorySceneClick(event) {
  if (!appCtx.gameStarted) return;
  if (!appCtx.isEnv || !appCtx.ENV || !appCtx.isEnv(appCtx.ENV.EARTH)) return;
  if (!appCtx.renderer || !appCtx.camera || memoryHitboxes.length === 0) return;

  const target = event.target;
  if (target && target.closest && target.closest('#memoryComposer, #memoryInfoPanel, #floatMenuContainer, #largeMap, #titleScreen, #propertyPanel, #historicPanel, #propertyModal, #controlsTab')) {
    return;
  }

  const canvas = appCtx.renderer.domElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX;
  const y = event.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

  memoryMouse.x = (x - rect.left) / rect.width * 2 - 1;
  memoryMouse.y = -((y - rect.top) / rect.height) * 2 + 1;
  memoryRaycaster.setFromCamera(memoryMouse, appCtx.camera);
  const intersections = memoryRaycaster.intersectObjects(memoryHitboxes, false);
  if (!intersections || intersections.length === 0) return;

  const entryId = intersections[0].object && intersections[0].object.userData ?
  intersections[0].object.userData.memoryEntryId :
  null;
  if (!entryId) return;

  const entry = memoryEntries.find((candidate) => candidate.id === entryId);
  if (!entry) return;

  event.preventDefault();
  event.stopPropagation();
  showMemoryInfo(entry);
}

function bindMemorySceneClick() {
  if (memoryClickBound) return;
  document.addEventListener('click', onMemorySceneClick, true);
  memoryClickBound = true;
}

function setupMemoryUI() {
  if (memoryUIBound) return;
  memoryUIBound = true;

  const input = document.getElementById('memoryMessageInput');
  const pinBtn = document.getElementById('memoryTypePin');
  const flowerBtn = document.getElementById('memoryTypeFlower');
  const placeBtn = document.getElementById('memoryPlaceBtn');
  const cancelBtn = document.getElementById('memoryCancelBtn');
  const deleteAllBtn = document.getElementById('memoryDeleteAllBtn');
  const closeInfoBtn = document.getElementById('memoryInfoCloseBtn');
  const deleteInfoBtn = document.getElementById('memoryDeleteBtn');
  const homeBtn = document.getElementById('fHome');

  if (input) {
    input.maxLength = MEMORY_MAX_MESSAGE_LENGTH;
    input.addEventListener('input', () => {
      if (input.value.length > MEMORY_MAX_MESSAGE_LENGTH) {
        input.value = input.value.slice(0, MEMORY_MAX_MESSAGE_LENGTH);
      }
      updateComposerCharCount();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMemoryComposer();
    });
  }

  if (pinBtn) pinBtn.addEventListener('click', () => setComposerType('pin'));
  if (flowerBtn) flowerBtn.addEventListener('click', () => setComposerType('flower'));
  if (placeBtn) placeBtn.addEventListener('click', placeMemoryFromComposer);
  if (cancelBtn) cancelBtn.addEventListener('click', closeMemoryComposer);
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', () => {
      if (memoryEntries.length === 0) {
        setComposerStatus('No memories to delete.', false);
        return;
      }
      const confirmed = globalThis.confirm(`Delete all ${memoryEntries.length} memories in this browser? This cannot be undone.`);
      if (!confirmed) return;
      if (removeAllMemories()) {
        setComposerStatus('All memories deleted.', false);
      } else {
        setComposerStatus('Failed to delete all memories.', true);
      }
    });
  }
  if (closeInfoBtn) closeInfoBtn.addEventListener('click', hideMemoryInfo);

  if (deleteInfoBtn) {
    deleteInfoBtn.addEventListener('click', () => {
      if (!selectedMemoryEntryId) return;
      if (removeMemoryById(selectedMemoryEntryId)) {
        hideMemoryInfo();
      }
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      closeMemoryComposer();
      hideMemoryInfo();
    });
  }

  updateComposerCharCount();
  updatePersistenceHint();
}

{
  const storageState = detectPersistentStorage();
  memoryPersistenceEnabled = storageState.enabled;
  memoryPersistenceDetail = storageState.detail;
}
memoryEntries = loadMemoryEntriesFromStorage();
bindMemorySceneClick();

Object.assign(appCtx, {
  clearMemoryMarkersForWorldReload,
  closeMemoryComposer,
  getMemoryEntriesForCurrentLocation,
  getMemoryPersistenceStatus,
  openMemoryComposer,
  refreshMemoryMarkersForCurrentLocation,
  setupMemoryUI
});

export {
  clearMemoryMarkersForWorldReload,
  closeMemoryComposer,
  getMemoryEntriesForCurrentLocation,
  getMemoryPersistenceStatus,
  openMemoryComposer,
  refreshMemoryMarkersForCurrentLocation,
  setupMemoryUI };
