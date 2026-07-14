import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const host = '127.0.0.1';
const outputDir = path.join(rootDir, 'output', 'playwright', 'title-planetary-launches');
const scenarios = [
  { mode: 'moon', toggle: '#moonLaunchToggle', env: 'MOON', destination: '' },
  { mode: 'space', toggle: '#spaceLaunchToggle', env: 'SPACE_FLIGHT', destination: 'moon' },
  { mode: 'mars', toggle: '#marsLaunchToggle', env: 'MARS', destination: '' }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCompleteSpaceCatalog(state, label) {
  const catalog = state.spaceCatalog || {};
  assert(catalog.groupAttached, `${label} did not attach the solar-system group`);
  assert(catalog.planets === 7, `${label} rendered ${catalog.planets || 0} of 7 non-Earth planets`);
  assert(catalog.namedAsteroids === 4, `${label} rendered ${catalog.namedAsteroids || 0} of 4 named asteroids`);
  assert(catalog.asteroidParticles === 3000, `${label} lost the 3,000-particle asteroid belt`);
  assert(catalog.kuiperParticles === 1800, `${label} lost the 1,800-particle Kuiper belt`);
  assert((catalog.spacecraft || 0) + (catalog.deepSpaceSpacecraft || 0) === 5, `${label} rendered an incomplete spacecraft catalog`);
  assert(catalog.galaxies === 8, `${label} rendered ${catalog.galaxies || 0} of 8 galaxies`);
}

function assertPlanetaryStarStyle(state, body, label) {
  const stars = state.starVisuals || {};
  assert(stars.observerBody === body, `${label} used ${stars.observerBody || 'no'} observer orientation`);
  assert(stars.brightVisible, `${label} hid the real bright-star catalog`);
  assert(stars.brightSize > 0 && stars.brightSize <= 1.5, `${label} used oversized ${stars.brightSize || 0}px stars`);
  assert(stars.brightVertexColors === false, `${label} retained unrealistic colored star points`);
  assert(stars.faintVisible === false, `${label} retained the synthetic faint-star layer`);
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
      spaceCatalog: globalThis.getWorldExplorerRuntimeDiagnostics?.().spaceCatalog || null,
      starVisuals: {
        observerBody: ctx.starField?.userData?.observerBody || '',
        brightVisible: !!brightStars?.visible,
        brightSize: Number(brightStars?.material?.size || 0),
        brightVertexColors: brightStars?.material?.vertexColors,
        faintVisible: !!faintStars?.visible
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
    await page.waitForSelector('#startBtn', { state: 'visible', timeout: 90000 });
    await waitForRuntime(page);
    await instrumentRoadLoads(page);
    await page.evaluate(() => {
      const panel = document.getElementById('proAccessPanel');
      if (panel) panel.hidden = true;
    });
    await page.click(scenario.toggle);
    await page.click('#startBtn');
    await waitForExpectedState(page, scenario);
    const state = await requireStableExpectedState(page, scenario);
    await settleVisualFrame(page);
    await page.screenshot({ path: path.join(outputDir, `${scenario.mode}.png`), fullPage: false });
    assert(state.env === scenario.env, `${scenario.mode} title launch ended in ${state.env || 'no environment'}`);
    assert(!scenario.destination || state.destination === scenario.destination, `${scenario.mode} title launch targeted ${state.destination || 'nothing'}`);
    assert(state.roadLoads === 0, `${scenario.mode} title launch loaded an Earth road world first`);
    assert(!state.fatal, `${scenario.mode} title launch showed a fatal renderer error`);
    if (scenario.mode === 'space') assertCompleteSpaceCatalog(state, 'Initial Space launch');
    if (scenario.mode === 'mars') assert(state.onMars && !state.spaceFlightActive, 'Mars title launch did not land directly on Mars');
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

      await page.click('#mainMenuBtn');
      const titleAfterEarth = await readState(page);
      assert(titleAfterEarth.env === 'EARTH', 'Main Menu did not normalize the returned Earth environment');
      assert(!titleAfterEarth.spaceFlightActive, 'Main Menu retained an active flight before Mars launch');
      await page.click('#marsLaunchToggle');
      await page.click('#startBtn');
      const marsScenario = scenarios.find((entry) => entry.mode === 'mars');
      await waitForExpectedState(page, marsScenario);
      const marsAfterMoon = await requireStableExpectedState(page, marsScenario);
      await settleVisualFrame(page);
      await page.screenshot({ path: path.join(outputDir, 'moon-earth-mars.png'), fullPage: false });
      assert(marsAfterMoon.onMars && !marsAfterMoon.spaceFlightActive, 'Mars launch after Moon return did not land on Mars');
      assertPlanetaryStarStyle(marsAfterMoon, 'mars', 'Mars launch after Moon return');
      assert(!marsAfterMoon.fatal, 'Mars launch after Moon return showed a fatal renderer error');
      assert(mainFrameNavigations === 1, 'Mars launch after Moon return reloaded the page');

      await page.click('#mainMenuBtn');
      await page.click('#spaceLaunchToggle');
      await page.click('#startBtn');
      const spaceScenario = scenarios.find((entry) => entry.mode === 'space');
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

      await page.click('#mainMenuBtn');
      await page.click('#spaceLaunchToggle');
      await page.click('#startBtn');
      await waitForExpectedState(page, spaceScenario);
      const repeatedSpace = await requireStableExpectedState(page, spaceScenario);
      assertCompleteSpaceCatalog(repeatedSpace, 'Repeated Space launch');
      const reuse = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return {
          renderer: ctx.spaceFlight?.renderer === globalThis.__titlePlanetarySpaceRenderer,
          scene: ctx.spaceFlight?.scene === globalThis.__titlePlanetarySpaceScene
        };
      });
      assert(reuse.renderer, 'Repeated Space launch recreated the renderer');
      assert(reuse.scene, 'Repeated Space launch discarded the complete space scene');
      repeatedSpace.reuse = reuse;
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
      const titleAfterCancelledLanding = await readState(page);
      assert(titleAfterCancelledLanding.env === 'EARTH', 'Main Menu left the cancelled flight environment active');
      assert(!titleAfterCancelledLanding.spaceFlightActive, 'Main Menu retained the cancelled flight runtime');
      await page.click('#marsLaunchToggle');
      await page.click('#startBtn');
      const marsScenario = scenarios.find((entry) => entry.mode === 'mars');
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
    return { ...state, elapsedLimitMs: 20000, earthReturn, mainFrameNavigations };
  } finally {
    await context.close();
  }
}

await mkdirp(outputDir);
const server = await startServer({
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
  const baseUrl = `http://${host}:${server.port}`;
  const report = {};
  for (const scenario of scenarios) {
    report[scenario.mode] = await runScenario(browser, baseUrl, scenario);
  }
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify({ ok: true, report }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
