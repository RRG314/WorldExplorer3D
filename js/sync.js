// ============================================================================
// sync.js - Supabase-backed multiplayer sync layer for blocks + memory markers
// ============================================================================

const SYNC_SUPABASE_URL_KEY = 'worldExplorer3D.supabase.url';
const SYNC_SUPABASE_ANON_KEY = 'worldExplorer3D.supabase.anonKey';
const SYNC_CLIENT_ID_KEY = 'worldExplorer3D.sync.clientId.v1';
const SYNC_TABLE_NAME = 'world_placeables';

const SYNC_LOCATION_PRECISION = 5;
const SYNC_CHUNK_SIZE = 200;
const SYNC_CHUNK_RADIUS = 2;
const SYNC_POLL_MS = 3500;
const SYNC_FLUSH_MS = 900;
const SYNC_SCHEMA_VERSION = 1;
const SYNC_WRITE_LIMIT_PER_MINUTE = 30;
const SYNC_MAX_BLOCKS_PER_CHUNK = 2000;
const SYNC_MAX_MEMORIES_PER_CHUNK = 200;

const SYNC_ALLOWED_TYPES = new Set(['block', 'pin', 'flower']);

let syncCreateClient = null;
let syncClient = null;
let syncEnabled = false;
let syncDetail = 'Supabase sync is disabled. Add URL + anon key in Settings.';
let syncError = false;
let syncPolling = false;
let syncFlushing = false;
let syncLastPollAt = 0;
let syncLastFlushAt = 0;
let syncClientId = null;

let syncActiveEnv = null;
let syncActiveLocationKey = null;
const syncChunkRows = new Map(); // chunkKey -> Map<id, row>
const syncPendingWrites = [];
const syncWriteTimes = [];

function isFiniteNumber(v) {
    return Number.isFinite(v);
}

function sanitizeFreeText(value, limit = 200) {
    return String(value || '')
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, limit);
}

function sanitizeLocationLabel(value) {
    const cleaned = String(value || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .trim()
        .slice(0, 120);
    return cleaned || 'Unknown';
}

function parseIso(value) {
    if (!value) return null;
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return null;
    return dt.toISOString();
}

function setSyncStatus(detail, isError = false) {
    syncDetail = String(detail || '').slice(0, 240);
    syncError = !!isError;
}

function getSyncStatus() {
    return {
        enabled: syncEnabled,
        ready: !!syncClient,
        detail: syncDetail,
        error: syncError,
        queueLength: syncPendingWrites.length,
        lastPollAt: syncLastPollAt || null,
        lastFlushAt: syncLastFlushAt || null,
        chunkSize: SYNC_CHUNK_SIZE,
        chunkRadius: SYNC_CHUNK_RADIUS,
        writeLimitPerMinute: SYNC_WRITE_LIMIT_PER_MINUTE,
        maxChunkBlocks: SYNC_MAX_BLOCKS_PER_CHUNK,
        maxChunkMemories: SYNC_MAX_MEMORIES_PER_CHUNK,
        clientId: syncClientId || null
    };
}

function getStoredSyncConfig() {
    try {
        const url = String(localStorage.getItem(SYNC_SUPABASE_URL_KEY) || '').trim();
        const anonKey = String(localStorage.getItem(SYNC_SUPABASE_ANON_KEY) || '').trim();
        return { url, anonKey };
    } catch {
        return { url: '', anonKey: '' };
    }
}

function setStoredSyncConfig(url, anonKey) {
    const safeUrl = String(url || '').trim();
    const safeKey = String(anonKey || '').trim();
    try {
        if (safeUrl) localStorage.setItem(SYNC_SUPABASE_URL_KEY, safeUrl);
        else localStorage.removeItem(SYNC_SUPABASE_URL_KEY);

        if (safeKey) localStorage.setItem(SYNC_SUPABASE_ANON_KEY, safeKey);
        else localStorage.removeItem(SYNC_SUPABASE_ANON_KEY);
    } catch (err) {
        setSyncStatus(`Failed to persist Supabase config: ${err && err.message ? err.message : String(err)}`, true);
    }
}

function getOrCreateClientId() {
    if (syncClientId) return syncClientId;
    try {
        const existing = String(localStorage.getItem(SYNC_CLIENT_ID_KEY) || '').trim();
        if (existing) {
            syncClientId = existing;
            return syncClientId;
        }
    } catch {
        // no-op
    }

    const fresh = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    syncClientId = fresh;
    try {
        localStorage.setItem(SYNC_CLIENT_ID_KEY, fresh);
    } catch {
        // no-op
    }
    return syncClientId;
}

function resetRemoteChunkState() {
    syncChunkRows.clear();
    syncActiveEnv = null;
    syncActiveLocationKey = null;
}

function normalizeEnv(raw) {
    const env = String(raw || '').toLowerCase();
    if (env === 'moon') return 'moon';
    if (env === 'space') return 'space';
    return 'earth';
}

function getCurrentEnv() {
    if (typeof isEnv === 'function' && typeof ENV !== 'undefined') {
        if (isEnv(ENV.SPACE_FLIGHT)) return 'space';
        if (isEnv(ENV.MOON)) return 'moon';
        return 'earth';
    }
    if (globalThis.onMoon) return 'moon';
    return 'earth';
}

function getCurrentLocationKey() {
    const loc = globalThis.LOC;
    if (!loc || !isFiniteNumber(loc.lat) || !isFiniteNumber(loc.lon)) return null;
    return `${loc.lat.toFixed(SYNC_LOCATION_PRECISION)},${loc.lon.toFixed(SYNC_LOCATION_PRECISION)}`;
}

function getReferencePosition() {
    if (globalThis.droneMode && globalThis.drone) {
        return { x: Number(globalThis.drone.x), z: Number(globalThis.drone.z) };
    }
    if (globalThis.Walk && globalThis.Walk.state && globalThis.Walk.state.mode === 'walk' && globalThis.Walk.state.walker) {
        return {
            x: Number(globalThis.Walk.state.walker.x),
            z: Number(globalThis.Walk.state.walker.z)
        };
    }
    if (globalThis.car) {
        return { x: Number(globalThis.car.x), z: Number(globalThis.car.z) };
    }
    return null;
}

function chunkPrefix(env) {
    if (env === 'moon') return 'M';
    if (env === 'space') return 'S';
    return 'E';
}

function chunkKeyForWorld(env, x, z) {
    const cx = Math.floor(x / SYNC_CHUNK_SIZE);
    const cz = Math.floor(z / SYNC_CHUNK_SIZE);
    return `${chunkPrefix(env)}:${cx},${cz}`;
}

function nearbyChunkKeys(env, x, z, radius = SYNC_CHUNK_RADIUS) {
    const keys = [];
    const cx = Math.floor(x / SYNC_CHUNK_SIZE);
    const cz = Math.floor(z / SYNC_CHUNK_SIZE);
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            keys.push(`${chunkPrefix(env)}:${cx + dx},${cz + dz}`);
        }
    }
    return keys;
}

async function loadSupabaseLibrary() {
    if (typeof syncCreateClient === 'function') return true;
    try {
        const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        if (!mod || typeof mod.createClient !== 'function') {
            throw new Error('Supabase createClient is unavailable');
        }
        syncCreateClient = mod.createClient;
        return true;
    } catch (err) {
        setSyncStatus(`Could not load Supabase client library: ${err && err.message ? err.message : String(err)}`, true);
        return false;
    }
}

async function initSyncClient() {
    const cfg = getStoredSyncConfig();
    if (!cfg.url || !cfg.anonKey) {
        syncEnabled = false;
        syncClient = null;
        setSyncStatus('Supabase sync is disabled. Add URL + anon key in Settings.', false);
        return false;
    }

    const libReady = await loadSupabaseLibrary();
    if (!libReady) {
        syncEnabled = false;
        syncClient = null;
        return false;
    }

    try {
        syncClient = syncCreateClient(cfg.url, cfg.anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
        syncEnabled = true;
        setSyncStatus('Supabase sync is active.', false);
        return true;
    } catch (err) {
        syncEnabled = false;
        syncClient = null;
        setSyncStatus(`Supabase client init failed: ${err && err.message ? err.message : String(err)}`, true);
        return false;
    }
}

function trimWriteTimes(nowMs) {
    while (syncWriteTimes.length > 0 && (nowMs - syncWriteTimes[0]) > 60000) {
        syncWriteTimes.shift();
    }
}

function hasWriteBudget(nowMs = Date.now()) {
    trimWriteTimes(nowMs);
    return syncWriteTimes.length < SYNC_WRITE_LIMIT_PER_MINUTE;
}

function consumeWriteBudget(nowMs = Date.now()) {
    trimWriteTimes(nowMs);
    if (syncWriteTimes.length >= SYNC_WRITE_LIMIT_PER_MINUTE) return false;
    syncWriteTimes.push(nowMs);
    return true;
}

function normalizeSyncAction(rawAction) {
    if (!rawAction || typeof rawAction !== 'object') return null;

    const op = rawAction.op === 'delete' ? 'delete' : 'upsert';
    const type = String(rawAction.type || '').toLowerCase();
    if (!SYNC_ALLOWED_TYPES.has(type)) return null;

    const id = String(rawAction.id || '').trim();
    if (!id) return null;

    const env = normalizeEnv(rawAction.env || getCurrentEnv());
    const locationKey = String(rawAction.locationKey || getCurrentLocationKey() || '').trim();
    if (!locationKey) return null;

    const x = Number(rawAction.x);
    const y = Number(rawAction.y);
    const z = Number(rawAction.z);
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null;

    const lat = Number(rawAction.lat);
    const lon = Number(rawAction.lon);
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;

    const chunkKey = String(rawAction.chunkKey || chunkKeyForWorld(env, x, z));
    if (!chunkKey) return null;

    const metaSource = rawAction.meta && typeof rawAction.meta === 'object' ? rawAction.meta : {};
    let meta = {};

    if (type === 'block') {
        const gx = Math.round(Number(metaSource.gx));
        const gy = Math.round(Number(metaSource.gy));
        const gz = Math.round(Number(metaSource.gz));
        const materialIndex = Math.max(0, Math.min(3, Math.round(Number(metaSource.materialIndex) || 0)));
        if (!isFiniteNumber(gx) || !isFiniteNumber(gy) || !isFiniteNumber(gz)) return null;
        meta = { gx, gy, gz, materialIndex };
    } else {
        const note = sanitizeFreeText(metaSource.note || rawAction.message || '', 200);
        if (op === 'upsert' && !note) return null;
        meta = {
            note,
            locationLabel: sanitizeLocationLabel(metaSource.locationLabel || rawAction.locationLabel || 'Unknown')
        };
    }

    return {
        op,
        id,
        type,
        env,
        locationKey,
        chunkKey,
        x,
        y,
        z,
        lat: Number(lat.toFixed(7)),
        lon: Number(lon.toFixed(7)),
        createdAt: parseIso(rawAction.createdAt) || new Date().toISOString(),
        meta
    };
}

function getChunkTypeCount(chunkKey, type) {
    const rows = syncChunkRows.get(chunkKey);
    if (!rows || rows.size === 0) return 0;
    let count = 0;
    rows.forEach((row) => {
        if (row && row.type === type && !row.deletedAt) count++;
    });
    return count;
}

function enqueueWorldPlaceableSync(rawAction) {
    const action = normalizeSyncAction(rawAction);
    if (!action) return false;

    if (action.op === 'upsert') {
        if (action.type === 'block') {
            const existing = getChunkTypeCount(action.chunkKey, 'block');
            if (existing >= SYNC_MAX_BLOCKS_PER_CHUNK) {
                setSyncStatus(`Chunk limit reached (${SYNC_MAX_BLOCKS_PER_CHUNK} blocks).`, true);
                return false;
            }
        } else {
            const pins = getChunkTypeCount(action.chunkKey, 'pin');
            const flowers = getChunkTypeCount(action.chunkKey, 'flower');
            if ((pins + flowers) >= SYNC_MAX_MEMORIES_PER_CHUNK) {
                setSyncStatus(`Chunk limit reached (${SYNC_MAX_MEMORIES_PER_CHUNK} markers).`, true);
                return false;
            }
        }
    }

    const nowMs = Date.now();
    if (!hasWriteBudget(nowMs)) {
        setSyncStatus(`Write rate limit reached (${SYNC_WRITE_LIMIT_PER_MINUTE}/min).`, true);
        return false;
    }

    const existingIdx = syncPendingWrites.findIndex((pending) => pending.id === action.id);
    if (existingIdx >= 0) syncPendingWrites.splice(existingIdx, 1);
    syncPendingWrites.push(action);
    return true;
}

function actionToDbRow(action) {
    const nowIso = new Date().toISOString();
    return {
        id: action.id,
        env: action.env,
        location_key: action.locationKey,
        chunk_key: action.chunkKey,
        type: action.type,
        x: action.x,
        y: action.y,
        z: action.z,
        lat: action.lat,
        lon: action.lon,
        meta: action.meta,
        author_id: getOrCreateClientId(),
        schema_version: SYNC_SCHEMA_VERSION,
        created_at: action.createdAt || nowIso,
        updated_at: nowIso,
        deleted_at: action.op === 'delete' ? nowIso : null
    };
}

async function flushSyncQueue() {
    if (syncFlushing || syncPendingWrites.length === 0) return;
    if (!syncClient) {
        const ok = await initSyncClient();
        if (!ok) return;
    }
    if (!syncClient) return;

    syncFlushing = true;
    try {
        while (syncPendingWrites.length > 0) {
            const action = syncPendingWrites[0];
            if (!consumeWriteBudget(Date.now())) {
                setSyncStatus(`Write rate limit reached (${SYNC_WRITE_LIMIT_PER_MINUTE}/min).`, true);
                break;
            }

            const row = actionToDbRow(action);
            const { error } = await syncClient
                .from(SYNC_TABLE_NAME)
                .upsert(row, { onConflict: 'id' });

            if (error) {
                setSyncStatus(`Supabase write failed: ${error.message || String(error)}`, true);
                break;
            }

            syncPendingWrites.shift();
            syncLastFlushAt = Date.now();
        }
    } catch (err) {
        setSyncStatus(`Supabase write error: ${err && err.message ? err.message : String(err)}`, true);
    } finally {
        syncFlushing = false;
    }
}

function normalizeRemoteRow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const type = String(raw.type || '').toLowerCase();
    if (!id || !SYNC_ALLOWED_TYPES.has(type)) return null;

    const env = normalizeEnv(raw.env || 'earth');
    const locationKey = String(raw.location_key || raw.locationKey || '').trim();
    const chunkKey = String(raw.chunk_key || raw.chunkKey || '').trim();
    if (!locationKey || !chunkKey) return null;

    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    const lat = Number(raw.lat);
    const lon = Number(raw.lon);
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;

    const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
    const createdAt = parseIso(raw.created_at || raw.createdAt) || new Date().toISOString();
    const updatedAt = parseIso(raw.updated_at || raw.updatedAt) || createdAt;
    const deletedAt = parseIso(raw.deleted_at || raw.deletedAt);

    return {
        id,
        type,
        env,
        locationKey,
        chunkKey,
        x,
        y,
        z,
        lat,
        lon,
        meta,
        createdAt,
        updatedAt,
        deletedAt
    };
}

function applyRemoteRows(changedRows) {
    if (!Array.isArray(changedRows) || changedRows.length === 0) return;

    const blockRows = changedRows.filter((row) => row.type === 'block');
    const memoryRows = changedRows.filter((row) => row.type === 'pin' || row.type === 'flower');

    if (blockRows.length > 0 && typeof mergeRemoteBuildSyncRows === 'function') {
        mergeRemoteBuildSyncRows(blockRows);
    }
    if (memoryRows.length > 0 && typeof mergeRemoteMemorySyncRows === 'function') {
        mergeRemoteMemorySyncRows(memoryRows);
    }
}

function rowHasChanged(prev, next) {
    if (!prev) return true;
    if (prev.updatedAt !== next.updatedAt) return true;
    if (prev.deletedAt !== next.deletedAt) return true;
    return false;
}

function processChunkPayload(chunkKeys, rows) {
    const activeChunks = new Set(chunkKeys);
    const rowsByChunk = new Map();
    activeChunks.forEach((chunkKey) => rowsByChunk.set(chunkKey, new Map()));

    rows.forEach((row) => {
        if (!row || !activeChunks.has(row.chunkKey)) return;
        const chunkRows = rowsByChunk.get(row.chunkKey);
        chunkRows.set(row.id, row);
    });

    const changedRows = [];

    activeChunks.forEach((chunkKey) => {
        const prevRows = syncChunkRows.get(chunkKey) || new Map();
        const nextRows = rowsByChunk.get(chunkKey) || new Map();

        nextRows.forEach((nextRow, id) => {
            const prevRow = prevRows.get(id);
            if (rowHasChanged(prevRow, nextRow)) {
                changedRows.push(nextRow);
            }
        });

        syncChunkRows.set(chunkKey, nextRows);
    });

    Array.from(syncChunkRows.keys()).forEach((chunkKey) => {
        if (!activeChunks.has(chunkKey)) syncChunkRows.delete(chunkKey);
    });

    applyRemoteRows(changedRows);
}

async function pollSyncChunks() {
    if (syncPolling) return;
    if (!globalThis.gameStarted) return;

    const env = getCurrentEnv();
    if (env !== 'earth') return;

    const locationKey = getCurrentLocationKey();
    const pos = getReferencePosition();
    if (!locationKey || !pos || !isFiniteNumber(pos.x) || !isFiniteNumber(pos.z)) return;

    if (!syncClient) {
        const ok = await initSyncClient();
        if (!ok) return;
    }
    if (!syncClient || !syncEnabled) return;

    syncPolling = true;
    try {
        if (syncActiveLocationKey !== locationKey || syncActiveEnv !== env) {
            resetRemoteChunkState();
            syncActiveLocationKey = locationKey;
            syncActiveEnv = env;
        }

        const chunkKeys = nearbyChunkKeys(env, pos.x, pos.z, SYNC_CHUNK_RADIUS);
        const { data, error } = await syncClient
            .from(SYNC_TABLE_NAME)
            .select('id,env,location_key,chunk_key,type,x,y,z,lat,lon,meta,created_at,updated_at,deleted_at')
            .eq('env', env)
            .eq('location_key', locationKey)
            .eq('schema_version', SYNC_SCHEMA_VERSION)
            .in('chunk_key', chunkKeys)
            .limit(8000);

        if (error) {
            setSyncStatus(`Supabase sync read failed: ${error.message || String(error)}`, true);
            return;
        }

        const normalizedRows = Array.isArray(data)
            ? data.map(normalizeRemoteRow).filter(Boolean)
            : [];

        processChunkPayload(chunkKeys, normalizedRows);
        syncLastPollAt = Date.now();
        if (!syncError) {
            setSyncStatus(`Supabase sync active (${chunkKeys.length} chunks, ${syncPendingWrites.length} queued writes).`, false);
        }
    } catch (err) {
        setSyncStatus(`Supabase sync polling error: ${err && err.message ? err.message : String(err)}`, true);
    } finally {
        syncPolling = false;
    }
}

async function saveSupabaseSyncConfig(url, anonKey) {
    setStoredSyncConfig(url, anonKey);
    resetRemoteChunkState();
    syncClient = null;
    const ok = await initSyncClient();
    if (!ok) {
        return getSyncStatus();
    }
    await pollSyncChunks();
    await flushSyncQueue();
    return getSyncStatus();
}

function getSupabaseSyncConfig() {
    const cfg = getStoredSyncConfig();
    return {
        url: cfg.url,
        anonKey: cfg.anonKey
    };
}

function requestImmediateWorldSync() {
    void pollSyncChunks();
    void flushSyncQueue();
}

function bootWorldSync() {
    getOrCreateClientId();
    void initSyncClient();
    setInterval(() => {
        void flushSyncQueue();
    }, SYNC_FLUSH_MS);
    setInterval(() => {
        void pollSyncChunks();
    }, SYNC_POLL_MS);
}

bootWorldSync();

Object.assign(globalThis, {
    enqueueWorldPlaceableSync,
    getSupabaseSyncConfig,
    getWorldSyncStatus: getSyncStatus,
    requestImmediateWorldSync,
    saveSupabaseSyncConfig
});

export {
    enqueueWorldPlaceableSync,
    getSupabaseSyncConfig,
    getSyncStatus as getWorldSyncStatus,
    requestImmediateWorldSync,
    saveSupabaseSyncConfig
};
