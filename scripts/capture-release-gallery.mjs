import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './verification/static-server.mjs';

const root = process.cwd();
const captureRoot = path.join(root, 'assets', 'landing', 'current');
const server = await startStaticServer({ rootDir: root, ports: [4431, 4432, 4433] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ url: response.url(), status: response.status() });
  }
});

const captures = [];

async function capture(file, label, journey) {
  const absolute = path.join(captureRoot, file);
  await page.screenshot({ path: absolute, fullPage: false });
  const bytes = await readFile(absolute);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  captures.push({
    file: `assets/landing/current/${file}`,
    label,
    journey,
    width: dimensions.width,
    height: dimensions.height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    provenance: 'normal-input browser runtime capture; no synthetic camera or test-only scene'
  });
}

async function waitForWorld() {
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false &&
      Number(state.worldCounts?.buildings || 0) > 0 &&
      Number(state.worldCounts?.roads || 0) > 0 &&
      Number(state.worldCounts?.terrainTiles || 0) > 0;
  }, null, { timeout: 300_000 });
  await page.waitForTimeout(2_500);
}

async function selectMode(expected, selector) {
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator(selector).click();
  await page.waitForFunction((mode) => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === mode, expected, { timeout: 20_000 });
  await page.waitForTimeout(900);
}

async function hold(key, milliseconds) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
  await page.waitForTimeout(500);
}

try {
  await mkdir(captureRoot, { recursive: true });
  await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, {
    waitUntil: 'load', timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const consent = page.locator('#analyticsConsentDenyBtn');
  if (await consent.isVisible().catch(() => false)) await consent.click();
  // The selector shell can become visible before its asynchronous Earth
  // imagery has replaced the neutral globe material. Do not publish that
  // transitional frame as current gameplay.
  await page.waitForTimeout(5_000);
  await capture('world-entry-5.0.png', 'World entry', 'Baltimore selected in the normal world selector');
  await page.locator('#globeSelectorStartBtn').click();
  await waitForWorld();
  const skipGuide = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skipGuide.isVisible().catch(() => false)) {
    await skipGuide.click();
    await page.waitForTimeout(400);
  }

  await selectMode('walk', '#fWalk');
  await hold('ArrowUp', 900);
  await capture('street-walk-5.0.png', 'Street exploration', 'Normal keyboard walking in the assembled Baltimore world');

  await selectMode('drive', '#fDriving');
  await hold('ArrowUp', 1_400);
  await capture('driving-5.0.png', 'Driving', 'Normal keyboard driving in the assembled Baltimore world');

  await selectMode('drone', '#fDrone');
  await hold('Space', 1_100);
  await hold('ArrowUp', 1_000);
  await capture('drone-5.0.png', 'Drone flight', 'Normal keyboard drone controls in the assembled Baltimore world');

  await selectMode('plane', '#fPlane');
  await hold('ArrowUp', 1_200);
  await capture('plane-5.0.png', 'Plane flight', 'Normal keyboard plane controls in the assembled Baltimore world');

  await page.locator('#mainMenuBtn').click();
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorOceanBtn').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.environment === 'OCEAN' && state.gameStarted === true && state.modes?.ocean === true;
  }, null, { timeout: 180_000 });
  await page.waitForTimeout(2_500);
  await capture('ocean-5.0.png', 'Ocean exploration', 'Normal title-screen Ocean launch at the selected coordinates');

  if (browserErrors.length || localFailures.length) {
    throw new Error(`Capture runtime errors: ${JSON.stringify({ browserErrors, localFailures })}`);
  }
  const manifest = {
    schemaVersion: 1,
    release: '5.0.0',
    generatedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 900 },
    captureCommand: 'npm run capture:5.0-gallery',
    writesProduction: false,
    captures
  };
  await writeFile(path.join(root, 'config', 'public-capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, captureCount: captures.length, files: captures.map((entry) => entry.file) }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
