import {
  normalizeBlockMaterial,
  normalizeBlockRotation,
  normalizeBlockShape
} from './catalog.js?v=4';

export function createSharedBlockSync(options = {}) {
  const { blockKey, onRefresh, toVerticalGridCoord } = options;
  let enabled = false;
  let roomId = '';
  let entries = [];
  let entryMap = new Map();
  let upsertFn = null;
  let removeFn = null;
  let clearMineFn = null;

  function isActive() {
    return enabled && !!roomId;
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const gx = Number(raw.gx);
    const gy = Number(raw.gy);
    const gz = Number(raw.gz);
    if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) return null;
    return {
      id: String(raw.id || `${Math.round(gx)}_${Math.round(gy)}_${Math.round(gz)}`),
      gx: Math.round(gx),
      gy: toVerticalGridCoord(gy),
      gz: Math.round(gz),
      materialIndex: normalizeBlockMaterial(raw.materialIndex),
      shape: normalizeBlockShape(raw.shape),
      rotation: normalizeBlockRotation(raw.rotation)
    };
  }

  function keyFor(entry) {
    return blockKey(entry.gx, entry.gy, entry.gz);
  }

  function replaceEntries(nextEntries = []) {
    entryMap = new Map();
    entries = [];
    nextEntries.forEach((raw) => {
      const entry = normalizeEntry(raw);
      if (!entry) return;
      entryMap.set(keyFor(entry), entry);
      entries.push(entry);
    });
  }

  function setEntries(nextEntries = []) {
    replaceEntries(nextEntries);
    if (isActive()) onRefresh?.();
  }

  function configure(config = {}) {
    const nextEnabled = config.enabled === true && typeof config.roomId === 'string' && config.roomId.length > 0;
    const nextRoomId = nextEnabled ? String(config.roomId) : '';
    const roomChanged = roomId !== nextRoomId || enabled !== nextEnabled;
    enabled = nextEnabled;
    roomId = nextRoomId;
    upsertFn = enabled && typeof config.upsert === 'function' ? config.upsert : null;
    removeFn = enabled && typeof config.remove === 'function' ? config.remove : null;
    clearMineFn = enabled && typeof config.clearMine === 'function' ? config.clearMine : null;
    if (!enabled || roomChanged) replaceEntries([]);
    onRefresh?.();
  }

  function upsert(raw, onFailure) {
    const entry = normalizeEntry(raw);
    if (!entry) return null;
    const key = keyFor(entry);
    const previous = entryMap.get(key) || null;
    entryMap.set(key, entry);
    entries = Array.from(entryMap.values());
    if (upsertFn) {
      Promise.resolve(upsertFn(entry)).catch((error) => {
        if (previous) entryMap.set(key, previous);
        else entryMap.delete(key);
        entries = Array.from(entryMap.values());
        onFailure?.(error, entry);
      });
    }
    return entry;
  }

  function remove(raw, onFailure) {
    const entry = normalizeEntry(raw);
    if (!entry) return null;
    const key = keyFor(entry);
    const previous = entryMap.get(key) || null;
    entryMap.delete(key);
    entries = Array.from(entryMap.values());
    if (removeFn) {
      Promise.resolve(removeFn(entry)).catch((error) => {
        if (previous) entryMap.set(key, previous);
        entries = Array.from(entryMap.values());
        onFailure?.(error, previous || entry);
      });
    }
    return entry;
  }

  function clearMine() {
    return clearMineFn ? Promise.resolve(clearMineFn()) : null;
  }

  function getEntries() {
    return entries.slice();
  }

  function getStatus() {
    return { enabled: isActive(), roomId, totalCount: entries.length };
  }

  return {
    clearMine,
    configure,
    getEntries,
    getStatus,
    isActive,
    normalizeEntry,
    remove,
    setEntries,
    upsert
  };
}
