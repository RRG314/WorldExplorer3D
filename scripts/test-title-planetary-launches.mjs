import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const host = '127.0.0.1';
const externalBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
const outputDir = path.join(rootDir, 'output', 'playwright', 'title-planetary-launches');
const scenarioCatalog = [
  { mode: 'moon', shortcut: '#globeSelectorMoonBtn', env: 'MOON', destination: '' },
  { mode: 'space', shortcut: '#globeSelectorSpaceBtn', env: 'SPACE_FLIGHT', destination: 'moon' },
  { mode: 'mars', shortcut: '#globeSelectorMarsBtn', env: 'MARS', destination: '' }
];
const requestedScenario = String(process.env.TEST_SCENARIO || '').trim().toLowerCase();
const scenarios = requestedScenario
  ? scenarioCatalog.filter((scenario) => scenario.mode === requestedScenario)
  : scenarioCatalog;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCompleteSpaceCatalog(state, label) {
  const catalog = state.spaceCatalog || {};
  assert(catalog.groupAttached, `${label} did not attach the solar-system group`);
  assert(catalog.planets === 7, `${label} rendered ${catalog.planets || 0} of 7 non-Earth planets`);
  assert(catalog.namedAsteroids === 4, `${label} rendered ${catalog.namedAsteroids || 0} of 4 named asteroids`);
  assert(catalog.asteroidParticles === 3000, `${label} lost the 3,000-particle asteroid belt`);
  assert(catalog.kuiperParticles === 3600, `${label} lost the 3,600-particle Kuiper belt`);
  assert((catalog.spacecraft || 0) + (catalog.deepSpaceSpacecraft || 0) === 5, `${label} rendered an incomplete spacecraft catalog`);
  assert(catalog.galaxies === 8, `${label} rendered ${catalog.galaxies || 0} of 8 galaxies`);
}

function assertPlanetaryStarStyle(state, body, label) {
  const stars = state.starVisuals || {};
  assert(stars.observerBody === body, `${label} used ${stars.observerBody || 'no'} observer orientation`);
  assert(stars.brightVisible, `${label} hid the real bright-star catalog`);
  assert(stars.brightSize >= 4 && stars.brightSize <= 6.5, `${label} used unreadable ${stars.brightSize || 0}px bright stars`);
  assert(stars.brightVertexColors === false, `${label} retained unrealistic colored star points`);
  assert(stars.brightRoundSprite, `${label} lost the round bright-star sprite`);
  assert(stars.faintVisible, `${label} hid the background star field`);
  assert(stars.faintSize >= 3 && stars.faintSize <= 4.2, `${label} used unreadable ${stars.faintSize || 0}px background stars`);
  assert(stars.faintRoundSprite, `${label} lost the round background-star sprite`);
}

function assertMarsSceneOwned(state, label) {
  const scene = state.sceneOwnership || {};
  assert(state.env === 'MARS' && state.onMars, `${label} did not retain Mars runtime ownership`);
  assert(scene.earthVisible === false, `${label} left the Earth scene visible`);
  assert(scene.marsSurfaceVisible && scene.marsSurfaceAttached, `${label} detached or hid the Mars surface`);
  assert(scene.visibleMarsObjects > 0, `${label} hid the Mars world objects`);
}

function isTransientNetworkError(message = '') {
  return /net::ERR_(ABORTED|HTTP2_PROTOCOL_ERROR)|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(message);
}

async function waitForRuntime(page) {
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!(
      typeof ctx?.loadRoads === 'function' &&
      typeof ctx?.switchEnv === 'function' &&
      typeof ctx?.setTitleLocationMode === 'function'
    );
  }, null, { timeout: 90000 });
}

async function instrumentRoadLoads(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const original = ctx.loadRoads;
    ctx.__titlePlanetaryRoadLoadCount = 0;
    ctx.loadRoads = (...args) => {
      ctx.__titlePlanetaryRoadLoadCount++;
      return original(...args);
    };
  });
}

async function readState(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const brightStars = ctx.starField?.getObjectByName?.('Bright Star Catalog') || null;
    const faintStars = ctx.starField?.getObjectByName?.('Faint Star Background') || null;
    return {
      env: ctx.getEnv?.() || '',
      destination: ctx.spaceFlight?.destination || '',
      nearestBody: ctx.spaceFlight?._nearestBody?.name || '',
      roadLoads: Number(ctx.__titlePlanetaryRoadLoadCount || 0),
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      onMoon: !!ctx.onMoon,
      onMars: !!ctx.onMars,
      spaceFlightActive: !!ctx.spaceFlight?.active,
      spaceOverview: {
        active: !!ctx.spaceFlight?.overviewMode,
        mode: ctx.spaceFlight?.overviewMode || '',
        cameraDistance: Number(ctx.spaceFlight?.camera?.position?.length?.() || 0)
      },
      sceneOwnership: {
        earthVisible: !!ctx.earthSceneVisible,
        marsSurfaceVisible: !!ctx.marsSurface?.visible,
        marsSurfaceAttached: ctx.marsSurface?.parent === ctx.scene,
        visibleMarsObjects: (ctx.marsObjects || []).filter((object) => object?.visible && object?.parent === ctx.scene).length
      },
      spaceCatalog: globalThis.getWorldExplorerRuntimeDiagnostics?.().spaceCatalog || null,
      starVisuals: {
        observerBody: ctx.starField?.userData?.observerBody || '',
        brightVisible: !!brightStars?.visible,
        brightSize: Number(brightStars?.material?.size || 0),
        brightVertexColors: brightStars?.material?.vertexColors,
        brightRoundSprite: !!brightStars?.material?.map,
        faintVisible: !!faintStars?.visible,
        faintSize: Number(faintStars?.material?.size || 0),
        faintRoundSprite: !!faintStars?.material?.map
      },
      fatal: /Startup failed|Renderer Creation Failed|Failed to create 3D renderer/i.test(document.body.innerText)
    };
  });
}

async function waitForExpectedState(page, scenario, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let state = await readState(page);
  while (Date.now() < deadline) {
    const destinationReady = !scenario.destination || state.destination === scenario.destination;
    if (state.env === scenario.env && destinationReady) return state;
    await page.waitForTimeout(250);
    state = await readState(page);
  }
  const destinationReady = !scenario.destination || state.destination === scenario.destination;
  if (state.env === scenario.env && destinationReady) return state;
  throw new Error(`${scenario.mode} title launch timed out: ${JSON.stringify(state)}`);
}

async function requireStableExpectedState(page, scenario, stabilityMs = 4000) {
  const deadline = Date.now() + stabilityMs;
  let state = await readState(page);
  while (Date.now() < deadline) {
    const destinationReady = !scenario.destination || state.destination === scenario.destination;
    assert(
      state.env === scenario.env && destinationReady,
      `${scenario.mode} title launch changed during its stability window: ${JSON.stringify(state)}`
    );
    await page.waitForTimeout(250);
    state = await readState(page);
  }
  return state;
}

async function waitForEarthReturn(page, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let state = await readState(page);
  while (Date.now() < deadline) {
    if (state.env === 'EARTH' && !state.onMoon && state.roads > 0) return state;
    await page.waitForTimeout(250);
    state = await readState(page);
  }
  throw new Error(`Moon return to Earth timed out: ${JSON.stringify(state)}`);
}

async function settleVisualFrame(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(500);
}

async function waitForEarthVisual(page) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading');
    const canvas = document.querySelector('canvas:not(#spaceFlightCanvas)');
    return !loading?.classList.contains('show') && !!canvas && getComputedStyle(canvas).display !== 'none';
  }, null, { timeout: 90000 });
  await settleVisualFrame(page);
}

async function openMainMenu(page) {
  await page.evaluate(() => document.getElementById('mainMenuBtn')?.click());
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
}

async function launchFromHub(page, selector) {
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
  await page.click(selector);
}

async function runScenario(browser, baseUrl, scenario) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const consoleErrors = [];
  let mainFrameNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations++;
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !isTransientNetworkError(message.text())) consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${baseUrl}/app/?title-launch=${scenario.mode}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForRuntime(page);
    await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 90000 });
    await instrumentRoadLoads(page);
    await page.evaluate(() => {
      const panel = document.getElementById('proAccessPanel');
      if (panel) panel.hidden = true;
    });
    await launchFromHub(page, scenario.shortcut);
    await waitForExpectedState(page, scenario);
    const state = await requireStableExpectedState(page, scenario);
    await settleVisualFrame(page);
    await page.screenshot({ path: path.join(outputDir, `${scenario.mode}.png`), fullPage: false });
    assert(state.env === scenario.env, `${scenario.mode} title launch ended in ${state.env || 'no environment'}`);
    assert(!scenario.destination || state.destination === scenario.destination, `${scenario.mode} title launch targeted ${state.destination || 'nothing'}`);
    assert(state.roadLoads === 0, `${scenario.mode} title launch loaded an Earth road world first`);
    assert(!state.fatal, `${scenario.mode} title launch showed a fatal renderer error`);
    if (scenario.mode === 'space') {
      assertCompleteSpaceCatalog(state, 'Initial Space launch');
      assert(!state.spaceOverview.active, 'Initial Space launch did not open in controllable flight view');
      const beltPresentation = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const scene = ctx.spaceFlight?.scene;
        return {
          asteroidBelt: !!scene?.getObjectByName?.('asteroidBelt') && scene.getObjectByName('asteroidBelt').visible !== false,
          asteroidBand: !!scene?.getObjectByName?.('asteroidBeltBand'),
          kuiperBelt: !!scene?.getObjectByName?.('kuiperBelt') && scene.getObjectByName('kuiperBelt').visible !== false,
          kuiperBand: !!scene?.getObjectByName?.('kuiperBeltBand'),
          mapButton: !!document.getElementById('solarSystemOverview'),
          radar: !!document.getElementById('solarSystemRadar')
        };
      });
      assert(beltPresentation.asteroidBelt && beltPresentation.asteroidBand, 'Asteroid belt is not a persistent Space scene layer');
      assert(beltPresentation.kuiperBelt && beltPresentation.kuiperBand, 'Kuiper belt is not a persistent Space scene layer');
      assert(!beltPresentation.mapButton && !beltPresentation.radar, 'Space still exposes a separate belt map control');
    }
    if (scenario.mode === 'mars') assert(state.onMars && !state.spaceFlightActive, 'Mars title launch did not land directly on Mars');
    if (scenario.mode === 'mars') assertMarsSceneOwned(state, 'Initial Mars title launch');
    if (scenario.mode === 'moon' || scenario.mode === 'mars') assertPlanetaryStarStyle(state, scenario.mode, `${scenario.mode} title launch`);
    assert(consoleErrors.length === 0, `${scenario.mode} title launch logged console errors: ${consoleErrors.join(' | ')}`);
    let earthReturn = null;
    if (scenario.mode === 'moon') {
      await page.click('#returnToEarthBtn');
      earthReturn = await waitForEarthReturn(page);
      await settleVisualFrame(page);
      await page.screenshot({ path: path.join(outputDir, 'moon-return-earth.png'), fullPage: false });
      assert(earthReturn.roads > 0, 'Moon return did not initialize the selected Earth world');
      assert(mainFrameNavigations === 1, 'Moon return reloaded the page instead of restoring Earth in place');
      assert(!earthReturn.fatal, 'Moon return showed a fatal renderer error');

      await openMainMenu(page);
      const titleAfterEarth = await readState(page);
      assert(titleAfterEarth.env === 'EARTH', 'Main Menu did not normalize the returned Earth environment');
      assert(!titleAfterEarth.spaceFlightActive, 'Main Menu retained an active flight before Mars launch');
      await launchFromHub(page, '#globeSelectorMarsBtn');
      const marsScenario = scenarioCatalog.find((entry) => entry.mode === 'mars');
      await waitForExpectedState(page, marsScenario);
      const marsAfterMoon = await requireStableExpectedState(page, marsScenario);
      await settleVisualFrame(page);
      await page.screenshot({ path: path.join(outputDir, 'moon-earth-mars.png'), fullPage: false });
      assert(marsAfterMoon.onMars && !marsAfterMoon.spaceFlightActive, 'Mars launch after Moon return did not land on Mars');
      assertPlanetaryStarStyle(marsAfterMoon, 'mars', 'Mars launch after Moon return');
      assert(!marsAfterMoon.fatal, 'Mars launch after Moon return showed a fatal renderer error');
      assert(mainFrameNavigations === 1, 'Mars launch after Moon return reloaded the page');

      await openMainMenu(page);
      await launchFromHub(page, '#globeSelectorSpaceBtn');
      const spaceScenario = scenarioCatalog.find((entry) => entry.mode === 'space');
      await waitForExpectedState(page, spaceScenario);
      const spaceAfterMars = await requireStableExpectedState(page, spaceScenario);
      assertCompleteSpaceCatalog(spaceAfterMars, 'Space launch after Mars');
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        globalThis.__titlePlanetarySpaceRenderer = ctx.spaceFlight?.renderer || null;
        globalThis.__titlePlanetarySpaceScene = ctx.spaceFlight?.scene || null;
      });
      assert(!spaceAfterMars.fatal, 'Space relaunch after Mars showed a fatal renderer error');
      assert(mainFrameNavigations === 1, 'Space relaunch after Mars reloaded the page');

      await openMainMenu(page);
      await launchFromHub(page, '#globeSelectorSpaceBtn');
      await waitForExpectedState(page, spaceScenario);
      const repeatedSpace = await requireStableExpectedState(page, spaceScenario);
      assertCompleteSpaceCatalog(repeatedSpace, 'Repeated Space launch');
      const replacement = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return {
          renderer: ctx.spaceFlight?.renderer === globalThis.__titlePlanetarySpaceRenderer,
          scene: ctx.spaceFlight?.scene === globalThis.__titlePlanetarySpaceScene
        };
      });
      assert(!replacement.renderer, 'Repeated Space launch retained the exited renderer');
      assert(!replacement.scene, 'Repeated Space launch retained the exited scene');
      repeatedSpace.replacement = replacement;
      spaceAfterMars.repeatedSpace = repeatedSpace;
      marsAfterMoon.spaceAfterMars = spaceAfterMars;
      earthReturn.marsAfterMoon = marsAfterMoon;
    }
    if (scenario.mode === 'space') {
      const staleLandingStarted = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.forceSpaceFlightLanding?.('Earth') === true;
      });
      assert(staleLandingStarted, 'Could not start the stale-landing cancellation regression scenario');
      await page.click('#mainMenuBtn');
      await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
      const titleAfterCancelledLanding = await readState(page);
      assert(titleAfterCancelledLanding.env === 'EARTH', 'Main Menu left the cancelled flight environment active');
      assert(!titleAfterCancelledLanding.spaceFlightActive, 'Main Menu retained the cancelled flight runtime');
      await launchFromHub(page, '#globeSelectorMarsBtn');
      const marsScenario = scenarioCatalog.find((entry) => entry.mode === 'mars');
      await waitForExpectedState(page, marsScenario);
      const marsAfterCancelledLanding = await requireStableExpectedState(page, marsScenario, 9500);
      await settleVisualFrame(page);
      await page.screenshot({ path: path.join(outputDir, 'cancelled-earth-landing-mars.png'), fullPage: false });
      assert(
        marsAfterCancelledLanding.env === 'MARS' && marsAfterCancelledLanding.onMars && !marsAfterCancelledLanding.spaceFlightActive,
        'An exited flight landing sequence overwrote the direct Mars arrival'
      );
      assertPlanetaryStarStyle(marsAfterCancelledLanding, 'mars', 'Mars arrival after cancelled flight');
      state.marsAfterCancelledLanding = marsAfterCancelledLanding;
    }
    if (scenario.mode === 'mars') {
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const originalLoadRoads = ctx.loadRoads;
        ctx.loadRoads = async (...args) => {
          await new Promise((resolve) => setTimeout(resolve, 1800));
          return originalLoadRoads(...args);
        };
        void ctx.returnFromMars?.();
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => document.getElementById('mainMenuBtn')?.click());
      await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
      await launchFromHub(page, '#globeSelectorMarsBtn');
      await waitForExpectedState(page, scenario);
      const marsAfterCancelledReturn = await requireStableExpectedState(page, scenario, 5000);
      assertMarsSceneOwned(marsAfterCancelledReturn, 'Mars relaunch after a cancelled return');
      await settleVisualFrame(page);
      await page.screenshot({ path: path.join(outputDir, 'cancelled-mars-return-mars.png'), fullPage: false });

      await page.click('#marsReturnEarthBtn');
      const earthAfterMarsReturn = await waitForEarthReturn(page);
      assert(earthAfterMarsReturn.sceneOwnership.earthVisible, 'Return to Earth did not restore Earth scene ownership');
      assert(!earthAfterMarsReturn.sceneOwnership.marsSurfaceVisible, 'Return to Earth left the Mars surface visible');
      await waitForEarthVisual(page);
      await page.screenshot({ path: path.join(outputDir, 'mars-return-earth.png'), fullPage: false });
      state.marsAfterCancelledReturn = marsAfterCancelledReturn;
      state.earthAfterMarsReturn = earthAfterMarsReturn;
    }
    return { ...state, elapsedLimitMs: 20000, earthReturn, mainFrameNavigations };
  } finally {
    await context.close();
  }
}

await mkdirp(outputDir);
const server = externalBaseUrl ? null : await startServer({
  rootDir,
  host,
  candidatePorts: [4212, 4213, 4214, 4215]
});
const headed = process.env.WE3D_HEADED === '1';
const browserChannel = String(process.env.WE3D_BROWSER_CHANNEL || '').trim();
const browser = await chromium.launch({
  headless: !headed,
  ...(browserChannel ? { channel: browserChannel } : {}),
  args: headed ? [] : ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});

try {
  const baseUrl = externalBaseUrl || `http://${host}:${server.port}`;
  const report = {};
  for (const scenario of scenarios) {
    report[scenario.mode] = await runScenario(browser, baseUrl, scenario);
  }
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify({ ok: true, report }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, report }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
