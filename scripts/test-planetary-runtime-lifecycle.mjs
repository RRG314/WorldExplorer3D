import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'planetary-runtime-lifecycle');
const host = '127.0.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function poll(page, evaluator, argument, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await page.evaluate(evaluator, argument);
    if (result) return result;
    await page.waitForTimeout(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function launchBaltimore(page, baseUrl) {
  await page.goto(`${baseUrl}/app/?planetary-runtime=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && document.getElementById('globeSelectorScreen')?.classList.contains('show');
  }, null, { timeout: 90000 });
  await page.locator('#globeCustomLat').fill('39.2904');
  await page.locator('#globeCustomLon').fill('-76.6122');
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });
  await poll(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.EARTH && ctx.gameStarted && !ctx.worldLoading && (ctx.roads?.length || 0) > 0;
  }, null, 60000, 'loaded Earth world');
}

async function readState(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const astronaut = ctx.Walk?.state?.characterMesh?.getObjectByName?.('Planetary Astronaut Gear') || null;
    const vehicle = ctx.carMesh?.children?.find((child) => child?.userData?.vehicleKind) || null;
    const environment = ctx.getEnv?.() || '';
    const activeCamera = environment === ctx.ENV?.SPACE_FLIGHT ? ctx.spaceFlight?.camera : ctx.camera;
    const spaceScene = ctx.spaceFlight?.scene;
    const worldCanvas = document.querySelector('canvas:not(#spaceFlightCanvas):not(#oceanModeCanvas)');
    const spaceCanvas = document.getElementById('spaceFlightCanvas');
    return {
      env: environment,
      onMoon: !!ctx.onMoon,
      onMars: !!ctx.onMars,
      roads: Number(ctx.roads?.length || 0),
      earthVisible: !!ctx.earthSceneVisible,
      space: {
        active: !!ctx.spaceFlight?.active,
        animationActive: ctx.spaceFlight?.animationId != null,
        destination: ctx.spaceFlight?.destination || '',
        asteroidBelt: !!spaceScene?.getObjectByName?.('asteroidBelt')?.visible,
        kuiperBelt: !!spaceScene?.getObjectByName?.('kuiperBelt')?.visible
      },
      moon: {
        surfaceVisible: !!ctx.moonSurface?.visible,
        earthVisible: !!ctx.lunarEarthSphere?.visible
      },
      mars: {
        surfaceVisible: !!ctx.marsSurface?.visible,
        surfaceAttached: ctx.marsSurface?.parent === ctx.scene,
        visibleObjects: (ctx.marsObjects || []).filter((object) => object?.visible && object?.parent === ctx.scene).length
      },
      actor: {
        astronautVisible: !!astronaut?.visible,
        astronautBody: astronaut?.userData?.body || '',
        vehicleKind: vehicle?.userData?.vehicleKind || ''
      },
      skyObserver: ctx.starField?.userData?.observerBody || '',
      camera: activeCamera ? {
        x: Number(activeCamera.position.x),
        y: Number(activeCamera.position.y),
        z: Number(activeCamera.position.z)
      } : null,
      canvases: {
        worldVisible: !!worldCanvas && getComputedStyle(worldCanvas).display !== 'none',
        spaceVisible: !!spaceCanvas && getComputedStyle(spaceCanvas).display !== 'none',
        spaceCount: document.querySelectorAll('#spaceFlightCanvas').length,
        oceanCount: document.querySelectorAll('#oceanModeCanvas').length
      }
    };
  });
}

function assertFiniteCamera(state, label) {
  assert(Object.values(state.camera || {}).every(Number.isFinite), `${label} camera is invalid`);
}

function assertEarthRestored(state, label) {
  assert(state.env === 'EARTH' && !state.onMoon && !state.onMars, `${label} did not restore Earth identity`);
  assert(state.earthVisible && state.roads > 0, `${label} did not restore the populated Earth scene`);
  assert(!state.space.active && !state.space.animationActive, `${label} retained the Space render owner`);
  assert(!state.moon.surfaceVisible && !state.mars.surfaceVisible, `${label} retained a planetary surface`);
  assert(!state.actor.astronautVisible && !state.actor.vehicleKind, `${label} retained planetary actor state: ${JSON.stringify(state.actor)}`);
  assert(state.canvases.worldVisible && !state.canvases.spaceVisible, `${label} restored the wrong canvas`);
  assert(state.canvases.spaceCount === 1 && state.canvases.oceanCount === 1, `${label} duplicated an environment canvas`);
  assertFiniteCamera(state, label);
}

await mkdirp(outputDir);
const suppliedBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
const server = suppliedBaseUrl ? null : await startServer({ rootDir, host, candidatePorts: [4226, 4227, 4228] });
const baseUrl = suppliedBaseUrl || `http://${host}:${server.port}`;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/net::ERR_|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(text)) consoleErrors.push(text);
  });

  await launchBaltimore(page, baseUrl);
  const earthStart = await readState(page);
  assertEarthRestored(earthStart, 'Initial Earth');
  await page.screenshot({ path: path.join(outputDir, 'earth-start.png'), fullPage: false });

  const moonFlightStarted = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.startSpaceFlightToMoon?.();
  });
  assert(moonFlightStarted, 'Earth-to-Moon space flight did not start');
  await poll(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.SPACE_FLIGHT && ctx.spaceFlight?.active && ctx.spaceFlight?.animationId != null;
  }, null, 30000, 'Moon space flight');
  await page.waitForTimeout(1200);
  const spaceToMoon = await readState(page);
  assert(spaceToMoon.space.destination === 'moon', 'Space flight targeted the wrong Moon destination');
  assert(spaceToMoon.space.asteroidBelt && spaceToMoon.space.kuiperBelt, 'Space flight lost a persistent belt layer');
  assert(spaceToMoon.canvases.spaceVisible && !spaceToMoon.canvases.worldVisible, 'Space flight retained the Earth canvas');
  assertFiniteCamera(spaceToMoon, 'Moon space flight');
  await page.screenshot({ path: path.join(outputDir, 'space-to-moon.png'), fullPage: false });

  const moonLandingStarted = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.forceSpaceFlightLanding?.('Moon') === true;
  });
  assert(moonLandingStarted, 'Moon landing sequence did not start');
  await poll(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.MOON && ctx.onMoon && !ctx.spaceFlight?.active;
  }, null, 45000, 'Moon landing');
  await page.waitForTimeout(800);
  const moon = await readState(page);
  assert(moon.moon.surfaceVisible && moon.actor.vehicleKind === 'moon', `Moon scene or LRV is missing: ${JSON.stringify(moon)}`);
  assert(moon.actor.astronautVisible && moon.actor.astronautBody === 'moon', 'Moon astronaut state is missing');
  assert(moon.skyObserver === 'moon', `Moon sky used ${moon.skyObserver || 'no'} observer`);
  assertFiniteCamera(moon, 'Moon');
  await page.screenshot({ path: path.join(outputDir, 'moon.png'), fullPage: false });

  await page.click('#returnToEarthBtn');
  await poll(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.EARTH && !ctx.onMoon && !ctx.worldLoading &&
      ctx.earthResumePending !== true && ctx.earthSceneVisible === true &&
      !document.getElementById('loading')?.classList.contains('show') && (ctx.roads?.length || 0) > 0;
  }, null, 180000, 'Earth return from Moon');
  const earthAfterMoon = await readState(page);
  assertEarthRestored(earthAfterMoon, 'Moon return');
  await page.screenshot({ path: path.join(outputDir, 'earth-after-moon.png'), fullPage: false });

  const marsFlightStarted = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.startSpaceFlightToMars?.();
  });
  assert(marsFlightStarted, 'Earth-to-Mars space flight did not start');
  await poll(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.SPACE_FLIGHT && ctx.spaceFlight?.active && ctx.spaceFlight?.destination === 'mars';
  }, null, 30000, 'Mars space flight');
  await page.waitForTimeout(1200);
  const spaceToMars = await readState(page);
  assert(spaceToMars.space.asteroidBelt && spaceToMars.space.kuiperBelt, 'Mars flight lost a persistent belt layer');
  assertFiniteCamera(spaceToMars, 'Mars space flight');
  await page.screenshot({ path: path.join(outputDir, 'space-to-mars.png'), fullPage: false });

  const marsLandingStarted = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.forceSpaceFlightLanding?.('Mars') === true;
  });
  assert(marsLandingStarted, 'Mars landing sequence did not start');
  await poll(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.MARS && ctx.onMars && !ctx.spaceFlight?.active;
  }, null, 45000, 'Mars landing');
  await page.waitForTimeout(1000);
  const mars = await readState(page);
  assert(mars.mars.surfaceVisible && mars.mars.surfaceAttached && mars.mars.visibleObjects > 0, 'Mars scene ownership is incomplete');
  assert(mars.actor.vehicleKind === 'mars', `Mars rover is missing: ${JSON.stringify(mars.actor)}`);
  assert(mars.actor.astronautVisible && mars.actor.astronautBody === 'mars', 'Mars astronaut state is missing');
  assert(mars.skyObserver === 'mars', `Mars sky used ${mars.skyObserver || 'no'} observer`);
  assertFiniteCamera(mars, 'Mars');
  await page.screenshot({ path: path.join(outputDir, 'mars.png'), fullPage: false });

  await page.click('#marsReturnEarthBtn');
  await poll(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.EARTH && !ctx.onMars && !ctx.worldLoading &&
      ctx.earthResumePending !== true && ctx.earthSceneVisible === true &&
      !document.getElementById('loading')?.classList.contains('show') && (ctx.roads?.length || 0) > 0;
  }, null, 180000, 'Earth return from Mars');
  const earthAfterMars = await readState(page);
  assertEarthRestored(earthAfterMars, 'Mars return');
  await page.screenshot({ path: path.join(outputDir, 'earth-after-mars.png'), fullPage: false });

  assert(navigations === 1, `Planetary lifecycle reloaded the page (${navigations} navigations)`);
  assert(consoleErrors.length === 0, `Planetary lifecycle logged errors: ${consoleErrors.join(' | ')}`);
  const report = { ok: true, earthStart, spaceToMoon, moon, earthAfterMoon, spaceToMars, mars, earthAfterMars, navigations, consoleErrors };
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    sequence: [earthStart.env, spaceToMoon.env, moon.env, earthAfterMoon.env, spaceToMars.env, mars.env, earthAfterMars.env],
    actors: { moon: moon.actor, mars: mars.actor, restored: earthAfterMars.actor },
    navigations,
    consoleErrors
  }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
