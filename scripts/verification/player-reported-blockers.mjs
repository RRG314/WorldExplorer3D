import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const outputDir = path.join(root, 'output/verification/player-reported-blockers');
const server = await startStaticServer({ rootDir: servedRoot, ports: [4411, 4412, 4413] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const browserErrors = [];
const localFailures = [];

function observe(page) {
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
}

async function waitForRuntime(page) {
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
}

async function selectBaltimore(page) {
  await page.locator('#globeCustomLat').fill('39.2904');
  await page.locator('#globeCustomLon').fill('-76.6122');
  await page.locator('#globeCustomLon').press('Enter');
  await page.waitForFunction(() => /39\.290400.*-76\.612200/.test(
    document.getElementById('globeSelectorLatLon')?.textContent || ''
  ));
  await page.waitForTimeout(800);
}

async function waitForInteractiveWorld(page) {
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    const loadingVisible = document.getElementById('loading')?.classList.contains('show') === true;
    const titleVisible = !document.getElementById('titleScreen')?.classList.contains('hidden');
    const ready = state?.gameStarted === true && state.worldLoading === false && !loadingVisible && !titleVisible;
    if (!ready) {
      globalThis.__WE3D_PLAYER_REPORT_READY_SINCE__ = 0;
      return false;
    }
    globalThis.__WE3D_PLAYER_REPORT_READY_SINCE__ ||= performance.now();
    return performance.now() - globalThis.__WE3D_PLAYER_REPORT_READY_SINCE__ >= 1_500;
  }, null, { timeout: 300_000 });
}

async function switchToWalking(page) {
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator('#fWalk').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'walk', null, { timeout: 20_000 });
  await page.waitForSelector('#mobileTouchControls.show.mode-walking', { timeout: 10_000 });
  await page.waitForTimeout(450);
}

async function switchTravelMode(page, selector, expectedMode, controlClass) {
  const menuOpen = await page.locator('#exploreMenu').evaluate((menu) => menu.classList.contains('open'));
  if (!menuOpen) {
    await page.locator('#exploreBtn').click();
    await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  }
  await page.locator(selector).click();
  await page.waitForFunction((mode) => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === mode, expectedMode, { timeout: 20_000 });
  await page.waitForSelector(`#mobileTouchControls.show.${controlClass}`, { timeout: 10_000 });
  await page.waitForTimeout(350);
}

function horizontalDistance(a, b) {
  return Math.hypot(Number(b?.x) - Number(a?.x), Number(b?.z) - Number(a?.z));
}

function screenRightProjection(before, after) {
  const actorBefore = before?.activeActor?.position;
  const cameraBefore = before?.camera?.position;
  const viewX = Number(actorBefore?.x) - Number(cameraBefore?.x);
  const viewZ = Number(actorBefore?.z) - Number(cameraBefore?.z);
  const viewLength = Math.hypot(viewX, viewZ);
  assert.ok(viewLength > 0.001, 'Camera and actor must have distinct horizontal positions.');
  // Horizontal screen-right is view-forward × world-up. Deriving it from the
  // actual camera/actor positions avoids Euler-angle ambiguity after lookAt().
  const rightX = -viewZ / viewLength;
  const rightZ = viewX / viewLength;
  const dx = Number(after?.activeActor?.position?.x) - Number(before?.activeActor?.position?.x);
  const dz = Number(after?.activeActor?.position?.z) - Number(before?.activeActor?.position?.z);
  return dx * rightX + dz * rightZ;
}

async function touchHold(page, cdp, selector, deltaX, deltaY, holdMs = 1_050) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} must be visible.`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const end = { x: start.x + deltaX, y: start.y + deltaY };
  const point = (position) => ({ x: position.x, y: position.y, id: 0, radiusX: 5, radiusY: 5, force: 1 });
  const before = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
  await page.waitForTimeout(70);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(end)] });
  await page.waitForTimeout(holdMs);
  const held = await page.evaluate(() => ({
    diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.(),
    hud: {
      speed: Number(document.getElementById('speed')?.textContent || NaN),
      unit: String(document.getElementById('speedUnitLabel')?.textContent || '').trim(),
      secondaryLabel: String(document.getElementById('limitLabel')?.textContent || '').trim(),
      secondary: String(document.getElementById('limit')?.textContent || '').trim()
    }
  }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  return { before, held, after, holdMs };
}

let desktopContext;
let mobileContext;
try {
  await mkdir(outputDir, { recursive: true });

  desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktop = await desktopContext.newPage();
  observe(desktop);
  await desktop.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await waitForRuntime(desktop);
  await selectBaltimore(desktop);
  const initialCoordinates = await desktop.locator('#globeSelectorLatLon').textContent();
  const initialScale = await desktop.locator('#globeSelectorScaleReadout').textContent();
  await desktop.locator('#globeSelectorCanvas').screenshot({ path: path.join(outputDir, 'globe-selected-global.png') });
  for (let index = 0; index < 12; index += 1) {
    if (await desktop.locator('#globeSelectorZoomInBtn').isDisabled()) break;
    await desktop.locator('#globeSelectorZoomInBtn').click();
    await desktop.waitForTimeout(160);
  }
  await desktop.waitForTimeout(1_200);
  const zoomedCoordinates = await desktop.locator('#globeSelectorLatLon').textContent();
  const zoomedScale = await desktop.locator('#globeSelectorScaleReadout').textContent();
  await desktop.locator('#globeSelectorCanvas').screenshot({ path: path.join(outputDir, 'globe-selected-zoomed.png') });
  const globe = {
    initialCoordinates,
    zoomedCoordinates,
    initialScale,
    zoomedScale,
    canvasBox: await desktop.locator('#globeSelectorCanvas').boundingBox()
  };
  await desktopContext.close();
  desktopContext = null;

  mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const mobile = await mobileContext.newPage();
  const cdp = await mobileContext.newCDPSession(mobile);
  observe(mobile);
  await mobile.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await waitForRuntime(mobile);
  await selectBaltimore(mobile);

  await mobile.locator('#globeSelectorStartBtn').click();
  await mobile.waitForSelector('#loading.show', { timeout: 30_000 });
  const loadingCover = await mobile.evaluate(() => {
    const loading = document.getElementById('loading');
    const points = [
      [1, 1],
      [innerWidth - 2, 1],
      [innerWidth / 2, innerHeight / 2],
      [1, innerHeight - 2],
      [innerWidth - 2, innerHeight - 2]
    ];
    return {
      display: loading ? getComputedStyle(loading).display : 'missing',
      zIndex: Number(loading ? getComputedStyle(loading).zIndex : 0),
      ownsViewport: points.every(([x, y]) => document.elementFromPoint(x, y)?.closest?.('#loading') === loading),
      gameStarted: globalThis.getWorldExplorerRuntimeDiagnostics?.().gameStarted === true,
      titleHidden: document.getElementById('titleScreen')?.classList.contains('hidden') === true,
      backgroundImage: loading ? getComputedStyle(loading).backgroundImage : ''
    };
  });
  await mobile.screenshot({ path: path.join(outputDir, 'loading-cover-mobile.png') });
  await waitForInteractiveWorld(mobile);
  await switchToWalking(mobile);

  const rightMove = await touchHold(mobile, cdp, '#mobileMovePad', 48, 0, 1_050);
  const leftMove = await touchHold(mobile, cdp, '#mobileMovePad', -48, 0, 1_050);
  const forwardMove = await touchHold(mobile, cdp, '#mobileMovePad', 0, -52, 1_050);
  await mobile.screenshot({ path: path.join(outputDir, 'walking-controls-mobile.png'), fullPage: true });

  const promptSelector = '#urbanVehiclePrompt.show, #discoveryContextPrompt.show, #interiorPrompt.show, #boatPrompt.show';
  let promptAppeared = false;
  try {
    await mobile.waitForSelector(promptSelector, { timeout: 20_000 });
    promptAppeared = true;
  } catch {
    // The ecology and proximity clocks are intentionally variable. Menu
    // ownership still has to cover every contextual prompt implementation.
  }
  if (!promptAppeared) {
    await mobile.evaluate(() => document.getElementById('urbanVehiclePrompt')?.classList.add('show'));
  }
  await mobile.locator('#exploreBtn').click();
  await mobile.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  const menuOwnership = await mobile.evaluate((appearedNaturally) => {
    const menu = document.getElementById('exploreMenu');
    const menuBox = menu?.getBoundingClientRect();
    const prompts = ['urbanVehiclePrompt', 'discoveryContextPrompt', 'interiorPrompt', 'boatPrompt']
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((element) => {
        const box = element.getBoundingClientRect();
        const overlap = menuBox
          ? !(box.right <= menuBox.left || box.left >= menuBox.right || box.bottom <= menuBox.top || box.top >= menuBox.bottom)
          : false;
        return { id: element.id, display: getComputedStyle(element).display, overlap };
      });
    return {
      promptAppearedNaturally: appearedNaturally,
      menuOpen: menu?.classList.contains('open') === true,
      prompts
    };
  }, promptAppeared);
  await mobile.screenshot({ path: path.join(outputDir, 'bottom-menu-mobile.png'), fullPage: true });

  await switchTravelMode(mobile, '#fDriving', 'drive', 'mode-driving');
  const driveMove = await touchHold(mobile, cdp, '#mobileMovePad', 0, -52, 1_350);
  await switchTravelMode(mobile, '#fDrone', 'drone', 'mode-drone');
  const droneMove = await touchHold(mobile, cdp, '#mobileMovePad', 0, -52, 1_200);
  await switchTravelMode(mobile, '#fPlane', 'plane', 'mode-plane');
  const planeMove = await touchHold(mobile, cdp, '#mobileMovePad', 0, -52, 1_200);
  await mobile.screenshot({ path: path.join(outputDir, 'plane-speed-mobile.png'), fullPage: true });

  await mobileContext.close();
  mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const oceanMobile = await mobileContext.newPage();
  const oceanCdp = await mobileContext.newCDPSession(oceanMobile);
  observe(oceanMobile);
  await oceanMobile.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await waitForRuntime(oceanMobile);
  await selectBaltimore(oceanMobile);
  await oceanMobile.locator('#globeSelectorOceanBtn').click();
  await oceanMobile.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'ocean', null, { timeout: 120_000 });
  await waitForInteractiveWorld(oceanMobile);
  try {
    await oceanMobile.waitForSelector('#mobileTouchControls.show.mode-ocean', { timeout: 20_000 });
  } catch (error) {
    const oceanUiState = await oceanMobile.evaluate(() => {
      const controls = document.getElementById('mobileTouchControls');
      const controlPanel = document.getElementById('ctrlContent');
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
      return {
        activeMode: diagnostics?.activeActor?.mode,
        environment: diagnostics?.environment,
        gameStarted: diagnostics?.gameStarted,
        paused: diagnostics?.paused,
        worldLoading: diagnostics?.worldLoading,
        showLargeMap: diagnostics?.showLargeMap,
        mobileInput: diagnostics?.mobileControls,
        browserTouch: {
          maxTouchPoints: navigator.maxTouchPoints,
          coarsePointer: matchMedia('(hover: none) and (pointer: coarse)').matches,
          touchEvent: 'ontouchstart' in window
        },
        controlsClass: controls?.className,
        controlsDisplay: controls ? getComputedStyle(controls).display : 'missing',
        controlsBox: controls?.getBoundingClientRect?.().toJSON?.(),
        controlsExpanded: controlPanel ? !controlPanel.classList.contains('hidden') : null
      };
    });
    throw new Error(`Ocean mobile controls did not become visible: ${JSON.stringify(oceanUiState)}`, { cause: error });
  }
  const oceanMove = await touchHold(oceanMobile, oceanCdp, '#mobileMovePad', 0, -52, 1_250);
  await oceanMobile.screenshot({ path: path.join(outputDir, 'ocean-speed-mobile.png'), fullPage: true });

  const rightProjection = screenRightProjection(rightMove.before, rightMove.held.diagnostics);
  const leftProjection = screenRightProjection(leftMove.before, leftMove.held.diagnostics);
  const checks = {
    globeSelectionSurvivesZoom: globe.initialCoordinates === globe.zoomedCoordinates,
    globeActuallyZooms: globe.initialScale !== globe.zoomedScale,
    globeCanvasHasUsableSize: Number(globe.canvasBox?.width) > 400 && Number(globe.canvasBox?.height) > 300,
    loadingCoverOwnsEntireViewport: loadingCover.display !== 'none' && loadingCover.ownsViewport,
    loadingCoverAboveAppLayers: loadingCover.zIndex >= 20_000,
    loadingUsesImage: /url\(/i.test(loadingCover.backgroundImage),
    rightTouchMovesScreenRight: rightProjection > 0.35,
    leftTouchMovesScreenLeft: leftProjection < -0.35,
    rightAndLeftAreDistinct: rightProjection - leftProjection > 0.9,
    cameraFollowsDuringHeldMovement: Number(rightMove.held.diagnostics?.cameraFollow?.headingAlignmentDegrees) < 12 &&
      Number(rightMove.held.diagnostics?.cameraFollow?.trailingDistance) > 1,
    walkingSpeedIsPhysicalAndPlausible: forwardMove.held.hud.unit === 'MPH' &&
      forwardMove.held.hud.speed >= 2 && forwardMove.held.hud.speed <= 10 &&
      horizontalDistance(forwardMove.before.activeActor?.position, forwardMove.held.diagnostics?.activeActor?.position) > 0.8,
    driveSpeedUsesMph: driveMove.held.hud.unit === 'MPH' && driveMove.held.hud.speed > 0 && driveMove.held.hud.speed < 160 &&
      horizontalDistance(driveMove.before.activeActor?.position, driveMove.held.diagnostics?.activeActor?.position) > 0.15,
    droneSeparatesSpeedAndHeight: droneMove.held.hud.unit === 'MPH' && droneMove.held.hud.secondaryLabel === 'HEIGHT' &&
      /m$/.test(droneMove.held.hud.secondary) && droneMove.held.hud.speed > 0 && droneMove.held.hud.speed < 160,
    planeSpeedUsesMph: planeMove.held.hud.unit === 'MPH' && planeMove.held.hud.secondaryLabel === 'ALT' &&
      planeMove.held.hud.speed > 0 && planeMove.held.hud.speed < 500,
    oceanSpeedUsesKnots: oceanMove.held.hud.unit === 'KTS' && oceanMove.held.hud.secondaryLabel === 'DEPTH' &&
      /m$/.test(oceanMove.held.hud.secondary) && oceanMove.held.hud.speed > 0 && oceanMove.held.hud.speed < 100,
    bottomMenuOwnsHudArea: menuOwnership.menuOpen && menuOwnership.prompts.every((prompt) =>
      prompt.display === 'none' && prompt.overlap === false
    ),
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'player-reported-release-blockers-v1',
    checks,
    globe,
    loadingCover,
    mobileMovement: {
      rightProjection,
      leftProjection,
      rightDistance: horizontalDistance(rightMove.before.activeActor?.position, rightMove.held.diagnostics?.activeActor?.position),
      leftDistance: horizontalDistance(leftMove.before.activeActor?.position, leftMove.held.diagnostics?.activeActor?.position),
      cameraWhileRightHeld: rightMove.held.diagnostics?.cameraFollow,
      forwardHud: forwardMove.held.hud,
      forwardDistance: horizontalDistance(forwardMove.before.activeActor?.position, forwardMove.held.diagnostics?.activeActor?.position),
      drive: { hud: driveMove.held.hud, distance: horizontalDistance(driveMove.before.activeActor?.position, driveMove.held.diagnostics?.activeActor?.position) },
      drone: { hud: droneMove.held.hud, velocity: droneMove.held.diagnostics?.activeActor?.velocity },
      plane: { hud: planeMove.held.hud, distance: horizontalDistance(planeMove.before.activeActor?.position, planeMove.held.diagnostics?.activeActor?.position) },
      ocean: { hud: oceanMove.held.hud, distance: horizontalDistance(oceanMove.before.activeActor?.position, oceanMove.held.diagnostics?.activeActor?.position) }
    },
    menuOwnership,
    browserErrors,
    localFailures
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'One or more player-reported release blockers remain.');
} finally {
  await Promise.allSettled([
    desktopContext?.close(),
    mobileContext?.close(),
    browser.close()
  ]);
  await server.close();
}
