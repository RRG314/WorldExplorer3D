// Pure-model fixture only: encoded test-pattern JPEGs and controlled capture
// metadata. Never use this data as source-world photo/story evidence.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { transitionThreeViews, THREE_VIEWS } from '../../app/js/campaign/three-views.js';
export function documentaryAlbum() {
  const subject = {
    id: 'controlled-documentary-building',
    name: 'Controlled composition target',
    regionId: 'documentary-test',
    regionLabel: 'Controlled album',
    position: { lat: 39, lon: -76, y: 10 },
  };
  let result;
  const write = (type, extra = {}) =>
    (result = transitionThreeViews(
      result?.state,
      result?.album,
      { type, revision: result?.state.revision || 0, ...extra },
      1000
    ));
  write('accept', { mode: 'photo', regionId: subject.regionId, regionLabel: subject.regionLabel });
  write('choose', { subject });
  for (const [index, kind] of THREE_VIEWS.kinds.entries()) {
    const dataUrl =
        'data:image/jpeg;base64,' +
        fs
          .readFileSync(new URL(`../fixtures/documentary-test-${index + 1}.jpg`, import.meta.url))
          .toString('base64'),
      fingerprint = createHash('sha256').update(dataUrl).digest('hex'),
      photo = { id: `three-views:${kind}`, kind, width: 64, height: 64, dataUrl },
      view = {
        kind,
        subjectId: subject.id,
        regionId: subject.regionId,
        environment: 'EARTH',
        travelMode: 'walk',
        liveGps: false,
        visible: true,
        coverage: 0.4,
        position: { lat: 39 + index * 0.0002, lon: -76, y: 12 },
        bearing: index * 0.4,
        range: [40, 15, 50][index],
        fingerprint,
      };
    write('keep', { photo, view });
  }
  write('finish');
  return result;
}
export const storyDraft = {
  title: 'Reading a street through its building',
  question: 'How does the frontage connect the building to its street?',
  captions: {
    context: 'The street view shows the frontage and its approach.',
    detail: 'The closer view records the entrance and facade details.',
    setting: 'The wider view places the building among neighboring blocks.',
  },
  conclusion:
    'The three views connect the visible entrance and frontage to the surrounding street. They do not establish the building’s history or current use.',
};
export function reviewedDocumentary() {
  let result = documentaryAlbum(),
    now = 2000;
  const baseEvent = result.event;
  const write = (type, extra = {}) =>
    (result = transitionThreeViews(
      result.state,
      result.album,
      { type, revision: result.state.revision, ...extra },
      ++now
    ));
  write('story-start', storyDraft);
  write('story-select', { order: ['setting', 'context', 'detail'] });
  write('story-draft', storyDraft);
  write('story-review');
  return { ...result, baseEvent };
}
