import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'water-travel-lifecycle');
const host = '127.0.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distance2d(a, b) {
  return Math.hypot(Number(b?.x || 0) - Number(a?.x || 0), Number(b?.z || 0) - Number(a?.z || 0));
}

async function pollPageState(page, evaluator, argument, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await page.evaluate(evaluator, argument);
    if (result) return result;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function launchAtlantic(page, baseUrl) {
  await page.goto(`${baseUrl}/app/?water-travel=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && document.getElementById('globeSelectorScreen')?.classList.contains('show');
  }, null, { timeout: 90000 });
  await page.locator('#globeCustomLat').fill('30');
  await page.locator('#globeCustomLon').fill('-40');
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });
  await pollPageState(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.boatMode?.active && ctx.boatMode?.mesh?.visible;
  }, null, 90000, 'Atlantic boat readiness');
  await page.evaluate(() => document.activeElement?.blur?.());
}

async function readState(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const ocean = ctx.getOceanModeDebugState?.() || null;
    return {
      env: ctx.getEnv?.(),
      travelMode: ctx.getCurrentTravelMode?.(),
      gameStarted: !!ctx.gameStarted,
      worldLoading: !!ctx.worldLoading,
      activeElement: document.activeElement?.tagName || null,
      boatActions: ctx.readControlActions?.('boat') || null,
      oceanActions: ctx.readControlActions?.('ocean') || null,
      boat: {
        active: !!ctx.boatMode?.active,
        visible: !!ctx.boatMode?.mesh?.visible,
        x: Number(ctx.boat?.x),
        y: Number(ctx.boat?.y),
        z: Number(ctx.boat?.z),
        angle: Number(ctx.boat?.angle),
        speed: Number(ctx.boat?.speed),
        waterKind: ctx.boatMode?.waterKind || null
      },
      ocean,
      canvases: {
        ocean: document.querySelectorAll('#oceanModeCanvas').length,
        visibleOcean: document.querySelectorAll('#oceanModeCanvas:not([style*="display: none"])').length,
        total: document.querySelectorAll('canvas').length
      },
      camera: ctx.camera ? {
        x: Number(ctx.camera.position.x),
        y: Number(ctx.camera.position.y),
        z: Number(ctx.camera.position.z)
      } : null,
      worldCanvasVisible: getComputedStyle(document.querySelector('canvas')).display !== 'none'
    };
  });
}

await mkdirp(outputDir);
const suppliedBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
const server = suppliedBaseUrl ? null : await startServer({ rootDir, host, candidatePorts: [4219, 4220, 4221] });
const baseUrl = suppliedBaseUrl || `http://${host}:${server.port}`;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  const httpErrors = [];
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
  });
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/net::ERR_|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(text)) {
      consoleErrors.push(text);
    }
  });

  await launchAtlantic(page, baseUrl);
  const boatStart = await readState(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3000);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(250);
  const boatMoved = await readState(page);
  await page.screenshot({ path: path.join(outputDir, 'boat-moving.png'), fullPage: false });

  assert(boatStart.boat.active && boatStart.boat.visible, 'Atlantic did not start with a visible boat');
  assert(boatStart.travelMode === 'boat', `Atlantic public travel mode was ${boatStart.travelMode || 'unset'}`);
  assert(boatStart.boat.waterKind === 'open_ocean', `Atlantic resolved as ${boatStart.boat.waterKind || 'unknown'} water`);
  assert(distance2d(boatStart.boat, boatMoved.boat) > 1, 'Real Arrow key input did not move the boat');
  assert(Math.abs(boatMoved.boat.angle - boatStart.boat.angle) > 0.02, 'Real Arrow key input did not steer the boat');

  const diveStarted = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.transferBoatToSubmarine({ showNotice: false });
  });
  assert(diveStarted, 'Boat-to-submarine transfer was rejected');
  await pollPageState(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.OCEAN && ctx.oceanMode?.active && ctx.oceanMode?.animationId != null;
  }, null, 30000, 'submarine environment readiness');

  const subStart = await readState(page);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ControlLeft');
  await page.waitForTimeout(1800);
  await page.keyboard.up('ControlLeft');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(250);
  const subMoved = await readState(page);
  await page.screenshot({ path: path.join(outputDir, 'submarine-moving.png'), fullPage: false });
  await fs.writeFile(path.join(outputDir, 'submarine-control-report.json'), `${JSON.stringify({ subStart, subMoved }, null, 2)}\n`);

  assert(subStart.ocean?.active, 'Ocean owner was not active after the dive');
  assert(distance2d(subStart.ocean?.position, subMoved.ocean?.position) > 0.8, 'Real Arrow key input did not move the submarine');
  assert(Number(subMoved.ocean?.position?.y) < Number(subStart.ocean?.position?.y) - 0.15, 'Real Control input did not descend the submarine');
  assert(Math.abs(Number(subMoved.ocean?.yaw) - Number(subStart.ocean?.yaw)) > 0.01, 'Real Arrow key input did not turn the submarine');

  const surfaced = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.transferSubmarineToBoat({ emitTutorial: false, source: 'water_travel_acceptance' });
  });
  assert(surfaced, 'Submarine-to-boat transfer failed');
  await pollPageState(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.EARTH && ctx.boatMode?.active && !ctx.oceanMode?.active && ctx.oceanMode?.animationId == null;
  }, null, 180000, 'surface boat restoration');
  await page.waitForTimeout(400);
  const restored = await readState(page);
  await page.screenshot({ path: path.join(outputDir, 'boat-restored.png'), fullPage: false });

  assert(restored.boat.active && restored.boat.visible, 'Surface boat was not restored visibly');
  assert(!restored.ocean?.active, 'Ocean owner remained active after surfacing');
  assert(restored.canvases.ocean === 1, `Ocean canvas duplicated (${restored.canvases.ocean})`);
  assert(restored.canvases.visibleOcean === 0, 'Ocean canvas remained visible after surfacing');
  assert(restored.worldCanvasVisible, 'Earth canvas was not restored after surfacing');
  assert(Object.values(restored.camera || {}).every(Number.isFinite), 'Earth camera was invalid after surfacing');
  await fs.writeFile(path.join(outputDir, 'network-report.json'), `${JSON.stringify({ httpErrors, consoleErrors }, null, 2)}\n`);
  assert(consoleErrors.length === 0, `Water travel logged errors: ${consoleErrors.join(' | ')}`);

  const report = { ok: true, boatStart, boatMoved, subStart, subMoved, restored, httpErrors, consoleErrors };
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    boatDistance: distance2d(boatStart.boat, boatMoved.boat),
    submarineDistance: distance2d(subStart.ocean?.position, subMoved.ocean?.position),
    submarineDepthChange: Number(subMoved.ocean?.position?.y) - Number(subStart.ocean?.position?.y),
    restored: {
      env: restored.env,
      travelMode: restored.travelMode,
      canvases: restored.canvases
    },
    consoleErrors
  }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
