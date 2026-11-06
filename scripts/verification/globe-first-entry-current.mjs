import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';

const touch = process.argv.includes('--touch');
const largeOnly = process.argv.includes('--large-only');
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(`output/verification/globe-first-entry-20261106/${touch ? 'touch' : 'desktop'}-${Date.now()}`);
const qa = await createFieldworkQaSession({ output, careerId: 'explorer', maximumDurationMs: 240000, pageOptions: { hasTouch: touch }, browserChannel: null });
const page = qa.page;
const views = largeOnly ? touch ? [[390, 844, '200']] : [[1280, 800, '200']] : touch ? [[390, 844, '100'], [844, 390, '100'], [390, 844, '200']] : [[1440, 900, '100'], [1280, 452, '100'], [1000, 700, '100'], [1280, 800, '200']];
const report = { scope: 'Automatic native globe entry, responsive controls and original optional setup/menu round trips. No gameplay launches, career procedures, saves, account or player mutations.', cases: [], checks: [], passed: false };
const globe = page.locator('#globeSelectorScreen.show');
async function ready() {
  await globe.waitFor({ state: 'visible', timeout: 90000 });
  assert.equal(await page.locator('#playerEntryScreen').isVisible(), false, 'The cinematic overview must not cover the initial globe');
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 90000 });
  await page.locator('#journeySync[open]').waitFor({ state: 'hidden', timeout: 90000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
}
try {
  for (const [width, height, scale] of views) {
    await page.setViewportSize({ width, height });
    await page.goto(base + '/app/');
    await ready();
    await page.evaluate(value => { document.documentElement.dataset.we3dTextScale = value; }, scale);
    await page.waitForTimeout(300);
    const layout = await page.evaluate(() => {
      const rect = selector => {
        const e = document.querySelector(selector), r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right, hit: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), clippedText: e.scrollWidth > e.clientWidth + 1 };
      };
      return { canvas: rect('#globeSelectorCanvas'), frame: rect('.globe-selector-stage'), metadata: rect('.globe-map-meta'), footer: rect('.globe-destination-bar'), launch: rect('#globeSelectorStartBtn'), setup: rect('#globeExplorerSetupBtn'), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, worlds: [...document.querySelectorAll('.globe-destination-bar button')].map(e => ({ id: e.id, ...rect('#' + e.id) })) };
    });
    report.cases.push({ width, height, scale, layout });
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.launch.clippedText, false, 'Explore text must remain readable');
    assert.equal(layout.setup.clippedText, false, 'Setup text must remain readable');
    assert(Math.abs(layout.canvas.height - layout.frame.height) <= 3, 'No hidden reserved strip in the globe');
    assert(layout.metadata.y >= layout.canvas.bottom - 1, 'Credits must stay outside the interactive globe');
    assert(layout.footer.bottom <= height + 1, 'World destinations must remain within the viewport');
    for (const world of layout.worlds) assert(world.width >= 44 && world.height >= 44 && world.hit, world.id + ': reachable touch target');
    if (scale === '100') {
      assert(layout.canvas.height >= height * (touch ? height > width ? .32 : .44 : .60), 'The globe needs a substantial share of the viewport');
      assert(layout.launch.hit && layout.setup.hit, 'Explore and optional setup must be visible without a preliminary click');
    } else {
      await page.locator('#globeSelectorStartBtn').focus();
      assert(await page.locator('#globeSelectorStartBtn').evaluate(e => { const r=e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), 'Large-text launch remains reachable');
      const lastDestination = page.locator('.globe-app-rail [data-globe-destination="multiplayer"]');
      await lastDestination.focus();
      assert(await lastDestination.evaluate(e => { const r=e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), 'All large-text navigation destinations remain reachable');
    }
    await page.screenshot({ path: path.join(output, `${width}x${height}-${scale}.png`) });
  }
  if (!largeOnly) {
  await page.setViewportSize(touch ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await page.goto(base + '/app/');
  await ready();
  await page.locator('#globeExplorerSetupBtn').click();
  await page.locator('#playerIntroduction[open]').waitFor();
  await page.locator('#playerIntroduction [data-intro="exit"]').click();
  await ready();
  report.checks.push('setup opens directly; cancel returns to the globe');
  if (!touch) {
    await page.locator('#globeExplorerSetupBtn').click();
    for (let i = 0; i < 3; i++) await page.locator('#playerIntroduction [data-intro="next"]').click();
    await page.locator('#playerIntroduction [data-intro="choose-place"]').click();
    await globe.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#globeExplorerSetupBtn').isVisible(), false);
    assert.match(await page.locator('#globeSelectorStartBtn').innerText(), /Use this starting place/);
    await page.locator('#globeSelectorBackBtn').click();
    await page.locator('#playerIntroduction[open]').waitFor();
    await page.locator('#playerIntroduction [data-intro="exit"]').click();
    await ready();
    report.checks.push('original setup destination choice and back/cancel preserve the globe-first flow');
  }
  await page.locator('.globe-app-rail [data-globe-destination="games"]').click();
  await page.locator('#experienceBrowser[open]').waitFor();
  await page.locator('[data-experience-close]').click();
  await ready();
  report.checks.push('Activities closes directly to the globe');
  const input = page.locator(touch ? '#globeMobileLocationSearch' : '#globeLocationSearch');
  await input.fill('39.2904, -76.6122');
  await input.press('Enter');
  await page.waitForFunction(() => Math.abs(Number(document.getElementById('globeCustomLat').value)-39.2904)<.000001);
  await page.locator('#globeSelectorZoomInBtn').click();
  await page.locator('#globeSelectorZoomOutBtn').click();
  report.checks.push('original coordinate selection and zoom controls remain usable');
  await page.reload();
  await ready();
  assert.equal(await page.locator('#globeSelectorBackBtn').isVisible(), false, 'Initial globe cannot dismiss to an empty title screen');
  await page.keyboard.press('Escape');
  await ready();
  report.checks.push('reload and Escape retain the initial globe');
  }
  assert.deepEqual(qa.report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({ path: path.join(output, 'failed.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.errors = qa.report.errors;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  await qa.close();
  console.log(JSON.stringify({ output, passed: report.passed, cases: report.cases.length, checks: report.checks.length, failure: report.failure }));
}
