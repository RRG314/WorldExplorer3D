import {
  applyWorldModificationOperation,
  normalizeWorld,
  WORLD_MODIFICATION_SCHEMA_VERSION
} from './model.js?v=1';

const PRIMARY_KEY = 'worldExplorer3D.worldModifications.v1';
const BACKUP_KEY = 'worldExplorer3D.worldModifications.backup.v1';
const MAX_WORLD_COUNT = 24;
const MAX_DATABASE_CHARS = 8_000_000;

function sameSavedValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameSavedValue(left[key], right[key]));
}

function supportedSavedWorld(world, worldId) {
  if (!world || !Number.isSafeInteger(world.revision) || world.revision < 0 || world.revision >= Number.MAX_SAFE_INTEGER) return false;
  // Normalization is appropriate for a new command, not for silently repairing
  // a persisted record. Unsupported fields, dropped objects and clamped poses
  // must protect the original database instead of being saved over later.
  const normalized = normalizeWorld(world, worldId);
  if (!sameSavedValue(world, normalized)) return false;
  return new Set(world.objects.map(entry => entry.id)).size === world.objects.length
    && new Set(world.suppressions.map(entry => entry.sourceFeatureId)).size === world.suppressions.length;
}

function parseDatabase(raw) {
  if (!raw || raw.length > MAX_DATABASE_CHARS) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== WORLD_MODIFICATION_SCHEMA_VERSION || !parsed.worlds || typeof parsed.worlds !== 'object' || Array.isArray(parsed.worlds)) return null;
    const entries = Object.entries(parsed.worlds);
    if (Object.keys(parsed).some(key => !['schemaVersion', 'worlds'].includes(key))
      || !entries.every(([worldId, world]) => worldId && supportedSavedWorld(world, worldId))) return null;
    return {
      schemaVersion: WORLD_MODIFICATION_SCHEMA_VERSION,
      worlds: Object.fromEntries(entries.map(([worldId, world]) => [worldId, normalizeWorld(world, worldId)]))
    };
  } catch {
    return null;
  }
}

export function createLocalWorldModificationStore(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  let database = { schemaVersion: WORLD_MODIFICATION_SCHEMA_VERSION, worlds: {} };
  let enabled = false;
  let recovery = 'none';
  let expectedPrimary = null, expectedBackup = null, backupAvailable = true;

  function save(nextDatabase) {
    if (!enabled) return false;
    const payload = JSON.stringify(nextDatabase);
    try {
      storage.setItem(PRIMARY_KEY, payload);
      database = nextDatabase;
      expectedPrimary = payload;
      // The primary write is the commit point. Failure of this redundant copy
      // must not report an uncommitted edit after the edit already took effect.
      try { storage.setItem(BACKUP_KEY, payload); expectedBackup = payload; backupAvailable = true; }
      catch { backupAvailable = false; }
      return true;
    } catch {
      return false;
    }
  }

  function initialize() {
    if (!storage) return Object.freeze({ enabled: false, recovery: 'unavailable' });
    try {
      const probeKey = `${PRIMARY_KEY}.probe`;
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      enabled = true;
      expectedPrimary = storage.getItem(PRIMARY_KEY);
      const primary = parseDatabase(expectedPrimary);
      const backupRaw = storage.getItem(BACKUP_KEY);
      expectedBackup = backupRaw;
      const backup = parseDatabase(backupRaw);
      if (primary) database = primary;
      else {
        if (backup) {
          database = backup;
          recovery = 'backup';
        }
        // An unreadable/newer primary is retained. Never overwrite it with an
        // empty or older normalized database on the next unrelated edit.
        if (expectedPrimary !== null) {enabled = false;recovery = backup ? 'backup-read-only' : 'invalid-existing';}
      }
      if (backupRaw !== null && !backup) { enabled = false; recovery = expectedPrimary !== null && !primary ? 'invalid-existing' : 'backup-protected'; backupAvailable = false; }
    } catch {
      enabled = false;
    }
    return status();
  }

  function snapshot(worldId) {
    return normalizeWorld(database.worlds[worldId], worldId);
  }

  // Database entries are normalized on load and commit. Collision queries need
  // membership only, not another copy of objects, history and suppressions.
  function isBuildingSuppressed(worldId, sourceFeatureId) {
    return database.worlds[worldId]?.suppressions.some(entry => entry.sourceFeatureId === sourceFeatureId) === true;
  }

  function commit(worldId, operation, commitOptions = {}) {
    const current = snapshot(worldId);
    if (!enabled) return Object.freeze({ committed: false, reason: 'storage-unavailable', current });
    try {if(storage.getItem(PRIMARY_KEY)!==expectedPrimary||storage.getItem(BACKUP_KEY)!==expectedBackup)return Object.freeze({committed:false,reason:'storage-conflict',current});}
    catch {return Object.freeze({committed:false,reason:'storage-unavailable',current});}
    if (!Object.hasOwn(database.worlds,worldId) && Object.keys(database.worlds).length >= MAX_WORLD_COUNT) {
      return Object.freeze({committed:false,reason:'world-limit',current});
    }
    const result = applyWorldModificationOperation(current, operation, {
      ...commitOptions,
      worldId
    });
    if (!result.committed) return result;
    const worlds = { ...database.worlds, [worldId]: result.current };
    const nextDatabase = {
      schemaVersion: WORLD_MODIFICATION_SCHEMA_VERSION,
      worlds
    };
    if (!enabled) return Object.freeze({ committed: false, reason: 'storage-unavailable', current });
    if (save(nextDatabase)) return result;
    return Object.freeze({ committed: false, reason: 'storage-write-failed', current });
  }

  function exportWorld(worldId) {
    return JSON.stringify(snapshot(worldId), null, 2);
  }

  function exportRecovery() {
    // Read the current bytes, including another tab's newer state. Do not
    // normalize, migrate or overwrite either copy while producing a backup.
    return JSON.stringify({ format: 'world-explorer-mapped-edits-recovery', version: 1,
      primary: storage.getItem(PRIMARY_KEY), backup: storage.getItem(BACKUP_KEY) }, null, 2);
  }

  function status() {
    return Object.freeze({ enabled, recovery, backupAvailable, worldCount: Object.keys(database.worlds).length, worldLimit:MAX_WORLD_COUNT, primaryKey: PRIMARY_KEY, backupKey: BACKUP_KEY });
  }

  return Object.freeze({ commit, exportWorld, exportRecovery, initialize, snapshot, status, isBuildingSuppressed });
}

export { BACKUP_KEY, PRIMARY_KEY };
