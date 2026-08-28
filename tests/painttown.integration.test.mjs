#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium, devices } from 'playwright';
import { startStaticServer } from '../scripts/verification/static-server.mjs';

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
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx?.gameMode === 'painttown';
  }, null, { timeout: 10_000 });
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
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod && mod.ctx;
    if (!ctx || typeof ctx.paintTownDebugSnapshot !== 'function') return false;
    const snap = ctx.paintTownDebugSnapshot();
    return !!(snap && snap.active && Number(snap.totalBuildings) > 0);
  }, null, { timeout: 120_000 });
}

async function capturePaintTownRuntime(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      gameMode: ctx?.gameMode || null,
      disableNearBuildingBatching: ctx?.disableNearBuildingBatching === true,
      buildings: Number(ctx?.buildings?.length || 0),
      buildingMeshes: Number(ctx?.buildingMeshes?.length || 0),
      unbatchedBuildingMeshes: Array.isArray(ctx?.buildingMeshes)
        ? ctx.buildingMeshes.filter((mesh) => mesh && !mesh.userData?.isBuildingBatch).length
        : 0,
      gameplay: ctx?.getGameplayRegistrySnapshot?.() || null,
      paintTown: ctx?.paintTownDebugSnapshot?.() || null
    };
  });
}

function isExpectedLocalNetworkConsoleError(message) {
  const text = String(message || '');
  return text.includes('Failed to load resource: net::ERR_') ||
    (text.includes('blocked by CORS policy') && text.includes('/api/interpreter')) ||
    (text.includes('net::ERR_FAILED') && text.includes('Failed to load resource'));
}

async function checkDeterministicSeed(page) {
  return page.evaluate(async () => {
    const mod = await import('/app/js/multiplayer/rooms.js?v=55');
    const derive = mod.deriveRoomDeterministicSeed;
    const baseRoom = {
      code: 'AB12CD',
      world: {
        kind: 'earth',
        seed: 'latlon:35.68000,139.76000',
        lat: 35.68,
        lon: 139.76
      }
    };
    const same1 = Number(derive(baseRoom));
    const same2 = Number(derive(baseRoom));
    const diff = Number(derive({ ...baseRoom, code: 'ZX98QP' }));
    return {
      same1,
      same2,
      diff,
      deterministic: Number.isFinite(same1) && same1 === same2,
      differentiatesByRoom: Number.isFinite(diff) && same1 !== diff
    };
  });
}

async function runTouchPaintCheck(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const before = ctx.paintTownDebugSnapshot();

    const candidates = (() => {
      const camera = ctx.camera;
      const THREE = globalThis.THREE;
      const canvas = ctx.renderer?.domElement;
      if (!camera || !THREE || !canvas || !Array.isArray(ctx.buildingMeshes)) return [];
      const meshes = ctx.buildingMeshes.filter((mesh) => mesh && mesh.visible && !mesh.userData?.isBuildingBatch);
      if (!meshes.length) return [];
      const ray = new THREE.Raycaster();
      const stepX = Math.max(30, Math.floor(window.innerWidth / 26));
      const stepY = Math.max(28, Math.floor(window.innerHeight / 18));
      const points = [];
      for (let y = stepY; y < window.innerHeight - stepY; y += stepY) {
        for (let x = stepX; x < window.innerWidth - stepX; x += stepX) {
          const ndcX = (x / window.innerWidth) * 2 - 1;
          const ndcY = -(y / window.innerHeight) * 2 + 1;
          ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
          const intersects = ray.intersectObjects(meshes, true);
          if (!Array.isArray(intersects) || intersects.length === 0) continue;
          points.push({ x, y, dist: Number(intersects[0].distance || 0) });
          if (points.length >= 120) break;
        }
        if (points.length >= 120) break;
      }
      points.sort((a, b) => a.dist - b.dist);
      return points.slice(0, 60).map((p) => [p.x, p.y]);
    })();

    let touched = false;
    let used = null;
    for (const [x, y] of candidates) {
      if (ctx.paintTownDebugTryTouchPaintAt(x, y)) {
        touched = true;
        used = { x: Math.round(x), y: Math.round(y) };
        break;
      }
    }

    const after = ctx.paintTownDebugSnapshot();
    return {
      touched,
      used,
      claimsBefore: Array.isArray(before.claims) ? before.claims.length : 0,
      claimsAfter: Array.isArray(after.claims) ? after.claims.length : 0,
      paintedBefore: Number(before.paintedBuildings || 0),
      paintedAfter: Number(after.paintedBuildings || 0),
      totalBuildings: Number(after.totalBuildings || 0)
    };
  });
}

async function runGunPhysicsCheck(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.setPaintTownPlayerColor('#3b82f6');

    const targets = (() => {
      const camera = ctx.camera;
      const THREE = globalThis.THREE;
      const canvas = ctx.renderer?.domElement;
      if (!camera || !THREE || !canvas || !Array.isArray(ctx.buildingMeshes)) return [];
      const meshes = ctx.buildingMeshes.filter((mesh) => mesh && mesh.visible && !mesh.userData?.isBuildingBatch);
      if (!meshes.length) return [];
      const ray = new THREE.Raycaster();
      const stepX = Math.max(30, Math.floor(window.innerWidth / 24));
      const stepY = Math.max(26, Math.floor(window.innerHeight / 17));
      const points = [];
      for (let y = stepY; y < window.innerHeight - stepY; y += stepY) {
        for (let x = stepX; x < window.innerWidth - stepX; x += stepX) {
          const ndcX = (x / window.innerWidth) * 2 - 1;
          const ndcY = -(y / window.innerHeight) * 2 + 1;
          ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
          const intersects = ray.intersectObjects(meshes, true);
          if (!Array.isArray(intersects) || intersects.length === 0) continue;
          points.push({ x, y, dist: Number(intersects[0].distance || 0) });
          if (points.length >= 140) break;
        }
        if (points.length >= 140) break;
      }
      points.sort((a, b) => a.dist - b.dist);
      return points.slice(0, 80).map((p) => [p.x, p.y]);
    })();

    let fired = false;
    let hitClaim = false;
    let used = null;
    let baselineClaims = 0;
    let finalSnapshot = ctx.paintTownDebugSnapshot();

    for (const [x, y] of targets) {
      const before = ctx.paintTownDebugSnapshot();
      baselineClaims = Array.isArray(before.claims) ? before.claims.length : 0;
      if (ctx.paintTown && typeof ctx.paintTown === 'object') {
        ctx.paintTown.lastShotAtMs = 0;
      }
      const shotOk = ctx.paintTownDebugFirePaintballAt(x, y);
      if (!shotOk) continue;
      fired = true;
      used = { x: Math.round(x), y: Math.round(y) };
      for (let i = 0; i < 240; i++) {
        ctx.paintTownDebugUpdatePaintballs(1 / 60);
      }
      finalSnapshot = ctx.paintTownDebugSnapshot();
      const claimsAfter = Array.isArray(finalSnapshot.claims) ? finalSnapshot.claims.length : 0;
      if (claimsAfter > baselineClaims) {
        hitClaim = true;
        break;
      }
    }

    const colorCounts = finalSnapshot && finalSnapshot.colorCounts && typeof finalSnapshot.colorCounts === 'object'
      ? finalSnapshot.colorCounts
      : {};

    return {
      fired,
      hitClaim,
      used,
      claimsBaseline: baselineClaims,
      claimsAfter: Array.isArray(finalSnapshot.claims) ? finalSnapshot.claims.length : 0,
      paintballsRemaining: Number(finalSnapshot.paintballs || 0),
      blueClaims: Number(colorCounts['#3b82f6'] || 0),
      paintedBuildings: Number(finalSnapshot.paintedBuildings || 0),
      totalBuildings: Number(finalSnapshot.totalBuildings || 0)
    };
  });
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

    report.seedCheck = await checkDeterministicSeed(page);
    report.touchCheck = await runTouchPaintCheck(page);
    report.gunCheck = await runGunPhysicsCheck(page);
    await page.screenshot({ path: SCREEN_HUD_PATH, fullPage: true });

    const seedPass = report.seedCheck.deterministic && report.seedCheck.differentiatesByRoom;
    const touchPass = report.touchCheck.touched && report.touchCheck.claimsAfter > report.touchCheck.claimsBefore;
    const gunPass =
      report.gunCheck.fired &&
      report.gunCheck.hitClaim &&
      report.gunCheck.claimsAfter > report.gunCheck.claimsBaseline &&
      report.gunCheck.paintballsRemaining === 0;
    const noRuntimeErrors = report.errors.length === 0;

    report.pass = seedPass && touchPass && gunPass && noRuntimeErrors;
  } catch (err) {
    report.errors.push(String(err && err.stack ? err.stack : err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server?.close();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  }

  if (!report.pass) {
    process.exitCode = 1;
  }
}

run();
