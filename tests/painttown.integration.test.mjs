#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium, devices } from 'playwright';
import { startStaticServer } from '../scripts/verification/static-server.mjs';
import { deriveRoomDeterministicSeed } from '../app/js/multiplayer/rooms-seed-model.js';

const VERIFY_ROOT = process.env.WE3D_VERIFY_ROOT || process.cwd();
let APP_URL = '';
const OUTPUT_DIR = path.join('/tmp', 'worldexplorer3d-verification', 'painttown-physics-check');
const REPORT_PATH = path.join(OUTPUT_DIR, 'report.json');
const SCREEN_TITLE_PATH = path.join(OUTPUT_DIR, 'title-painttown-selected.png');
const SCREEN_GAME_PATH = path.join(OUTPUT_DIR, 'ingame-painttown.png');
const SCREEN_HUD_PATH = path.join(OUTPUT_DIR, 'ingame-painttown-after-tests.png');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function selectPaintTownAndStart(page) {
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const consentButton = page.locator('#analyticsConsentDenyBtn');
  if (await consentButton.isVisible()) await consentButton.click();
  await page.click('[data-globe-destination="games"]');
  await page.waitForSelector('#globeHubOverlay:not([hidden]) #tab-games.active', { timeout: 10_000 });
  const paintTownMode = page.locator('.mode[data-mode="painttown"]');
  await paintTownMode.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await paintTownMode.focus();
  await paintTownMode.press('Enter');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().gameMode === 'painttown', null, { timeout: 10_000 });
  await page.screenshot({ path: SCREEN_TITLE_PATH, fullPage: true });
  await page.click('#globeHubOverlayCloseBtn');
  await page.click('#globeSelectorStartBtn');
  await page.waitForFunction(() => {
    const title = document.getElementById('titleScreen');
    const loading = document.getElementById('loading');
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return !!title && title.classList.contains('hidden') &&
      !loading?.classList.contains('show') &&
      state.gameStarted === true && state.worldLoading === false &&
      Number(state.worldCounts?.buildings || 0) > 0 &&
      Number(state.worldCounts?.roads || 0) > 0;
  }, null, { timeout: 180_000 });
  // The world publication is complete at this point; allow the PaintTown
  // plugin one render turn to finish indexing the published building meshes.
  await page.waitForTimeout(1_200);
}

async function waitForPaintTownRuntime(page) {
  await page.waitForFunction(() => {
    const snap = globalThis.getWorldExplorerRuntimeDiagnostics?.().paintTown;
    return !!(snap && snap.active && Number(snap.totalBuildings) > 0);
  }, null, { timeout: 120_000 });
}

async function capturePaintTownRuntime(page) {
  return page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return {
      gameMode: diagnostics.gameMode || null,
      buildings: Number(diagnostics.worldCounts?.buildings || 0),
      gameplay: diagnostics.gameplayPlugins || null,
      paintTown: diagnostics.paintTown || null
    };
  });
}

function isExpectedLocalNetworkConsoleError(message) {
  const text = String(message || '');
  return text.includes('Failed to load resource: net::ERR_') ||
    (text.includes('blocked by CORS policy') && text.includes('/api/interpreter')) ||
    (text.includes('net::ERR_FAILED') && text.includes('Failed to load resource'));
}

async function checkDeterministicSeed() {
  const baseRoom = {
    code: 'AB12CD',
    world: {
      kind: 'earth',
      seed: 'latlon:35.68000,139.76000',
      lat: 35.68,
      lon: 139.76
    }
  };
  const same1 = Number(deriveRoomDeterministicSeed(baseRoom));
  const same2 = Number(deriveRoomDeterministicSeed(baseRoom));
  const diff = Number(deriveRoomDeterministicSeed({ ...baseRoom, code: 'ZX98QP' }));
  return {
    same1,
    same2,
    diff,
    deterministic: Number.isFinite(same1) && same1 === same2,
    differentiatesByRoom: Number.isFinite(diff) && same1 !== diff
  };
}

async function runTouchPaintCheck(page) {
  const snapshot = () => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().paintTown || {});
  const before = await snapshot();
  await page.locator('#paintTownHud button[data-paint-toggle="open"]').click();
  await page.locator('#paintTownHud button[data-paint-tool="touch"]').click();
  const points = [];
  for (let y = 120; y <= 620; y += 50) {
    for (let x = 420; x <= 1180; x += 55) points.push([x, y]);
  }
  let used = null;
  let after = before;
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    after = await snapshot();
    if ((after.claims?.length || 0) > (before.claims?.length || 0)) {
      used = { x, y };
      break;
    }
  }
  return {
    touched: !!used,
    used,
    claimsBefore: before.claims?.length || 0,
    claimsAfter: after.claims?.length || 0,
    paintedBefore: Number(before.paintedBuildings || 0),
    paintedAfter: Number(after.paintedBuildings || 0),
    totalBuildings: Number(after.totalBuildings || 0)
  };
}

async function runGunPhysicsCheck(page) {
  const snapshot = () => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().paintTown || {});
  await page.locator('#paintTownHud button[data-paint-tool="gun"]').click();
  const before = await snapshot();
  let launched;
  await page.keyboard.down('ControlLeft');
  try {
    await page.waitForFunction((previousShotAt) =>
      Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().paintTown?.lastShotAtMs || 0) > Number(previousShotAt || 0),
    Number(before.lastShotAtMs || 0), { timeout: 2_000 });
    launched = await snapshot();
  } finally {
    await page.keyboard.up('ControlLeft');
  }
  await page.waitForFunction(() => Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().paintTown?.paintballs || 0) === 0, null, { timeout: 8_000 });
  const after = await snapshot();
  return {
    fired: Number(launched.lastShotAtMs || 0) > Number(before.lastShotAtMs || 0),
    lastShotAtBefore: Number(before.lastShotAtMs || 0),
    lastShotAtAfter: Number(launched.lastShotAtMs || 0),
    projectileExpired: Number(after.paintballs || 0) === 0,
    claimsBaseline: before.claims?.length || 0,
    claimsAfter: after.claims?.length || 0,
    paintballsRemaining: Number(after.paintballs || 0),
    paintedBuildings: Number(after.paintedBuildings || 0),
    totalBuildings: Number(after.totalBuildings || 0)
  };
}

async function run() {
  const report = {
    appUrl: APP_URL,
    timestamp: new Date().toISOString(),
    seedCheck: null,
    touchCheck: null,
    gunCheck: null,
    runtime: null,
    consoleErrors: [],
    errors: [],
    pass: false
  };

  let server = null;
  let browser = null;
  try {
    server = await startStaticServer({ rootDir: VERIFY_ROOT, ports: [4431, 4432, 4433] });
    APP_URL = `http://127.0.0.1:${server.port}/app/`;
    report.appUrl = APP_URL;

    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width: 1280, height: 800 },
      screen: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const message = `console.error: ${msg.text()}`;
        report.consoleErrors.push(message);
        if (!isExpectedLocalNetworkConsoleError(message)) report.errors.push(message);
      }
    });
    page.on('pageerror', (err) => {
      report.errors.push(`pageerror: ${String(err)}`);
    });

    await page.goto(APP_URL, { waitUntil: 'load', timeout: 120_000 });
    await selectPaintTownAndStart(page);
    await waitForPaintTownRuntime(page);
    report.runtime = await capturePaintTownRuntime(page);
    await page.screenshot({ path: SCREEN_GAME_PATH, fullPage: true });

    report.seedCheck = await checkDeterministicSeed();
    report.touchCheck = await runTouchPaintCheck(page);
    report.gunCheck = await runGunPhysicsCheck(page);
    await page.screenshot({ path: SCREEN_HUD_PATH, fullPage: true });

    const seedPass = report.seedCheck.deterministic && report.seedCheck.differentiatesByRoom;
    const touchPass = report.touchCheck.touched && report.touchCheck.claimsAfter > report.touchCheck.claimsBefore;
    const gunPass = report.gunCheck.fired && report.gunCheck.projectileExpired && report.gunCheck.paintballsRemaining === 0;
    const noRuntimeErrors = report.errors.length === 0;

    report.pass = seedPass && touchPass && gunPass && noRuntimeErrors;
  } catch (err) {
    report.errors.push(String(err && err.stack ? err.stack : err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server?.close();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.pass) {
    process.exitCode = 1;
  }
}

run();
