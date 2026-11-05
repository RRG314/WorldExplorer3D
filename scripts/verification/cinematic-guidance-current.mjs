import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(`output/verification/cinematic-app-20261105/guidance-${Date.now()}`);
const qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 300000,
    pageOptions: { hasTouch: true },
  }),
  page = qa.page;
const report = {
  scope:
    'Original optional tutorial controller and native visible touch controls. Only affected hint geometry/Details/close is rechecked; no accepted intro, methods, travel or laps replayed.',
  checks: [],
};
try {
  if (['localhost', '127.0.0.1'].includes(new URL(base).hostname))
    await configureStagingAppCheck(page, base, { proxyGeospatial: false });
  await page.goto(base + '/app/');
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, {
    timeout: 90000,
  });
  await page.evaluate(async () => {
    globalThis.hintCtx = (
      await import(
        (globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix ||
          document.documentElement.dataset.runtimeModulePrefix ||
          '') + '/app/js/shared-context.js?v=55'
      )
    ).ctx;
  });
  await page.locator('#playerEntryScreen [data-entry=explore]').first().click();
  for (const [w, h, scale] of process.env.WE3D_CINEMATIC_HINT_LANDSCAPE_ONLY === '1'
    ? []
    : [
        [1280, 800, '100'],
        [390, 844, '100'],
        [844, 390, '200'],
      ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate((s) => (document.documentElement.dataset.we3dTextScale = s), scale);
    const search = page.locator('#globeMobileLocationSearch');
    await search.scrollIntoViewIfNeeded();
    assert.equal(await search.isVisible(), true);
    await search.fill('39.2904, -76.6122');
    await search.press('Enter');
    await page.locator('#globeLocationSearchResults button').first().click();
    await page.waitForFunction(
      () => Math.abs(Number(document.getElementById('globeCustomLat').value) - 39.2904) < 0.000001
    );
    await page.screenshot({ path: path.join(output, `globe-mobile-search-${w}-${scale}.png`) });
    report.checks.push(`${w}/${scale}:original-mobile-search-visible-and-coordinate-selection`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '100'));
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(
    () =>
      hintCtx.gameStarted &&
      !hintCtx.worldLoading &&
      !hintCtx.titleLaunchPending &&
      !hintCtx.paused,
    null,
    { timeout: 180000 }
  );
  for (const [w, h, scale] of process.env.WE3D_CINEMATIC_HINT_LANDSCAPE_ONLY === '1'
    ? [[844, 390, '200']]
    : [
        [1440, 1000, '100'],
        [390, 844, '100'],
        [390, 844, '200'],
        [844, 390, '200'],
      ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate((s) => {
      document.documentElement.dataset.we3dTextScale = s;
      hintCtx.restartTutorial('explore');
    }, scale);
    const card = page.locator('#tutorialHintCard');
    await card.waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    for (const expanded of [false, true]) {
      if (expanded) await page.locator('#tutorialHintCard .tutorial-details-btn').click();
      const overlaps = await page.evaluate(() => {
        const card = document.getElementById('tutorialHintCard').getBoundingClientRect();
        return [
          ...document.querySelectorAll('#mobileMovePad,#mobileLookPad,#mobileActionStack button'),
        ]
          .filter((e) => {
            const s = getComputedStyle(e),
              r = e.getBoundingClientRect();
            return s.display !== 'none' && r.width && r.height;
          })
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              Math.min(r.right, card.right) - Math.max(r.left, card.left) > 1 &&
              Math.min(r.bottom, card.bottom) - Math.max(r.top, card.top) > 1
            );
          })
          .map((e) => e.id);
      });
      assert.deepEqual(
        overlaps,
        [],
        `${w}/${scale}/${expanded}: guide covers actual touch controls`
      );
      await page.screenshot({
        path: path.join(output, `hint-${w}-${scale}-${expanded ? 'details' : 'compact'}.png`),
      });
    }
    await page.locator('#tutorialHintCard .tutorial-icon-btn').click();
    assert.equal(await card.isVisible(), false);
    report.checks.push(`${w}/${scale}:compact-details-close-clear-native-touch-controls`);
  }
  assert.deepEqual(qa.report.errors, []);
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  report.ok = true;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  report.failure = error.stack;
  report.errors = qa.report.errors;
  await page.screenshot({ path: path.join(output, 'failed.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
