const EXPLORER_EVENT_SCHEMA_VERSION = 1;

const EXPLORER_RANKS = Object.freeze([
  Object.freeze({ id: 'trailhead', label: 'Trailhead', minimumPoints: 0 }),
  Object.freeze({ id: 'pathfinder', label: 'Pathfinder', minimumPoints: 8 }),
  Object.freeze({ id: 'field-explorer', label: 'Field Explorer', minimumPoints: 20 }),
  Object.freeze({ id: 'expeditioner', label: 'Expeditioner', minimumPoints: 45 })
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
  return Object.freeze({
    ...progress,
    points,
    rankId: rank.id,
    rankLabel: rank.label,
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
    schemaVersion: 1,
    points: 0,
    totalRecords: 0,
    uniqueDiscoveries: 0,
    regions: [],
    specialties: {
      nature: { points: 0, records: 0, uniqueDiscoveries: 0 },
      earth: { points: 0, records: 0, uniqueDiscoveries: 0 },
      places: { points: 0, records: 0, uniqueDiscoveries: 0 }
    },
    milestones: []
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
  return {
    ...base,
    ...(input || {}),
    points: Math.max(0, Number(input?.points) || 0),
    totalRecords: Math.max(0, Number(input?.totalRecords) || 0),
    uniqueDiscoveries: Math.max(0, Number(input?.uniqueDiscoveries) || 0),
    regions: unique(input?.regions),
    specialties,
    milestones: unique(input?.milestones),
    schemaVersion: 1
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
  const specialty = { ...progress.specialties[specialtyId] };
  const regionId = boundedText(record.regionId || record.worldIdentity || 'local-region', 160);
  const points = Math.max(0, Number(credit?.points) || 0);
  const uniqueDiscovery = credit?.reason === 'new-identification';

  specialty.points += points;
  specialty.records += 1;
  if (uniqueDiscovery) specialty.uniqueDiscoveries += 1;

  const next = normalizeExplorerProgress({
    ...progress,
    points: progress.points + points,
    totalRecords: progress.totalRecords + 1,
    uniqueDiscoveries: progress.uniqueDiscoveries + (uniqueDiscovery ? 1 : 0),
    regions: unique([...progress.regions, regionId]),
    specialties: { ...progress.specialties, [specialtyId]: specialty }
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
    worldIdentity: boundedText(record.worldIdentity || regionId, 180),
    environment: boundedText(record.environment || options.environment || 'EARTH', 32).toUpperCase(),
    localPosition: Object.freeze({
      x: finiteOrNull(record.localPosition?.x ?? options.localPosition?.x),
      y: finiteOrNull(record.localPosition?.y ?? options.localPosition?.y),
      z: finiteOrNull(record.localPosition?.z ?? options.localPosition?.z)
    }),
    projections: Object.freeze({ journal: true, fieldGuide: true, collection, missionProgress: true }),
    progress: Object.freeze({
      points: Math.max(0, Number(options.progress?.points) || 0),
      reason: boundedText(options.progress?.reason || 'pending', 64)
    })
  });
}

export {
  EXPLORER_EVENT_SCHEMA_VERSION,
  EXPLORER_RANKS,
  EXPLORER_SPECIALTIES,
  createExplorerEvent,
  defaultExplorerProgress,
  explorerProgressSnapshot,
  explorerRankForPoints,
  normalizeExplorerProgress,
  progressCreditForDiscovery,
  projectExplorerProgress,
  specialtyForDiscovery
};
