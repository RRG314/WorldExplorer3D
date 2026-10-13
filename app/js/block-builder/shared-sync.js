import {
  blockDocumentIdFromCoords,
  normalizeBlockMaterial,
  normalizeBlockRotation,
  normalizeBlockShape
} from './catalog.js?v=2';

export function createSharedBlockSync(options = {}) {
  const { blockKey, onRefresh, onSettled, toVerticalGridCoord } = options;
  let enabled = false;
  let roomId = '';
  let scopeKey = '';
  let entries = [];
  let entryMap = new Map();
  let acceptedMap = new Map();
  let snapshotSequence = 0;
  let scopeGeneration = 0;
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
    return Object.freeze({
      id: blockDocumentIdFromCoords(gx, toVerticalGridCoord(gy), gz),
      gx: Math.round(gx),
      gy: toVerticalGridCoord(gy),
      gz: Math.round(gz),
      materialIndex: normalizeBlockMaterial(raw.materialIndex),
      shape: normalizeBlockShape(raw.shape),
      rotation: normalizeBlockRotation(raw.rotation)
    });
  }

  function keyFor(entry) {
    return blockKey(entry.gx, entry.gy, entry.gz);
  }

  function replaceEntries(nextEntries = []) {
    acceptedMap = new Map();
    nextEntries.forEach((raw) => {
      const entry = normalizeEntry(raw);
      if (!entry) return;
      acceptedMap.set(keyFor(entry), entry);
    });
    snapshotSequence++;
    publishEntries();
  }

  function publishEntries() {
    entryMap = new Map(acceptedMap);
    for (const operation of pendingOperations.values()) {
      if (operation.kind === 'remove') entryMap.delete(operation.key);
      else entryMap.set(operation.key, operation.entry);
    }
    entries = Array.from(entryMap.values());
  }

  function setEntries(nextEntries = []) {
    replaceEntries(nextEntries);
    if (isActive()) onRefresh?.();
  }

  function configure(config = {}) {
    const nextEnabled = config.enabled === true && typeof config.roomId === 'string' && config.roomId.length > 0;
    const nextRoomId = nextEnabled ? String(config.roomId) : '';
    const nextScopeKey = nextEnabled ? String(config.scopeKey || nextRoomId) : '';
    const roomChanged = roomId !== nextRoomId || enabled !== nextEnabled || scopeKey !== nextScopeKey;
    enabled = nextEnabled;
    roomId = nextRoomId;
    scopeKey = nextScopeKey;
    upsertFn = enabled && typeof config.upsert === 'function' ? config.upsert : null;
    removeFn = enabled && typeof config.remove === 'function' ? config.remove : null;
    clearMineFn = enabled && typeof config.clearMine === 'function' ? config.clearMine : null;
    connected = enabled ? config.connected !== false : true;
    if (roomChanged) { pendingOperations.clear(); scopeGeneration++; }
    if (!enabled || roomChanged) replaceEntries([]);
    onRefresh?.();
  }

  function rollbackOperation(operation, error) {
    if (!operation) return;
    // A fresh accepted room snapshot outranks the state captured at click time.
    // Never resurrect a deleted block or replace another builder's later edit.
    publishEntries();
    operation.onFailure?.(error, operation.previous || operation.entry);
  }

  function setConnected(nextConnected) {
    const next = nextConnected !== false;
    if (connected === next) return connected;
    connected = next;
    if (!connected && pendingOperations.size > 0) {
      const error = new Error('Room connection is offline. The save is not confirmed; reconnect to check the room.');
      const pending = Array.from(pendingOperations.values());
      pendingOperations.clear();
      pending.forEach((operation) => rollbackOperation(operation, error));
      onRefresh?.();
      onSettled?.();
    }
    return connected;
  }

  function upsert(raw, onFailure, onCommitted) {
    const entry = normalizeEntry(raw);
    if (!entry) return null;
    if (!isActive() || !connected || !upsertFn) return null;
    const key = keyFor(entry);
    if (pendingOperations.has(key)) return null;
    const previous = entryMap.get(key) || null;
    {
      const operationId = ++operationSequence;
      const operation = { operationId, kind: 'upsert', key, entry, previous, onFailure, snapshotSequence };
      pendingOperations.set(key, operation);
      publishEntries();
      let request;
      try { request = upsertFn(entry); } catch (error) { request = Promise.reject(error); }
      Promise.resolve(request).then(() => {
        if (pendingOperations.get(key)?.operationId !== operationId) return;
        pendingOperations.delete(key);
        if (snapshotSequence === operation.snapshotSequence) acceptedMap.set(key, entry);
        publishEntries();
        onRefresh?.();
        onSettled?.();
        onCommitted?.(entry, { roomId, count: acceptedMap.size });
      }, (error) => {
        if (pendingOperations.get(key)?.operationId !== operationId) return;
        pendingOperations.delete(key);
        rollbackOperation(operation, error);
        onRefresh?.();
        onSettled?.();
      });
    }
    return entry;
  }

  function remove(raw, onFailure) {
    const entry = normalizeEntry(raw);
    if (!entry) return null;
    if (!isActive() || !connected || !removeFn) return null;
    const key = keyFor(entry);
    if (pendingOperations.has(key)) return null;
    const previous = entryMap.get(key) || null;
    if (!previous) return null;
    {
      const operationId = ++operationSequence;
      const operation = { operationId, kind: 'remove', key, entry, previous, onFailure, snapshotSequence };
      pendingOperations.set(key, operation);
      publishEntries();
      let request;
      try { request = removeFn(entry); } catch (error) { request = Promise.reject(error); }
      Promise.resolve(request).then(() => {
        if (pendingOperations.get(key)?.operationId !== operationId) return;
        pendingOperations.delete(key);
        if (snapshotSequence === operation.snapshotSequence) acceptedMap.delete(key);
        publishEntries();
        onRefresh?.();
        onSettled?.();
      }, (error) => {
        if (pendingOperations.get(key)?.operationId !== operationId) return;
        pendingOperations.delete(key);
        rollbackOperation(operation, error);
        onRefresh?.();
        onSettled?.();
      });
    }
    return entry;
  }

  function clearMine() {
    if (!isActive() || !clearMineFn) return null;
    if (!connected) return Promise.reject(new Error('Room connection is offline. Shared blocks were kept.'));
    if (pendingOperations.size) return Promise.reject(new Error('Wait for your current block saves before clearing.'));
    const request = clearMineFn, generation = scopeGeneration;
    return Promise.resolve().then(() => generation === scopeGeneration ? request() : null)
      .then(count => generation === scopeGeneration ? count : null,
        error => { if (generation === scopeGeneration) throw error; return null; });
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
