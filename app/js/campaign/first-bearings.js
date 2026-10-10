// Personal campaign evidence belongs to the Journal transaction, never analytics.
export const FIRST_BEARINGS = Object.freeze({
  id: 'first-bearings', schemaVersion: 1, title: 'First Bearings',
  receiptId: 'event:campaign-completed:first-bearings:v1'
});

const text = (value, limit = 160) => String(value || '').trim().slice(0, limit);
const time = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export function normalizeOpeningChapter(input = {}) {
  // Preserve newer saves. This client may read their presence, but cannot edit them.
  if (input?.schemaVersion != null && input.schemaVersion !== 1) return { ...input };
  const acceptedAt = time(input?.acceptedAt), completedAt = time(input?.completedAt);
  const regionId = text(input?.regionId), eventId = text(input?.eventId, 260);
  const phase = !acceptedAt || !regionId ? 'available' : !eventId ? 'active' : completedAt ? 'complete' : 'review';
  return { schemaVersion: 1, phase, acceptedAt, regionId,
    regionLabel: text(input?.regionLabel, 120), environment: 'EARTH',
    eventId, resultName: text(input?.resultName), completedAt: phase === 'complete' ? completedAt : 0 };
}

export function beginOpeningChapter(input, location, now = Date.now()) {
  const chapter = normalizeOpeningChapter(input);
  if (chapter.schemaVersion !== 1) throw new Error('This chapter was saved by a newer version of World Explorer.');
  if (chapter.phase !== 'available') return chapter;
  if (location?.environment !== 'EARTH' || !text(location?.regionId) || !time(now)) {
    throw new Error('Start First Bearings in a loaded Earth location.');
  }
  return normalizeOpeningChapter({ acceptedAt: now, regionId: location.regionId, regionLabel: location.regionLabel });
}

function eligibleEvidence(chapter, event) {
  return chapter.schemaVersion === 1 && chapter.acceptedAt > 0 && event?.sourceSystem === 'field'
    && ['discovery-recorded', 'specimen-collected'].includes(event.eventType)
    && ['recorded', 'collected'].includes(event.resolution)
    && event.environment === 'EARTH' && event.regionId === chapter.regionId
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
