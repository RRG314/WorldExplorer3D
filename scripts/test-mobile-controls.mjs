import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'mobile-controls');
const host = '127.0.0.1';
const ports = [4230, 4231, 4232, 4233];

const devices = {
  iphone: {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
  },
  android: {
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36'
  },
  iphoneLandscape: {
    viewport: { width: 844, height: 390 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
  }
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function contextOptions(device) {
  return { ...device, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
}

async function waitForRuntime(page) {
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return typeof ctx?.loadRoads === 'function' &&
      typeof ctx?.setTravelMode === 'function' &&
      typeof ctx?.switchEnv === 'function' &&
      !!ctx?.ENV?.EARTH &&
      ctx.runtimeReady === true &&
      globalThis.__WE3D_RUNTIME_READY__ === true;
  }, null, { timeout: 90000 });
}

async function selectBaltimoreAndExplore(page) {
  await page.locator('#globeCustomLat').fill('39.2904');
  await page.locator('#globeCustomLon').fill('-76.6122');
  await page.locator('#globeSelectorStartBtn').tap();
}

async function assertTitleTouch(page, baseUrl) {
  await page.goto(`${baseUrl}/app/?mobile-title=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForRuntime(page);
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 90000 });
  assert(await page.locator('#proAccessPanel').evaluate((el) => el.hidden), 'Touch title was blocked by the automatic donation panel');
  await page.locator('.globe-hub-tools [data-globe-destination="settings"]').tap();
  assert(await page.locator('#tab-settings').evaluate((el) => el.classList.contains('active')), 'Settings panel ignored an iPhone tap');
  await page.locator('#globeHubOverlayCloseBtn').tap();
  await selectBaltimoreAndExplore(page);
  await page.waitForFunction(() => document.getElementById('titleScreen')?.classList.contains('hidden'), null, { timeout: 15000 });
}

async function bootstrapEarth(page, baseUrl) {
  await page.goto(`${baseUrl}/app/?mobile-runtime=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForRuntime(page);
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 90000 });
  await selectBaltimoreAndExplore(page);
  await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 15000 });
  try {
    const deadline = Date.now() + 90000;
    let consecutiveReadySamples = 0;
    while (Date.now() < deadline && consecutiveReadySamples < 6) {
      const ready = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const loading = document.getElementById('loading');
        return !!loading && ctx.gameStarted && !ctx.worldLoading && (ctx.roads?.length || 0) > 300 &&
          document.getElementById('titleScreen')?.classList.contains('hidden') &&
          !loading.classList.contains('show') && getComputedStyle(loading).display === 'none';
      });
      consecutiveReadySamples = ready ? consecutiveReadySamples + 1 : 0;
      if (consecutiveReadySamples < 6) await page.waitForTimeout(250);
    }
    if (consecutiveReadySamples < 6) throw new Error('Earth runtime did not remain interactive for six consecutive readiness samples');
  } catch (error) {
    const diagnostics = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return {
        worldLoading: !!ctx.worldLoading,
        roads: Number(ctx.roads?.length || 0),
        buildings: Number(ctx.buildings?.length || 0),
        titleHidden: document.getElementById('titleScreen')?.classList.contains('hidden'),
        loadingVisible: document.getElementById('loading')?.classList.contains('show'),
        loadMetrics: ctx.perfStats?.lastLoad || ctx.lastLoadMetrics || null
      };
    }).catch(() => ({ unavailable: 'renderer main thread did not answer diagnostics' }));
    throw new Error(`Mobile Earth bootstrap exceeded its acceptance budget: ${JSON.stringify(diagnostics)} (${error.message})`);
  }
}

async function readMode(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      runtime: ctx.getCurrentTravelMode?.(),
      controls: document.getElementById('mobileTouchControls')?.dataset.mode || '',
      visible: document.getElementById('mobileTouchControls')?.classList.contains('show')
    };
  });
}

async function switchMode(page, selector, expected) {
  await page.locator('#exploreBtn').tap();
  const geometry = await page.evaluate(() => {
    const dock = document.getElementById('floatMenuContainer').getBoundingClientRect();
    const panel = document.querySelector('#exploreMenu .floatItems').getBoundingClientRect();
    return { dockTop: dock.top, panelBottom: panel.bottom, panelLeft: panel.left, panelRight: panel.right };
  });
  assert(geometry.panelBottom <= geometry.dockTop, `Mode sheet overlaps the command dock: ${JSON.stringify(geometry)}`);
  assert(geometry.panelLeft >= 0 && geometry.panelRight <= await page.evaluate(() => innerWidth), 'Mode sheet extends outside the viewport');
  await page.locator(selector).tap();
  await page.waitForTimeout(expected === 'plane' ? 700 : 400);
  const mode = await readMode(page);
  assert(mode.runtime === expected && mode.visible, `${selector} resolved to ${JSON.stringify(mode)}`);
}

async function assertDockHitTargets(page) {
  const failures = await page.evaluate(() => [...document.querySelectorAll('.floatBtn')].flatMap((button) => {
    const rect = button.getBoundingClientRect();
    const rawHit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const hit = rawHit?.closest('.floatBtn');
    const loading = document.getElementById('loading');
    return hit === button ? [] : [{
      button: button.id,
      hit: hit?.id || null,
      coveringElement: rawHit ? { id: rawHit.id || null, className: String(rawHit.className || ''), tagName: rawHit.tagName } : null,
      loading: loading ? {
        className: loading.className,
        display: getComputedStyle(loading).display,
        text: document.getElementById('loadText')?.textContent || ''
      } : null,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight }
    }];
  }));
  assert(failures.length === 0, `Mobile dock has blocked hit targets: ${JSON.stringify(failures)}`);
}

async function assertHeldMovement(page) {
  const button = page.locator('#mobileMoveUp');
  const box = await button.boundingBox();
  assert(box, 'Mobile movement control is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const held = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!ctx.keys?.ArrowUp && document.getElementById('mobileMoveUp')?.classList.contains('active');
  });
  await page.mouse.up();
  await page.waitForTimeout(60);
  const released = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !ctx.keys?.ArrowUp && !document.getElementById('mobileMoveUp')?.classList.contains('active');
  });
  assert(held && released, `Mobile held input did not press/release cleanly (${held}/${released})`);
}

async function assertDockMenus(page) {
  const cases = [
    ['#travelBtn', 'travelMenu'],
    ['#gameBtn', 'gameMenu'],
    ['#realEstateFloatBtn', 'realEstateMenu'],
    ['#multiplayerBtn', 'multiplayerMenu']
  ];
  for (const [selector, menuId] of cases) {
    await page.locator(selector).tap();
    const state = await page.evaluate((id) => {
      const dock = document.getElementById('floatMenuContainer').getBoundingClientRect();
      const menu = document.getElementById(id);
      const panel = menu?.querySelector('.floatItems')?.getBoundingClientRect();
      return { open: !!menu?.classList.contains('open'), panelBottom: panel?.bottom || 0, dockTop: dock.top };
    }, menuId);
    assert(state.open && state.panelBottom <= state.dockTop, `${menuId} did not open above the dock: ${JSON.stringify(state)}`);
    await page.locator(selector).tap();
  }
}

async function assertMainMenuReturn(page) {
  await page.locator('#mainMenuBtn').tap();
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.globe-hub-tools [data-globe-destination="settings"]').tap();
  assert(await page.locator('#tab-settings').evaluate((el) => el.classList.contains('active')), 'Globe hub controls stopped responding after Main Menu');
}

async function assertLandscapeShell(browser, baseUrl) {
  const context = await browser.newContext(contextOptions(devices.iphoneLandscape));
  const page = await context.newPage();
  await bootstrapEarth(page, baseUrl);
  await assertDockHitTargets(page);
  await page.locator('#exploreBtn').tap();
  await page.locator('#exploreMenu.open').waitFor({ state: 'attached', timeout: 10000 });
  const tutorialHidden = await page.evaluate(() => {
    const card = document.getElementById('tutorialHintCard');
    return !card || getComputedStyle(card).display === 'none';
  });
  assert(tutorialHidden, 'Landscape Explore menu did not suppress the tutorial card');
  await page.screenshot({ path: path.join(outputDir, 'iphone-landscape.png') });
  await context.close();
}

async function assertMobileEnvironmentShell(browser, baseUrl, spec) {
  const context = await browser.newContext(contextOptions(devices.android));
  const page = await context.newPage();
  await page.goto(`${baseUrl}/app/?mobile-environment=${spec.id}-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForRuntime(page);
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 90000 });
  if (spec.boat) {
    await page.locator('#globeCustomLat').fill('30');
    await page.locator('#globeCustomLon').fill('-40');
    await page.locator('#globeSelectorStartBtn').tap();
  } else {
    await page.locator(spec.selector).tap();
  }
  await page.waitForFunction(async ({ expectedEnv, boat }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (boat) return ctx.getEnv?.() === ctx.ENV?.EARTH && ctx.boatMode?.active && ctx.boatMode?.mesh?.visible && !ctx.worldLoading;
    return ctx.getEnv?.() === ctx.ENV?.[expectedEnv] && (
      expectedEnv === 'SPACE_FLIGHT' ? ctx.spaceFlight?.active :
      expectedEnv === 'OCEAN' ? ctx.oceanMode?.active :
      expectedEnv === 'MOON' ? ctx.onMoon :
      expectedEnv === 'MARS' ? ctx.onMars : false
    );
  }, { expectedEnv: spec.env, boat: !!spec.boat }, { timeout: spec.boat ? 180000 : 90000 });
  {
    const deadline = Date.now() + 90000;
    let stableSamples = 0;
    while (Date.now() < deadline && stableSamples < 6) {
      const stable = await page.evaluate(async ({ expectedEnv, boat }) => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const loading = document.getElementById('loading');
        const ownerReady = boat
          ? ctx.getEnv?.() === ctx.ENV?.EARTH && ctx.boatMode?.active && ctx.boatMode?.mesh?.visible
          : ctx.getEnv?.() === ctx.ENV?.[expectedEnv] && (
            expectedEnv === 'SPACE_FLIGHT' ? ctx.spaceFlight?.active :
            expectedEnv === 'OCEAN' ? ctx.oceanMode?.active :
            expectedEnv === 'MOON' ? ctx.onMoon :
            expectedEnv === 'MARS' ? ctx.onMars : false
          );
        return ownerReady && !ctx.worldLoading && !loading?.classList.contains('show') && getComputedStyle(loading).display === 'none';
      }, { expectedEnv: spec.env, boat: !!spec.boat });
      stableSamples = stable ? stableSamples + 1 : 0;
      if (stableSamples < 6) await page.waitForTimeout(250);
    }
    assert(stableSamples === 6, `${spec.id} endpoint did not remain ready for six consecutive samples`);
  }
  await page.waitForTimeout(900);
  const state = await page.evaluate(async ({ expectedEnv, boat }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const controls = document.getElementById('mobileTouchControls');
    const visibleCanvases = [...document.querySelectorAll('canvas')].filter((canvas) => getComputedStyle(canvas).display !== 'none');
    return {
      env: ctx.getEnv?.(),
      boatActive: !!ctx.boatMode?.active,
      travelMode: ctx.getCurrentTravelMode?.() || '',
      boatSnapshot: ctx.getBoatModeSnapshot?.() || null,
      loading: !!ctx.worldLoading,
      controlsVisible: !!controls?.classList.contains('show'),
      controlsMode: controls?.dataset.mode || '',
      visibleCanvases: visibleCanvases.length,
      viewportFits: document.documentElement.scrollWidth <= innerWidth + 1,
      fatal: /Startup failed|Renderer Creation Failed|Failed to create 3D renderer/i.test(document.body.innerText),
      expectedEnv,
      boat
    };
  }, { expectedEnv: spec.env, boat: !!spec.boat });
  await page.screenshot({ path: path.join(outputDir, `android-${spec.id}.png`) });
  assert(state.env === spec.env, `${spec.id} resolved to ${state.env}`);
  assert(!spec.boat || state.boatActive, `${spec.id} did not retain Boat ownership: ${JSON.stringify(state)}`);
  assert(state.controlsVisible, `${spec.id} did not expose mobile controls`);
  assert(state.visibleCanvases >= 1, `${spec.id} has no visible canvas`);
  assert(state.viewportFits, `${spec.id} overflows the mobile viewport`);
  assert(!state.fatal, `${spec.id} displayed a renderer failure`);
  await context.close();
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const hostedBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
  const server = hostedBaseUrl ? null : await startStaticRootServer({ rootDir, host, candidatePorts: ports });
  const baseUrl = hostedBaseUrl || `http://${host}:${server.port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const environmentFilter = String(process.env.MOBILE_CONTROL_SCENARIO || '').trim().toLowerCase();
  try {
    if (!environmentFilter) {
    console.log('[mobile-controls] iPhone title touch');
    const iphone = await browser.newContext(contextOptions(devices.iphone));
    const iphonePage = await iphone.newPage();
    iphonePage.on('pageerror', (error) => errors.push(`iphone: ${error.message}`));
    await assertTitleTouch(iphonePage, baseUrl);
    await iphone.close();

    console.log('[mobile-controls] Android Earth bootstrap and mode controls');
    const android = await browser.newContext(contextOptions(devices.android));
    const androidPage = await android.newPage();
    androidPage.on('pageerror', (error) => errors.push(`android: ${error.message}`));
    await bootstrapEarth(androidPage, baseUrl);
    await androidPage.screenshot({ path: path.join(outputDir, 'android-bootstrap.png') });
    await assertDockHitTargets(androidPage);
    await switchMode(androidPage, '#fDriving', 'drive');
    await assertHeldMovement(androidPage);
    await androidPage.screenshot({ path: path.join(outputDir, 'android-drive.png') });
    await switchMode(androidPage, '#fDrone', 'drone');
    await assertHeldMovement(androidPage);
    await androidPage.screenshot({ path: path.join(outputDir, 'android-drone.png') });
    await switchMode(androidPage, '#fPlane', 'plane');
    await assertHeldMovement(androidPage);
    await androidPage.screenshot({ path: path.join(outputDir, 'android-plane.png') });
    await switchMode(androidPage, '#fWalk', 'walk');
    await assertHeldMovement(androidPage);
    await androidPage.screenshot({ path: path.join(outputDir, 'android-walk.png') });
    await assertDockMenus(androidPage);
    await androidPage.screenshot({ path: path.join(outputDir, 'android-portrait.png') });
    await assertMainMenuReturn(androidPage);
    await android.close();

    console.log('[mobile-controls] iPhone landscape Earth bootstrap');
    await assertLandscapeShell(browser, baseUrl);
    }

    const environments = [
      { id: 'boat', env: 'EARTH', boat: true },
      { id: 'ocean', env: 'OCEAN', selector: '#globeSelectorOceanBtn' },
      { id: 'space', env: 'SPACE_FLIGHT', selector: '#globeSelectorSpaceBtn' },
      { id: 'moon', env: 'MOON', selector: '#globeSelectorMoonBtn' },
      { id: 'mars', env: 'MARS', selector: '#globeSelectorMarsBtn' }
    ].filter((environment) => !environmentFilter || environment.id === environmentFilter);
    for (const environment of environments) {
      console.log(`[mobile-controls] Android ${environment.id} endpoint`);
      await assertMobileEnvironmentShell(browser, baseUrl, environment);
    }
  } finally {
    await browser.close();
    await server?.close();
  }
  assert(errors.length === 0, `Mobile page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    ok: true,
    devices: ['iPhone portrait', 'Android portrait', 'iPhone landscape'],
    mobileEnvironmentEndpoints: ['boat', 'ocean', 'space', 'moon', 'mars']
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
