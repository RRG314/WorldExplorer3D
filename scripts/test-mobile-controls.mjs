import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'mobile-controls');
const host = '127.0.0.1';
const ports = [4230, 4231, 4232, 4233];
const browserName = process.env.MOBILE_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browserType = browserName === 'webkit' ? webkit : chromium;
const headed = process.env.MOBILE_HEADED === '1';
const browserChannel = String(process.env.MOBILE_BROWSER_CHANNEL || '').trim();

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
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
  const ready = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return typeof ctx?.loadRoads === 'function' &&
      typeof ctx?.setTravelMode === 'function' &&
      typeof ctx?.switchEnv === 'function' &&
      !!ctx?.ENV?.EARTH &&
      ctx.runtimeReady === true &&
      globalThis.__WE3D_RUNTIME_READY__ === true;
  });
  assert(ready, 'Runtime-ready event fired before required mobile APIs were installed.');
}

async function selectBaltimoreAndExplore(page) {
  await page.locator('#globeCustomLat').fill('39.2904');
  await page.locator('#globeCustomLon').fill('-76.6122');
  await page.locator('#globeSelectorStartBtn').tap();
}

async function assertTitleTouch(page, baseUrl) {
  await page.goto(`${baseUrl}/app/?mobile-title=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForRuntime(page);
  const lifecycle = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (typeof ctx.getLifecycleRegistrySnapshot !== 'function') return null;
    const scopes = ctx.getLifecycleRegistrySnapshot().scopes;
    const owners = Object.fromEntries(['mobile-controls', 'weather-ui'].map((owner) => {
      const owned = scopes.filter((scope) => scope.owner === owner);
      return [owner, {
        scopes: owned.length,
        resources: owned.reduce((total, scope) => total + scope.resourceCount, 0),
        intervals: owned.reduce((total, scope) => total + Number(scope.resources?.interval || 0), 0)
      }];
    }));
    return owners;
  });
  assert(lifecycle, 'Lifecycle registry API was unavailable after runtime readiness.');
  assert(lifecycle['mobile-controls'].scopes === 1 && lifecycle['mobile-controls'].resources > 0,
    `Touch controls do not have one disposable listener owner: ${JSON.stringify(lifecycle)}`);
  assert(lifecycle['mobile-controls'].intervals === 0,
    `Touch controls retained the duplicate polling interval: ${JSON.stringify(lifecycle)}`);
  assert(lifecycle['weather-ui'].scopes === 1 && lifecycle['weather-ui'].intervals === 0,
    `Weather UI retained an unowned clock interval: ${JSON.stringify(lifecycle)}`);
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
  const pointer = { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 };
  await button.dispatchEvent('pointerdown', pointer);
  await page.waitForTimeout(120);
  const held = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!ctx.keys?.ArrowUp && document.getElementById('mobileMoveUp')?.classList.contains('active');
  });
  await button.dispatchEvent('pointerup', { ...pointer, buttons: 0 });
  await page.waitForTimeout(60);
  const released = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !ctx.keys?.ArrowUp && !document.getElementById('mobileMoveUp')?.classList.contains('active');
  });
  assert(held && released, `Mobile held input did not press/release cleanly (${held}/${released})`);
}

async function assertDockMenus(page) {
  const cases = [
    ['#travelBtn', 'travelMenu', []],
    ['#gameBtn', 'gameMenu', ['fMpCreate', 'fMpJoin', 'fMpInvite', 'fMpLeave']],
    ['#realEstateFloatBtn', 'realEstateMenu', []]
  ];
  for (const [selector, menuId, requiredItems] of cases) {
    await page.locator(selector).tap();
    const state = await page.evaluate(({ id, requiredIds }) => {
      const dock = document.getElementById('floatMenuContainer').getBoundingClientRect();
      const menu = document.getElementById(id);
      const panel = menu?.querySelector('.floatItems')?.getBoundingClientRect();
      const missingItems = requiredIds.filter((requiredId) => {
        const item = document.getElementById(requiredId);
        return !item || item.closest('.floatMenu') !== menu || getComputedStyle(item).display === 'none';
      });
      return {
        open: !!menu?.classList.contains('open'),
        panelBottom: panel?.bottom || 0,
        dockTop: dock.top,
        missingItems
      };
    }, { id: menuId, requiredIds: requiredItems });
    assert(state.open && state.panelBottom <= state.dockTop, `${menuId} did not open above the dock: ${JSON.stringify(state)}`);
    assert(state.missingItems.length === 0, `${menuId} is missing consolidated multiplayer controls: ${JSON.stringify(state)}`);
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
  await page.waitForFunction(() => {
    const menu = document.getElementById('exploreMenu');
    const card = document.getElementById('tutorialHintCard');
    return menu?.classList.contains('open') && (!card || getComputedStyle(card).display === 'none');
  }, null, { timeout: 8000 });
  await page.screenshot({ path: path.join(outputDir, 'iphone-landscape.png') });
  await context.close();
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const hostedBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
  const server = hostedBaseUrl ? null : await startStaticRootServer({ rootDir, host, candidatePorts: ports });
  const baseUrl = hostedBaseUrl || `http://${host}:${server.port}`;
  const browser = await browserType.launch({
    headless: !headed,
    ...(browserName === 'chromium' && browserChannel ? { channel: browserChannel } : {})
  });
  const errors = [];
  try {
    console.log('[mobile-controls] iPhone title touch');
    const iphone = await browser.newContext(contextOptions(devices.iphone));
    const iphonePage = await iphone.newPage();
    iphonePage.on('pageerror', (error) => errors.push(`iphone: ${error.message}`));
    await assertTitleTouch(iphonePage, baseUrl);
    await iphone.close();

    const runtimeDevice = browserName === 'webkit' ? devices.iphone : devices.android;
    const runtimeLabel = browserName === 'webkit' ? 'iPhone WebKit' : 'Android Chromium';
    console.log(`[mobile-controls] ${runtimeLabel} Earth bootstrap and mode controls`);
    const runtime = await browser.newContext(contextOptions(runtimeDevice));
    const runtimePage = await runtime.newPage();
    runtimePage.on('pageerror', (error) => errors.push(`${runtimeLabel}: ${error.message}`));
    await bootstrapEarth(runtimePage, baseUrl);
    await runtimePage.screenshot({ path: path.join(outputDir, `${browserName}-bootstrap.png`) });
    await assertDockHitTargets(runtimePage);
    await switchMode(runtimePage, '#fDriving', 'drive');
    await switchMode(runtimePage, '#fDrone', 'drone');
    await switchMode(runtimePage, '#fPlane', 'plane');
    await switchMode(runtimePage, '#fWalk', 'walk');
    await assertDockMenus(runtimePage);
    await assertHeldMovement(runtimePage);
    await runtimePage.screenshot({ path: path.join(outputDir, `${browserName}-portrait.png`) });
    await assertMainMenuReturn(runtimePage);
    await runtime.close();

    console.log('[mobile-controls] iPhone landscape Earth bootstrap');
    await assertLandscapeShell(browser, baseUrl);
  } finally {
    await browser.close();
    await server?.close();
  }
  assert(errors.length === 0, `Mobile page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    ok: true,
    browser: browserName,
    devices: browserName === 'webkit'
      ? ['iPhone WebKit portrait', 'iPhone WebKit landscape']
      : ['iPhone emulation portrait', 'Android Chromium portrait', 'iPhone emulation landscape']
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
