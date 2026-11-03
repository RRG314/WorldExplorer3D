export const copyFieldRecord = (value) => JSON.parse(JSON.stringify(value));
export const fieldCoordinate = (p) =>
  p &&
  Number.isFinite(p.lat) &&
  Math.abs(p.lat) <= 90 &&
  Number.isFinite(p.lon) &&
  Math.abs(p.lon) <= 180;
export const fieldDistance = (a, b) =>
  Math.hypot(
    (a.lat - b.lat) * 111000,
    (a.lon - b.lon) * 111000 * Math.cos((a.lat * Math.PI) / 180)
  );
export function normalizeFieldStudy(value) {
  if (value?.schemaVersion != null && value.schemaVersion !== 1) return copyFieldRecord(value);
  return {
    schemaVersion: 1,
    revision: 0,
    completed: {},
    active: null,
    ...copyFieldRecord(value || {})
  };
}
export function validateFieldSite(site, offsets) {
  const ids = Object.keys(offsets);
  if (
    !site?.id ||
    site.truthType !== 'virtual-training-site' ||
    !fieldCoordinate(site.location) ||
    !ids.every((id) => fieldCoordinate(site.points?.[id])) ||
    (site.locationContext && !fieldCoordinate(site.locationContext)) ||
    ids.some((id) => fieldDistance(site.points[id], site.location) > 120)
  )
    throw Error('Choose a supported virtual field course.');
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (fieldDistance(site.points[ids[i]], site.points[ids[j]]) < 5)
        throw Error('The field stations need separate supported spaces.');
  return {
    id: String(site.id).slice(0, 100),
    name: String(site.name || 'Virtual field course').slice(0, 120),
    truthType: 'virtual-training-site',
    location: { lat: site.location.lat, lon: site.location.lon },
    locationContext: site.locationContext
      ? {
          lat: site.locationContext.lat,
          lon: site.locationContext.lon,
          name: String(site.locationContext.name || site.name).slice(0, 120)
        }
      : null,
    points: Object.fromEntries(
      ids.map((id) => [id, { lat: site.points[id].lat, lon: site.points[id].lon }])
    )
  };
}
export function requireFieldPresence(active, target, evidence, now) {
  if (
    evidence?.environment !== 'EARTH' ||
    evidence.travelMode !== 'walk' ||
    evidence.liveGps ||
    evidence.supported !== true ||
    !Number.isFinite(evidence.verticalDistance) ||
    Math.abs(evidence.verticalDistance) > 2.5 ||
    !fieldCoordinate(evidence.position) ||
    evidence.siteId !== active.site.id ||
    !Number.isFinite(evidence.at) ||
    Math.abs(evidence.at - now) > 2000 ||
    fieldDistance(evidence.position, active.site.points[target]) > 3
  )
    throw Error('Walk to the marked station before recording this step.');
}
export function requireFieldCustody(active, command, ids) {
  if (!ids.length || !ids.every((id) => command.custody?.includes(id)))
    throw Error(
      'Bring this case’s labelled specimen to the bench. Retrieve stored specimens from home first.'
    );
  return ids;
}
export const canonicalFieldRecord = (value) =>
  JSON.stringify(value, (_, v) =>
    v && !Array.isArray(v) && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
// Replay the saved domain commands, without creating any new rewards or writes.
export function validateFieldHistory(id, value, events, items, transition) {
  if (!value || value.schemaVersion !== 1) return;
  const canonical = canonicalFieldRecord,
    fail = () => {
      throw TypeError('The saved field study or specimen custody is incomplete.');
    };
  const records = events
    .filter((row) => row.sourceSystem === 'research-careers' && row.metadata?.careerId === id)
    .sort((a, b) => Number(a.metadata.action?.revision) - Number(b.metadata.action?.revision));
  let replay = normalizeFieldStudy();
  for (const record of records) {
    const command = record.metadata.action;
    if (!command || command.revision !== replay.revision) fail();
    const result = transition(replay, command, record.occurredAt);
    if (
      !result.event ||
      record.eventId !== result.event.eventId ||
      record.eventType !== result.event.eventType ||
      canonical(record.metadata) !== canonical(result.event.metadata)
    )
      fail();
    for (const specimen of result.samples) {
      const saved = items.find((row) => row.instanceId === specimen.instanceId);
      if (
        !saved ||
        saved.tradeable !== false ||
        saved.catalogId !== specimen.catalogId ||
        saved.sourceEventId !== specimen.sourceEventId ||
        canonical(saved.researchLabel) !== canonical(specimen.researchLabel)
      )
        fail();
    }
    replay = result.state;
  }
  if (canonical(replay) !== canonical(normalizeFieldStudy(value))) fail();
}
