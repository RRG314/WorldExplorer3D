import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4213').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/universe-wayfinder');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function diagnostics(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space && document.getElementById('universeToggle');
  }, null, { timeout: 120000 });
}

async function setCourse(page, destinationId) {
  await page.locator('#universeToggle').click();
  await page.locator('#universeNavigator').waitFor({ state: 'visible' });
  await page.locator('#universeDestinationSelect').selectOption(destinationId);
  const buttonText = await page.locator('#universeTravelBtn').innerText();
  assert.match(buttonText, new RegExp(`SET COURSE`, 'i'));
  await page.locator('#universeTravelBtn').click();
}

async function verifyViewport(viewport, name) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name} pageerror: ${error.stack || error}`));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failures.push(`${name} ${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failures.push(`${name} failed ${request.url()}`);
  });

  try {
    await openSpace(page);
    const optionCount = await page.locator('#universeDestinationSelect option').count();
    const planetOptionCount = await page.locator('#universeDestinationSelect optgroup[label$="· planets"] option').count();
    assert.ok(optionCount > 25, 'Wayfinder should include deep-space frames and planets');
    assert.ok(planetOptionCount >= 25, 'Wayfinder should expose catalog planets directly');

    await setCourse(page, 'trappist-1-e');
    await page.waitForFunction(() => document.getElementById('universeToggle')?.textContent?.includes('TRAPPIST-1 e'));
    await page.waitForFunction(() => document.getElementById('sfDestination')?.textContent?.includes('TRAPPIST-1 e'));
    const transitState = await diagnostics(page);
    assert.equal(transitState.universeNavigation.courseDestinationId, 'trappist-1-e');
    assert.equal(transitState.universeNavigation.courseFrameId, 'trappist-1');
    assert.equal(transitState.universeNavigation.courseStatus, 'transit');

    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.universeNavigation?.currentFrameId === 'trappist-1' &&
        state.universeNavigation?.courseStatus === 'active' &&
        state.planetary?.nearestBody === 'TRAPPIST-1 e';
    }, null, { timeout: 15000 });
    const arrivalState = await diagnostics(page);
    const targetVisual = arrivalState.universeNavigation?.targetVisual;
    assert.equal(targetVisual.markerVisible, true);
    assert.ok(
      Math.abs(targetVisual.ndcX) < 0.92 && Math.abs(targetVisual.ndcY) < 0.92,
      `course planet must remain visible after arrival: ${JSON.stringify(targetVisual)}`
    );
    const hud = await page.evaluate(() => ({
      destination: document.getElementById('sfDestination')?.textContent?.trim(),
      zone: document.getElementById('sfZoneLabel')?.textContent?.trim(),
      action: document.getElementById('sfLandBtn')?.textContent?.trim(),
      wayfinder: document.getElementById('universeToggle')?.textContent?.trim()
    }));
    assert.equal(hud.destination, 'TRAPPIST-1 e');
    assert.equal(hud.zone, 'PLANET APPROACH');
    assert.match(hud.action, /ORBIT TARGET/);
    assert.match(hud.wayfinder, /TRAPPIST-1 e/);
    await page.screenshot({ path: path.join(outputDir, `${name}-trappist-course.png`), fullPage: true });

    if (name === 'desktop') {
      await setCourse(page, 'sagittarius-a-star');
      await page.waitForFunction(() => {
        const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
        return state.universeNavigation?.currentFrameId === 'sagittarius-a-star' &&
          state.universeNavigation?.courseStatus === 'active' &&
          state.universeNavigation?.transitionDestinationId === null;
      }, null, { timeout: 15000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(outputDir, 'desktop-sagittarius-a-star.png'), fullPage: true });

      await setCourse(page, 'triangulum');
      await page.waitForFunction(() => {
        const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
        return state.universeNavigation?.currentFrameId === 'triangulum' &&
          state.universeNavigation?.courseStatus === 'active' &&
          state.universeNavigation?.transitionDestinationId === null;
      }, null, { timeout: 15000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(outputDir, 'desktop-triangulum.png'), fullPage: true });
    }

    results.push({
      name,
      viewport,
      optionCount,
      planetOptionCount,
      arrivalState: arrivalState.universeNavigation,
      targetVisual,
      hud
    });
  } finally {
    await context.close();
  }
}

try {
  await verifyViewport({ width: 1440, height: 900 }, 'desktop');
  await verifyViewport({ width: 390, height: 844 }, 'mobile');
} finally {
  await browser.close();
}

const report = { ok: failures.length === 0, baseUrl, results, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
