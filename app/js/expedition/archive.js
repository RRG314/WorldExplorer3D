const EXPEDITION_DISCOVERY_KEY = 'world-explorer:interstellar-discoveries:v1';
const LEGACY_ACTIVE_EXPEDITION_KEY = 'world-explorer:interstellar-expedition:v1';
const EXPEDITION_DISCOVERY_SCHEMA_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDiscovery(value) {
  const contact = value?.contact;
  if (!contact?.id || !Number.isInteger(Number(contact.stableSeed))) return null;
  const outpost = value?.outpost?.contactId === contact.id ? clone(value.outpost) : null;
  return Object.freeze({
    id: String(contact.id),
    expeditionId: String(value.expeditionId || ''),
    contact: Object.freeze(clone(contact)),
    distanceLy: Math.max(0.01, Number(value.distanceLy) || 1),
    routeProgress: Math.max(0.05, Math.min(1, Number(value.routeProgress) || 0.5)),
    outpost: outpost ? Object.freeze(outpost) : null,
    firstRecordedAtMs: Math.max(0, Number(value.firstRecordedAtMs) || 0),
    updatedAtMs: Math.max(0, Number(value.updatedAtMs) || 0)
  });
}

function parseArchive(value) {
  if (!value || value.length > 2_000_000) return null;
  try {
    const record = JSON.parse(value);
    if (record?.type !== 'InterstellarDiscoveryArchive') return null;
    if (record.schemaVersion !== EXPEDITION_DISCOVERY_SCHEMA_VERSION || !Array.isArray(record.discoveries)) return null;
    const discoveries = record.discoveries.map(normalizeDiscovery);
    if (discoveries.some(entry => !entry)) return null;
    return Object.freeze({
      type: 'InterstellarDiscoveryArchive',
      schemaVersion: EXPEDITION_DISCOVERY_SCHEMA_VERSION,
      discoveries: Object.freeze(discoveries)
    });
  } catch {
    return null;
  }
}

function discoveriesFromExpedition(expedition, previous = []) {
  if (expedition?.type !== 'InterstellarExpedition') return Object.freeze([...previous]);
  const byId = new Map(previous.map((entry) => [entry.id, entry]));
  const nowMs = Math.max(0, Number(expedition.updatedAtMs || expedition.createdAtMs) || Date.now());
  for (const contact of expedition.routeContacts || []) {
    if (!contact?.id || !Number.isInteger(Number(contact.stableSeed))) continue;
    const prior = byId.get(contact.id);
    const outpost = (expedition.outposts || []).find((entry) => entry.contactId === contact.id) || prior?.outpost || null;
    byId.set(contact.id, normalizeDiscovery({
      id: contact.id,
      expeditionId: expedition.id,
      contact,
      distanceLy: expedition.calculation?.distanceLy,
      routeProgress: expedition.progress,
      outpost,
      firstRecordedAtMs: prior?.firstRecordedAtMs || nowMs,
      updatedAtMs: nowMs
    }));
  }
  return Object.freeze([...byId.values()].filter(Boolean).sort((a, b) => a.firstRecordedAtMs - b.firstRecordedAtMs || a.id.localeCompare(b.id)));
}

function createExpeditionArchive(storage = globalThis.localStorage) {
  let expectedRaw = null, protectedRecord = false;
  const empty = () => Object.freeze({ type: 'InterstellarDiscoveryArchive', schemaVersion: EXPEDITION_DISCOVERY_SCHEMA_VERSION, discoveries: Object.freeze([]) });
  function persist(discoveries) {
    if (protectedRecord) throw new Error('The existing discovery archive is unreadable or newer and has been preserved.');
    if (typeof storage?.setItem !== 'function' || typeof storage?.getItem !== 'function') throw new Error('Discovery storage unavailable.');
    if (storage.getItem(EXPEDITION_DISCOVERY_KEY) !== expectedRaw) throw new Error('The discovery archive changed. Reload before saving.');
    const record = Object.freeze({ ...empty(), discoveries: Object.freeze(discoveries) });
    const raw = JSON.stringify(record);
    if (raw.length > 2_000_000) throw new Error('The discovery archive is full. Existing discoveries have been preserved.');
    storage.setItem(EXPEDITION_DISCOVERY_KEY, raw);
    expectedRaw = raw;
    return record;
  }
  function load() {
    try {
      if (typeof storage?.getItem !== 'function') throw new Error('Storage unavailable');
      expectedRaw = storage.getItem(EXPEDITION_DISCOVERY_KEY);
      const current = parseArchive(expectedRaw);
      protectedRecord = expectedRaw !== null && !current;
      if (current) return current;
      if (protectedRecord) return empty();
      const legacyRaw = storage.getItem(LEGACY_ACTIVE_EXPEDITION_KEY);
      const legacy = legacyRaw && legacyRaw.length <= 2_000_000 ? JSON.parse(legacyRaw) : null;
      const discoveries = legacy?.schemaVersion === 1 ? discoveriesFromExpedition(legacy) : [];
      // Reading is never an implicit migration write.
      return Object.freeze({ ...empty(), discoveries: Object.freeze(discoveries) });
    } catch {
      protectedRecord = true;
      return empty();
    }
  }
  function mergeExpedition(expedition) {
    const current = load();
    return persist(discoveriesFromExpedition(expedition, current.discoveries));
  }
  return Object.freeze({ key: EXPEDITION_DISCOVERY_KEY, load, mergeExpedition });
}

export {
  createExpeditionArchive,
  discoveriesFromExpedition,
  EXPEDITION_DISCOVERY_KEY,
  EXPEDITION_DISCOVERY_SCHEMA_VERSION,
  normalizeDiscovery
};
