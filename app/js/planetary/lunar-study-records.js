import {
  LUNAR_STUDIES,
  LUNAR_STRATEGIES,
  lunarStudyMissionId,
  lunarStudyReportId,
  lunarFieldPlan,
} from './lunar-survey.js';
export const lunarStudyDisplayId = (variantId) => {
  lunarStudyMissionId(variantId);
  return variantId === 'campaign'
    ? 'event:campaign:lunar-homecoming:v1'
    : 'event:campaign:lunar-homecoming:' + variantId;
};
export const lunarStudyEventIds = Object.freeze(
  Object.keys(LUNAR_STUDIES).flatMap((id) => [lunarStudyReportId(id), lunarStudyDisplayId(id)]),
);
export function lunarStudyReport(event) {
  const m = event?.metadata,
    id = m?.surveyVariantId || 'campaign';
  if (
    !event ||
    !Object.hasOwn(LUNAR_STUDIES, id) ||
    event.eventId !== lunarStudyReportId(id) ||
    event.sourceSystem !== 'destination-missions' ||
    event.eventType !== 'destination-mission-complete' ||
    !Number.isFinite(event.occurredAt) ||
    event.occurredAt <= 0 ||
    m?.lunarVersion !== 1 ||
    m.truthType !== 'authored' ||
    m.missionId !== lunarStudyMissionId(id) ||
    m.prepared !== true ||
    !LUNAR_STRATEGIES.some((s) => s.id === m.strategy) ||
    typeof m.podId !== 'string' ||
    !m.podId ||
    typeof m.expeditionId !== 'string' ||
    !m.expeditionId ||
    !Array.isArray(m.fieldEvidence) ||
    m.fieldEvidence.length > 8 ||
    !lunarFieldPlan(m.strategy).every((e) => m.fieldEvidence.includes(e.evidenceId))
  )
    return null;
  if (
    id === 'planned-return' &&
    (!m.siteARecovery ||
      m.siteARecovery.podId === m.podId ||
      typeof m.siteARecovery.podId !== 'string' ||
      !m.siteARecovery.podId ||
      m.siteARecovery.expeditionId !== m.expeditionId ||
      !Number.isFinite(m.siteARecovery.atMs) ||
      m.siteARecovery.atMs > event.occurredAt)
  )
    return null;
  if (id !== 'campaign' && m.definitionId !== 'mission:moon') return null;
  return event;
}
export function lunarStudyState(events = []) {
  const reports = Object.fromEntries(
    Object.keys(LUNAR_STUDIES).map((id) => [
      id,
      lunarStudyReport(events.find((e) => e.eventId === lunarStudyReportId(id))),
    ]),
  );
  if (
    reports['alternate-method'] &&
    (!reports.campaign ||
      reports['alternate-method'].metadata.strategy === reports.campaign.metadata.strategy)
  )
    reports['alternate-method'] = null;
  if (reports['planned-return'] && !reports.campaign) reports['planned-return'] = null;
  const displays = Object.fromEntries(
    Object.keys(LUNAR_STUDIES).map((id) => [
      id,
      events.find(
        (e) =>
          e.eventId === lunarStudyDisplayId(id) &&
          e.sourceSystem === 'explorer-campaign' &&
          e.eventType === 'campaign-completed' &&
          e.environment === 'EARTH' &&
          e.occurredAt >= reports[id]?.occurredAt &&
          e.metadata?.reportId === reports[id]?.eventId &&
          e.metadata?.podId === reports[id]?.metadata.podId &&
          e.metadata?.homeId,
      ) || null,
    ]),
  );
  return { reports, displays };
}
export function lunarStudyHomecomingRecord(home, report, now = Date.now()) {
  const accepted = lunarStudyReport(report),
    id = accepted?.metadata.surveyVariantId || 'campaign';
  if (
    !accepted ||
    !home?.id ||
    home.workspace?.recordId !== accepted.eventId ||
    !Number.isFinite(now) ||
    now < accepted.occurredAt
  )
    throw Error('Display this lunar field book at your Earth desk first.');
  return {
    eventId: lunarStudyDisplayId(id),
    eventType: 'campaign-completed',
    sourceSystem: 'explorer-campaign',
    sourceId: id === 'campaign' ? 'lunar-homecoming' : 'lunar-homecoming:' + id,
    pathId: 'creation',
    name: id === 'campaign' ? 'Bring the Journey Home' : LUNAR_STUDIES[id].label + ' · homecoming',
    detail:
      id === 'campaign'
        ? 'Returned to an Earth workspace and reviewed the two-site lunar field record at the desk.'
        : 'Returned to an Earth workspace and reviewed this lunar comparison at the desk.',
    occurredAt: now,
    environment: 'EARTH',
    regionId: home.locationId,
    regionLabel: home.locationLabel,
    points: 0,
    projections: { journal: true, profile: false, place: false },
    metadata: {
      homeId: home.id,
      reportId: accepted.eventId,
      podId: accepted.metadata.podId,
      truthType: 'authored',
      ...(id !== 'campaign' ? { surveyVariantId: id } : {}),
    },
  };
}
export function validateLunarStudyBackups(events) {
  const state = lunarStudyState(events);
  for (const id of ['alternate-method', 'planned-return']) {
    if (events.some((e) => e.eventId === lunarStudyReportId(id)) && !state.reports[id])
      throw Error('The lunar repeat report is incomplete.');
    if (events.some((e) => e.eventId === lunarStudyDisplayId(id)) && !state.displays[id])
      throw Error('The lunar repeat homecoming is incomplete.');
  }
}

// Keep the bounded field books reachable alongside recent observations. Their
// saved timestamps and source records are not rewritten to make them recent.
export function mergeLunarJournalRecords(recent = [], studyEvents = []) {
  const saved = lunarStudyState(studyEvents),
    rows = [...recent];
  for (const id of Object.keys(LUNAR_STUDIES)) {
    if (saved.reports[id]) rows.push(saved.reports[id]);
    if (saved.displays[id]) rows.push(saved.displays[id]);
  }
  return [...new Map(rows.map((row) => [row.eventId, row])).values()].sort(
    (a, b) => b.occurredAt - a.occurredAt,
  );
}
