import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/mining-career-20261103/station-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'mining', maximumDurationMs: 180000 }),
  { page, report } = qa;
const button = (name) => page.getByRole('button', { name, exact: true }),
  state = () => page.evaluate(() => miningUi.state);
async function checkpoint() {
  await fs.writeFile(
    output + '/qa-native-backup.json',
    JSON.stringify(await page.evaluate(() => miningUi.store.exportData())) + '\n',
    { mode: 0o600 }
  );
}
async function save(name) {
  const rev = (await state()).revision;
  await button(name).click();
  await page.waitForFunction(
    (n) =>
      miningUi.state.revision > n ||
      [...document.querySelectorAll('.research-station-status')].some(
        (e) => e.textContent && !e.textContent.startsWith('Saving')
      ),
    rev,
    { timeout: 8000 }
  );
  assert.ok(
    (await state()).revision > rev,
    await page.locator('.research-station-status').innerText()
  );
  await checkpoint();
}
async function arrive() {
  if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
  await page.evaluate(() => miningUi.arrive());
}
async function sizes(name, tag) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const b = button(name);
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    assert.ok(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: output + '/' + tag + '-' + width + '.png' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
try {
  report.scope =
    'Finite one native Mining case: actual quarry meshes/rays/cutter/carrier/normal-frame tools/UI/profile transaction/IndexedDB. Actor presence/camera and carrier-route walker positions controlled. Genuine source job and source keyboard journey are separate and not claimed. Failed actual transaction frozen retry/first-line reload/final reload/new views3sizes.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/mining-view.html?station=1');
  await page.waitForFunction(() => window.ready);
  if (process.env.WE3D_MINING_NATIVE_RECOVERY) {
    const data = JSON.parse(await fs.readFile(process.env.WE3D_MINING_NATIVE_RECOVERY));
    await page.evaluate((d) => miningUi.review(d), data);
    report.reusedSource = process.env.WE3D_MINING_NATIVE_RECOVERY;
  }
  let count = 0;
  while ((await state()).active.phase !== 'complete') {
    assert.ok(++count <= 16);
    const a = (await state()).active;
    if (a.phase !== 'deliver') await arrive();
    if (a.phase === 'inspect') await save('Record visible face');
    else if (a.phase === 'assay' || a.phase === 'cut') {
      const first = a.phase === 'assay' && Object.keys(a.assays).length === 0;
      await button(a.phase === 'assay' ? 'Place line and measure' : 'Run cutter').click();
      assert.equal(await page.evaluate(() => miningView.ctx.paused), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'nativeWorldFocus');
      await page.waitForFunction(
        () => miningUi.tools.snapshot().window?.ready,
        {},
        { timeout: 20000 }
      );
      await page.locator('[data-mining-open]').click();
      const label = a.phase === 'assay' ? 'Save measured line' : 'Save cut record';
      if (first) {
        await sizes(label, 'measured-line');
        const frozen = await page.evaluate(() => miningUi.tools.snapshot().window),
          rev = (await state()).revision;
        await page.evaluate(() => (miningUi.failNext = true));
        await button(label).click();
        await page
          .locator('.research-station-status')
          .filter({ hasText: 'Controlled IndexedDB write failure' })
          .waitFor();
        assert.equal((await state()).revision, rev);
        assert.deepEqual(await page.evaluate(() => miningUi.tools.snapshot().window), frozen);
        report.failedTransactionFrozen = true;
      }
      await save(label);
      if (first) {
        const saved = (await state()).active.assays.a;
        await page.reload();
        await page.waitForFunction(() => window.ready);
        assert.deepEqual((await state()).active.assays.a, saved);
        report.firstLineReload = true;
      }
    } else if (a.phase === 'plan') {
      await sizes('Mark bounded cut', 'mark-volume');
      await page.locator('[name=faceId]').selectOption('b');
      await page.locator('[name=take1]').check();
      await page.locator('[name=take2]').check();
      await save('Mark bounded cut');
    } else if (a.phase === 'sort') {
      await page.locator('[name=ore0]').check();
      await page.locator('[name=ore1]').check();
      await save('Separate and load carrier');
    } else if (a.phase === 'deliver') {
      if (await page.locator('.research-station[open]').count())
        await page.keyboard.press('Escape');
      await page.locator('[data-mining-start]').click();
      assert.ok((await page.evaluate(() => miningUi.tools.snapshot().carrier)).attached);
      const r = await page.evaluate(() => miningUi.driveCarrier());
      assert.equal(r.ready, true, r.reason);
      await page.locator('[data-mining-open]').click();
      await sizes('Save weighed delivery', 'weighed-carrier');
      await save('Save weighed delivery');
    } else if (a.phase === 'process') await save('Process weighed batch');
    else if (a.phase === 'fabricate') {
      await sizes('Cast and install marker base', 'conserved-processing');
      await save('Cast and install marker base');
    } else if (a.phase === 'restore') await save('Backfill and stabilize worked cell');
    else if (a.phase === 'publish') {
      await page.locator('[name=limit]').selectOption('authored-formation-not-real-ore-reserve');
      await save('Publish quarry ledger');
    } else throw Error(a.phase);
  }
  await arrive();
  assert.equal(await page.locator('.mining-report').evaluate((e) => e.open), true);
  await sizes('Choose next job', 'complete');
  const complete = await state();
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.deepEqual(await state(), complete);
  await checkpoint();
  report.completeReload = true;
  report.result = {
    revision: complete.revision,
    capstones: 1,
    routeSamples: complete.active.delivery.route.length,
    deliveredGrams: complete.active.delivery.massGrams,
    backfillGrams: complete.active.restoration.backfillGrams,
  };
  await page.evaluate(() => miningUi.dispose());
  assert.equal(await page.evaluate(() => miningView.ctx.dynamicBuildingColliders.length), 0);
  await qa.succeed();
} catch (e) {
  try {
    await fs.writeFile(
      output + '/qa-native-failed-backup.json',
      JSON.stringify(await page.evaluate(() => miningUi.store.exportData())) + '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
