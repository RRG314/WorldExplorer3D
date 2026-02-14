// ============================================================================
// memory.js - Persistent memory markers (pin/flower + short note)
// ============================================================================

const MEMORY_STORAGE_KEY = 'worldExplorer3D.memories.v1';
const MEMORY_STORAGE_TEST_KEY = 'worldExplorer3D.memories.test';
const MEMORY_SCHEMA_VERSION = 2;
const MEMORY_PACK_KIND = 'worldExplorer3D.memoryPack';
const MEMORY_CONFLICT_KEEP_EXISTING = 'keep-existing';
const MEMORY_CONFLICT_REPLACE_LOCATION = 'replace-location';
const MEMORY_CONFLICT_REPLACE_ALL = 'replace-all';
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
    return String(raw || '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, MEMORY_MAX_MESSAGE_LENGTH);
}

function clampLocationLabel(raw) {
    const cleaned = String(raw || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .trim()
        .slice(0, MEMORY_MAX_LOCATION_LABEL_LENGTH);
    return cleaned || 'Unknown';
}

function parseDateSafe(iso) {
    const dt = new Date(iso);
    if (!Number.isFinite(dt.getTime())) return new Date().toISOString();
    return dt.toISOString();
}

function createMemoryEntryId() {
    return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLocationKey(rawKey, lat = null, lon = null) {
    const key = String(rawKey || '').trim();
    if (key) return key;
    const currentKey = getCurrentLocationKey();
    if (currentKey) return currentKey;
    if (isFiniteNumber(lat) && isFiniteNumber(lon)) {
        return `${lat.toFixed(MEMORY_LOCATION_PRECISION)},${lon.toFixed(MEMORY_LOCATION_PRECISION)}`;
    }
    return '';
}

function sanitizeMemoryEntries(entries) {
    if (!Array.isArray(entries)) return [];
    const normalized = entries.map(normalizeMemoryEntry).filter(Boolean);
    if (normalized.length <= MEMORY_MAX_TOTAL) return normalized;
    return normalized.slice(normalized.length - MEMORY_MAX_TOTAL);
}

function parseMemoryPayload(rawParsed) {
    if (Array.isArray(rawParsed)) {
        return {
            schemaVersion: 1,
            entries: rawParsed,
            migrated: true
        };
    }
    if (rawParsed && typeof rawParsed === 'object') {
        const schemaVersion = Number(rawParsed.schemaVersion || rawParsed.version || 1);
        const entries = Array.isArray(rawParsed.entries)
            ? rawParsed.entries
            : Array.isArray(rawParsed.memories)
                ? rawParsed.memories
                : null;
        if (entries) {
            return {
                schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : 1,
                entries,
                migrated: schemaVersion !== MEMORY_SCHEMA_VERSION || !Array.isArray(rawParsed.entries)
            };
        }
    }
    return null;
}

function createMemoryPayload(entries, schemaVersion = MEMORY_SCHEMA_VERSION) {
    return {
        kind: MEMORY_PACK_KIND,
        schemaVersion,
        updatedAt: new Date().toISOString(),
        entries: entries.map((entry) => ({
            id: entry.id,
            type: entry.type === 'flower' ? 'flower' : 'pin',
            message: clampMessage(entry.message),
            lat: Number(entry.lat),
            lon: Number(entry.lon),
            locationKey: normalizeLocationKey(entry.locationKey, Number(entry.lat), Number(entry.lon)),
            locationLabel: clampLocationLabel(entry.locationLabel),
            createdAt: parseDateSafe(entry.createdAt)
        }))
    };
}

function getMemoryConflictMode(raw) {
    const value = String(raw || MEMORY_CONFLICT_KEEP_EXISTING).toLowerCase();
    if (value === MEMORY_CONFLICT_REPLACE_LOCATION) return MEMORY_CONFLICT_REPLACE_LOCATION;
    if (value === MEMORY_CONFLICT_REPLACE_ALL) return MEMORY_CONFLICT_REPLACE_ALL;
    return MEMORY_CONFLICT_KEEP_EXISTING;
}

function dedupeMemoryEntriesById(entries) {
    const byId = new Map();
    entries.forEach((entry) => {
        const normalized = normalizeMemoryEntry(entry);
        if (!normalized) return;
        const existing = byId.get(normalized.id);
        if (!existing) {
            byId.set(normalized.id, normalized);
            return;
        }
        const existingTs = new Date(existing.createdAt).getTime();
        const candidateTs = new Date(normalized.createdAt).getTime();
        if (!Number.isFinite(existingTs) || candidateTs >= existingTs) {
            byId.set(normalized.id, normalized);
        }
    });
    return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function mergeImportedMemoryEntries(importedEntries, conflictMode) {
    const normalizedImported = dedupeMemoryEntriesById(importedEntries);
    if (normalizedImported.length === 0) {
        return {
            nextEntries: memoryEntries.slice(),
            importedCount: 0,
            skippedCount: 0,
            removedCount: 0
        };
    }

    if (conflictMode === MEMORY_CONFLICT_REPLACE_ALL) {
        const trimmed = normalizedImported.length <= MEMORY_MAX_TOTAL
            ? normalizedImported
            : normalizedImported.slice(normalizedImported.length - MEMORY_MAX_TOTAL);
        return {
            nextEntries: trimmed,
            importedCount: trimmed.length,
            skippedCount: Math.max(0, normalizedImported.length - trimmed.length),
            removedCount: memoryEntries.length
        };
    }

    let baseEntries = memoryEntries.slice();
    let removedCount = 0;
    if (conflictMode === MEMORY_CONFLICT_REPLACE_LOCATION) {
        const replaceKeys = new Set(normalizedImported.map((entry) => entry.locationKey).filter(Boolean));
        const originalCount = baseEntries.length;
        baseEntries = baseEntries.filter((entry) => !replaceKeys.has(entry.locationKey));
        removedCount = originalCount - baseEntries.length;
    }

    const existingIds = new Set(baseEntries.map((entry) => entry.id));
    const merged = baseEntries.slice();
    let importedCount = 0;
    let skippedCount = 0;

    normalizedImported.forEach((entry) => {
        if (existingIds.has(entry.id)) {
            skippedCount += 1;
            return;
        }
        merged.push(entry);
        existingIds.add(entry.id);
        importedCount += 1;
    });

    const trimmed = merged.length <= MEMORY_MAX_TOTAL ? merged : merged.slice(merged.length - MEMORY_MAX_TOTAL);
    skippedCount += Math.max(0, merged.length - trimmed.length);

    return {
        nextEntries: trimmed,
        importedCount,
        skippedCount,
        removedCount
    };
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
        storageKey: MEMORY_STORAGE_KEY,
        schemaVersion: MEMORY_SCHEMA_VERSION
    };
}

function getCurrentLocationKey() {
    if (!LOC || !isFiniteNumber(LOC.lat) || !isFiniteNumber(LOC.lon)) return null;
    return `${LOC.lat.toFixed(MEMORY_LOCATION_PRECISION)},${LOC.lon.toFixed(MEMORY_LOCATION_PRECISION)}`;
}

function getCurrentLocationLabel() {
    if (selLoc === 'custom') return (customLoc && customLoc.name) ? customLoc.name : 'Custom Location';
    if (LOCS && selLoc && LOCS[selLoc]) return LOCS[selLoc].name;
    return 'Current Location';
}

function worldToLatLonSafe(x, z) {
    if (typeof worldToLatLon === 'function') {
        const ll = worldToLatLon(x, z);
        if (ll && isFiniteNumber(ll.lat) && isFiniteNumber(ll.lon)) return ll;
    }
    const lat = LOC.lat - (z / SCALE);
    const lon = LOC.lon + (x / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));
    return { lat, lon };
}

function latLonToWorldSafe(lat, lon) {
    const x = (lon - LOC.lon) * SCALE * Math.cos(LOC.lat * Math.PI / 180);
    const z = -(lat - LOC.lat) * SCALE;
    return { x, z };
}

function getGroundYAt(x, z) {
    if (typeof elevationWorldYAtWorldXZ === 'function') {
        const y = elevationWorldYAtWorldXZ(x, z);
        if (isFiniteNumber(y)) return y;
    }
    return 0;
}

function isInsideFootprintSafe(x, z, pts) {
    if (!Array.isArray(pts) || pts.length < 3) return false;
    if (typeof pointInPolygon === 'function') {
        return !!pointInPolygon(x, z, pts);
    }
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, zi = pts[i].z;
        const xj = pts[j].x, zj = pts[j].z;
        const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getBuildingRoofYAt(x, z, groundY) {
    if (!Array.isArray(buildings) || buildings.length === 0) return null;
    const candidates = (typeof getNearbyBuildings === 'function')
        ? (getNearbyBuildings(x, z, 28) || [])
        : buildings;
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

    if (typeof getBuildTopSurfaceAtWorldXZ === 'function') {
        const blockY = getBuildTopSurfaceAtWorldXZ(x, z, Infinity);
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
        id: String(raw.id || createMemoryEntryId()),
        type: raw.type === 'flower' ? 'flower' : 'pin',
        message,
        lat,
        lon,
        locationKey: normalizeLocationKey(raw.locationKey, lat, lon),
        locationLabel: clampLocationLabel(raw.locationLabel),
        createdAt: parseDateSafe(raw.createdAt)
    };
}

function loadMemoryEntriesFromStorage() {
    if (!memoryPersistenceEnabled) return [];
    try {
        const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const payload = parseMemoryPayload(parsed);
        if (!payload) return [];
        const normalized = sanitizeMemoryEntries(payload.entries);
        if (payload.migrated) {
            try {
                localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(createMemoryPayload(normalized)));
            } catch (migrationErr) {
                console.warn('[memory] Failed to persist migrated payload:', migrationErr);
            }
        }
        return normalized;
    } catch (err) {
        console.warn('[memory] Failed to read storage:', err);
        return [];
    }
}

function saveMemoryEntriesToStorage() {
    if (!memoryPersistenceEnabled) return false;
    try {
        const sanitizedEntries = sanitizeMemoryEntries(memoryEntries);
        if (sanitizedEntries.length !== memoryEntries.length) {
            memoryEntries = sanitizedEntries;
        }

        const payloadObj = createMemoryPayload(memoryEntries);
        const serializedPayload = JSON.stringify(payloadObj);
        if (serializedPayload.length > MEMORY_MAX_STORAGE_BYTES) {
            memoryPersistenceDetail = `Storage limit reached (${Math.round(MEMORY_MAX_STORAGE_BYTES / 1024)}KB). Remove some memories and try again.`;
            updatePersistenceHint();
            return false;
        }
        localStorage.setItem(MEMORY_STORAGE_KEY, serializedPayload);
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

function ensureMemoryGroup() {
    if (!scene) return null;
    if (!memoryGroup) {
        memoryGroup = new THREE.Group();
        memoryGroup.name = 'memoryMarkers';
    }
    if (memoryGroup.parent !== scene) {
        scene.add(memoryGroup);
    }
    return memoryGroup;
}

function clearRenderedMemoryMarkers() {
    memoryHitboxes = [];
    if (!memoryGroup) return;
    while (memoryGroup.children.length > 0) {
        const child = memoryGroup.children[memoryGroup.children.length - 1];
        memoryGroup.remove(child);
        disposeObject3D(child);
    }
}

function buildPinMarker(entry) {
    const root = new THREE.Group();
    root.name = `memoryPin_${entry.id}`;

    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.55, 10),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.42, metalness: 0.2 })
    );
    stem.position.y = 0.9;
    root.add(stem);

    const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.15 })
    );
    cap.position.y = 1.74;
    root.add(cap);

    const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.32, 12),
        new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.55, metalness: 0.05 })
    );
    tip.position.y = 0.16;
    root.add(tip);

    return root;
}

function buildFlowerMarker(entry) {
    const root = new THREE.Group();
    root.name = `memoryFlower_${entry.id}`;

    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 1.45, 9),
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55, metalness: 0.05 })
    );
    stem.position.y = 0.82;
    root.add(stem);

    const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.1 })
    );
    center.position.y = 1.6;
    root.add(center);

    const petalMaterial = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.35, metalness: 0.05 });
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), petalMaterial.clone());
        petal.position.set(Math.cos(angle) * 0.24, 1.6, Math.sin(angle) * 0.24);
        root.add(petal);
    }

    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6, metalness: 0.03 });
    const leafA = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), leafMaterial);
    leafA.scale.set(1.5, 0.45, 0.8);
    leafA.position.set(0.17, 0.74, 0);
    root.add(leafA);

    const leafB = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), leafMaterial.clone());
    leafB.scale.set(1.5, 0.45, 0.8);
    leafB.position.set(-0.16, 0.62, 0.04);
    root.add(leafB);

    return root;
}

function createMarkerForEntry(entry, x, y, z) {
    const marker = entry.type === 'flower' ? buildFlowerMarker(entry) : buildPinMarker(entry);
    marker.position.set(x, y + 0.02, z);
    marker.userData = { isMemoryMarker: true, memoryEntryId: entry.id };
    marker.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = false;
        }
    });

    const hitbox = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 10, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.position.y = 1.1;
    hitbox.userData = { isMemoryMarkerHitbox: true, memoryEntryId: entry.id };
    marker.add(hitbox);
    memoryHitboxes.push(hitbox);

    return marker;
}

function getEntriesForCurrentLocation() {
    const key = getCurrentLocationKey();
    if (!key) return [];
    return memoryEntries.filter((entry) => entry.locationKey === key);
}

function getMemoryEntriesForCurrentLocation() {
    return getEntriesForCurrentLocation().map((entry) => ({
        id: entry.id,
        type: entry.type,
        lat: entry.lat,
        lon: entry.lon,
        message: entry.message,
        locationKey: entry.locationKey,
        locationLabel: entry.locationLabel,
        createdAt: entry.createdAt
    }));
}

function refreshMemoryMarkersForCurrentLocation() {
    const group = ensureMemoryGroup();
    if (!group) return;

    clearRenderedMemoryMarkers();

    if (!isEnv || !ENV || !isEnv(ENV.EARTH)) return;

    const entries = getEntriesForCurrentLocation();
    entries.forEach((entry) => {
        const worldPos = latLonToWorldSafe(entry.lat, entry.lon);
        if (!isFiniteNumber(worldPos.x) || !isFiniteNumber(worldPos.z)) return;
        const y = getTopSurfaceYAt(worldPos.x, worldPos.z);
        const marker = createMarkerForEntry(entry, worldPos.x, y, worldPos.z);
        group.add(marker);
    });

    const infoPanel = document.getElementById('memoryInfoPanel');
    if (infoPanel && selectedMemoryEntryId && !entries.some((e) => e.id === selectedMemoryEntryId)) {
        infoPanel.classList.remove('show');
        selectedMemoryEntryId = null;
    }
}

function clearMemoryMarkersForWorldReload() {
    clearRenderedMemoryMarkers();
    const infoPanel = document.getElementById('memoryInfoPanel');
    if (infoPanel) infoPanel.classList.remove('show');
    selectedMemoryEntryId = null;
}

function getPlacementReferencePosition() {
    if (droneMode && drone) {
        return { x: drone.x, z: drone.z };
    }
    if (Walk && Walk.state && Walk.state.mode === 'walk' && Walk.state.walker) {
        return { x: Walk.state.walker.x, z: Walk.state.walker.z };
    }
    if (car) {
        return { x: car.x, z: car.z };
    }
    return null;
}

function setComposerType(type) {
    selectedMemoryType = type === 'flower' ? 'flower' : 'pin';
    const pinBtn = document.getElementById('memoryTypePin');
    const flowerBtn = document.getElementById('memoryTypeFlower');
    if (pinBtn) pinBtn.classList.toggle('active', selectedMemoryType === 'pin');
    if (flowerBtn) flowerBtn.classList.toggle('active', selectedMemoryType === 'flower');
}

function setComposerStatus(text, isError) {
    const el = document.getElementById('memoryComposerStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
}

function updateComposerCharCount() {
    const input = document.getElementById('memoryMessageInput');
    const count = document.getElementById('memoryCharCount');
    if (!input || !count) return;
    const msg = String(input.value || '');
    count.textContent = `${msg.length}/${MEMORY_MAX_MESSAGE_LENGTH}`;
}

function openMemoryComposer(defaultType = 'pin') {
    if (!gameStarted) return;
    const panel = document.getElementById('memoryComposer');
    const input = document.getElementById('memoryMessageInput');
    if (!panel || !input) return;
    panel.classList.add('show');
    setComposerType(defaultType);
    updatePersistenceHint();
    if (!memoryPersistenceEnabled) {
        setComposerStatus('Persistent storage unavailable. Enable local storage for this site.', true);
    } else {
        setComposerStatus('Drop point: your current surface position.', false);
    }
    updateComposerCharCount();
    input.focus();
}

function closeMemoryComposer() {
    const panel = document.getElementById('memoryComposer');
    const input = document.getElementById('memoryMessageInput');
    if (panel) panel.classList.remove('show');
    if (input) input.value = '';
    updateComposerCharCount();
    setComposerStatus('', false);
}

function showMemoryInfo(entry) {
    const panel = document.getElementById('memoryInfoPanel');
    const title = document.getElementById('memoryInfoTitle');
    const text = document.getElementById('memoryInfoText');
    const meta = document.getElementById('memoryInfoMeta');
    if (!panel || !title || !text || !meta) return;

    selectedMemoryEntryId = entry.id;
    title.textContent = entry.type === 'flower' ? 'Flower Memory' : 'Pin Memory';
    text.textContent = entry.message;

    const date = new Date(entry.createdAt);
    const dateText = Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unknown time';
    meta.textContent = `${entry.locationLabel} • ${dateText}`;

    panel.classList.add('show');
}

function hideMemoryInfo() {
    const panel = document.getElementById('memoryInfoPanel');
    if (panel) panel.classList.remove('show');
    selectedMemoryEntryId = null;
}

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

function buildMemoryExportPack(scope = 'current') {
    const resolvedScope = scope === 'all' ? 'all' : 'current';
    const sourceEntries = resolvedScope === 'all' ? memoryEntries : getEntriesForCurrentLocation();
    return {
        kind: MEMORY_PACK_KIND,
        schemaVersion: MEMORY_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        scope: resolvedScope,
        locationKey: resolvedScope === 'current' ? getCurrentLocationKey() : null,
        locationLabel: resolvedScope === 'current' ? clampLocationLabel(getCurrentLocationLabel()) : null,
        entries: sourceEntries.map((entry) => ({
            id: entry.id,
            type: entry.type === 'flower' ? 'flower' : 'pin',
            message: clampMessage(entry.message),
            lat: Number(entry.lat),
            lon: Number(entry.lon),
            locationKey: normalizeLocationKey(entry.locationKey, Number(entry.lat), Number(entry.lon)),
            locationLabel: clampLocationLabel(entry.locationLabel),
            createdAt: parseDateSafe(entry.createdAt)
        }))
    };
}

function exportMemoryPack(options = {}) {
    return buildMemoryExportPack(options.scope);
}

function downloadMemoryPack(options = {}) {
    const pack = buildMemoryExportPack(options.scope);
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        return false;
    }
    const scopeLabel = pack.scope === 'all' ? 'all' : (pack.locationKey || 'current');
    const safeScope = String(scopeLabel).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = options.fileName || `worldexplorer3d-memory-${safeScope}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
    return true;
}

function importMemoryPack(rawPack, options = {}) {
    if (!memoryPersistenceEnabled) {
        return { ok: false, error: 'Persistent storage unavailable.' };
    }

    let parsed;
    try {
        parsed = typeof rawPack === 'string' ? JSON.parse(rawPack) : rawPack;
    } catch (err) {
        return { ok: false, error: `Invalid JSON: ${err && err.message ? err.message : String(err)}` };
    }

    const payload = parseMemoryPayload(parsed);
    if (!payload) {
        return { ok: false, error: 'Unsupported memory pack format.' };
    }

    const importedEntries = sanitizeMemoryEntries(payload.entries);
    const conflictMode = getMemoryConflictMode(options.conflictMode || options.conflict);
    const mergeResult = mergeImportedMemoryEntries(importedEntries, conflictMode);
    const previousEntries = memoryEntries.slice();
    memoryEntries = mergeResult.nextEntries;

    if (!saveMemoryEntriesToStorage()) {
        memoryEntries = previousEntries;
        return { ok: false, error: memoryPersistenceDetail || 'Failed to persist imported memories.' };
    }

    refreshMemoryMarkersForCurrentLocation();
    return {
        ok: true,
        schemaVersion: MEMORY_SCHEMA_VERSION,
        importedTotal: importedEntries.length,
        importedApplied: mergeResult.importedCount,
        skipped: mergeResult.skippedCount,
        removed: mergeResult.removedCount,
        totalAfterImport: memoryEntries.length,
        conflictMode
    };
}

function placeMemoryFromComposer() {
    if (!gameStarted) return;
    if (!memoryPersistenceEnabled) {
        setComposerStatus('Persistent storage unavailable. Marker placement is disabled.', true);
        return;
    }
    if (!isEnv || !ENV || !isEnv(ENV.EARTH)) {
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
        id: createMemoryEntryId(),
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
    if (!gameStarted) return;
    if (!isEnv || !ENV || !isEnv(ENV.EARTH)) return;
    if (!renderer || !camera || memoryHitboxes.length === 0) return;

    const target = event.target;
    if (target && target.closest && target.closest('#memoryComposer, #memoryInfoPanel, #floatMenuContainer, #largeMap, #titleScreen, #propertyPanel, #historicPanel, #propertyModal, #controlsTab')) {
        return;
    }

    const canvas = renderer.domElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

    memoryMouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    memoryMouse.y = -((y - rect.top) / rect.height) * 2 + 1;
    memoryRaycaster.setFromCamera(memoryMouse, camera);
    const intersections = memoryRaycaster.intersectObjects(memoryHitboxes, false);
    if (!intersections || intersections.length === 0) return;

    const entryId = intersections[0].object && intersections[0].object.userData
        ? intersections[0].object.userData.memoryEntryId
        : null;
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

function registerMemoryFeature() {
    if (typeof registerFeature !== 'function') return;
    registerFeature({
        id: 'memory.markers',
        name: 'Memory Markers',
        version: '1.0.0',
        init() {
            setupMemoryUI();
        },
        onEnvEnter(nextEnv) {
            if (nextEnv === (globalThis.ENV && globalThis.ENV.EARTH)) {
                refreshMemoryMarkersForCurrentLocation();
            }
        },
        onEnvExit(prevEnv, nextEnv) {
            if (prevEnv === (globalThis.ENV && globalThis.ENV.EARTH) && nextEnv !== prevEnv) {
                closeMemoryComposer();
                hideMemoryInfo();
                clearRenderedMemoryMarkers();
            }
        },
        dispose() {
            closeMemoryComposer();
            hideMemoryInfo();
            clearRenderedMemoryMarkers();
        }
    }, { replace: true });
}

{
    const storageState = detectPersistentStorage();
    memoryPersistenceEnabled = storageState.enabled;
    memoryPersistenceDetail = storageState.detail;
}
memoryEntries = loadMemoryEntriesFromStorage();
bindMemorySceneClick();
registerMemoryFeature();

Object.assign(globalThis, {
    clearMemoryMarkersForWorldReload,
    closeMemoryComposer,
    downloadMemoryPack,
    exportMemoryPack,
    getMemoryEntriesForCurrentLocation,
    importMemoryPack,
    getMemoryPersistenceStatus,
    openMemoryComposer,
    refreshMemoryMarkersForCurrentLocation,
    setupMemoryUI
});

export {
    clearMemoryMarkersForWorldReload,
    closeMemoryComposer,
    downloadMemoryPack,
    exportMemoryPack,
    getMemoryEntriesForCurrentLocation,
    importMemoryPack,
    getMemoryPersistenceStatus,
    openMemoryComposer,
    refreshMemoryMarkersForCurrentLocation,
    setupMemoryUI
};
