import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transitionThreeViews,
  validateThreeViewsBackup,
  THREE_VIEWS,
} from '../app/js/campaign/three-views.js';
import {
  DOCUMENTARY_STORY,
  documentaryStory,
  documentarySelected,
} from '../app/js/campaign/documentary-story.js';
import {
  prepareDocumentaryMedia,
  assertDocumentaryMediaCurrent,
} from '../app/js/campaign/documentary-media.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js?v=5';
import { documentaryAlbum, reviewedDocumentary, storyDraft } from './helpers/documentary-album.mjs';
test('one reviewed photo story preserves the original album, viewpoints and reward while saving a distinct immutable record', () => {
  let r = reviewedDocumentary();
  const before = structuredClone(r.state),
    photos = structuredClone(r.album);
  const saved = transitionThreeViews(
    r.state,
    r.album,
    { type: 'story-publish', revision: r.state.revision },
    3000
  );
  for (const key of Object.keys(before).filter((k) => !['story', 'revision'].includes(k)))
    assert.deepEqual(saved.state[key], before[key]);
  assert.deepEqual(saved.album, photos);
  assert.equal(saved.event.eventId, DOCUMENTARY_STORY.receiptId);
  assert.equal(saved.event.points, 0);
  validateThreeViewsBackup(saved.state, saved.album, [r.baseEvent, saved.event]);
  assert.equal(
    transitionThreeViews(
      saved.state,
      saved.album,
      { type: 'story-publish', revision: saved.state.revision },
      4000
    ).event,
    null
  );
  assert.throws(() =>
    transitionThreeViews(
      saved.state,
      saved.album,
      { type: 'story-draft', revision: saved.state.revision, ...storyDraft },
      4000
    )
  );
});
test('a draft needs actual contrasting photo references, a complete sequence and evidence-based captions before review', () => {
  const base = documentaryAlbum();
  for (const patch of [{ phase: 'available' }, { mode: 'observation' }, { mediaDeleted: true }])
    assert.throws(() =>
      transitionThreeViews(
        { ...base.state, ...patch },
        base.album,
        { type: 'story-start', revision: base.state.revision, ...storyDraft },
        2000
      )
    );
  let r = transitionThreeViews(
    base.state,
    base.album,
    { type: 'story-start', revision: base.state.revision, ...storyDraft },
    2000
  );
  assert.throws(() =>
    transitionThreeViews(
      r.state,
      r.album,
      { type: 'story-select', revision: r.state.revision, order: ['context', 'context', 'detail'] },
      2001
    )
  );
  r = transitionThreeViews(
    r.state,
    r.album,
    { type: 'story-select', revision: r.state.revision, order: THREE_VIEWS.kinds },
    2001
  );
  assert.throws(() =>
    transitionThreeViews(
      r.state,
      r.album,
      { type: 'story-review', revision: r.state.revision },
      2002
    )
  );
  const draft = transitionThreeViews(
    r.state,
    r.album,
    {
      type: 'story-draft',
      revision: r.state.revision,
      ...storyDraft,
      captions: { context: '', detail: '', setting: '' },
      conclusion: '',
    },
    2002
  );
  assert.equal(draft.state.story.phase, 'edit');
  assert.deepEqual(draft.state.story.captions, { context: '', detail: '', setting: '' });
  assert.throws(() =>
    transitionThreeViews(
      draft.state,
      draft.album,
      { type: 'story-review', revision: draft.state.revision },
      2003
    )
  );
});
test('stale writers, future stories and altered capture/report references cannot overwrite the original album', () => {
  const r = reviewedDocumentary(),
    future = { ...r.state, story: { schemaVersion: 2, future: ['keep'] } };
  assert.deepEqual(documentaryStory(future), future.story);
  assert.throws(() =>
    transitionThreeViews(
      future,
      r.album,
      { type: 'story-draft', revision: future.revision, ...storyDraft },
      3000
    )
  );
  assert.throws(() =>
    transitionThreeViews(
      r.state,
      r.album,
      { type: 'story-publish', revision: r.state.revision - 1 },
      3000
    )
  );
  const saved = transitionThreeViews(
      r.state,
      r.album,
      { type: 'story-publish', revision: r.state.revision },
      3000
    ),
    events = [r.baseEvent, saved.event],
    bad = structuredClone(saved.state);
  bad.story.source.photographs[0].view.position.lat += 0.01;
  assert.throws(() => validateThreeViewsBackup(bad, saved.album, events));
  const altered = structuredClone(events);
  altered[1].metadata.documentaryStoryReport.conclusion += ' extra';
  assert.throws(() => validateThreeViewsBackup(saved.state, saved.album, altered));
});
test('image fingerprints and the exact-byte transaction guard reject replacement photographs without copying pixels into the story', async () => {
  const r = reviewedDocumentary(),
    guard = await prepareDocumentaryMedia(r.state, r.album);
  assert.equal(guard.length, 3);
  assert.doesNotThrow(() => assertDocumentaryMediaCurrent(guard, r.album));
  const changed = structuredClone(r.album);
  changed.photos[0].dataUrl = changed.photos[1].dataUrl;
  assert.throws(() => assertDocumentaryMediaCurrent(guard, changed));
  await assert.rejects(prepareDocumentaryMedia(r.state, changed));
  assert.ok(!JSON.stringify(r.state.story).includes('data:image/'));
});
test('the profile transaction publishes once, retains the original receipt and rejects altered-image imports with full rollback', async () => {
  const r = reviewedDocumentary(),
    store = createMemoryDiscoveryProfileStore({
      profile: { threeViews: r.state },
      albums: [r.album],
      events: [r.baseEvent],
    });
  const before = await store.exportData(),
    state = (await store.getProfile()).threeViews;
  await store.updateThreeViews({ type: 'story-publish', revision: state.revision }, 3000);
  const first = await store.exportData();
  assert.equal(first.events.filter((e) => e.eventId === DOCUMENTARY_STORY.receiptId).length, 1);
  assert.deepEqual(
    first.events.find((e) => e.eventId === THREE_VIEWS.receiptId),
    before.events.find((e) => e.eventId === THREE_VIEWS.receiptId)
  );
  await store.updateThreeViews(
    { type: 'story-publish', revision: first.profile.threeViews.revision },
    4000
  );
  await store.importData(first);
  const stable = await store.exportData(),
    bad = structuredClone(stable);
  bad.albums[0].photos[0].dataUrl = bad.albums[0].photos[1].dataUrl;
  await assert.rejects(store.importData(bad));
  const after = await store.exportData();
  assert.deepEqual(after.profile, stable.profile);
  assert.deepEqual(after.events, stable.events);
  assert.deepEqual(after.albums, stable.albums);
});
test('explicit photograph deletion keeps the published story and original badge history without inventing replacement images', () => {
  const r = reviewedDocumentary(),
    saved = transitionThreeViews(
      r.state,
      r.album,
      { type: 'story-publish', revision: r.state.revision },
      3000
    ),
    deleted = transitionThreeViews(
      saved.state,
      saved.album,
      { type: 'delete-photos', revision: saved.state.revision },
      4000
    );
  assert.deepEqual(deleted.state.story, saved.state.story);
  assert.equal(deleted.album.photos.length, 0);
  validateThreeViewsBackup(deleted.state, deleted.album, [r.baseEvent, saved.event]);
});
test('the existing prerequisite admits a selected compatible Documentary career and keeps ordinary unselected gating', async () => {
  const store = createMemoryDiscoveryProfileStore();
  await assert.rejects(
    store.updateThreeViews({
      type: 'accept',
      revision: 0,
      mode: 'observation',
      regionId: 'test',
      regionLabel: 'Test',
    }),
    /First Bearings/
  );
  const intent = {
    schemaVersion: 1,
    definitionVersion: 1,
    experienceId: 'career:documentary-explorer',
  };
  assert.ok(documentarySelected({ activeExperience: intent }));
  assert.equal(documentarySelected({ activeExperience: { ...intent, schemaVersion: 2 } }), false);
  const selected = createMemoryDiscoveryProfileStore({ profile: { activeExperience: intent } });
  const result = await selected.updateThreeViews(
    { type: 'accept', revision: 0, mode: 'photo', regionId: 'test', regionLabel: 'Test' },
    2000
  );
  assert.equal(result.state.phase, 'choose');
});

test('Review atomically saves the current typed captions instead of discarding unsaved form changes', () => {
  const r = reviewedDocumentary(),
    editing = transitionThreeViews(
      r.state,
      r.album,
      { type: 'story-draft', revision: r.state.revision, ...storyDraft },
      3000
    ),
    updated = {
      ...storyDraft,
      conclusion:
        'The newly edited conclusion compares visible frontage details with the wider district context, while leaving historical use uncertain.',
    };
  const next = transitionThreeViews(
    editing.state,
    editing.album,
    { type: 'story-review', revision: editing.state.revision, ...updated },
    3001
  );
  assert.equal(next.state.story.phase, 'review');
  assert.equal(next.state.story.conclusion, updated.conclusion);
  assert.equal(next.state.revision, editing.state.revision + 1);
});
test('a duplicate finish after explicit image deletion keeps the immutable story without requiring deleted bytes', async () => {
  const r = reviewedDocumentary(),
    store = createMemoryDiscoveryProfileStore({
      profile: { threeViews: r.state },
      albums: [r.album],
      events: [r.baseEvent],
    });
  await store.updateThreeViews({ type: 'story-publish', revision: r.state.revision }, 3000);
  await store.updateThreeViews(
    { type: 'delete-photos', revision: (await store.getProfile()).threeViews.revision },
    4000
  );
  const before = (await store.getProfile()).threeViews;
  await store.updateThreeViews({ type: 'story-publish', revision: before.revision }, 5000);
  assert.deepEqual((await store.getProfile()).threeViews, before);
  assert.equal(
    (await store.exportData()).events.filter((e) => e.eventId === DOCUMENTARY_STORY.receiptId)
      .length,
    1
  );
});

test('new albums retain their loaded-world origin separately from a facade hit and resume in that same frame', async () => {
  const locationSnapshot = { lat: 39.2904, lon: -76.6122, name: 'Original loaded frame' },
    r = transitionThreeViews(
      null,
      null,
      {
        type: 'accept',
        revision: 0,
        mode: 'photo',
        regionId: 'original-region',
        regionLabel: 'Original region',
        locationSnapshot,
      },
      1000
    );
  assert.deepEqual(r.state.locationSnapshot, locationSnapshot);
  const { bindDocumentaryCareer } = await import(
    '../app/js/campaign/documentary-career-adapter.js'
  );
  let adapter;
  bindDocumentaryCareer({}, { registerAdapter: (id, value) => (adapter = value) });
  const place = adapter.places({
    profile: { threeViews: { ...r.state, subject: { position: { lat: 40, lon: -77, y: 10 } } } },
  })[0];
  assert.equal(place.lat, locationSnapshot.lat);
  assert.equal(place.lon, locationSnapshot.lon);
  assert.throws(() =>
    transitionThreeViews(
      null,
      null,
      {
        type: 'accept',
        revision: 0,
        mode: 'photo',
        regionId: 'x',
        regionLabel: 'x',
        locationSnapshot: { lat: NaN, lon: 0 },
      },
      1000
    )
  );
});

test('new camera evidence reports physical metre range while existing capture records remain unchanged', async () => {
  const THREE = await import('three'),
    old = globalThis.THREE;
  globalThis.THREE = THREE;
  try {
    const { inspectPhotoSubject } = await import('../app/js/campaign/three-views-capture.js'),
      scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(55, 1, 0.5, 200),
      root = new THREE.Group();
    root.userData.sourceBuildingId = 'metric-facade';
    root.userData.buildingName = 'Metric facade';
    const geometry = new THREE.BoxGeometry(12, 8, 2),
      material = new THREE.MeshBasicMaterial(),
      mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 4, 20);
    root.add(mesh);
    scene.add(root);
    scene.updateMatrixWorld(true);
    camera.position.set(0, 1.7, 0);
    camera.lookAt(0, 1.7, 20);
    camera.updateMatrixWorld(true);
    const c = {
        scene,
        camera,
        LOC: { lat: 39, lon: -76 },
        SCALE: 100000,
        METERS_PER_WORLD_UNIT: 1.11,
        getEnv: () => 'EARTH',
        getCurrentTravelMode: () => 'walk',
        buildings: [{ sourceBuildingId: 'metric-facade', name: 'Metric facade' }],
      },
      capture = inspectPhotoSubject(c, { regionId: 'test', regionLabel: 'Test' });
    assert.equal(capture.view.rangeUnits, 'm');
    assert.ok(Math.abs(capture.view.range - 19 * 1.11) < 1e-8);
    geometry.dispose();
    material.dispose();
  } finally {
    globalThis.THREE = old;
  }
});
