#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const PORT = Number(process.env.WE3D_TEST_PORT || 4300 + Math.floor(Math.random() * 500));
const HOST = `http://127.0.0.1:${PORT}`;
const APP_URL = `${HOST}/app/index.html`;
const OUTPUT_DIR = path.join(process.cwd(), 'output', 'playwright', 'painttown-physics-check');
const REPORT_PATH = path.join(OUTPUT_DIR, 'report.json');
const SCREEN_TITLE_PATH = path.join(OUTPUT_DIR, 'title-painttown-selected.png');
const SCREEN_GAME_PATH = path.join(OUTPUT_DIR, 'ingame-painttown.png');
const SCREEN_HUD_PATH = path.join(OUTPUT_DIR, 'ingame-painttown-after-tests.png');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(url, server, timeoutMs = 15000) {
  const start = Date.now();
  let lastStatus = '';
  while (Date.now() - start < timeoutMs) {
    if (server && server.exitCode !== null) {
      throw new Error(`Local static server exited early with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) return;
      lastStatus = `HTTP ${response.status}`;
    } catch (_) {
      lastStatus = 'connection failed';
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for local server at ${url} (${lastStatus})`);
}

function startStaticServer() {
  const publicDir = path.join(process.cwd(), 'public');
  const child = spawn('python3', ['-m', 'http.server', '-d', publicDir, String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

async function selectPaintTownAndStart(page) {
  await page.waitForSelector('#startBtn', { timeout: 20000 });
  await page.click('.tab-btn[data-tab="games"]');
  await page.click('.mode[data-mode="painttown"]');
  await page.screenshot({ path: SCREEN_TITLE_PATH, fullPage: true });
  await page.click('#startBtn', { force: true });
  await page.waitForFunction(() => {
    const title = document.getElementById('titleScreen');
    return !!title && title.classList.contains('hidden');
  }, { timeout: 30000 });
}

async function waitForPaintTownRuntime(page) {
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=54');
    const ctx = mod && mod.ctx;
    if (!ctx || typeof ctx.paintTownDebugSnapshot !== 'function') return false;
    const snap = ctx.paintTownDebugSnapshot();
    return !!(snap && snap.active && Number(snap.totalBuildings) > 0);
  }, { timeout: 45000 });
}

async function checkDeterministicSeed(page) {
  return page.evaluate(async () => {
    const mod = await import('/app/js/multiplayer/rooms.js?v=54');
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
    const { ctx } = await import('/app/js/shared-context.js?v=54');
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
    const { ctx } = await import('/app/js/shared-context.js?v=54');
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
    errors: [],
    pass: false
  };

  let server = null;
  let browser = null;
  try {
    server = startStaticServer();
    await waitForServerReady(APP_URL, server);

    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        report.errors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      report.errors.push(`pageerror: ${String(err)}`);
    });

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await selectPaintTownAndStart(page);
    await waitForPaintTownRuntime(page);
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
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
    if (server) {
      await new Promise((resolve) => {
        server.once('exit', () => resolve());
        setTimeout(resolve, 1500);
      });
    }
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  }

  if (!report.pass) {
    process.exitCode = 1;
  }
}

run();
