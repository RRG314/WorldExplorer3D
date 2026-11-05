export const JOURNEY_FORMAT_VERSION = 1;
export const JOURNEY_MAX_BYTES = 64 * 1024 * 1024;
export const JOURNEY_CHUNK_BYTES = 1024 * 1024;
export const JOURNEY_LOCAL_KEYS = Object.freeze([
  'worldExplorer3D.lastLocation.v1',
  'worldExplorer3D.activityLibrary.v1',
  'worldExplorer3D.activityCompletions.v1',
  'worldExplorer3D.activityPendingCompletions.v1',
  'worldExplorer3D.worldModifications.v1',
  'worldExplorer3D.tutorialState.v6',
  'worldExplorer3D.keyboardBindings.v1',
  'we3d.player-character-gender.v1',
  'world-explorer:destination-missions:v1',
  'world-explorer:interstellar-expedition:v1',
  'world-explorer:interstellar-discoveries:v1',
  'world-explorer:player-condition:v1',
  'we3d.ocean.voyage.v1',
  'we3d.ocean.voyage.v2',
  'we3d.ocean.voyage.v3',
  'we3d.ocean.continuous.v1',
]);

export function validateJourneyEnvelope(value, ownerUid) {
  if (
    !value ||
    value.schemaVersion !== JOURNEY_FORMAT_VERSION ||
    value.ownerUid !== ownerUid ||
    typeof ownerUid !== 'string' ||
    value.journal?.profile?.id !== 'local-explorer' ||
    !['events', 'items', 'companions', 'fieldGuide'].every((key) =>
      Array.isArray(value.journal[key])
    ) ||
    !value.deviceState ||
    typeof value.deviceState !== 'object' ||
    !value.deviceState.local ||
    typeof value.deviceState.local !== 'object' ||
    Array.isArray(value.deviceState.local) ||
    !JOURNEY_LOCAL_KEYS.every((key) => Object.hasOwn(value.deviceState.local, key))
  ) {
    throw new Error(
      'The account journey has an unsupported format or owner. Your current save is kept.'
    );
  }
  for (const [key, raw] of Object.entries(value.deviceState.local)) {
    if (
      !JOURNEY_LOCAL_KEYS.includes(key) ||
      (raw !== null && typeof raw !== 'string') ||
      (typeof raw === 'string' && raw.length > 8_000_000)
    ) {
      throw new Error('The account journey contains unsupported device state.');
    }
  }
  const backpack = value.deviceState.backpack;
  if (
    backpack !== null &&
    (!backpack ||
      backpack.schemaVersion !== 3 ||
      !Array.isArray(backpack.items) ||
      (backpack.housing && backpack.housing.schemaVersion !== 2) ||
      (backpack.commerce &&
        (backpack.commerce.schemaVersion !== 4 ||
          !Number.isSafeInteger(backpack.commerce.credits) ||
          backpack.commerce.credits < 0)))
  ) {
    throw new Error('The account journey contains an unsupported personal inventory or home save.');
  }
  if (!Array.isArray(value.receiptOutbox) || value.receiptOutbox.length > 10000)
    throw Error('The saved item-receipt queue has an unsupported format.');
  const items = new Map(value.journal.items.map((item) => [item.instanceId, item]));
  for (const row of value.receiptOutbox) {
    const item = items.get(row.instanceId);
    if (
      !ownerUid ||
      row.ownerUid !== ownerUid ||
      row.payload?.expectedOwnerUid !== ownerUid ||
      row.id !== JSON.stringify([ownerUid, row.payload?.claimId]) ||
      !item ||
      item.claimId !== row.payload.claimId ||
      item.catalogId !== row.payload.catalogId ||
      !['pending', 'blocked'].includes(row.status)
    )
      throw Error('The saved item-receipt queue does not match this account and inventory.');
  }
  return value;
}

export function journeySaveSummary(envelope) {
  const profile = envelope.journal.profile;
  return {
    name: String(profile.journeyPreferences?.explorerName || 'Explorer').slice(0, 32),
    records: envelope.journal.events.length,
    homes: envelope.deviceState.backpack?.housing?.homes?.length || 0,
    focus: String(profile.journeyPreferences?.activeFocusId || 'explore').slice(0, 80),
  };
}

export function canonicalJourneyText(envelope) {
  const journal = { ...envelope.journal, profile: { ...envelope.journal.profile } };
  delete journal.exportedAt;
  // The original profile owner refreshes this timestamp on read/import. It
  // does not distinguish player progress or a different device’s journey.
  delete journal.profile.updatedAt;
  for (const [name, key] of Object.entries({
    events: 'eventId',
    items: 'instanceId',
    fieldGuide: 'catalogId',
    companions: 'instanceId',
    albums: 'id',
    researchMedia: 'id',
    portalTrail: 'id',
  }))
    if (Array.isArray(journal[name]))
      journal[name] = [...journal[name]].sort((a, b) =>
        String(a[key] || '').localeCompare(String(b[key] || ''))
      );
  const backpack = envelope.deviceState.backpack ? { ...envelope.deviceState.backpack } : null;
  if (backpack) {
    delete backpack.migration;
    backpack.ammo ||= {};
    backpack.quantities ||= {};
  }
  const value = {
    ...envelope,
    journal,
    receiptOutbox: [...envelope.receiptOutbox].sort((a, b) => a.id.localeCompare(b.id)),
    deviceState: { ...envelope.deviceState, backpack },
  };
  const order = (input) =>
    Array.isArray(input)
      ? input.map(order)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.keys(input)
              .sort()
              .map((key) => [key, order(input[key])])
          )
        : input;
  return JSON.stringify(order(value));
}
