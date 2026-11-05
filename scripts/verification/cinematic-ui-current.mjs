import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const output = path.resolve(`output/verification/cinematic-app-20261105/ui-${Date.now()}`),
  url = 'http://127.0.0.1:4192/app/';
const qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 240000,
    pageOptions: { hasTouch: true },
  }),
  page = qa.page;
const report = {
  scope:
    'Actual cinematic home/navigation/native introduction, keyboard/touch and real shared 200% text tokens. No game procedures or account/room mutations.',
  checks: [],
};
async function shot(name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
}
async function home() {
  if (await page.locator('#globeHubOverlay').isVisible())
    await page.locator('#globeHubOverlayCloseBtn').click();
  if (await page.locator('#discoveryPanel').isVisible())
    await page.locator('#discoveryCloseBtn').click();
  await page.locator('#globeSelectorBackBtn').click();
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible' });
}
try {
  await configureStagingAppCheck(page, url, { proxyGeospatial: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('#startBtn')?.disabled === false, null, {
    timeout: 90000,
  });
  if (process.env.WE3D_CINEMATIC_LARGE_ONLY !== '1') {
    for (const action of ['journal', 'settings', 'create', 'together']) {
      await page.locator('#playerEntryScreen [data-entry=menu]').click();
      assert.equal(
        await page.locator('#playerEntryScreen [data-entry=menu]').getAttribute('aria-expanded'),
        'true'
      );
      await page.locator(`#playerHomeNavigation [data-entry=${action}]`).click();
      await page
        .locator(action === 'journal' ? '#discoveryPanel' : '#globeHubOverlay')
        .waitFor({ state: 'visible', timeout: 45000 });
      await shot('native-' + action);
      await home();
      report.checks.push('home menu opens original ' + action + ' and returns');
    }
    const links = await page
      .locator('#playerEntryScreen a')
      .evaluateAll((nodes) => nodes.map((e) => e.href));
    for (const link of new Set(links)) {
      const response = await page.request.get(link);
      assert.equal(response.status(), 200, 'Broken home link ' + new URL(link).pathname);
    }
    report.checks.push('account-privacy-terms-links-resolve');
  }
  await page.evaluate(async () => {
    const { modelAssetCacheSnapshot } = await import('/app/js/assets/model-asset-runtime.js?v=16');
    const ids = new Set(['character-field-explorer-v1', 'character-field-explorer-woman-v1']);
    const base = new Map(modelAssetCacheSnapshot().entries.map((e) => [e.id, e.leases]));
    window.__cinematicModelsReleased = () =>
      modelAssetCacheSnapshot()
        .entries.filter((e) => ids.has(e.id))
        .every((e) => e.ready && e.leases === (base.get(e.id) || 0));
  });
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['landscape', 844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '200'));
    assert(
      await page.locator('#playerEntryScreen').evaluate((e) => e.scrollWidth <= e.clientWidth),
      name + ': home overflow at 200%'
    );
    await page.locator('#playerEntryScreen [data-entry=menu]').tap();
    await shot(name + '-menu-200');
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('#playerEntryScreen [data-entry=menu]').getAttribute('aria-expanded'),
      'false'
    );
    await page.locator('#playerEntryScreen [data-entry=journey]').first().tap();
    await page.locator('#playerIntroduction canvas').waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('#introName').scrollIntoViewIfNeeded();
    const large = await page
      .locator('#introName')
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '100'));
    const normal = await page
      .locator('#introName')
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert(large >= normal * 1.9, name + ': text setting did not reach input');
    await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '200'));
    await page.locator('[data-gender=woman]').scrollIntoViewIfNeeded();
    const hit = await page.locator('[data-gender=woman]').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    assert(hit, name + ': gender covered');
    await page.locator('[data-gender=woman]').tap();
    await shot(name + '-appearance-200');
    assert(
      await page.locator('#playerIntroduction').evaluate((e) => e.scrollWidth <= e.clientWidth),
      name + ': intro overflow at 200%'
    );
    await page.locator('#playerIntroduction [data-intro=next]').tap();
    await page.locator('[data-intro-group=motion]').tap();
    assert.equal(
      await page.locator('[data-intro-career="career:expedition-pilot"]').isDisabled(),
      true
    );
    await page.locator('[data-intro-career="career:racer"]').scrollIntoViewIfNeeded();
    await shot(name + '-careers-200');
    await page.locator('#playerIntroduction [data-intro=exit]').tap();
    await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '100'));
    report.checks.push(name + ':real200%-native-touch-keyboard-menu-careers');
  }
  await page.waitForFunction(() => window.__cinematicModelsReleased(), null, { timeout: 45000 });
  report.checks.push('original-character-model-leases-return-to-baseline-after-close');
  assert.deepEqual(qa.report.errors, []);
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  report.ok = true;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  report.failure = error.stack;
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  await shot('failed').catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
