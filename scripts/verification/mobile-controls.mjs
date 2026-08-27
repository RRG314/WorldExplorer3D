import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4391, 4392, 4393] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
});

const diagnostics = () => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
const distance = (a, b) => Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.z) - Number(b?.z));
// Walking is calibrated near a normal human pace. These journeys must prove
// sustained directional movement without assuming vehicle-like displacement.
const MIN_WALK_DISTANCE_1250_MS = 1;
const MIN_STRAIGHT_SEGMENT_DISTANCE = 0.25;
const pathTurnDegrees = (a, b, c) => {
  const first = { x: Number(b?.x) - Number(a?.x), z: Number(b?.z) - Number(a?.z) };
  const second = { x: Number(c?.x) - Number(b?.x), z: Number(c?.z) - Number(b?.z) };
  const denominator = Math.hypot(first.x, first.z) * Math.hypot(second.x, second.z);
  if (!(denominator > 0.0001)) return 180;
  const cosine = Math.max(-1, Math.min(1, (first.x * second.x + first.z * second.z) / denominator));
  return Math.acos(cosine) * 180 / Math.PI;
};

async function touchDrag(selector, deltaX, deltaY, holdMs = 900) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} must be visible.`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const end = { x: start.x + deltaX, y: start.y + deltaY };
  const point = (position) => ({ x: position.x, y: position.y, id: 0, radiusX: 5, radiusY: 5, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(end)] });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(90);
}

async function touchPrecisionProbe(selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} must be visible.`);
  const start = { x: box.x + box.width / 2 + 24, y: box.y + box.height / 2 + 9 };
  const end = { x: start.x, y: start.y - 18 };
  const point = (position) => ({ x: position.x, y: position.y, id: 0, radiusX: 5, radiusY: 5, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
  await page.waitForTimeout(140);
  const touchdown = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().mobileControls?.move || null);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(end)] });
  await page.waitForTimeout(240);
  const gentleDrag = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().mobileControls?.move || null);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  return { touchdown, gentleDrag };
}

async function touchStraightnessProbe(selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} must be visible.`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const end = { x: start.x + 24, y: start.y - 36 };
  const point = (position) => ({ x: position.x, y: position.y, id: 0, radiusX: 5, radiusY: 5, force: 1 });
  const before = await diagnostics();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(end)] });
  await page.waitForTimeout(450);
  const middle = await diagnostics();
  await page.waitForTimeout(650);
  const after = await diagnostics();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  const positions = {
    before: before.activeActor?.position,
    middle: middle.activeActor?.position,
    after: after.activeActor?.position
  };
  return {
    ...positions,
    firstDistance: distance(positions.before, positions.middle),
    secondDistance: distance(positions.middle, positions.after),
    turnDegrees: pathTurnDegrees(positions.before, positions.middle, positions.after)
  };
}

async function mode(mode, selector) {
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator(selector).click();
  await page.waitForFunction((expected) => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === expected, mode, { timeout: 20_000 });
  await page.waitForTimeout(250);
  const visibility = await page.evaluate(() => {
    const element = document.getElementById('mobileTouchControls');
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return {
      display: element ? getComputedStyle(element).display : 'missing',
      bodyClasses: document.body.className,
      controlsExpanded: !document.getElementById('ctrlContent')?.classList.contains('hidden'),
      gameStarted: state.gameStarted,
      paused: state.paused,
      worldLoading: state.worldLoading,
      titleVisible: state.titleVisible,
      largeMapVisible: document.getElementById('largeMap')?.classList.contains('show') === true,
      maxTouchPoints: navigator.maxTouchPoints,
      coarsePointer: matchMedia('(hover: none) and (pointer: coarse)').matches,
      mobileInputEnabled: state.mobileControls?.enabled,
      controlsClasses: element?.className || '',
      mobileLifecycle: state.sessionLifecycle?.lifecycle?.scopes?.find((scope) => scope.owner === 'mobile-controls') || null
    };
  });
  if (visibility.display === 'none') console.log(JSON.stringify({ mobileControlsHiddenAfterMode: mode, ...visibility }));
  await page.waitForSelector(`#mobileTouchControls.show.mode-${mode === 'walk' ? 'walking' : mode === 'drive' ? 'driving' : mode}`, { timeout: 10_000 });
}

async function layoutSnapshot() {
  const [move, look, primary] = await Promise.all([
    page.locator('#mobileMovePad').boundingBox(),
    page.locator('#mobileLookPad').boundingBox(),
    page.locator('#mobileActionPrimary').boundingBox()
  ]);
  return { move, look, primary, width: page.viewportSize().width };
}

async function waitForInteractiveWorld() {
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    const loadingVisible = document.getElementById('loading')?.classList.contains('show') === true;
    const titleVisible = !document.getElementById('titleScreen')?.classList.contains('hidden');
    const ready = state?.gameStarted === true && state.worldLoading === false && !loadingVisible && !titleVisible;
    if (!ready) {
      globalThis.__WE3D_VERIFY_INTERACTIVE_SINCE__ = 0;
      return false;
    }
    globalThis.__WE3D_VERIFY_INTERACTIVE_SINCE__ ||= performance.now();
    return performance.now() - globalThis.__WE3D_VERIFY_INTERACTIVE_SINCE__ >= 2_500;
  }, null, { timeout: 300_000 });
}

try {
  await mkdir('output/verification/mobile-controls', { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForSelector('#loading.show', { timeout: 30_000 });
  await page.waitForFunction(() => !document.getElementById('loading')?.classList.contains('show'), null, { timeout: 240_000 });
  await waitForInteractiveWorld();

  await mode('walk', '#fWalk');
  const standardLayout = await layoutSnapshot();
  const onboardingLayout = await page.evaluate(() => {
    const tutorial = document.getElementById('tutorialHintCard');
    const look = document.getElementById('mobileLookPad');
    const pack = document.getElementById('urbanEquipmentToggle');
    const rect = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    const lookRect = look?.getBoundingClientRect();
    const lookHit = lookRect ? document.elementFromPoint(lookRect.left + lookRect.width / 2, lookRect.top + lookRect.height / 2) : null;
    return { tutorial: rect(tutorial), look: rect(look), pack: rect(pack), lookHit: lookHit?.closest?.('#mobileLookPad')?.id || lookHit?.id || '' };
  });
  await page.screenshot({ path: 'output/verification/mobile-controls/walk-onboarding-mobile.png', fullPage: true });
  const packUi = await page.evaluate(() => {
    const pack = document.getElementById('urbanEquipmentToggle');
    return {
      parent: pack?.parentElement?.id || '',
      integrated: pack?.classList.contains('mobilePackAction') || false,
      position: pack ? getComputedStyle(pack).position : ''
    };
  });
  await page.locator('#urbanEquipmentToggle').click();
  await page.waitForSelector('#urbanEquipment.show', { timeout: 10_000 });
  const openPackUi = await page.evaluate(() => {
    const pack = document.getElementById('urbanEquipment');
    const close = document.getElementById('urbanEquipmentCloseBtn');
    const menu = document.getElementById('mainMenuBtn');
    const closeRect = close?.getBoundingClientRect();
    const closeHit = closeRect
      ? document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2)
      : null;
    return {
      panelVisible: !!pack && getComputedStyle(pack).display !== 'none',
      menuVisible: !!menu && getComputedStyle(menu).display !== 'none',
      closeWidth: closeRect?.width || 0,
      closeHeight: closeRect?.height || 0,
      closeHitId: closeHit?.closest?.('#urbanEquipmentCloseBtn')?.id || closeHit?.id || ''
    };
  });
  await page.screenshot({ path: 'output/verification/mobile-controls/backpack-mobile.png', fullPage: true });
  await page.locator('#urbanEquipmentCloseBtn').click();
  await page.waitForFunction(() => !document.getElementById('urbanEquipment')?.classList.contains('show'), null, { timeout: 10_000 });
  await page.locator('#minimap').click();
  await page.waitForSelector('#largeMap.show', { timeout: 10_000 });
  const mapActorBefore = await diagnostics();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowUp');
  const mapActorAfterBlockedInput = await diagnostics();
  const mapFollowState = await page.evaluate(() => ({
    browsing: document.getElementById('largeMap')?.classList.contains('browsing') || false,
    status: document.getElementById('mapExplorerStatus')?.textContent || '',
    zoom: document.getElementById('zoomLevel')?.textContent || '',
    tutorialVisible: document.getElementById('tutorialHintCard') ? getComputedStyle(document.getElementById('tutorialHintCard')).display !== 'none' : false
  }));
  await touchDrag('#largeMapCanvas', 58, 36, 180);
  const mapBrowseState = await page.evaluate(() => ({
    browsing: document.getElementById('largeMap')?.classList.contains('browsing') || false,
    status: document.getElementById('mapExplorerStatus')?.textContent || ''
  }));
  await page.locator('#mapZoomIn').click();
  const mapZoomed = await page.locator('#zoomLevel').textContent();
  await page.screenshot({ path: 'output/verification/mobile-controls/map-explorer-mobile.png', fullPage: true });
  await page.locator('#mapRecenter').click();
  const mapRecentered = await page.evaluate(() => !document.getElementById('largeMap')?.classList.contains('browsing'));
  await page.locator('#mapClose').click();
  await page.waitForFunction(() => !document.getElementById('largeMap')?.classList.contains('show'), null, { timeout: 10_000 });
  await page.waitForSelector('#mobileTouchControls.show.mode-walking', { timeout: 10_000 });
  const mapReturnedToPlay = await page.locator('#mobileTouchControls.show.mode-walking').isVisible();
  const walkPrecision = await touchPrecisionProbe('#mobileMovePad');
  const walkStraightness = await touchStraightnessProbe('#mobileMovePad');
  const walkBefore = await diagnostics();
  await touchDrag('#mobileMovePad', 28, -46, 1_250);
  const walkMoved = await diagnostics();
  await touchDrag('#mobileLookPad', 43, 0, 950);
  const walkLooked = await diagnostics();
  await page.waitForTimeout(2_300);
  const walkRecentered = await diagnostics();
  await page.screenshot({ path: 'output/verification/mobile-controls/walk-standard-mobile.png', fullPage: true });

  await page.locator('#controlsBarBtn').click();
  await page.waitForSelector('#controlsTab.bar-open #mobileControlSettings', { timeout: 10_000 });
  await page.locator('#mobileControlsHandedness').selectOption('southpaw');
  const settingsLayout = await page.evaluate(() => ({
    summary: document.getElementById('mobileControlModeSummary')?.innerText || '',
    desktopInstructionsVisible: ['drivingControls', 'boatControls', 'walkingControls', 'droneControls', 'planeControls', 'rocketControls', 'oceanControls']
      .some((id) => getComputedStyle(document.getElementById(id)).display !== 'none')
  }));
  await page.screenshot({ path: 'output/verification/mobile-controls/settings-mobile.png', fullPage: true });
  await page.locator('#controlsBarBtn').click();
  const southpawLayout = await layoutSnapshot();
  const savedSouthpawSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('world-explorer-mobile-controls-v1') || 'null'));

  await mode('drive', '#fDriving');
  const drivePackVisible = await page.locator('#urbanEquipmentToggle').isVisible();
  const driveBefore = await diagnostics();
  await touchDrag('#mobileMovePad', 30, -48, 1_500);
  const driveMoved = await diagnostics();
  await touchDrag('#mobileLookPad', 43, 0, 900);
  const driveLooked = await diagnostics();
  await page.waitForTimeout(2_500);
  const driveRecentered = await diagnostics();
  await page.screenshot({ path: 'output/verification/mobile-controls/drive-standard-mobile.png', fullPage: true });

  await mode('drone', '#fDrone');
  const droneBefore = await diagnostics();
  await touchDrag('#mobileMovePad', 30, -46, 1_250);
  const droneControlled = await diagnostics();
  await page.screenshot({ path: 'output/verification/mobile-controls/drone-southpaw-mobile.png', fullPage: true });

  await mode('plane', '#fPlane');
  const planeBefore = await diagnostics();
  await touchDrag('#mobileMovePad', 34, -42, 1_250);
  const planeControlled = await diagnostics();
  await touchDrag('#mobileLookPad', 42, 0, 900);
  const planeLooked = await diagnostics();
  await page.waitForTimeout(3_000);
  const planeRecentered = await diagnostics();
  await page.screenshot({ path: 'output/verification/mobile-controls/plane-standard-mobile.png', fullPage: true });

  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => navigator.maxTouchPoints > 0 && matchMedia('(hover: none) and (pointer: coarse)').matches, null, { timeout: 10_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await waitForInteractiveWorld();
  await mode('walk', '#fWalk');
  const reloadedSouthpawLayout = await layoutSnapshot();
  const reloadedWalkState = await diagnostics();
  await page.locator('#controlsBarBtn').click();
  await page.locator('#mobileControlsReset').click();
  await page.locator('#controlsBarBtn').click();
  const resetLayout = await layoutSnapshot();
  const resetWalkState = await diagnostics();

  const checks = {
    standardMoveLeft: standardLayout.move.x + standardLayout.move.width / 2 < standardLayout.width / 2,
    standardLookAndActionRight: standardLayout.look.x > standardLayout.width / 2 && standardLayout.primary.x > standardLayout.width / 2,
    southpawActuallySwaps: southpawLayout.move.x > southpawLayout.width / 2 && southpawLayout.look.x < southpawLayout.width / 2,
    southpawSurvivesReload: savedSouthpawSettings?.handedness === 'southpaw' &&
      reloadedSouthpawLayout.move.x > reloadedSouthpawLayout.width / 2 && reloadedSouthpawLayout.look.x < reloadedSouthpawLayout.width / 2,
    resetRestoresStandard: resetLayout.move.x < resetLayout.width / 2 && resetLayout.look.x > resetLayout.width / 2,
    onboardingClearOfLookControl: onboardingLayout.lookHit === 'mobileLookPad',
    walkingPackClearOfLookControl: !onboardingLayout.pack || onboardingLayout.pack.x + onboardingLayout.pack.width < onboardingLayout.look.x,
    packIsIntegratedWithActionDock: packUi.parent === 'mobileActionStack' && packUi.integrated && packUi.position === 'static',
    backpackOwnsMobileFocus: openPackUi.panelVisible === true && openPackUi.menuVisible === false,
    backpackCloseIsTouchable: openPackUi.closeWidth >= 44 && openPackUi.closeHeight >= 44 && openPackUi.closeHitId === 'urbanEquipmentCloseBtn',
    vehiclePackHidden: drivePackVisible === false,
    mobileSettingsAreModeSpecific: /walking/i.test(settingsLayout.summary) && /jump/i.test(settingsLayout.summary) && settingsLayout.desktopInstructionsVisible === false,
    expandedMapStartsFollowingPlayer: mapFollowState.browsing === false && /following/i.test(mapFollowState.status),
    expandedMapOwnsTheScreen: mapFollowState.tutorialVisible === false,
    expandedMapSuspendsGameplayMovement: distance(mapActorBefore.activeActor?.position, mapActorAfterBlockedInput.activeActor?.position) < 0.5,
    expandedMapCanPan: mapBrowseState.browsing === true && /exploring/i.test(mapBrowseState.status),
    expandedMapCanZoom: mapZoomed !== mapFollowState.zoom,
    expandedMapRecenters: mapRecentered === true,
    closingMapRestoresGameplayControls: mapReturnedToPlay === true,
    offCenterTouchdownIsNeutral: Math.hypot(Number(walkPrecision.touchdown?.x), Number(walkPrecision.touchdown?.y)) < 0.01,
    shortWalkDragStaysPrecise: Math.abs(Number(walkPrecision.gentleDrag?.x)) < 0.01 && Number(walkPrecision.gentleDrag?.y) < -0.25 && Number(walkPrecision.gentleDrag?.y) > -0.4,
    heldDiagonalWalkStaysStraight:
      walkStraightness.firstDistance > MIN_STRAIGHT_SEGMENT_DISTANCE &&
      walkStraightness.secondDistance > MIN_STRAIGHT_SEGMENT_DISTANCE &&
      walkStraightness.firstDistance + walkStraightness.secondDistance > 0.9 &&
      walkStraightness.turnDegrees < 5,
    walkAnalogMoves: distance(walkBefore.activeActor?.position, walkMoved.activeActor?.position) > MIN_WALK_DISTANCE_1250_MS,
    walkRightLookTurnsRight: Number(walkLooked.cameraFollow?.signedHeadingOffsetDegrees) > 8,
    walkCameraRecenters: Number(walkRecentered.cameraFollow?.headingAlignmentDegrees) < 5 && Number(walkRecentered.cameraFollow?.trailingDistance) > 1,
    driveAnalogMoves: distance(driveBefore.activeActor?.position, driveMoved.activeActor?.position) > 0.4,
    driveRightLookTurnsRight: Number(driveLooked.cameraFollow?.signedHeadingOffsetDegrees) > 8,
    driveCameraRecenters: Number(driveRecentered.cameraFollow?.headingAlignmentDegrees) < 6 && Number(driveRecentered.cameraFollow?.trailingDistance) > 2,
    droneTransitionAndAnalogControl: droneBefore.activeActor?.mode === 'drone' && droneControlled.activeActor?.mode === 'drone' &&
      distance(droneBefore.activeActor?.position, droneControlled.activeActor?.position) > 0.4,
    planeAnalogChangesAttitude: Math.abs(Number(planeControlled.activeActor?.orientation?.pitch) - Number(planeBefore.activeActor?.orientation?.pitch)) > 0.05 || Math.abs(Number(planeControlled.activeActor?.orientation?.roll) - Number(planeBefore.activeActor?.orientation?.roll)) > 0.05,
    planeRightLookTurnsRight: Number(planeLooked.cameraFollow?.signedHeadingOffsetDegrees) > 8,
    planeCameraRecenters: Number(planeRecentered.cameraFollow?.headingAlignmentDegrees) < 7 && Number(planeRecentered.cameraFollow?.trailingDistance) > 2,
    returnToWalkClearsInput: reloadedWalkState.activeActor?.mode === 'walk' &&
      reloadedWalkState.mobileControls?.move?.active !== true && reloadedWalkState.mobileControls?.look?.active !== true &&
      resetWalkState.activeActor?.mode === 'walk',
    savedSettingsPresent: await page.evaluate(() => !!localStorage.getItem('world-explorer-mobile-controls-v1')),
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean), contract: 'semantic-mobile-controls-v2', checks,
    layouts: { standardLayout, southpawLayout, reloadedSouthpawLayout, resetLayout, onboardingLayout, settingsLayout, packUi, openPackUi },
    map: { mapFollowState, mapBrowseState, mapZoomed, mapRecentered, mapReturnedToPlay, blockedMovementDistance: distance(mapActorBefore.activeActor?.position, mapActorAfterBlockedInput.activeActor?.position) },
    camera: {
      walk: { looked: walkLooked.cameraFollow, recentered: walkRecentered.cameraFollow },
      drive: { looked: driveLooked.cameraFollow, recentered: driveRecentered.cameraFollow },
      plane: { looked: planeLooked.cameraFollow, recentered: planeRecentered.cameraFollow }
    },
    movement: {
      walkPrecision,
      walkStraightness,
      walk: distance(walkBefore.activeActor?.position, walkMoved.activeActor?.position),
      drive: distance(driveBefore.activeActor?.position, driveMoved.activeActor?.position),
      drone: distance(droneBefore.activeActor?.position, droneControlled.activeActor?.position),
      planeBefore: planeBefore.activeActor?.orientation,
      planeAfter: planeControlled.activeActor?.orientation
    },
    browserErrors, localFailures
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Mobile control and camera journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
