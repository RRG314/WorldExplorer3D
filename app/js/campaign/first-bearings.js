import { researchStarter, starterAcceptsActivity } from './research-starters.js';
// Personal campaign evidence belongs to the Journal transaction, never analytics.
export const FIRST_BEARINGS = Object.freeze({
  id: 'first-bearings', schemaVersion: 1, title: 'First Bearings',
  receiptId: 'event:campaign-completed:first-bearings:v1'
});

const text = (value, limit = 160) => String(value || '').trim().slice(0, limit);
const time = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export function validateOpeningLocation(value) {
  if (
    !value ||
    ![value.lat, value.lon].every(Number.isFinite) ||
    Math.abs(value.lat) > 90 ||
    Math.abs(value.lon) > 180 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 120
  )
    throw Error('Choose a valid starting place for First Bearings.');
  return { lat: value.lat, lon: value.lon, name: value.name };
}
export function normalizeOpeningChapter(input = {}) {
  // Preserve newer saves. This client may read their presence, but cannot edit them.
  if (input?.schemaVersion != null && input.schemaVersion !== 1) return { ...input };
  const acceptedAt = time(input?.acceptedAt),
    completedAt = time(input?.completedAt);
  const regionId = text(input?.regionId),
    eventId = text(input?.eventId, 260);
  const phase =
    !acceptedAt || !regionId
      ? 'available'
      : !eventId
        ? 'active'
        : completedAt
          ? 'complete'
          : 'review';
  return {
    schemaVersion: 1,
    phase,
    acceptedAt,
    regionId,
    careerId: text(input?.careerId, 60) || 'general',
    regionLabel: text(input?.regionLabel, 120),
    environment: 'EARTH',
    eventId,
    resultName: text(input?.resultName),
    completedAt: phase === 'complete' ? completedAt : 0,
    ...(input?.locationSnapshot ? { locationSnapshot: { ...input.locationSnapshot } } : {}),
  };
}

// Older readers retain unknown profile fields, but their chapter normalizer
// predates locationSnapshot. This backup restores only the same accepted
// chapter's optional location; it cannot create progress or a completion.
export function preserveOpeningLocation(input, backup) {
  let chapter = normalizeOpeningChapter(input);
  if (chapter.schemaVersion !== 1) return { chapter, backup };
  const matches =
    backup?.schemaVersion === 1 &&
    chapter.acceptedAt > 0 &&
    backup.acceptedAt === chapter.acceptedAt &&
    backup.regionId === chapter.regionId &&
    backup.careerId === chapter.careerId;
  if (!chapter.locationSnapshot && matches) {
    try {
      chapter = { ...chapter, locationSnapshot: validateOpeningLocation(backup.locationSnapshot) };
    } catch {
      /* Unreadable metadata cannot invent a starting place. */
    }
  }
  if (
    chapter.acceptedAt > 0 &&
    chapter.locationSnapshot &&
    (backup == null || backup.schemaVersion === 1)
  ) {
    try {
      backup = {
        schemaVersion: 1,
        acceptedAt: chapter.acceptedAt,
        regionId: chapter.regionId,
        careerId: chapter.careerId,
        locationSnapshot: validateOpeningLocation(chapter.locationSnapshot),
      };
    } catch {
      /* Preserve the original value for validation/recovery. */
    }
  }
  return { chapter, backup };
}

export function beginOpeningChapter(input, location, now = Date.now()) {
  const chapter = normalizeOpeningChapter(input);
  if (chapter.schemaVersion !== 1)
    throw new Error('This chapter was saved by a newer version of World Explorer.');
  if (chapter.phase !== 'available') return chapter;
  if (location?.environment !== 'EARTH' || !text(location?.regionId) || !time(now)) {
    throw new Error('Start First Bearings in a loaded Earth location.');
  }
  const careerId = text(location.careerId, 60) || 'general';
  if (!researchStarter(careerId))
    throw Error('This field assignment needs a newer version of World Explorer.');
  return normalizeOpeningChapter({
    acceptedAt: now,
    regionId: location.regionId,
    regionLabel: location.regionLabel,
    careerId,
    ...(location.locationSnapshot
      ? { locationSnapshot: validateOpeningLocation(location.locationSnapshot) }
      : {}),
  });
}

function eligibleEvidence(chapter, event) {
  return chapter.schemaVersion === 1 && chapter.acceptedAt > 0 && event?.sourceSystem === 'field'
    && ['discovery-recorded', 'specimen-collected'].includes(event.eventType)
    && ['recorded', 'collected'].includes(event.resolution)
    && event.environment === 'EARTH' && event.regionId === chapter.regionId
    && starterAcceptsActivity(chapter.careerId,event.activityId)
    && time(event.occurredAt) >= chapter.acceptedAt && !!text(event.eventId, 260);
}

export function projectOpeningChapter(input, event) {
  const chapter = normalizeOpeningChapter(input);
  if (chapter.phase !== 'active' || !eligibleEvidence(chapter, event)) return chapter;
  return normalizeOpeningChapter({ ...chapter, eventId: event.eventId, resultName: event.name });
}

export function finishOpeningChapter(input, evidence, now = Date.now()) {
  const chapter = normalizeOpeningChapter(input);
  if (chapter.schemaVersion !== 1) throw new Error('This chapter was saved by a newer version of World Explorer.');
  if (chapter.phase !== 'review' || evidence?.eventId !== chapter.eventId || !eligibleEvidence(chapter, evidence)) {
    throw new Error('Review the saved First Bearings field record before finishing this chapter.');
  }
  return normalizeOpeningChapter({ ...chapter, completedAt: Math.max(time(now), time(evidence.occurredAt), 1) });
}

export function openingChapterBadge(input) {
  const chapter = normalizeOpeningChapter(input);
  return chapter.schemaVersion === 1 && chapter.phase === 'complete'
    ? { id: FIRST_BEARINGS.id, label: FIRST_BEARINGS.title, earnedAt: chapter.completedAt,
      eventId: FIRST_BEARINGS.receiptId, detail: 'Recorded a local discovery and reviewed it in the Journal.' }
    : null;
}
