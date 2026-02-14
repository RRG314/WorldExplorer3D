// ============================================================================
// blocks.js - Lightweight voxel-style builder (place/stack/remove brick blocks)
// ============================================================================

const BUILD_BLOCK_SIZE = 1;
const BUILD_HALF = BUILD_BLOCK_SIZE * 0.5;
const BUILD_MAX_DISTANCE = 260;
const BUILD_BLOCK_COLORS = [0xb55239, 0xa74631, 0x9a3d2b, 0xc16345];

const BUILD_STORAGE_KEY = 'worldExplorer3D.buildBlocks.v1';
const BUILD_STORAGE_TEST_KEY = 'worldExplorer3D.buildBlocks.test';
const BUILD_LOCATION_PRECISION = 5;
const BUILD_MAX_PER_LOCATION = 100;
const BUILD_MAX_TOTAL = 100;

let buildModeEnabled = false;
let buildGroup = null;
let buildGeometry = null;
let buildRaycaster = null;

let buildPersistenceEnabled = false;
let buildPersistenceDetail = 'Not initialized.';
let buildEntries = [];
let buildIndicatorResetTimer = null;

const buildBlocks = new Map();
const buildColumns = new Map();
const buildMaterials = [];
const buildMouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;
const buildPlane = typeof THREE !== 'undefined' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : null;
const buildTempPoint = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
const buildNormalMatrix = typeof THREE !== 'undefined' ? new THREE.Matrix3() : null;

function isFiniteNumber(v) {
    return Number.isFinite(v);
}

function toGridCoord(v) {
    return Math.round(v / BUILD_BLOCK_SIZE);
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

function getLocRef() {
    const loc = globalThis.LOC;
    if (!loc || !isFiniteNumber(loc.lat) || !isFiniteNumber(loc.lon)) return null;
    return loc;
}

function getCurrentLocationKey() {
    const loc = getLocRef();
    if (!loc) return null;
    return `${loc.lat.toFixed(BUILD_LOCATION_PRECISION)},${loc.lon.toFixed(BUILD_LOCATION_PRECISION)}`;
}

function worldToLatLonSafe(x, z) {
    if (typeof worldToLatLon === 'function') {
        const ll = worldToLatLon(x, z);
        if (ll && isFiniteNumber(ll.lat) && isFiniteNumber(ll.lon)) return ll;
    }
    const loc = getLocRef();
    if (!loc || !isFiniteNumber(SCALE) || SCALE === 0) return null;
    const lat = loc.lat - (z / SCALE);
    const lon = loc.lon + (x / (SCALE * Math.cos(loc.lat * Math.PI / 180)));
    return { lat, lon };
}

function latLonToWorldSafe(lat, lon) {
    const loc = getLocRef();
    if (!loc || !isFiniteNumber(SCALE) || SCALE === 0) return { x: NaN, z: NaN };
    const x = (lon - loc.lon) * SCALE * Math.cos(loc.lat * Math.PI / 180);
    const z = -(lat - loc.lat) * SCALE;
    return { x, z };
}

function detectBuildStorage() {
    try {
        if (!globalThis.localStorage) {
            return { enabled: false, detail: 'localStorage is unavailable in this environment.' };
        }
        localStorage.setItem(BUILD_STORAGE_TEST_KEY, 'ok');
        const probe = localStorage.getItem(BUILD_STORAGE_TEST_KEY);
        localStorage.removeItem(BUILD_STORAGE_TEST_KEY);
        if (probe !== 'ok') return { enabled: false, detail: 'Storage round-trip check failed.' };
        return { enabled: true, detail: 'Storage round-trip check passed.' };
    } catch (err) {
        return { enabled: false, detail: `Storage access blocked: ${err && err.message ? err.message : String(err)}` };
    }
}

function getBuildPersistenceStatus() {
    return {
        enabled: buildPersistenceEnabled,
        detail: buildPersistenceDetail,
        storageKey: BUILD_STORAGE_KEY
    };
}

function getBuildLimits() {
    const locationKey = getCurrentLocationKey();
    let locationCount = 0;
    if (locationKey) {
        locationCount = buildEntries.reduce((count, entry) =>
            count + (entry.locationKey === locationKey ? 1 : 0), 0);
    }
    return {
        maxPerLocation: BUILD_MAX_PER_LOCATION,
        maxTotal: BUILD_MAX_TOTAL,
        currentLocationCount: locationCount,
        totalCount: buildEntries.length
    };
}

function getBuildIndicatorDefaultHtml() {
    return '🧱 Build Mode ON<br>Click to place blocks, Shift+Click to remove.<br>Press B to toggle.';
}

function showBuildTransientMessage(text) {
    const indicator = document.getElementById('buildModeIndicator');
    if (!indicator) return;
    indicator.classList.add('show');
    indicator.innerHTML = `🧱 ${String(text || '').slice(0, 160)}`;

    if (buildIndicatorResetTimer) {
        clearTimeout(buildIndicatorResetTimer);
        buildIndicatorResetTimer = null;
    }
    buildIndicatorResetTimer = setTimeout(() => {
        const target = document.getElementById('buildModeIndicator');
        if (!target) return;
        if (buildModeEnabled) {
            target.innerHTML = getBuildIndicatorDefaultHtml();
        } else {
            target.classList.remove('show');
        }
        buildIndicatorResetTimer = null;
    }, 2200);
}

function canPersistBuildBlocks() {
    if (typeof isEnv === 'function' && typeof ENV !== 'undefined') {
        return isEnv(ENV.EARTH);
    }
    return !onMoon;
}

function normalizeBuildEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const locationKey = String(raw.locationKey || '');
    const lat = Number(raw.lat);
    const lon = Number(raw.lon);
    const gy = Number(raw.gy);
    const gx = Number(raw.gx);
    const gz = Number(raw.gz);
    const materialIndex = Number(raw.materialIndex);

    if (!locationKey) return null;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
    if (!isFiniteNumber(gy)) return null;

    return {
        id: String(raw.id || `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
        locationKey,
        lat: Number(lat.toFixed(7)),
        lon: Number(lon.toFixed(7)),
        gx: Number.isInteger(gx) ? gx : null,
        gy: Math.round(gy),
        gz: Number.isInteger(gz) ? gz : null,
        materialIndex: Number.isInteger(materialIndex) ? materialIndex : 0,
        createdAt: String(raw.createdAt || new Date().toISOString())
    };
}

function loadBuildEntriesFromStorage() {
    if (!buildPersistenceEnabled) return [];
    try {
        const raw = localStorage.getItem(BUILD_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const normalized = parsed.map(normalizeBuildEntry).filter(Boolean);
        if (normalized.length <= BUILD_MAX_TOTAL) return normalized;
        return normalized.slice(normalized.length - BUILD_MAX_TOTAL);
    } catch (err) {
        console.warn('[blocks] Failed to read storage:', err);
        return [];
    }
}

function saveBuildEntriesToStorage() {
    if (!buildPersistenceEnabled) return false;
    try {
        localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(buildEntries));
        return true;
    } catch (err) {
        buildPersistenceEnabled = false;
        buildPersistenceDetail = `Storage write failed: ${err && err.message ? err.message : String(err)}`;
        console.warn('[blocks] Failed to save storage:', err);
        return false;
    }
}

function getBuildEntriesForCurrentLocation() {
    const locationKey = getCurrentLocationKey();
    if (!locationKey) return [];
    return buildEntries.filter((entry) => entry.locationKey === locationKey);
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

function getBuildRaycaster() {
    if (!buildRaycaster && typeof THREE !== 'undefined') {
        buildRaycaster = new THREE.Raycaster();
        buildRaycaster.far = 1200;
    }
    return buildRaycaster;
}

function ensureBuildMaterials() {
    if (buildMaterials.length > 0 || typeof THREE === 'undefined') return;
    BUILD_BLOCK_COLORS.forEach((color) => {
        buildMaterials.push(new THREE.MeshStandardMaterial({
            color,
            roughness: 0.92,
            metalness: 0.04
        }));
    });
}

function ensureBuildGeometry() {
    if (!buildGeometry && typeof THREE !== 'undefined') {
        buildGeometry = new THREE.BoxGeometry(BUILD_BLOCK_SIZE, BUILD_BLOCK_SIZE, BUILD_BLOCK_SIZE);
    }
}

function ensureBuildGroup() {
    if (!scene || typeof THREE === 'undefined') return null;
    if (!buildGroup) {
        buildGroup = new THREE.Group();
        buildGroup.name = 'buildBlocksGroup';
    }
    if (buildGroup.parent !== scene) {
        scene.add(buildGroup);
    }
    return buildGroup;
}

function getBuildReferencePosition() {
    if (droneMode) {
        return { x: drone.x, y: drone.y, z: drone.z };
    }
    if (Walk && Walk.state && Walk.state.mode === 'walk' && Walk.state.walker) {
        return {
            x: Walk.state.walker.x,
            y: Walk.state.walker.y,
            z: Walk.state.walker.z
        };
    }
    return { x: car.x, y: car.y || 0, z: car.z };
}

function getSurfaceYAt(x, z) {
    if (onMoon && moonSurface && typeof _getPhysRaycaster === 'function' && _physRayStart && _physRayDir) {
        const raycaster = _getPhysRaycaster();
        _physRayStart.set(x, 2000, z);
        raycaster.set(_physRayStart, _physRayDir);
        const hits = raycaster.intersectObject(moonSurface, false);
        if (hits.length > 0) return hits[0].point.y;
    }
    if (typeof terrainMeshHeightAt === 'function') return terrainMeshHeightAt(x, z);
    if (typeof elevationWorldYAtWorldXZ === 'function') return elevationWorldYAtWorldXZ(x, z);
    return 0;
}

function isBuildClickBlocked(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
        '#titleScreen, #largeMap, #propertyPanel, #propertyModal, #historicPanel, #memoryComposer, ' +
        '#memoryInfoPanel, #floatMenuContainer, #controlsTab, #pauseScreen, #resultScreen, #caughtScreen, ' +
        '#legendPanel, #mapInfoPanel, #mainMenuBtn, #realEstateBtn, #historicBtn, #memoryFlowerFloatBtn, #starInfo, #solarSystemInfoPanel'
    );
}

function snapFaceNormalToAxis(faceNormal, object) {
    if (!faceNormal || !object || typeof THREE === 'undefined') return { x: 0, y: 1, z: 0 };
    const worldNormal = faceNormal.clone();
    buildNormalMatrix.getNormalMatrix(object.matrixWorld);
    worldNormal.applyMatrix3(buildNormalMatrix).normalize();

    const ax = Math.abs(worldNormal.x);
    const ay = Math.abs(worldNormal.y);
    const az = Math.abs(worldNormal.z);

    if (ax >= ay && ax >= az) return { x: worldNormal.x >= 0 ? 1 : -1, y: 0, z: 0 };
    if (ay >= ax && ay >= az) return { x: 0, y: worldNormal.y >= 0 ? 1 : -1, z: 0 };
    return { x: 0, y: 0, z: worldNormal.z >= 0 ? 1 : -1 };
}

function persistPlacedBuildBlock(gx, gy, gz, materialIndex) {
    if (!buildPersistenceEnabled) return true;
    if (!canPersistBuildBlocks()) return true;
    const locationKey = getCurrentLocationKey();
    if (!locationKey || !getLocRef()) return false;

    const existingIndex = buildEntries.findIndex((entry) =>
        entry.locationKey === locationKey && entry.gx === gx && entry.gy === gy && entry.gz === gz
    );
    if (existingIndex < 0) {
        const locationCount = buildEntries.reduce((count, entry) =>
            count + (entry.locationKey === locationKey ? 1 : 0), 0);
        if (locationCount >= BUILD_MAX_PER_LOCATION || buildEntries.length >= BUILD_MAX_TOTAL) {
            return false;
        }
    }

    const worldX = toWorldCoord(gx);
    const worldZ = toWorldCoord(gz);
    const latLon = worldToLatLonSafe(worldX, worldZ);
    if (!latLon || !isFiniteNumber(latLon.lat) || !isFiniteNumber(latLon.lon)) return false;

    const prev = buildEntries.slice();
    const idx = existingIndex;

    const nextEntry = normalizeBuildEntry({
        id: idx >= 0 ? buildEntries[idx].id : undefined,
        locationKey,
        lat: latLon.lat,
        lon: latLon.lon,
        gx,
        gy,
        gz,
        materialIndex: Number.isInteger(materialIndex) ? materialIndex : 0,
        createdAt: idx >= 0 ? buildEntries[idx].createdAt : new Date().toISOString()
    });
    if (!nextEntry) return false;

    if (idx >= 0) buildEntries[idx] = nextEntry;
    else buildEntries.push(nextEntry);

    if (buildEntries.length > BUILD_MAX_TOTAL) {
        buildEntries = buildEntries.slice(buildEntries.length - BUILD_MAX_TOTAL);
    }

    if (!saveBuildEntriesToStorage()) {
        buildEntries = prev;
        return false;
    }
    return true;
}

function persistRemovedBuildBlock(gx, gy, gz) {
    if (!buildPersistenceEnabled) return true;
    if (!canPersistBuildBlocks()) return true;
    const locationKey = getCurrentLocationKey();
    if (!locationKey) return false;

    const next = buildEntries.filter((entry) =>
        !(entry.locationKey === locationKey && entry.gx === gx && entry.gy === gy && entry.gz === gz)
    );
    if (next.length === buildEntries.length) return true;

    const prev = buildEntries;
    buildEntries = next;
    if (!saveBuildEntriesToStorage()) {
        buildEntries = prev;
        return false;
    }
    return true;
}

function clearPersistedBuildBlocksForCurrentLocation() {
    if (!buildPersistenceEnabled) return true;
    if (!canPersistBuildBlocks()) return true;
    const locationKey = getCurrentLocationKey();
    if (!locationKey) return false;

    const next = buildEntries.filter((entry) => entry.locationKey !== locationKey);
    if (next.length === buildEntries.length) return true;

    const prev = buildEntries;
    buildEntries = next;
    if (!saveBuildEntriesToStorage()) {
        buildEntries = prev;
        return false;
    }
    return true;
}

function placeBuildBlock(gx, gy, gz, materialIndex = null, options = {}) {
    if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) return false;
    const group = ensureBuildGroup();
    if (!group) return false;
    ensureBuildMaterials();
    ensureBuildGeometry();

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

    const idx = Number.isInteger(materialIndex)
        ? Math.max(0, Math.min(buildMaterials.length - 1, materialIndex))
        : Math.floor(Math.random() * buildMaterials.length);

    const mesh = new THREE.Mesh(buildGeometry, buildMaterials[idx]);
    mesh.position.set(toWorldCoord(gx), toWorldCoord(gy), toWorldCoord(gz));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
        isBuildBlock: true,
        buildBlock: true,
        materialIndex: idx,
        gx, gy, gz,
        blockKey: key
    };

    group.add(mesh);
    buildBlocks.set(key, mesh);
    addBuildColumnEntry(gx, gy, gz);

    if (options.persist !== false) {
        if (!persistPlacedBuildBlock(gx, gy, gz, idx)) {
            if (mesh.parent) mesh.parent.remove(mesh);
            buildBlocks.delete(key);
            removeBuildColumnEntry(gx, gy, gz);
            showBuildTransientMessage(`Limit reached (${BUILD_MAX_PER_LOCATION} blocks max). Remove some blocks to continue.`);
            return false;
        }
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
    if (options.persist !== false) {
        clearPersistedBuildBlocksForCurrentLocation();
    }
    clearRenderedBuildBlocks();
}

function forEachBlockAtWorldXZ(x, z, cb) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || typeof cb !== 'function') return;
    const baseGX = toGridCoord(x);
    const baseGZ = toGridCoord(z);
    const epsilon = 0.000001;

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const gx = baseGX + dx;
            const gz = baseGZ + dz;
            const cx = toWorldCoord(gx);
            const cz = toWorldCoord(gz);
            if (Math.abs(x - cx) > BUILD_HALF + epsilon || Math.abs(z - cz) > BUILD_HALF + epsilon) continue;

            const ys = buildColumns.get(columnKey(gx, gz));
            if (!ys || ys.size === 0) continue;
            ys.forEach((gy) => cb(gx, gy, gz));
        }
    }
}

function getBuildTopSurfaceAtWorldXZ(x, z, maxTopY = Infinity) {
    let best = -Infinity;
    forEachBlockAtWorldXZ(x, z, (_, gy) => {
        const topY = toWorldCoord(gy) + BUILD_HALF;
        if (topY <= maxTopY + 0.0001 && topY > best) best = topY;
    });
    return Number.isFinite(best) ? best : null;
}

function getBuildCollisionAtWorldXZ(x, z, feetY, stepHeight = 0.65) {
    if (!Number.isFinite(feetY)) {
        return { blocked: false, stepTopY: null };
    }

    let blocked = false;
    let stepTopY = -Infinity;

    forEachBlockAtWorldXZ(x, z, (_, gy) => {
        const bottomY = toWorldCoord(gy) - BUILD_HALF;
        const topY = toWorldCoord(gy) + BUILD_HALF;

        if (feetY < bottomY - 0.02) return;
        if (feetY >= topY - 0.02) return;

        const requiredStep = topY - feetY;
        if (requiredStep <= stepHeight + 0.0001) {
            if (topY > stepTopY) stepTopY = topY;
            return;
        }
        blocked = true;
    });

    return {
        blocked,
        stepTopY: Number.isFinite(stepTopY) ? stepTopY : null
    };
}

function updateBuildModeUI() {
    const toggleBtn = document.getElementById('fBlockBuild');
    if (toggleBtn) {
        toggleBtn.classList.toggle('on', buildModeEnabled);
        toggleBtn.textContent = buildModeEnabled ? '🧱 Build Mode: ON' : '🧱 Build Mode';
    }

    const indicator = document.getElementById('buildModeIndicator');
    if (indicator) {
        if (buildModeEnabled) {
            indicator.innerHTML = getBuildIndicatorDefaultHtml();
        }
        indicator.classList.toggle('show', buildModeEnabled);
    }
}

function setBuildModeEnabled(nextState) {
    buildModeEnabled = !!nextState;
    if (buildModeEnabled) {
        ensureBuildGroup();
        if (typeof clearStarSelection === 'function') clearStarSelection();
    }
    updateBuildModeUI();
    return buildModeEnabled;
}

function toggleBlockBuildMode(forceState) {
    if (!gameStarted) return false;
    if (typeof isEnv === 'function' && typeof ENV !== 'undefined' && isEnv(ENV.SPACE_FLIGHT)) {
        return false;
    }
    const next = typeof forceState === 'boolean' ? forceState : !buildModeEnabled;
    return setBuildModeEnabled(next);
}

function raycastBuildAction(event) {
    const raycaster = getBuildRaycaster();
    if (!raycaster || !camera || !renderer || !buildMouse) return null;

    const canvasRect = renderer.domElement.getBoundingClientRect();
    buildMouse.x = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    buildMouse.y = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
    raycaster.setFromCamera(buildMouse, camera);

    // Existing blocks take precedence for stacking/removal.
    if (buildGroup && buildGroup.children.length > 0) {
        const hits = raycaster.intersectObjects(buildGroup.children, false);
        if (hits.length > 0) {
            const hit = hits[0];
            const data = hit.object && hit.object.userData ? hit.object.userData : null;
            if (data && Number.isFinite(data.gx) && Number.isFinite(data.gy) && Number.isFinite(data.gz)) {
                if (event.shiftKey) {
                    return { kind: 'remove', gx: data.gx, gy: data.gy, gz: data.gz };
                }
                const n = snapFaceNormalToAxis(hit.face && hit.face.normal, hit.object);
                return {
                    kind: 'place',
                    gx: data.gx + n.x,
                    gy: data.gy + n.y,
                    gz: data.gz + n.z
                };
            }
        }
    }

    if (event.shiftKey) return null;

    // Place on world surface if not targeting an existing block.
    let point = null;
    const worldTargets = [];
    if (Array.isArray(roadMeshes)) {
        roadMeshes.forEach((mesh) => {
            if (mesh && mesh.visible) worldTargets.push(mesh);
        });
    }
    if (Array.isArray(buildingMeshes)) {
        buildingMeshes.forEach((mesh) => {
            if (mesh && mesh.visible) worldTargets.push(mesh);
        });
    }
    if (Array.isArray(landuseMeshes)) {
        landuseMeshes.forEach((mesh) => {
            if (mesh && mesh.visible) worldTargets.push(mesh);
        });
    }
    if (onMoon && moonSurface && moonSurface.visible !== false) {
        worldTargets.push(moonSurface);
    }

    if (worldTargets.length > 0) {
        const worldHits = raycaster.intersectObjects(worldTargets, true);
        if (worldHits.length > 0) {
            point = worldHits[0].point.clone();
        }
    }

    if (!point) {
        if (!buildPlane || !buildTempPoint || !raycaster.ray.intersectPlane(buildPlane, buildTempPoint)) {
            return null;
        }
        point = buildTempPoint.clone();
        point.y = getSurfaceYAt(point.x, point.z);
    }

    const gy = toGridCoord(point.y + BUILD_HALF);
    return {
        kind: 'place',
        gx: toGridCoord(point.x),
        gy,
        gz: toGridCoord(point.z)
    };
}

function handleBlockBuilderClick(event) {
    if (!buildModeEnabled || !gameStarted || paused || showLargeMap) return false;
    if (typeof isEnv === 'function' && typeof ENV !== 'undefined' && isEnv(ENV.SPACE_FLIGHT)) return false;
    if (isBuildClickBlocked(event.target)) return false;

    const action = raycastBuildAction(event);
    if (!action) return false;

    const worldX = toWorldCoord(action.gx);
    const worldY = toWorldCoord(action.gy);
    const worldZ = toWorldCoord(action.gz);
    const ref = getBuildReferencePosition();
    const dist = Math.hypot(worldX - ref.x, worldY - ref.y, worldZ - ref.z);
    if (dist > BUILD_MAX_DISTANCE) return true;

    if (action.kind === 'remove') {
        removeBuildBlock(action.gx, action.gy, action.gz);
        return true;
    }
    if (action.kind === 'place') {
        placeBuildBlock(action.gx, action.gy, action.gz);
        return true;
    }
    return false;
}

function clearBlockBuilderForWorldReload() {
    clearRenderedBuildBlocks();
}

function refreshBlockBuilderForCurrentLocation() {
    ensureBuildGroup();
    clearRenderedBuildBlocks();

    const entries = getBuildEntriesForCurrentLocation();
    entries.forEach((entry) => {
        if (!isFiniteNumber(entry.lat) || !isFiniteNumber(entry.lon) || !isFiniteNumber(entry.gy)) return;
        const worldPos = latLonToWorldSafe(entry.lat, entry.lon);
        if (!isFiniteNumber(worldPos.x) || !isFiniteNumber(worldPos.z)) return;
        const gx = toGridCoord(worldPos.x);
        const gz = toGridCoord(worldPos.z);
        placeBuildBlock(gx, Math.round(entry.gy), gz, entry.materialIndex, { persist: false, enforceLimit: false });
    });
}

{
    const storageState = detectBuildStorage();
    buildPersistenceEnabled = storageState.enabled;
    buildPersistenceDetail = storageState.detail;
}
buildEntries = loadBuildEntriesFromStorage();

Object.assign(globalThis, {
    clearAllBuildBlocks,
    clearBlockBuilderForWorldReload,
    getBuildCollisionAtWorldXZ,
    getBuildLimits,
    getBuildPersistenceStatus,
    getBuildTopSurfaceAtWorldXZ,
    handleBlockBuilderClick,
    placeBuildBlock,
    refreshBlockBuilderForCurrentLocation,
    setBuildModeEnabled,
    toggleBlockBuildMode
});

export {
    clearAllBuildBlocks,
    clearBlockBuilderForWorldReload,
    getBuildCollisionAtWorldXZ,
    getBuildLimits,
    getBuildPersistenceStatus,
    getBuildTopSurfaceAtWorldXZ,
    handleBlockBuilderClick,
    placeBuildBlock,
    refreshBlockBuilderForCurrentLocation,
    setBuildModeEnabled,
    toggleBlockBuildMode
};
