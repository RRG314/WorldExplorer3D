import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { documentaryAlbum, storyDraft } from '../../tests/helpers/documentary-album.mjs';
const recovery = process.env.WE3D_DOCUMENTARY_NATIVE_RECOVERY,
  r = documentaryAlbum(),
  seed = recovery
    ? JSON.parse(await fs.readFile(recovery))
    : await createMemoryDiscoveryProfileStore({
        profile: { threeViews: r.state },
        albums: [r.album],
        events: [r.event],
      }).exportData(),
  output = 'output/verification/documentary-career-20261103/native-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'documentary',
    maximumDurationMs: 180000,
  }),
  { page, report } = qa;
async function ready(phase) {
  await page.waitForFunction(
    (p) => fixture.runtime.snapshot().story.phase === p && !fixture.runtime.snapshot().busy,
    phase
  );
}
async function action(id) {
  await page.locator(`[data-photo-action="${id}"]`).click();
  await page.waitForFunction(() => !fixture.runtime.snapshot().busy);
}
async function initialize(data) {
  const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    ),
    { createThreeViewsRuntime } = await import('/app/js/campaign/three-views-runtime.js');
  const store = createIndexedDbDiscoveryProfileStore();
  if ((await store.getProfile()).threeViews.phase === 'available') await store.importData(data);
  const owners = new Set(),
    ctx = {
      getEnv: () => 'EARTH',
      getCurrentTravelMode: () => 'walk',
      getLiveGpsSnapshot: () => ({ active: false }),
      registerRuntimeSystem(s) {
        owners.add(s.id);
        return () => owners.delete(s.id);
      },
      registerContextInteraction(i) {
        owners.add(i.id);
        return () => owners.delete(i.id);
      },
      openWorldDiscoverySection() {},
      showToast() {},
    };
  const state = {
    appCtx: ctx,
    profileStore: store,
    worldIdentityId: 'documentary-test',
    regionLabel: 'Controlled album',
    ui: {
      open: true,
      setOpen() {},
      setCareerFocus(v) {
        window.__focus = v;
      },
      refreshData: async () => {},
    },
  };
  const runtime = createThreeViewsRuntime(state),
    options = { variantId: 'field-story', isActive: () => true, onNext() {} };
  await runtime.startCareer(options);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...args) {
    if (
      (window.fixture?.fail === 'draft' &&
        this.name === 'profiles' &&
        value?.id === 'local-explorer' &&
        value?.threeViews?.story?.phase === 'edit') ||
      (window.fixture?.fail === 'publish' &&
        this.name === 'events' &&
        value?.eventId === 'event:campaign:documentary-story:v1')
    )
      throw new DOMException('Controlled story quota failure', 'QuotaExceededError');
    return put.call(this, value, ...args);
  };
  window.fixture = {
    ctx,
    state,
    runtime,
    store,
    owners,
    fail: '',
    originalPut: put,
    rawProfile: () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('world-explorer-discovery');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('profiles', 'readonly'),
            read = tx.objectStore('profiles').get('local-explorer');
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            const value = read.result;
            tx.oncomplete = () => {
              db.close();
              resolve(value);
            };
          };
        };
      }),
  };
}
try {
  report.scope =
    'Controlled native story only: actual retained Three Views owner, real IndexedDB/transaction, forms, draft/review/publication/export and lifetime. Test-pattern JPEGs and controlled original capture metadata, never source-world photographs. Accepted old camera/media matrix is not replayed.';
  await page.route('**/documentary-native-view', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/styles/discovery.css"><style>body{background:#152d32;color:#e2efea;font:14px system-ui}main{position:fixed;inset:12px;max-width:650px;padding:12px;overflow:auto;box-sizing:border-box;background:#1b3031}</style><main><h1>Documentary explorer</h1><section id="discoveryThreeViews" class="discoveryOpeningChapter"></section></main>',
    })
  );
  await page.goto('http://127.0.0.1:4192/documentary-native-view');
  await page.evaluate(initialize, seed);
  if (!recovery) {
    await page.locator('[name=title]').fill(storyDraft.title);
    await page.locator('[name=question]').fill(storyDraft.question);
    await page.getByRole('button', { name: 'Choose the story photographs', exact: true }).click();
    await ready('select');
    for (const [i, kind] of ['setting', 'context', 'detail'].entries())
      await page.locator(`[name=order-${i}]`).selectOption(kind);
    await page.getByRole('button', { name: 'Use this sequence', exact: true }).click();
    await ready('edit');
  } else report.recovery = recovery;
  for (const [k, v] of Object.entries(storyDraft.captions))
    await page.locator(`[name=caption-${k}]`).fill(v);
  await page.locator('[name=conclusion]').fill(storyDraft.conclusion);
  report.views = [];
  if (!recovery)
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Save draft', exact: true }).scrollIntoViewIfNeeded();
      assert.equal(
        await page.locator('main').evaluate((e) => e.scrollWidth > e.clientWidth + 1),
        false
      );
      await page.screenshot({ path: output + '/draft-actions-' + width + '.png' });
      report.views.push({ width, height });
    }
  const before = await page.evaluate(() => fixture.rawProfile());
  await page.evaluate(() => (fixture.fail = 'draft'));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.locator('[data-photo-action=story-retry]').waitFor();
  assert.deepEqual(await page.evaluate(() => fixture.rawProfile()), before);
  assert.equal(await page.locator('[name=conclusion]').inputValue(), storyDraft.conclusion);
  assert.equal(await page.locator('[name=conclusion]').getAttribute('readonly'), '');
  report.draftRollback = true;
  await page.evaluate(() => (fixture.fail = ''));
  await action('story-retry');
  await ready('edit');
  const finalConclusion =
    storyDraft.conclusion + ' The edited sequence keeps the wider setting visible.';
  await page.locator('[name=conclusion]').fill(finalConclusion);
  await page.getByRole('button', { name: 'Review story', exact: true }).click();
  await ready('review');
  assert.equal(
    await page.evaluate(() => fixture.runtime.snapshot().story.conclusion),
    finalConclusion
  );
  report.atomicReview = true;
  await page.reload();
  await page.evaluate(initialize, seed);
  await ready('review');
  report.reviewReload = true;
  const beforePublish = await page.evaluate(() => fixture.store.exportData());
  await page.evaluate(() => (fixture.fail = 'publish'));
  await action('story-publish');
  await page.locator('[data-photo-action=story-retry]').waitFor();
  assert.deepEqual(
    (await page.evaluate(() => fixture.store.getProfile())).threeViews,
    beforePublish.profile.threeViews
  );
  assert.equal(
    (await page.evaluate(() => fixture.store.exportData())).events.filter(
      (e) => e.metadata?.documentaryStoryReport
    ).length,
    0
  );
  report.publicationRollback = true;
  await page.evaluate(() => (fixture.fail = ''));
  await action('story-retry');
  await ready('complete');
  const complete = await page.evaluate(() => fixture.store.exportData());
  assert.equal(complete.events.filter((e) => e.metadata?.documentaryStoryReport).length, 1);
  assert.deepEqual(complete.albums, seed.albums);
  for (const key of Object.keys(seed.profile.threeViews).filter(
    (k) => !['revision', 'story'].includes(k)
  ))
    assert.deepEqual(complete.profile.threeViews[key], seed.profile.threeViews[key]);
  const download = page.waitForEvent('download');
  await action('story-export');
  const file = await download;
  await file.saveAs(output + '/field-story.html');
  const html = await fs.readFile(output + '/field-story.html', 'utf8');
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.ok(html.includes(finalConclusion));
  report.export = true;
  await fs.writeFile(output + '/qa-documentary-backup.json', JSON.stringify(complete) + '\n', {
    mode: 0o600,
  });
  await page.reload();
  await page.evaluate(initialize, seed);
  await ready('complete');
  assert.equal(
    (await page.evaluate(() => fixture.store.exportData())).events.filter(
      (e) => e.metadata?.documentaryStoryReport
    ).length,
    1
  );
  report.completeReload = true;
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.documentary-story-report').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/complete-' + width + '.png' });
  }
  report.disposal = await page.evaluate(() => {
    fixture.runtime.dispose();
    IDBObjectStore.prototype.put = fixture.originalPut;
    return {
      owners: fixture.owners.size,
      reticles: document.querySelectorAll('.discoveryCameraReticle').length,
      focus: window.__focus,
    };
  });
  assert.deepEqual(report.disposal, { owners: 0, reticles: 0, focus: null });
  await qa.succeed();
} catch (error) {
  try {
    await fs.writeFile(
      output + '/qa-documentary-failed-backup.json',
      JSON.stringify(await page.evaluate(() => window.fixture?.store.exportData())) + '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
