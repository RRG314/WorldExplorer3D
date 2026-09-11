import {
  applyWorldModificationOperation,
  normalizeWorld,
  WORLD_MODIFICATION_SCHEMA_VERSION
} from './model.js?v=1';

const PRIMARY_KEY = 'worldExplorer3D.worldModifications.v1';
const BACKUP_KEY = 'worldExplorer3D.worldModifications.backup.v1';
const MAX_WORLD_COUNT = 24;

function parseDatabase(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.worlds || typeof parsed.worlds !== 'object') return null;
    const entries = Object.entries(parsed.worlds).slice(-MAX_WORLD_COUNT);
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

  function save(nextDatabase) {
    if (!enabled) return false;
    const payload = JSON.stringify(nextDatabase);
    try {
      storage.setItem(PRIMARY_KEY, payload);
      storage.setItem(BACKUP_KEY, payload);
      database = nextDatabase;
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
      const primary = parseDatabase(storage.getItem(PRIMARY_KEY));
      if (primary) database = primary;
      else {
        const backup = parseDatabase(storage.getItem(BACKUP_KEY));
        if (backup) {
          database = backup;
          recovery = 'backup';
          storage.setItem(PRIMARY_KEY, JSON.stringify(backup));
        }
      }
    } catch {
      enabled = false;
    }
    return status();
  }

  function snapshot(worldId) {
    return normalizeWorld(database.worlds[worldId], worldId);
  }

  function commit(worldId, operation, commitOptions = {}) {
    const current = snapshot(worldId);
    const result = applyWorldModificationOperation(current, operation, {
      ...commitOptions,
      worldId
    });
    if (!result.committed) return result;
    const worlds = { ...database.worlds, [worldId]: result.current };
    const ordered = Object.entries(worlds)
      .sort((a, b) => String(a[1].updatedAt).localeCompare(String(b[1].updatedAt)))
      .slice(-MAX_WORLD_COUNT);
    const nextDatabase = {
      schemaVersion: WORLD_MODIFICATION_SCHEMA_VERSION,
      worlds: Object.fromEntries(ordered)
    };
    if (!enabled) return Object.freeze({ committed: false, reason: 'storage-unavailable', current });
    if (save(nextDatabase)) return result;
    return Object.freeze({ committed: false, reason: 'storage-write-failed', current });
  }

  function exportWorld(worldId) {
    return JSON.stringify(snapshot(worldId), null, 2);
  }

  function status() {
    return Object.freeze({ enabled, recovery, worldCount: Object.keys(database.worlds).length, primaryKey: PRIMARY_KEY, backupKey: BACKUP_KEY });
  }

  return Object.freeze({ commit, exportWorld, initialize, snapshot, status });
}

export { BACKUP_KEY, PRIMARY_KEY };
