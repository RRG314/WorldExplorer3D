import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';
const source = process.env.WE3D_DOCUMENTARY_REVIEW;
if (!source) throw Error('Choose the genuine completed Documentary source checkpoint.');
const backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/documentary-career-20261103/reader-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'documentary',
    maximumDurationMs: 180000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Actual Documentary reader component and real IndexedDB using genuine source album; no world/photo/accepted save matrix replay. A delayed album read checks deletion during the new async image-loading boundary. Prescribed choreography reuses this one owned browser.';
  await page.route('**/documentary-reader-view', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/styles/discovery.css"><style>body{background:#152d32;color:#e2efea;font:14px system-ui}main{max-width:750px;margin:20px;padding:16px;background:#1b3031}</style><main><div id="report"></div></main>',
    })
  );
  await page.goto('http://127.0.0.1:4192/documentary-reader-view');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      ),
      { documentaryReportMarkup, showDocumentaryStoryPhotos } = await import(
        '/app/js/campaign/documentary-ui.js'
      ),
      s = createIndexedDbDiscoveryProfileStore();
    await s.importData(b);
    const record = b.events.find((e) => e.metadata?.documentaryStoryReport).metadata
      .documentaryStoryReport;
    const mount = (available) =>
      (document.querySelector('#report').innerHTML = documentaryReportMarkup(record, null, {
        lazy: true,
        mediaAvailable: available,
      }));
    mount(true);
    window.reader = { s, mount, show: showDocumentaryStoryPhotos, record };
    window.advanceTime = async () => {};
    window.render_game_to_text = () =>
      JSON.stringify({
        scope: 'Actual source report component only; no world journey replay',
        open: document.querySelector('details').open,
        images: document.querySelectorAll('#report img').length,
        status: document.querySelector('[data-documentary-photo-status]')?.textContent,
      });
    document.querySelector('#report').addEventListener('click', (e) => {
      const button = e.target.closest('[data-documentary-photos]');
      if (button) void showDocumentaryStoryPhotos(button, s);
    });
  }, backup);
  await runPrescribedGameActions(
    page,
    output,
    [
      { buttons: ['left_mouse_button'], frames: 1, mouse_x: 250, mouse_y: 12 },
      { buttons: [], frames: 2 },
    ],
    '#report'
  );
  if (!(await page.locator('details').evaluate((e) => e.open)))
    await page.locator('summary').click();
  const button = page.locator('[data-documentary-photos]');
  assert.equal(await page.locator('img').count(), 0);
  await page.evaluate(() => {
    const r = window.reader;
    window.pendingPhotoRead = r.show(document.querySelector('[data-documentary-photos]'), {
      getProfile: () => r.s.getProfile(),
      getThreeViewsAlbum: async () => {
        const album = await r.s.getThreeViewsAlbum();
        await new Promise((resolve) => (r.release = resolve));
        return album;
      },
    });
  });
  await page.waitForFunction(() => typeof window.reader.release === 'function');
  await page.evaluate(async () => {
    const r = window.reader,
      b = (await r.s.getProfile()).threeViews;
    await r.s.updateThreeViews({ type: 'delete-photos', revision: b.revision });
    r.release();
    await window.pendingPhotoRead;
  });
  assert.equal(await page.locator('img').count(), 0);
  assert.match(
    await page.locator('[data-documentary-photo-status]').innerText(),
    /changed|unavailable/
  );
  report.deletionDuringRead = true;
  await page.evaluate(() => reader.mount(false));
  await page.locator('summary').click();
  assert.equal(await page.locator('[data-documentary-photos]').count(), 0);
  assert.match(await page.locator('#report').innerText(), /unavailable on this device/);
  assert.match(await page.locator('#report').innerText(), /Windows Along the Street/);
  report.deletedHistoryVisible = true;
  await page.evaluate(async (b) => {
    await reader.s.importData(b);
    reader.mount(true);
  }, backup);
  await page.locator('summary').click();
  await button.click();
  await page.waitForFunction(() => document.querySelectorAll('#report img').length === 3);
  report.restoredOriginals = true;
  await page.screenshot({ path: output + '/originals-restored.png' });
  await fs.writeFile(
    output + '/state.json',
    (await page.evaluate(() => render_game_to_text())) + '\n'
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
