import { THREE_VIEWS } from './three-views-config.js';
import { canonicalFieldRecord as canonical } from './field-study-contract.js';
export const DOCUMENTARY_STORY = Object.freeze({
  id: 'read-the-street',
  label: 'Read the Street',
  schemaVersion: 1,
  receiptId: 'event:campaign:documentary-story:v1',
});
const copy = (v) => structuredClone(v),
  same = (a, b) => canonical(a) === canonical(b),
  kinds = THREE_VIEWS.kinds;
const text = (value, min, max) =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max;
const positive = (v) => Number.isFinite(v) && v > 0;
export function documentaryStory(value) {
  return value?.story ? copy(value.story) : { schemaVersion: 1, phase: 'available', revision: 0 };
}
export function documentarySelected(profile) {
  const i = profile?.activeExperience;
  return (
    i?.schemaVersion === 1 &&
    i.definitionVersion === 1 &&
    i.experienceId === 'career:documentary-explorer'
  );
}
export function documentaryAlbumReady(base, album) {
  return (
    base?.schemaVersion === 1 &&
    base.phase === 'complete' &&
    base.mode === 'photo' &&
    !base.mediaDeleted &&
    base.views?.length === 3 &&
    album?.photos?.length === 3
  );
}
function orderValid(order) {
  return (
    Array.isArray(order) &&
    order.length === 3 &&
    new Set(order).size === 3 &&
    order.every((k) => kinds.includes(k))
  );
}
function captionShape(captions, minimum = 0) {
  return (
    captions &&
    typeof captions === 'object' &&
    !Array.isArray(captions) &&
    Object.keys(captions).length === 3 &&
    kinds.every((k) => text(captions[k], minimum, 280))
  );
}
function sourceFor(base, album) {
  if (!documentaryAlbumReady(base, album))
    throw Error(
      'Finish your three-view photo album before editing this story. Observation records and deleted images cannot supply photographs.'
    );
  return {
    subject: copy(base.subject),
    regionId: base.regionId,
    regionLabel: base.regionLabel,
    completedAt: base.completedAt,
    photographs: kinds.map((kind) => {
      const view = base.views.find((v) => v.kind === kind),
        photo = album.photos.find((p) => p.kind === kind);
      if (!view || !photo || !/^[a-f0-9]{64}$/.test(view.fingerprint || ''))
        throw Error('A saved photograph or its capture record is missing.');
      return {
        id: photo.id,
        kind,
        width: photo.width,
        height: photo.height,
        fingerprint: view.fingerprint,
        view: copy(view),
      };
    }),
  };
}
function validateSource(base, album, story) {
  const source = story.source;
  if (
    !source ||
    !same(source.subject, base.subject) ||
    source.regionId !== base.regionId ||
    source.regionLabel !== base.regionLabel ||
    source.completedAt !== base.completedAt ||
    !Array.isArray(source.photographs) ||
    source.photographs.length !== 3
  )
    throw Error('Keep the story with its original album and capture records.');
  const seen = new Set();
  for (const photo of source.photographs) {
    const view = base.views.find((v) => v.kind === photo.kind);
    if (
      seen.has(photo.kind) ||
      !kinds.includes(photo.kind) ||
      photo.id !== `three-views:${photo.kind}` ||
      !view ||
      !same(photo.view, view) ||
      photo.fingerprint !== view.fingerprint ||
      !/^[a-f0-9]{64}$/.test(photo.fingerprint) ||
      ![photo.width, photo.height].every((v) => Number.isInteger(v) && v >= 64 && v <= 1280) ||
      photo.width * photo.height > 1280 * 960
    )
      throw Error('A story photograph differs from its original capture.');
    seen.add(photo.kind);
    if (!base.mediaDeleted) {
      const actual = album.photos.find((p) => p.id === photo.id);
      if (!actual || actual.width !== photo.width || actual.height !== photo.height)
        throw Error('A photograph required by the story is missing.');
    }
  }
}
function reviewReady(s) {
  return (
    text(s.title, 4, 100) &&
    text(s.question, 10, 240) &&
    captionShape(s.captions, 8) &&
    text(s.conclusion, 20, 600) &&
    orderValid(s.order)
  );
}
export function documentaryStoryReport(base) {
  const s = documentaryStory(base);
  if (s.schemaVersion !== 1 || s.phase !== 'complete')
    throw Error('Publish the reviewed story before opening its record.');
  return {
    schemaVersion: 1,
    id: DOCUMENTARY_STORY.id,
    title: s.title,
    question: s.question,
    order: copy(s.order),
    captions: copy(s.captions),
    conclusion: s.conclusion,
    source: copy(s.source),
    startedAt: s.startedAt,
    publishedAt: s.publishedAt,
  };
}
export function documentaryStoryReceipt(base) {
  const report = documentaryStoryReport(base);
  return {
    eventId: DOCUMENTARY_STORY.receiptId,
    eventType: 'campaign-completed',
    sourceSystem: 'explorer-campaign',
    sourceId: DOCUMENTARY_STORY.id,
    pathId: 'field',
    name: report.title,
    detail: `An edited three-photograph field story about ${report.source.subject.name}.`,
    occurredAt: report.publishedAt,
    regionId: report.source.regionId,
    regionLabel: report.source.regionLabel,
    environment: 'EARTH',
    locationSnapshot: base.locationSnapshot
      ? copy(base.locationSnapshot)
      : { ...report.source.photographs[0].view.position, name: report.source.regionLabel },
    points: 0,
    projections: { profile: false, place: false },
    metadata: { careerId: 'documentary', variantId: 'field-story', documentaryStoryReport: report },
  };
}
export function transitionDocumentaryStory(base, album, command, now = Date.now()) {
  if (base.schemaVersion !== 1 || command.revision !== base.revision)
    throw Error('The album changed. Reopen your saved story.');
  let story = documentaryStory(base);
  if (story.schemaVersion !== 1)
    throw Error('This saved story needs a newer version of World Explorer.');
  if (story.phase === 'complete') {
    if (command.type === 'story-publish')
      return { state: copy(base), album: copy(album), event: null };
    throw Error('Your published story is kept. Export it or review its original photographs.');
  }
  if (!documentaryAlbumReady(base, album))
    throw Error(
      'Finish the three-view photo album first. Its photographs are required for this story.'
    );
  if (!positive(now) || now < base.completedAt)
    throw Error('The story needs a valid saved time after its photographs.');
  const next = { ...story, revision: story.revision + 1 };
  if (command.type === 'story-start') {
    if (
      story.phase !== 'available' ||
      !text(command.title, 4, 100) ||
      !text(command.question, 10, 240)
    )
      throw Error('Give the story a title and a clear visual question.');
    Object.assign(next, {
      phase: 'select',
      title: command.title.trim(),
      question: command.question.trim(),
      startedAt: now,
      captions: Object.fromEntries(kinds.map((k) => [k, ''])),
      conclusion: '',
    });
  } else if (command.type === 'story-select') {
    if (!['select', 'edit', 'review'].includes(story.phase) || !orderValid(command.order))
      throw Error('Use each of the three views once, in your chosen story order.');
    Object.assign(next, {
      phase: 'edit',
      order: copy(command.order),
      source: sourceFor(base, album),
    });
  } else if (command.type === 'story-draft') {
    if (
      !['edit', 'review'].includes(story.phase) ||
      !text(command.title, 4, 100) ||
      !text(command.question, 10, 240) ||
      !captionShape(command.captions) ||
      !text(command.conclusion, 0, 600)
    )
      throw Error('Keep a title, question, three captions and a bounded conclusion.');
    Object.assign(next, {
      phase: 'edit',
      title: command.title.trim(),
      question: command.question.trim(),
      captions: Object.fromEntries(kinds.map((k) => [k, command.captions[k].trim()])),
      conclusion: command.conclusion.trim(),
    });
  } else if (command.type === 'story-review') {
    if (command.captions) {
      if (
        !text(command.title, 4, 100) ||
        !text(command.question, 10, 240) ||
        !captionShape(command.captions) ||
        !text(command.conclusion, 0, 600)
      )
        throw Error('Keep a title, question, three captions and a bounded conclusion.');
      Object.assign(next, {
        title: command.title.trim(),
        question: command.question.trim(),
        captions: Object.fromEntries(kinds.map((k) => [k, command.captions[k].trim()])),
        conclusion: command.conclusion.trim(),
      });
    }
    if (story.phase !== 'edit' || !reviewReady(next))
      throw Error(
        'Caption all three photographs and explain what they show before reviewing the story.'
      );
    next.phase = 'review';
  } else if (command.type === 'story-publish') {
    if (story.phase !== 'review' || !reviewReady(story))
      throw Error('Review the complete story and its actual photographs before publishing.');
    Object.assign(next, { phase: 'complete', publishedAt: now });
  } else throw Error('Choose an available story action.');
  if (next.source) validateSource(base, album, next);
  const state = { ...copy(base), revision: base.revision + 1, story: next };
  return {
    state,
    album: copy(album),
    event: next.phase === 'complete' ? documentaryStoryReceipt(state) : null,
  };
}
export function validateDocumentaryStoryBackup(base, album, events = []) {
  const records = events.filter(
    (e) => e.eventId === DOCUMENTARY_STORY.receiptId || e.metadata?.documentaryStoryReport
  );
  if (!base.story) {
    if (records.length) throw Error('Keep the story report and its matching saved draft.');
    return;
  }
  const s = documentaryStory(base);
  if (s.schemaVersion > 1) return;
  if (
    s.schemaVersion !== 1 ||
    !['select', 'edit', 'review', 'complete'].includes(s.phase) ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 1 ||
    base.phase !== 'complete' ||
    base.mode !== 'photo' ||
    !positive(s.startedAt) ||
    s.startedAt < base.completedAt ||
    !text(s.title, 4, 100) ||
    !text(s.question, 10, 240) ||
    !captionShape(s.captions) ||
    !text(s.conclusion, 0, 600)
  )
    throw Error('This saved story is incomplete or damaged.');
  if (s.phase === 'select') {
    if (s.source || s.order) throw Error('Choose the original photographs before editing.');
  } else {
    if (!orderValid(s.order)) throw Error('Keep all three contrasting views in the story.');
    validateSource(base, album, s);
  }
  if (['review', 'complete'].includes(s.phase) && !reviewReady(s))
    throw Error('Keep the reviewed captions and conclusion.');
  if (s.phase === 'complete') {
    if (
      !positive(s.publishedAt) ||
      s.publishedAt < s.startedAt ||
      records.length !== 1 ||
      records[0].eventId !== DOCUMENTARY_STORY.receiptId ||
      records[0].eventType !== 'campaign-completed' ||
      records[0].occurredAt !== s.publishedAt ||
      !same(records[0].metadata?.documentaryStoryReport, documentaryStoryReport(base))
    )
      throw Error('Keep the published story with its original immutable report.');
  } else if (records.length) throw Error('Publish the reviewed story before saving its report.');
}

export function documentaryJournalRecords(recent, saved) {
  const report = saved.find((e) => e.eventId === DOCUMENTARY_STORY.receiptId);
  return report ? [...recent.filter((e) => e.eventId !== report.eventId), report] : recent;
}
