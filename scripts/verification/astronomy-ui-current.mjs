import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/astronomy-career-20261103/station-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'astronomy', maximumDurationMs: 180000 }),
  { page, report } = qa;
const button = (name) => page.getByRole('button', { name, exact: true }),
  state = () => page.evaluate(() => astronomyUi.state);
async function checkpoint() {
  await fs.writeFile(
    output + '/qa-native-backup.json',
    JSON.stringify(await page.evaluate(() => astronomyUi.store.exportData())) + '\n',
    { mode: 0o600 }
  );
}
async function submit(name) {
  const before = (await state()).revision;
  await button(name).click();
  await page.waitForFunction(
    (n) =>
      astronomyUi.state.revision > n ||
      [...document.querySelectorAll('.research-station-status')].some(
        (e) => e.textContent && !e.textContent.startsWith('Saving')
      ),
    before,
    { timeout: 8000 }
  );
  assert.ok(
    (await state()).revision > before,
    await page.locator('.research-station-status').innerText()
  );
  await checkpoint();
}
async function arrive() {
  if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
  await page.evaluate(() => {
    astronomyUi.arrive();
    astronomyUi.open();
  });
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
    'One finite native Astronomy case: actual UI/tools/normal-frame recorder/profile transaction/IndexedDB; controlled geometry and presence. Separate physical-mesh acceptance is reused. Failed transaction retains identical buffer, supported clock, first-frame reload, final log/reload and new UI actions at3sizes. No source-world claim.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/astronomy-station.html');
  await page.waitForFunction(() => window.ready);
  if (process.env.WE3D_ASTRO_NATIVE_RECOVERY) {
    const data = JSON.parse(await fs.readFile(process.env.WE3D_ASTRO_NATIVE_RECOVERY));
    await page.evaluate((d) => astronomyUi.review(d), data);
    report.reusedSource = process.env.WE3D_ASTRO_NATIVE_RECOVERY;
  }
  let count = 0;
  while ((await state()).active.phase !== 'complete') {
    assert.ok(++count <= 8);
    const a = (await state()).active;
    await arrive();
    if (a.phase === 'align') {
      await sizes('Save physical alignment', 'align');
      for (let i = 0; i < 3; i++) await button('Azimuth minus 0.5 degrees').click();
      for (let i = 0; i < 2; i++) await button('Elevation minus 0.5 degrees').click();
      assert.ok((await page.evaluate(() => astronomyUi.snapshot().errorDegrees)) < 0.001);
      await submit('Save physical alignment');
    } else if (a.phase === 'configure') {
      await page.locator('[name=seconds]').selectOption('2');
      await submit('Save exposure settings');
    } else if (['primary', 'controls'].includes(a.phase)) {
      const first = a.phase === 'primary';
      await button('Begin exposure').click();
      assert.equal(await page.evaluate(() => astronomyUi.runtime.paused), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'worldFocusTarget');
      if (first) {
        await page.waitForTimeout(250);
        await page.evaluate(() => (astronomyUi.blocked = true));
        const before = await page.evaluate(() => astronomyUi.tools.snapshot().window.activeSeconds);
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => astronomyUi.tools.snapshot().window.activeSeconds);
        assert.ok(after - before < 0.1);
        await page.evaluate(() => (astronomyUi.blocked = false));
        report.blockedClock = true;
      }
      await page.waitForFunction(
        () => astronomyUi.tools.snapshot().window?.ready,
        {},
        { timeout: 20000 }
      );
      await page.locator('[data-astronomy-open]').click();
      if (first) {
        await sizes('Save exposure', 'pixels');
        const ready = await page.evaluate(() => astronomyUi.tools.snapshot().window),
          rev = (await state()).revision;
        await page.evaluate(() => (astronomyUi.failNext = true));
        await button('Save exposure').click();
        await page
          .locator('.research-station-status')
          .filter({ hasText: 'write failure' })
          .waitFor();
        assert.equal((await state()).revision, rev);
        assert.deepEqual(await page.evaluate(() => astronomyUi.tools.snapshot().window), ready);
        report.frozenFailedTransaction = true;
      }
      await submit('Save exposure');
      if (first) {
        const saved = (await state()).active.frames.primary;
        await page.reload();
        await page.waitForFunction(() => window.ready);
        assert.equal((await state()).active.phase, 'controls');
        assert.deepEqual((await state()).active.frames.primary, saved);
        report.firstFrameReload = true;
      }
    } else if (a.phase === 'analyze') {
      await sizes('Save comparison', 'comparison');
      await page.locator('[name=catalogHip]').selectOption(String(a.target.hip));
      await page.locator('[name=limit]').selectOption('synthetic-not-calibrated-sky-discovery');
      await page.locator('[name=outcome]').selectOption(
        await page.evaluate(async () => {
          const m = await import('/app/js/campaign/astronomy-career.js');
          return m.astronomyAnalysis(astronomyUi.state.active).outcome;
        })
      );
      await submit('Save comparison');
    } else if (a.phase === 'publish') {
      await sizes('Publish observing log', 'publish');
      await submit('Publish observing log');
    } else throw Error(a.phase);
  }
  await arrive();
  assert.equal(await page.locator('.astronomy-report').evaluate((e) => e.open), true);
  await sizes('Choose next study', 'complete');
  const complete = await state();
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.deepEqual(await state(), complete);
  await checkpoint();
  report.result = { revision: complete.revision, capstones: 1, completeReload: true };
  await qa.succeed();
} catch (e) {
  try {
    await fs.writeFile(
      output + '/qa-native-failed-backup.json',
      JSON.stringify(await page.evaluate(() => astronomyUi.store.exportData())) + '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
