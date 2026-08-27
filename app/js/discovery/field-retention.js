import { FIELD_EVIDENCE_CONTRACTS, resolveFieldEvidenceContract } from './evidence-contracts.js?v=2';
import {
  MINIMUM_5_0_MISSION_SCOPE,
  createMissionProgramSnapshot,
  dedupeMissionProgressEvents
} from './mission-lifecycle.js?v=1';

const FIELD_RETENTION_SCHEMA_VERSION = 2;

const GROUP_LABELS = Object.freeze({
  mammal: 'Mammals',
  bird: 'Birds',
  'insect-arachnid': 'Insects & Arachnids',
  plant: 'Plants',
  'freshwater-fish': 'Freshwater Fish',
  'marine-fish': 'Marine Fish'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function localDayKey(value = Date.now()) {
  const date = new Date(Number(value) || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localWeekKey(value = Date.now()) {
  const date = new Date(Number(value) || Date.now());
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return `week:${localDayKey(date.getTime())}`;
}

function seasonForMonth(month) {
  if ([12, 1, 2].includes(month)) return { id: 'winter', label: 'Winter' };
  if ([3, 4, 5].includes(month)) return { id: 'spring', label: 'Spring' };
  if ([6, 7, 8].includes(month)) return { id: 'summer', label: 'Summer' };
  return { id: 'autumn', label: 'Autumn' };
}

function activityContractId(event = {}) {
  return String(event.evidenceContractId || resolveFieldEvidenceContract(event.activityId)?.id || '');
}

function taxonGroup(record = {}) {
  if (record.taxonGroup && GROUP_LABELS[record.taxonGroup]) return record.taxonGroup;
  const family = String(record.family || '');
  return Object.keys(GROUP_LABELS).find((group) => family === `${group}-taxon`) || null;
}

function objective(id, label, current, target, detail, contributingEventIds = [], progressEventTypes = []) {
  const boundedTarget = Math.max(1, Number(target) || 1);
  const boundedCurrent = Math.max(0, Number(current) || 0);
  return deepFreeze({
    id, label, detail, contributingEventIds, progressEventTypes,
    current: boundedCurrent,
    target: boundedTarget,
    complete: boundedCurrent >= boundedTarget,
    progressPercent: Math.min(100, Math.round(boundedCurrent / boundedTarget * 100))
  });
}

function createFieldRetentionSnapshot(options = {}) {
  const now = Number(options.now) || Date.now();
  const guide = Array.isArray(options.guide) ? options.guide : [];
  const eventSet = dedupeMissionProgressEvents(options.events);
  const events = eventSet.accepted;
  const regionalPack = options.regionalPack?.type === 'RegionalEcologyPack' ? options.regionalPack : null;
  const regionId = String(options.regionId || '');
  const regionalEvents = regionId ? events.filter((event) => event.regionId === regionId) : events;
  const dayKey = localDayKey(now);
  const weekKey = localWeekKey(now);
  const todayEvents = regionalEvents.filter((event) => localDayKey(event.occurredAt) === dayKey);
  const weekEvents = regionalEvents.filter((event) => localWeekKey(event.occurredAt) === weekKey);
  const regionGuide = regionId
    ? guide.filter((entry) => Array.isArray(entry.regions) && entry.regions.includes(regionId))
    : guide;
  const packGuide = regionalPack
    ? regionGuide.filter((entry) => entry.regionalPackId === regionalPack.id || regionalPack.taxa.some((taxon) => taxon.id === entry.catalogId))
    : regionGuide;
  const groups = Object.entries(GROUP_LABELS).map(([id, label]) => {
    const target = regionalPack?.taxa?.filter((entry) => entry.group === id).length || 0;
    const current = new Set(packGuide.filter((entry) => taxonGroup(entry) === id).map((entry) => entry.catalogId)).size;
    return deepFreeze({ id, label, current, target });
  });
  const methods = Object.values(FIELD_EVIDENCE_CONTRACTS).map((contract) => {
    const records = regionalEvents.filter((event) => activityContractId(event) === contract.id).length;
    return deepFreeze({ id: contract.id, label: contract.recordKind, records });
  });
  const todayMethods = new Set(todayEvents.map(activityContractId).filter(Boolean));
  const weekMethods = new Set(weekEvents.map(activityContractId).filter(Boolean));
  const todayNewTaxa = packGuide.filter((entry) => localDayKey(entry.firstObservedAt) === dayKey).length;
  const weekNewTaxa = packGuide.filter((entry) => localWeekKey(entry.firstObservedAt) === weekKey).length;
  const daily = createMissionProgramSnapshot({
    id: `daily:${dayKey}`,
    programType: 'field-today',
    programVersion: 1,
    label: 'Field Today',
    resetPolicy: 'new-day-new-focus-no-streak-loss',
    objectives: [
      objective('daily-record', 'Save one field record', todayEvents.length, 1, 'Any honest typed field record counts.', todayEvents.map((event) => event.eventId), ['discovery-recorded', 'specimen-collected']),
      objective('daily-methods', 'Use two evidence methods', todayMethods.size, 2, 'Try a second way of documenting the place.', todayEvents.map((event) => event.eventId), ['evidence-method-recorded']),
      objective('daily-life-list', 'Add one regional life-list entry', todayNewTaxa, 1, 'Identify one new reviewed regional taxon.', todayEvents.filter((event) => event.firstIdentification).map((event) => event.eventId), ['first-identification'])
    ],
    eligibility: { eligible: true, acceptedMovementSources: ['manual_direct', 'gps_walk', 'accessibility_assist'] },
    replayPolicy: { mode: 'daily-rollover' },
    locationScope: { kind: 'region', regionId, regionalPackId: regionalPack?.id || '' },
    multiplayer: { mode: 'personal-progress', sharedCompletion: false, contributionRequiresOwnEvidence: true },
    window: { key: dayKey },
    progressEvents: todayEvents
  });
  const weekly = createMissionProgramSnapshot({
    id: `weekly:${weekKey}`,
    programType: 'weekly-expedition',
    programVersion: 1,
    label: 'Weekly Expedition',
    resetPolicy: 'new-week-new-expedition-no-streak-loss',
    objectives: [
      objective('weekly-records', 'Save five field records', weekEvents.length, 5, 'Records can come from free roam or Live GPS.', weekEvents.map((event) => event.eventId), ['discovery-recorded', 'specimen-collected']),
      objective('weekly-methods', 'Use four evidence methods', weekMethods.size, 4, 'Build a varied Journal instead of grinding one action.', weekEvents.map((event) => event.eventId), ['evidence-method-recorded']),
      objective('weekly-life-list', 'Add three regional taxa', weekNewTaxa, 3, 'Grow the same persistent regional life list.', weekEvents.filter((event) => event.firstIdentification).map((event) => event.eventId), ['first-identification'])
    ],
    eligibility: { eligible: true, acceptedMovementSources: ['manual_direct', 'gps_walk', 'accessibility_assist'] },
    replayPolicy: { mode: 'weekly-rollover' },
    locationScope: { kind: 'region', regionId, regionalPackId: regionalPack?.id || '' },
    multiplayer: { mode: 'personal-progress', sharedCompletion: false, contributionRequiresOwnEvidence: true },
    window: { key: weekKey },
    progressEvents: weekEvents
  });
  const date = new Date(now);
  const season = seasonForMonth(date.getMonth() + 1);
  const activeSeasonTaxa = regionalPack?.taxa?.filter((entry) =>
    entry.activeMonths.some((month) => seasonForMonth(month).id === season.id)) || [];
  const activeIds = new Set(activeSeasonTaxa.map((entry) => entry.id));
  const seasonalIdentified = new Set(packGuide.filter((entry) => activeIds.has(entry.catalogId)).map((entry) => entry.catalogId)).size;
  const seasonalTarget = Math.min(6, Math.max(1, activeIds.size));
  const seasonalMission = createMissionProgramSnapshot({
    id: `seasonal:${regionalPack?.id || 'global'}:${date.getFullYear()}:${season.id}`,
    programType: 'seasonal-regional-survey',
    programVersion: 1,
    label: `${season.label} Regional Survey`,
    resetPolicy: 'new-season-new-survey-no-permanent-life-list-loss',
    objectives: [objective('seasonal-life-list', `Identify ${seasonalTarget} season-compatible taxa`, seasonalIdentified, seasonalTarget,
      'Seasonality narrows the reviewed catalog; it does not assert live presence.',
      regionalEvents.filter((event) => activeIds.has(event.catalogId)).map((event) => event.eventId), ['season-compatible-identification'])],
    eligibility: {
      eligible: !!regionalPack,
      reasons: regionalPack ? [] : ['reviewed-regional-ecology-pack-unavailable'],
      acceptedMovementSources: ['manual_direct', 'gps_walk', 'accessibility_assist']
    },
    replayPolicy: { mode: 'seasonal-rollover' },
    locationScope: { kind: 'reviewed-regional-pack', regionId, regionalPackId: regionalPack?.id || '' },
    multiplayer: { mode: 'personal-progress', sharedCompletion: false, contributionRequiresOwnEvidence: true },
    window: { key: `${date.getFullYear()}:${season.id}` },
    progressEvents: regionalEvents.filter((event) => activeIds.has(event.catalogId))
  });
  const seasonal = deepFreeze({
    ...seasonalMission,
    eligibleTaxa: activeIds.size,
    objective: seasonalMission.objectives[0],
    truthClass: 'catalog-season-compatible-not-live-presence'
  });
  const lastEventAt = regionalEvents.reduce((latest, event) => Math.max(latest, Number(event.occurredAt) || 0), 0);
  const daysAway = lastEventAt ? Math.max(0, Math.floor((new Date(dayKey).getTime() - new Date(localDayKey(lastEventAt)).getTime()) / 86_400_000)) : null;
  const returnFocus = deepFreeze({
    id: 'non-punitive-return',
    noPenalty: true,
    daysAway,
    label: lastEventAt && daysAway === 0 ? 'Continue today’s fieldwork' : lastEventAt ? 'Welcome back to the field' : 'Begin your field story',
    detail: lastEventAt && daysAway > 0
      ? `You were away ${daysAway} day${daysAway === 1 ? '' : 's'}. Nothing was lost—choose one gentle observation to resume.`
      : lastEventAt ? 'Your life lists and Expedition progress are waiting; there is no streak to protect.' : 'Start with one nearby lead. Missed days never reduce progress.'
  });
  return deepFreeze({
    type: 'FieldRetentionSnapshot',
    schemaVersion: FIELD_RETENTION_SCHEMA_VERSION,
    generatedAt: now,
    regionId,
    regionalPackId: regionalPack?.id || null,
    lifeList: { identified: packGuide.length, target: regionalPack?.taxa?.length || 0, groups },
    evidenceSpecialties: methods,
    missionAuthority: {
      ...MINIMUM_5_0_MISSION_SCOPE,
      sourceEventCount: eventSet.acceptedCount,
      duplicateEventCount: eventSet.duplicateCount,
      rejectedEventCount: eventSet.rejectedCount,
      programs: [daily.id, weekly.id, seasonal.id]
    },
    daily,
    weekly,
    seasonal,
    returnFocus
  });
}

export {
  FIELD_RETENTION_SCHEMA_VERSION,
  GROUP_LABELS,
  createFieldRetentionSnapshot,
  localDayKey,
  localWeekKey,
  seasonForMonth,
  taxonGroup
};
