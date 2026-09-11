const EXPLORER_EVENT_SCHEMA_VERSION = 2;

const EXPLORER_EVENT_PATHS = Object.freeze({
  field: 'Fieldwork',
  activity: 'Games',
  creation: 'Making',
  travel: 'Travel',
  community: 'Community',
  companion: 'Companions'
});

const EXPLORER_RANKS = Object.freeze([
  Object.freeze({ id: 'trailhead', label: 'Trailhead', minimumPoints: 0 }),
  Object.freeze({ id: 'pathfinder', label: 'Pathfinder', minimumPoints: 8 }),
  Object.freeze({ id: 'field-explorer', label: 'Field Explorer', minimumPoints: 20 }),
  Object.freeze({ id: 'expeditioner', label: 'Expeditioner', minimumPoints: 45 }),
  Object.freeze({ id: 'world-explorer', label: 'World Explorer', minimumPoints: 80 }),
  Object.freeze({ id: 'seasoned-explorer', label: 'Seasoned Explorer', minimumPoints: 140 })
]);

const EXPLORER_BADGES = Object.freeze([
  Object.freeze({ id: 'field-notes', label: 'Field Notes', pathId: 'field', minimumRecords: 5 }),
  Object.freeze({ id: 'game-trail', label: 'Game Trail', pathId: 'activity', minimumFirsts: 3 }),
  Object.freeze({ id: 'world-maker', label: 'World Maker', pathId: 'creation', minimumFirsts: 1 }),
  Object.freeze({ id: 'five-places', label: 'Five Places', pathId: 'travel', minimumRecords: 5 }),
  Object.freeze({ id: 'good-neighbor', label: 'Good Neighbor', pathId: 'community', minimumRecords: 3 }),
  Object.freeze({ id: 'companion-bond', label: 'Companion Bond', pathId: 'companion', minimumRecords: 5 })
]);

const EXPLORER_SPECIALTIES = Object.freeze([
  Object.freeze({ id: 'nature', label: 'Nature' }),
  Object.freeze({ id: 'earth', label: 'Earth' }),
  Object.freeze({ id: 'places', label: 'Places' })
]);

const NATURE_FAMILIES = new Set([
  'wildlife-clue', 'wildlife-record', 'botany-record', 'water-survey',
  'fish', 'marine-life', 'plant', 'fungus'
]);
const EARTH_FAMILIES = new Set([
  'rock', 'mineral', 'sediment', 'gem', 'ore', 'metal',
  'fossil-representation', 'fossil'
]);

function boundedText(value, maximum = 120) {
  return String(value ?? '').trim().slice(0, maximum);
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function locationSnapshot(value = {}) {
  return Object.freeze({
    lat: finiteOrNull(value?.lat),
    lon: finiteOrNull(value?.lon),
    name: boundedText(value?.name, 120)
  });
}

function unique(values = []) {
  return [...new Set(values.map((value) => boundedText(value, 160)).filter(Boolean))];
}

function explorerRankForPoints(points = 0) {
  const total = Math.max(0, Number(points) || 0);
  return EXPLORER_RANKS.slice().reverse().find((rank) => total >= rank.minimumPoints) || EXPLORER_RANKS[0];
}

function explorerProgressSnapshot(progress = {}) {
  const points = Math.max(0, Number(progress.points) || 0);
  const rank = explorerRankForPoints(points);
  const index = EXPLORER_RANKS.findIndex((entry) => entry.id === rank.id);
  const next = EXPLORER_RANKS[index + 1] || null;
  const normalized = normalizeExplorerProgress(progress);
  const badgeAwards = EXPLORER_BADGES.filter((badge) => {
    const path = normalized.paths[badge.pathId] || {};
    return Number(path.records || 0) >= Number(badge.minimumRecords || 0) && Number(path.firsts || 0) >= Number(badge.minimumFirsts || 0);
  });
  return Object.freeze({
    ...normalized,
    points,
    rankId: rank.id,
    rankLabel: rank.label,
    badgeAwards: Object.freeze(badgeAwards),
    next: next ? Object.freeze({
      id: next.id,
      label: next.label,
      pointsRemaining: Math.max(0, next.minimumPoints - points)
    }) : null
  });
}

function specialtyForDiscovery(record = {}) {
  const family = boundedText(record.family, 64).toLowerCase();
  const discipline = boundedText(record.discipline, 64).toLowerCase();
  if (NATURE_FAMILIES.has(family) || discipline === 'nature') return 'nature';
  if (EARTH_FAMILIES.has(family) || discipline === 'earth-science') return 'earth';
  return 'places';
}

function defaultExplorerProgress() {
  return {
    schemaVersion: 2,
    points: 0,
    totalRecords: 0,
    uniqueDiscoveries: 0,
    regions: [],
    specialties: {
      nature: { points: 0, records: 0, uniqueDiscoveries: 0 },
      earth: { points: 0, records: 0, uniqueDiscoveries: 0 },
      places: { points: 0, records: 0, uniqueDiscoveries: 0 }
    },
    milestones: [],
    paths: Object.fromEntries(Object.keys(EXPLORER_EVENT_PATHS).map((id) => [id, { points: 0, records: 0, firsts: 0 }])),
    badges: []
  };
}

function normalizeExplorerProgress(input = {}) {
  const base = defaultExplorerProgress();
  const specialties = {};
  for (const specialty of EXPLORER_SPECIALTIES) {
    const current = input?.specialties?.[specialty.id] || {};
    specialties[specialty.id] = {
      points: Math.max(0, Number(current.points) || 0),
      records: Math.max(0, Number(current.records) || 0),
      uniqueDiscoveries: Math.max(0, Number(current.uniqueDiscoveries) || 0)
    };
  }
  const paths = {};
  for (const id of Object.keys(EXPLORER_EVENT_PATHS)) {
    const current = input?.paths?.[id] || {};
    paths[id] = {
      points: Math.max(0, Number(current.points) || 0),
      records: Math.max(0, Number(current.records) || 0),
      firsts: Math.max(0, Number(current.firsts) || 0)
    };
  }
  if (!input?.paths && Number(input?.totalRecords) > 0) {
    paths.field.records = Math.max(0, Number(input.totalRecords) || 0);
    paths.field.points = Math.max(0, Number(input.points) || 0);
    paths.field.firsts = Math.max(0, Number(input.uniqueDiscoveries) || 0);
  }
  return {
    ...base,
    ...(input || {}),
    points: Math.max(0, Number(input?.points) || 0),
    totalRecords: Math.max(0, Number(input?.totalRecords) || 0),
    uniqueDiscoveries: Math.max(0, Number(input?.uniqueDiscoveries) || 0),
    regions: unique(input?.regions),
    specialties,
    milestones: unique(input?.milestones),
    paths,
    badges: unique(input?.badges),
    schemaVersion: 2
  };
}

function progressCreditForDiscovery({ firstIdentification = false, newRegion = false } = {}) {
  if (firstIdentification) return Object.freeze({ points: 3, reason: 'new-identification' });
  if (newRegion) return Object.freeze({ points: 2, reason: 'new-region-evidence' });
  return Object.freeze({ points: 0, reason: 'already-documented-here' });
}

function projectExplorerProgress(current, record, credit) {
  const progress = normalizeExplorerProgress(current);
  const specialtyId = specialtyForDiscovery(record);
  const regionId = boundedText(record.regionId || record.worldIdentity || 'local-region', 160);
  const points = Math.max(0, Number(credit?.points) || 0);
  const uniqueDiscovery = credit?.reason === 'new-identification';
  const fieldPath = { ...progress.paths.field };
  fieldPath.points += points;
  fieldPath.records += 1;
  if (uniqueDiscovery) fieldPath.firsts += 1;

  const next = normalizeExplorerProgress({
    ...progress,
    points: progress.points + points,
    totalRecords: progress.totalRecords + 1,
    uniqueDiscoveries: progress.uniqueDiscoveries + (uniqueDiscovery ? 1 : 0),
    regions: unique([...progress.regions, regionId]),
    paths: { ...progress.paths, field: fieldPath }
  });
  return Object.freeze({ progress: next, specialtyId, points, reason: credit?.reason || 'no-credit' });
}

function createExplorerEvent(record = {}, options = {}) {
  const claimId = boundedText(record.claimId, 220);
  if (!claimId) throw new TypeError('Explorer event requires a stable claim ID.');
  const occurredAt = Math.max(1, Number(record.collectedAt || record.occurredAt) || Date.now());
  const collection = options.collection === true;
  const regionId = boundedText(record.regionId || record.worldIdentity || 'local-region', 160);
  const regionLabel = boundedText(record.regionLabel || options.regionLabel || 'Current region', 120);
  const resolution = boundedText(options.resolution || (collection ? 'collected' : 'recorded'), 40);
  const toolId = boundedText(record.toolId || options.toolId, 80);
  return Object.freeze({
    type: 'ExplorerEvent',
    schemaVersion: EXPLORER_EVENT_SCHEMA_VERSION,
    eventId: boundedText(options.eventId || `event:${claimId}`, 260),
    eventType: collection ? 'specimen-collected' : 'discovery-recorded',
    claimId,
    occurredAt,
    activityId: boundedText(record.activityId || 'inspect', 80),
    toolId,
    catalogId: boundedText(record.catalogId, 120),
    name: boundedText(record.name || record.catalogId || 'Discovery', 160),
    family: boundedText(record.family || 'discovery', 80),
    specialtyId: specialtyForDiscovery(record),
    resolution,
    evidenceClass: boundedText(record.evidenceClass || 'virtual-field-record', 80),
    evidenceContractId: boundedText(record.evidenceContractId, 80),
    evidencePayload: Object.freeze({ ...(record.evidencePayload || {}) }),
    regionalPackId: boundedText(record.regionalPackId, 120),
    regionalPackVersion: boundedText(record.regionalPackVersion, 80),
    stableTaxonId: boundedText(record.stableTaxonId, 160),
    taxonGroup: boundedText(record.taxonGroup, 80),
    regionId,
    regionLabel,
    locationKey: boundedText(record.locationKey || options.locationKey, 120),
    locationSnapshot: locationSnapshot(record.locationSnapshot || options.locationSnapshot),
    worldIdentity: boundedText(record.worldIdentity || regionId, 180),
    environment: boundedText(record.environment || options.environment || 'EARTH', 32).toUpperCase(),
    localPosition: Object.freeze({
      x: finiteOrNull(record.localPosition?.x ?? options.localPosition?.x),
      y: finiteOrNull(record.localPosition?.y ?? options.localPosition?.y),
      z: finiteOrNull(record.localPosition?.z ?? options.localPosition?.z)
    }),
    sourceSystem: 'field',
    pathId: 'field',
    detail: boundedText(record.description || options.detail, 240),
    projections: Object.freeze({ journal: true, fieldGuide: true, collection, profile: true, place: true, missionProgress: true }),
    progress: Object.freeze({
      points: Math.max(0, Number(options.progress?.points) || 0),
      reason: boundedText(options.progress?.reason || 'pending', 64)
    })
  });
}

function createExplorerStoryEvent(record = {}) {
  const eventType = boundedText(record.eventType, 80);
  const sourceId = boundedText(record.sourceId || record.activityId || record.worldIdentity, 180);
  const eventId = boundedText(record.eventId || (eventType && sourceId ? `event:${eventType}:${sourceId}` : ''), 260);
  if (!eventType || !eventId) throw new TypeError('Explorer story events require stable eventType and eventId values.');
  const pathId = Object.hasOwn(EXPLORER_EVENT_PATHS, record.pathId) ? record.pathId : 'travel';
  const regionId = boundedText(record.regionId || record.worldIdentity || 'local-region', 160);
  const projectionInput = record.projections && typeof record.projections === 'object' ? record.projections : {};
  return Object.freeze({
    type: 'ExplorerEvent',
    schemaVersion: EXPLORER_EVENT_SCHEMA_VERSION,
    eventId,
    eventType,
    sourceSystem: boundedText(record.sourceSystem || pathId, 80),
    sourceId,
    pathId,
    occurredAt: Math.max(1, Number(record.occurredAt) || Date.now()),
    name: boundedText(record.name || record.title || 'Explorer memory', 160),
    detail: boundedText(record.detail || record.description, 240),
    activityId: boundedText(record.activityId, 80),
    specialtyId: boundedText(record.specialtyId || (pathId === 'field' ? 'nature' : 'places'), 40),
    regionId,
    regionLabel: boundedText(record.regionLabel || 'Current region', 120),
    locationKey: boundedText(record.locationKey, 120),
    locationSnapshot: locationSnapshot(record.locationSnapshot),
    worldIdentity: boundedText(record.worldIdentity || regionId, 180),
    environment: boundedText(record.environment || 'EARTH', 32).toUpperCase(),
    localPosition: Object.freeze({
      x: finiteOrNull(record.localPosition?.x),
      y: finiteOrNull(record.localPosition?.y),
      z: finiteOrNull(record.localPosition?.z)
    }),
    projections: Object.freeze({
      journal: projectionInput.journal !== false,
      fieldGuide: projectionInput.fieldGuide === true,
      collection: projectionInput.collection === true,
      profile: projectionInput.profile !== false,
      place: projectionInput.place !== false,
      missionProgress: projectionInput.missionProgress === true
    }),
    progress: Object.freeze({
      points: Math.max(0, Number(record.progress?.points ?? record.points) || 0),
      reason: boundedText(record.progress?.reason || record.progressReason || 'sandbox-accomplishment', 64)
    }),
    firstCompletion: record.firstCompletion === true,
    metadata: Object.freeze({ ...(record.metadata || {}) })
  });
}

function projectExplorerStoryProgress(current, event) {
  const progress = normalizeExplorerProgress(current);
  const pathId = Object.hasOwn(EXPLORER_EVENT_PATHS, event?.pathId) ? event.pathId : 'travel';
  const points = Math.max(0, Number(event?.progress?.points) || 0);
  const path = { ...progress.paths[pathId] };
  path.points += points;
  path.records += 1;
  if (event?.firstCompletion === true) path.firsts += 1;
  const regionId = boundedText(event?.regionId || event?.worldIdentity, 160);
  return normalizeExplorerProgress({
    ...progress,
    points: progress.points + points,
    totalRecords: progress.totalRecords + 1,
    regions: regionId ? unique([...progress.regions, regionId]) : progress.regions,
    paths: { ...progress.paths, [pathId]: path }
  });
}

export {
  EXPLORER_EVENT_SCHEMA_VERSION,
  EXPLORER_EVENT_PATHS,
  EXPLORER_BADGES,
  EXPLORER_RANKS,
  EXPLORER_SPECIALTIES,
  createExplorerEvent,
  createExplorerStoryEvent,
  defaultExplorerProgress,
  explorerProgressSnapshot,
  explorerRankForPoints,
  normalizeExplorerProgress,
  progressCreditForDiscovery,
  projectExplorerProgress,
  projectExplorerStoryProgress,
  specialtyForDiscovery
};
