import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/gameplay-menu-5-1-baseline');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const pageErrors = [];

async function startEarth(page) {
  await page.goto(`${baseUrl}/app/?menuBaseline=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  if (await page.locator('#globeLocationSearch').isVisible()) {
    await page.locator('#globeLocationSearch').fill('Baltimore, Maryland');
    await page.locator('#globeLocationSearchBtn').click();
    const result = page.locator('#globeLocationSearchResults [role="option"]').first();
    await result.waitFor({ state: 'visible', timeout: 30_000 });
    await result.click();
    await page.locator('#globeSelectorStartBtn').click();
  } else if (await page.locator('#globeSelectorStartBtn').isVisible()) {
    await page.locator('#globeSelectorStartBtn').click();
  } else {
    await page.locator('#startBtn').click();
  }
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.gameStarted && !state.worldLoading && state.environment === 'EARTH';
  }, null, { timeout: 180_000 });
  if (await page.locator('#loading.show').isVisible()) {
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.hideLoad?.();
    });
  }
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 120_000 });
}

async function verify(viewport, screenshotName) {
  const touchViewport = viewport.width <= 760;
  const context = await browser.newContext({ viewport, hasTouch: touchViewport, isMobile: touchViewport });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await startEarth(page);

  const labels = await page.locator('#floatMenuContainer > .floatMenuRow > .floatMenu > .floatBtn .btnText').allTextContents();
  assert.deepEqual(labels.slice(0, 4).map((label) => label.trim()), [
    'Exploration',
    'Environment',
    'Games',
    'Land & Property'
  ]);
  assert.match(labels[4] || '', /Walking Mode Controls/i);
  assert.equal(await page.locator('#packBtn').count(), 0);
  assert.equal(await page.locator('#fEditorMode').count(), 0);

  await page.evaluate(() => {
    const loading = document.getElementById('loading');
    loading?.classList.remove('show');
    if (loading) loading.style.display = 'none';
  });
  await page.locator('#exploreBtn').click();
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#exploreMenu').evaluate((menu) => menu.classList.contains('open')), true);
  const exploration = await page.locator('#exploreMenu .floatItems').textContent();
  assert.match(exploration, /My Explorer & Activities/i);
  assert.match(exploration, /Backpack & Quick Slots/i);
  assert.match(exploration, /Deploy Pathfinder Pod/i);
  assert.match(exploration, /Board Solis Reach/i);
  assert.match(exploration, /Free Space Flight/i);

  if (touchViewport) {
    const controlsTextDisplay = await page.locator('#controlsBarBtn .btnText').evaluate((element) => getComputedStyle(element).display);
    assert.equal(controlsTextDisplay, 'none', 'The dynamic controls title overlaps the compact mobile label.');
  }

  await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
  await context.close();
  return { viewport, labels, exploration: exploration.replace(/\s+/g, ' ').trim() };
}

const mobileOnly = process.argv.includes('--mobile-only');
const desktopOnly = process.argv.includes('--desktop-only');
let result = null;
try {
  result = {
    desktop: mobileOnly ? null : await verify({ width: 1440, height: 900 }, 'desktop.png'),
    mobile: desktopOnly ? null : await verify({ width: 390, height: 844 }, 'mobile.png')
  };
} catch (error) {
  failures.push(String(error?.stack || error));
} finally {
  await browser.close();
}

failures.push(...pageErrors);
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
