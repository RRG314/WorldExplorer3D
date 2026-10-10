import { localSaveSession } from './local-save-session.js';
import {supportRecorder} from '../runtime/support-receipt.js';
const BACKPACK_STORAGE_SCHEMA_VERSION = 3;
const BACKPACK_STORAGE_KEY = 'world-explorer:character-backpack:v3';
const BACKPACK_CONTROLS_KEY = 'world-explorer:backpack-controls:v2';
const LEGACY_CONTROLS_KEY = 'world-explorer:backpack-controls:v1';
const LEGACY_BACKPACK_STORAGE_KEYS = Object.freeze([
  'world-explorer:character-backpack:v2',
  'world-explorer:character-backpack:v1'
]);
const LEGACY_HOUSING_KEY = 'world-explorer:homes:v1';
const BACKPACK_BACKUP_KEY = 'world-explorer:character-backpack:migration-backup:v3';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeBackpackState(value = {}, options = {}) {
  const source = value && typeof value === 'object' ? clone(value) : {};
  const sourceVersion = Number.isFinite(Number(options.sourceVersion))
    ? Number(options.sourceVersion)
    : Number(source.migration?.sourceVersion ?? source.schemaVersion) || 0;
  const items = [];
  const instanceAliases = new Map();
  const instanceIds = new Set();
  const eventRewards = new Map();
  let duplicateEventRewardsRemoved = 0;

  for (const candidate of Array.isArray(source.items) ? source.items : []) {
    const instanceId = text(candidate?.instanceId, text(candidate?.id));
    const catalogId = text(candidate?.catalogId, text(candidate?.id));
    if (!instanceId || !catalogId) continue;
    const sourceEventId = text(candidate?.sourceEventId || candidate?.eventId);
    const eventRewardKey = sourceEventId ? JSON.stringify([sourceEventId, catalogId]) : '';
    const canonicalForEvent = eventRewardKey ? eventRewards.get(eventRewardKey) : '';
    if (canonicalForEvent) {
      instanceAliases.set(instanceId, canonicalForEvent);
      duplicateEventRewardsRemoved += 1;
      continue;
    }
    if (instanceIds.has(instanceId)) continue;
    instanceIds.add(instanceId);
    if (eventRewardKey) eventRewards.set(eventRewardKey, instanceId);
    items.push({
      ...candidate,
      instanceId,
      catalogId,
      sourceEventId,
      authority: text(candidate?.authority, 'anonymous-local'),
      provenance: text(candidate?.provenance || candidate?.source, 'starter-grant'),
      metadata: candidate?.metadata && typeof candidate.metadata === 'object' ? { ...candidate.metadata } : {}
    });
  }

  const resolveInstanceId = (identity) => {
    const id = text(identity);
    if (!id) return null;
    const canonical = instanceAliases.get(id) || id;
    if (instanceIds.has(canonical)) return canonical;
    return items.find((item) => item.catalogId === id)?.instanceId || null;
  };
  const hotbar = Array.from({ length: 6 }, (_, index) =>
    resolveInstanceId(Array.isArray(source.hotbar) ? source.hotbar[index] : null)
  );
  const equippedInstanceId = resolveInstanceId(source.equippedInstanceId || source.equippedCatalogId);
  const migratedAt = Number(options.migratedAt || source.migration?.migratedAt) || Date.now();
  const priorDuplicateEventRewardsRemoved = Math.max(0, Number(source.migration?.duplicateEventRewardsRemoved) || 0);

  return {
    ...source,
    schemaVersion: BACKPACK_STORAGE_SCHEMA_VERSION,
    revision: Math.max(0, Math.floor(Number(source.revision) || 0)),
    equippedInstanceId,
    hotbar,
    items,
    migration: {
      version: BACKPACK_STORAGE_SCHEMA_VERSION,
      sourceVersion,
      migratedAt,
      duplicateEventRewardsRemoved: priorDuplicateEventRewardsRemoved + duplicateEventRewardsRemoved,
      backupAvailable: options.backupAvailable === true,
      saveGeneration: typeof source.migration?.saveGeneration === 'string' ? source.migration.saveGeneration : ''
    }
  };
}

function parseStored(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem?.(key) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch (_) {
    return null;
  }
}

function createLocalBackpackStore(storage = globalThis.localStorage) {
  const session = localSaveSession(storage);
  let lastMigration = null;
  let housing = null;
  let commerce = null;
  let loaded = false;
  let pendingLegacy = null;
  let blocked = false;
  let lastControls = null;
  const controls = snapshot => Object.fromEntries(['revision','equippedInstanceId','hotbar','ammo','quantities']
    .filter(key=>snapshot?.[key]!==undefined).map(key=>[key,clone(snapshot[key])]));

  function saveNormalized(snapshot, settings = {}) {
    if (!storage?.setItem || !snapshot || !session.writable() || blocked) return false;
    if (!loaded) load();
    if (blocked) return false;
    try {
      const latest = parseStored(storage, BACKPACK_STORAGE_KEY);
      if ((latest?.migration?.saveGeneration || '') !== (lastMigration?.saveGeneration || '')) return false;
      // A Journal projection contains items/slots but not equipment ammo. Keep
      // the latest small equipment state when replacing that full projection.
      const normalized = normalizeBackpackState({...lastControls,...snapshot, housing: settings.housing ?? housing, commerce: settings.commerce ?? commerce}, {
        sourceVersion: settings.sourceVersion ?? snapshot.migration?.sourceVersion ?? lastMigration?.sourceVersion,
        migratedAt: settings.migratedAt ?? snapshot.migration?.migratedAt ?? lastMigration?.migratedAt,
        backupAvailable: storage.getItem?.(BACKPACK_BACKUP_KEY) != null
      });
      normalized.migration.saveGeneration = crypto.randomUUID();
      if (!snapshot.migration && lastMigration) {
        normalized.migration.duplicateEventRewardsRemoved = Math.max(
          normalized.migration.duplicateEventRewardsRemoved,
          Number(lastMigration.duplicateEventRewardsRemoved) || 0
        );
      }
      if (pendingLegacy && storage.getItem?.(BACKPACK_BACKUP_KEY) == null) {
        storage.setItem(BACKPACK_BACKUP_KEY, JSON.stringify(pendingLegacy));
        normalized.migration.backupAvailable = true;
      }
      storage.setItem(BACKPACK_STORAGE_KEY, JSON.stringify(normalized));
      housing = clone(normalized.housing);
      commerce = clone(normalized.commerce);
      pendingLegacy = null;
      lastMigration = normalized.migration;
      lastControls = controls(normalized);
      return true;
    } catch (error) {
      supportRecorder.record({operation:'inventory-save',error});
      return false;
    }
  }

  function load() {
    if (!storage?.getItem) return null;
    loaded = true;
    let current;
    try {
      const raw = storage.getItem(BACKPACK_STORAGE_KEY);
      current = raw == null ? null : JSON.parse(raw);
      if (raw != null && (!current || typeof current !== 'object' || Array.isArray(current))) throw Error('Invalid Backpack save');
      if (current && !Array.isArray(current.items)) throw Error('Missing Backpack items');
      if (Number(current?.schemaVersion || 0) > BACKPACK_STORAGE_SCHEMA_VERSION) throw Error('Newer Backpack save');
      const legacyHousing = storage.getItem(LEGACY_HOUSING_KEY);
      housing = clone(current?.housing ?? (legacyHousing == null ? null : JSON.parse(legacyHousing)));
      if (housing && (!Array.isArray(housing.homes) || Number(housing.schemaVersion || 1) > 2)) throw Error('Unsupported home save');
      commerce = clone(current?.commerce ?? null);
      if (commerce && (Number(commerce.schemaVersion) !== 4 || !Number.isSafeInteger(commerce.credits) || commerce.credits < 0)) throw Error('Unsupported local wallet save');
    } catch (error) { blocked = true; supportRecorder.record({operation:'inventory-load',error}); return null; }
    if (current) {
      const normalized = normalizeBackpackState({...current, housing}, {
        migratedAt: current.migration?.migratedAt,
        backupAvailable: storage.getItem?.(BACKPACK_BACKUP_KEY) != null
      });
      lastMigration = normalized.migration;
      const needsNormalizationSave = JSON.stringify(normalized) !== JSON.stringify(current);
      const supplement = parseStored(storage, BACKPACK_CONTROLS_KEY);
      if (supplement?.schemaVersion === 1 && supplement.saveGeneration && supplement.saveGeneration === lastMigration?.saveGeneration) {
        Object.assign(normalized, controls(supplement));
        const ids = new Set(normalized.items.map(item=>item.instanceId));
        normalized.hotbar = Array.from({length:6},(_,index)=>ids.has(normalized.hotbar?.[index])?normalized.hotbar[index]:null);
        if (!ids.has(normalized.equippedInstanceId)) normalized.equippedInstanceId = null;
      }
      if (needsNormalizationSave && saveNormalized(normalized, normalized.migration)) normalized.migration = {...lastMigration};
      lastControls = controls(normalized);
      return normalized;
    }

    for (const legacyKey of LEGACY_BACKPACK_STORAGE_KEYS) {
      let legacy;
      try {
        const raw=storage.getItem(legacyKey);
        if (raw == null) continue;
        legacy=JSON.parse(raw);
        if (!legacy || !Array.isArray(legacy.items) || Number(legacy.schemaVersion||1)>2) throw Error('Unsupported legacy Backpack save');
      } catch (error) { blocked=true; supportRecorder.record({operation:'inventory-load',error}); return null; }
      housing = clone(legacy.housing || housing);
      if (housing && (!Array.isArray(housing.homes) || Number(housing.schemaVersion || 1) > 2)) { blocked=true; return null; }
      pendingLegacy = { sourceKey: legacyKey, backedUpAt: Date.now(), state: legacy };
      const supplement = parseStored(storage, LEGACY_CONTROLS_KEY);
      const currentControls = supplement?.schemaVersion === 1 && supplement.saveGeneration && supplement.saveGeneration === legacy.migration?.saveGeneration ? controls(supplement) : {};
      const migrated = normalizeBackpackState({...legacy, ...currentControls, housing}, { sourceVersion:Number(legacy.schemaVersion)||1, backupAvailable: false });
      if (session.writable() && saveNormalized(migrated, migrated.migration)) migrated.migration = {...lastMigration};
      return migrated;
    }
    return housing ? { schemaVersion: BACKPACK_STORAGE_SCHEMA_VERSION, items: [], housing: clone(housing) } : null;
  }

  function rollbackMigration() {
    if (!storage?.getItem || !storage?.setItem || !storage?.removeItem || !session.writable() || blocked) return false;
    // An inventory migration rollback must not erase later home ownership/items.
    if (!loaded) load();
    if (blocked || housing?.homes?.length || commerce) return false;
    const backup = parseStored(storage, BACKPACK_BACKUP_KEY);
    if (!backup?.sourceKey || !backup?.state) return false;
    try {
      storage.setItem(String(backup.sourceKey), JSON.stringify(backup.state));
      storage.removeItem(BACKPACK_STORAGE_KEY);
      lastMigration = null;
      lastControls = null;
      return true;
    } catch (error) {
      supportRecorder.record({operation:'inventory-save',error});
      return false;
    }
  }

  return Object.freeze({
    type: 'LocalBackpackStore',
    schemaVersion: BACKPACK_STORAGE_SCHEMA_VERSION,
    key: BACKPACK_STORAGE_KEY,
    backupKey: BACKPACK_BACKUP_KEY,
    legacyKeys: LEGACY_BACKPACK_STORAGE_KEYS,
    load,
    ready: session.ready,
    writable: () => session.writable() && !blocked,
    saveStatus: () => blocked ? 'unreadable-save' : session.status(),
    loadHousing() { if (!loaded) load(); return clone(housing); },
    loadCommerce() { if (!loaded) load(); return clone(commerce); },
    saveCommerce(next, inventory, nextHousing, expectedHousing) {
      if (!loaded) load();
      if ((Number(next?.revision) || 0) !== (Number(commerce?.revision) || 0) + 1) return false;
      if (expectedHousing!==undefined && JSON.stringify(housing)!==expectedHousing) return false;
      return saveNormalized(inventory, {commerce:next, housing:nextHousing});
    },
    // The Backpack and all personal home contents commit in one atomic setItem.
    // Legacy home bytes are retained as recovery material, not a second writer.
    saveHousing(next, inventory, expectedHousing) {
      if (!loaded) load();
      if (expectedHousing!==undefined && JSON.stringify(housing)!==expectedHousing) return false;
      return saveNormalized(inventory, {housing: next});
    },
    migrationSnapshot() { return lastMigration ? { ...lastMigration } : null; },
    rollbackMigration,
    save(snapshot) { return saveNormalized(snapshot); },
    saveControls(snapshot) {
      if (!storage?.setItem || !lastMigration?.saveGeneration || !session.writable() || blocked) return false;
      try {
        const latest = controls(snapshot);
        lastControls = {...lastControls,...latest};
        storage.setItem(BACKPACK_CONTROLS_KEY, JSON.stringify({schemaVersion:1,saveGeneration:lastMigration.saveGeneration,...lastControls}));
        return true;
      } catch (error) { supportRecorder.record({operation:'inventory-save',error}); return false; }
    }
  });
}

export {
  BACKPACK_BACKUP_KEY,
  BACKPACK_CONTROLS_KEY,
  BACKPACK_STORAGE_KEY,
  BACKPACK_STORAGE_SCHEMA_VERSION,
  LEGACY_BACKPACK_STORAGE_KEYS,
  createLocalBackpackStore,
  normalizeBackpackState
};
