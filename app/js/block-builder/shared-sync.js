import {
  blockDocumentIdFromCoords,
  normalizeBlockMaterial,
  normalizeBlockRotation,
  normalizeBlockShape
} from './catalog.js?v=2';

export function createSharedBlockSync(options = {}) {
  const { blockKey, onRefresh, toVerticalGridCoord } = options;
  let enabled = false;
  let roomId = '';
  let entries = [];
  let entryMap = new Map();
  let upsertFn = null;
  let removeFn = null;
  let clearMineFn = null;
  let connected = true;
  let operationSequence = 0;
  const pendingOperations = new Map();

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
      id: blockDocumentIdFromCoords(gx, toVerticalGridCoord(gy), gz),
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
    connected = enabled ? config.connected !== false : true;
    if (roomChanged) pendingOperations.clear();
    if (!enabled || roomChanged) replaceEntries([]);
    onRefresh?.();
  }

  function rollbackOperation(operation, error) {
    if (!operation) return;
    if (operation.previous) entryMap.set(operation.key, operation.previous);
    else entryMap.delete(operation.key);
    entries = Array.from(entryMap.values());
    operation.onFailure?.(error, operation.previous || operation.entry);
  }

  function setConnected(nextConnected) {
    const next = nextConnected !== false;
    if (connected === next) return connected;
    connected = next;
    if (!connected && pendingOperations.size > 0) {
      const error = new Error('Room connection is offline. The shared block was not committed.');
      const pending = Array.from(pendingOperations.values());
      pendingOperations.clear();
      pending.forEach((operation) => rollbackOperation(operation, error));
      onRefresh?.();
    }
    return connected;
  }

  function upsert(raw, onFailure) {
    const entry = normalizeEntry(raw);
    if (!entry) return null;
    if (!connected) return null;
    const key = keyFor(entry);
    if (pendingOperations.has(key)) return null;
    const previous = entryMap.get(key) || null;
    entryMap.set(key, entry);
    entries = Array.from(entryMap.values());
    if (upsertFn) {
      const operationId = ++operationSequence;
      const operation = { operationId, key, entry, previous, onFailure };
      pendingOperations.set(key, operation);
      Promise.resolve(upsertFn(entry)).then(() => {
        if (pendingOperations.get(key)?.operationId === operationId) pendingOperations.delete(key);
      }).catch((error) => {
        if (pendingOperations.get(key)?.operationId !== operationId) return;
        pendingOperations.delete(key);
        rollbackOperation(operation, error);
      });
    }
    return entry;
  }

  function remove(raw, onFailure) {
    const entry = normalizeEntry(raw);
    if (!entry) return null;
    if (!connected) return null;
    const key = keyFor(entry);
    if (pendingOperations.has(key)) return null;
    const previous = entryMap.get(key) || null;
    entryMap.delete(key);
    entries = Array.from(entryMap.values());
    if (removeFn) {
      const operationId = ++operationSequence;
      const operation = { operationId, key, entry, previous, onFailure };
      pendingOperations.set(key, operation);
      Promise.resolve(removeFn(entry)).then(() => {
        if (pendingOperations.get(key)?.operationId === operationId) pendingOperations.delete(key);
      }).catch((error) => {
        if (pendingOperations.get(key)?.operationId !== operationId) return;
        pendingOperations.delete(key);
        rollbackOperation(operation, error);
      });
    }
    return entry;
  }

  function clearMine() {
    if (!connected) return Promise.reject(new Error('Room connection is offline. Shared blocks were kept.'));
    return clearMineFn ? Promise.resolve(clearMineFn()) : null;
  }

  function getEntries() {
    return entries.slice();
  }

  function getStatus() {
    return {
      enabled: isActive(),
      roomId,
      totalCount: entries.length,
      connected,
      pendingCount: pendingOperations.size,
      detail: connected ? '' : 'Room connection is offline. Reconnect and try again.'
    };
  }

  return {
    clearMine,
    configure,
    getEntries,
    getStatus,
    isActive,
    normalizeEntry,
    remove,
    setConnected,
    setEntries,
    upsert
  };
}
