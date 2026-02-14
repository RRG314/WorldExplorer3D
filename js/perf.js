// ============================================================================
// perf.js - Runtime performance mode + benchmark telemetry for RDT comparisons
// ============================================================================

const PERF_MODE_RDT = 'rdt';
const PERF_MODE_BASELINE = 'baseline';
const PERF_STORAGE_MODE_KEY = 'worldExplorerPerfMode';
const PERF_STORAGE_OVERLAY_KEY = 'worldExplorerPerfOverlay';

let perfMode = PERF_MODE_RDT;
let perfOverlayEnabled = false;

let _perfFps = 0;
let _perfFrameMs = 0;
let _perfFrameAccum = 0;
let _perfFrameCount = 0;
let _perfLoadStart = null;

const perfStats = {
    mode: PERF_MODE_RDT,
    lastLoad: null,
    renderer: {
        calls: 0,
        triangles: 0,
        points: 0,
        lines: 0,
        geometries: 0,
        textures: 0,
        programs: 0
    },
    live: {
        speedMph: 0,
        terrainRing: (typeof TERRAIN_RING === 'number') ? TERRAIN_RING : 0,
        lodVisible: { near: 0, mid: 0 },
        worldCounts: { roads: 0, buildings: 0, poiMeshes: 0, landuseMeshes: 0 }
    },
    updatedAt: Date.now()
};

function exposeMutableGlobal(name, getter, setter) {
    Object.defineProperty(globalThis, name, {
        configurable: true,
        enumerable: true,
        get: getter,
        set: setter
    });
}

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Ignore storage failures (private browsing / blocked storage).
    }
}

function normalizePerfMode(mode) {
    return mode === PERF_MODE_BASELINE ? PERF_MODE_BASELINE : PERF_MODE_RDT;
}

function getPerfMode() {
    return perfMode;
}

function setPerfMode(mode, options = {}) {
    const normalized = normalizePerfMode(mode);
    perfMode = normalized;
    perfStats.mode = normalized;

    const persist = options.persist !== false;
    if (persist) writeStorage(PERF_STORAGE_MODE_KEY, normalized);
    return normalized;
}

function getPerfOverlayEnabled() {
    return !!perfOverlayEnabled;
}

function setPerfOverlayEnabled(enabled, options = {}) {
    perfOverlayEnabled = !!enabled;
    const persist = options.persist !== false;
    if (persist) writeStorage(PERF_STORAGE_OVERLAY_KEY, perfOverlayEnabled ? '1' : '0');
    return perfOverlayEnabled;
}

function setPerfLiveStat(key, value) {
    if (!key) return;
    perfStats.live[key] = value;
}

function mergePerfLiveStats(values = {}) {
    if (!values || typeof values !== 'object') return;
    Object.keys(values).forEach((key) => {
        perfStats.live[key] = values[key];
    });
}

function startPerfLoad(label, meta = {}) {
    _perfLoadStart = {
        label: label || 'world-load',
        mode: perfMode,
        startedAt: performance.now(),
        meta
    };
}

function finishPerfLoad(summary = {}) {
    const now = performance.now();
    const startedAt = _perfLoadStart?.startedAt;
    const loadMs = Number.isFinite(startedAt)
        ? (now - startedAt)
        : (Number.isFinite(summary.loadMs) ? summary.loadMs : 0);

    perfStats.lastLoad = {
        label: _perfLoadStart?.label || summary.label || 'world-load',
        mode: _perfLoadStart?.mode || perfMode,
        loadMs: Math.max(0, Math.round(loadMs)),
        timestamp: new Date().toISOString(),
        ...(typeof _perfLoadStart?.meta === 'object' ? _perfLoadStart.meta : {}),
        ...(typeof summary === 'object' ? summary : {})
    };
    _perfLoadStart = null;
    perfStats.updatedAt = Date.now();
}

function recordPerfFrame(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    const frameMs = dt * 1000;
    _perfFrameMs = _perfFrameMs <= 0 ? frameMs : (_perfFrameMs * 0.9 + frameMs * 0.1);

    _perfFrameAccum += dt;
    _perfFrameCount += 1;
    if (_perfFrameAccum >= 0.5) {
        _perfFps = _perfFrameCount / _perfFrameAccum;
        _perfFrameAccum = 0;
        _perfFrameCount = 0;
    }

    perfStats.live.fps = Number.isFinite(_perfFps) ? _perfFps : 0;
    perfStats.live.frameMs = Number.isFinite(_perfFrameMs) ? _perfFrameMs : 0;

    const currentSpeedMph = (() => {
        if (typeof droneMode !== 'undefined' && droneMode && typeof drone !== 'undefined') {
            return Math.max(0, Math.abs((drone.speed || 0) * 1.8));
        }
        if (
            typeof Walk !== 'undefined' &&
            Walk &&
            Walk.state &&
            Walk.state.mode === 'walk'
        ) {
            return Math.max(0, Math.abs(Walk.state.walker?.speedMph || 0));
        }
        if (typeof car !== 'undefined' && car) {
            return Math.max(0, Math.abs((car.speed || 0) * 0.5));
        }
        return 0;
    })();
    perfStats.live.speedMph = currentSpeedMph;
}

function recordPerfRendererInfo(rendererRef) {
    if (!rendererRef || !rendererRef.info) return;
    const info = rendererRef.info;
    const render = info.render || {};
    const memory = info.memory || {};
    const programs = Array.isArray(info.programs) ? info.programs.length : (info.programs || 0);

    perfStats.renderer.calls = render.calls || 0;
    perfStats.renderer.triangles = render.triangles || 0;
    perfStats.renderer.points = render.points || 0;
    perfStats.renderer.lines = render.lines || 0;
    perfStats.renderer.geometries = memory.geometries || 0;
    perfStats.renderer.textures = memory.textures || 0;
    perfStats.renderer.programs = programs || 0;

    perfStats.live.worldCounts = {
        roads: (typeof roads !== 'undefined' && Array.isArray(roads)) ? roads.length : 0,
        buildings: (typeof buildingMeshes !== 'undefined' && Array.isArray(buildingMeshes)) ? buildingMeshes.length : 0,
        poiMeshes: (typeof poiMeshes !== 'undefined' && Array.isArray(poiMeshes)) ? poiMeshes.length : 0,
        landuseMeshes: (typeof landuseMeshes !== 'undefined' && Array.isArray(landuseMeshes)) ? landuseMeshes.length : 0
    };
    perfStats.updatedAt = Date.now();
}

function formatPerfNumber(n) {
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n));
}

function capturePerfSnapshot(extra = {}) {
    const locName = (() => {
        if (typeof selLoc === 'undefined') return 'Unknown';
        if (selLoc === 'custom' && typeof customLoc !== 'undefined') return customLoc?.name || 'Custom';
        if (typeof LOCS !== 'undefined' && LOCS && LOCS[selLoc]) return LOCS[selLoc].name;
        return String(selLoc);
    })();

    return {
        generatedAt: new Date().toISOString(),
        location: locName,
        mode: perfMode,
        fps: Number((perfStats.live.fps || 0).toFixed(2)),
        frameMs: Number((perfStats.live.frameMs || 0).toFixed(2)),
        renderer: { ...perfStats.renderer },
        live: { ...perfStats.live },
        lastLoad: perfStats.lastLoad ? { ...perfStats.lastLoad } : null,
        ...extra
    };
}

async function copyPerfSnapshotToClipboard(extra = {}) {
    const snapshot = capturePerfSnapshot(extra);
    const text = JSON.stringify(snapshot, null, 2);

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return snapshot;
    }
    throw new Error('Clipboard API unavailable in this browser context.');
}

function updatePerfPanel(force = false) {
    const panel = document.getElementById('perfPanel');
    if (!panel) return;

    const shouldShow = !!perfOverlayEnabled && !!gameStarted;
    if (!shouldShow) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    const lastLoad = perfStats.lastLoad || {};
    const r = perfStats.renderer;
    const live = perfStats.live || {};
    const lod = live.lodVisible || {};
    const counts = live.worldCounts || {};

    const lines = [
        `MODE: ${String(perfMode).toUpperCase()}`,
        `FPS: ${(live.fps || 0).toFixed(1)} | FRAME: ${(live.frameMs || 0).toFixed(1)} ms`,
        `DRAW: ${formatPerfNumber(r.calls)} | TRI: ${formatPerfNumber(r.triangles)}`,
        `GEO: ${formatPerfNumber(r.geometries)} | TEX: ${formatPerfNumber(r.textures)} | PROG: ${formatPerfNumber(r.programs)}`,
        `LOAD: ${Number.isFinite(lastLoad.loadMs) ? `${lastLoad.loadMs} ms` : '--'}`,
        `FEATURES: R${counts.roads || 0} B${counts.buildings || 0} P${counts.poiMeshes || 0} L${counts.landuseMeshes || 0}`,
        `LOD: NEAR ${lod.near || 0} | MID ${lod.mid || 0}`,
        `TERRAIN RING: ${Number.isFinite(live.terrainRing) ? live.terrainRing : '--'} | SPEED ${Math.round(live.speedMph || 0)} mph`
    ];

    if (force || panel.textContent !== lines.join('\n')) {
        panel.textContent = lines.join('\n');
    }
}

setPerfMode(readStorage(PERF_STORAGE_MODE_KEY), { persist: false });
setPerfOverlayEnabled(readStorage(PERF_STORAGE_OVERLAY_KEY) === '1', { persist: false });

exposeMutableGlobal('perfMode', () => perfMode, (value) => {
    setPerfMode(value, { persist: false });
});
exposeMutableGlobal('perfOverlayEnabled', () => perfOverlayEnabled, (value) => {
    setPerfOverlayEnabled(value, { persist: false });
});

Object.assign(globalThis, {
    PERF_MODE_BASELINE,
    PERF_MODE_RDT,
    capturePerfSnapshot,
    copyPerfSnapshotToClipboard,
    finishPerfLoad,
    getPerfMode,
    getPerfOverlayEnabled,
    mergePerfLiveStats,
    perfStats,
    recordPerfFrame,
    recordPerfRendererInfo,
    setPerfLiveStat,
    setPerfMode,
    setPerfOverlayEnabled,
    startPerfLoad,
    updatePerfPanel
});

export {
    PERF_MODE_BASELINE,
    PERF_MODE_RDT,
    capturePerfSnapshot,
    copyPerfSnapshotToClipboard,
    finishPerfLoad,
    getPerfMode,
    getPerfOverlayEnabled,
    mergePerfLiveStats,
    perfMode,
    perfOverlayEnabled,
    perfStats,
    recordPerfFrame,
    recordPerfRendererInfo,
    setPerfLiveStat,
    setPerfMode,
    setPerfOverlayEnabled,
    startPerfLoad,
    updatePerfPanel
};
