import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'deflock-browser');
const fixturePath = path.join(rootDir, 'scripts', 'fixtures', 'deflock-surveillance.json');
const fixtureBody = await fs.readFile(fixturePath, 'utf8');
const fixture = JSON.parse(fixtureBody);
const fixtureCameras = fixture.elements.filter((element) => element?.tags?.man_made === 'surveillance');
const externalBaseUrl = String(process.env.DEFLOCK_BROWSER_URL || '').trim();
const headless = process.env.DEFLOCK_BROWSER_HEADED !== '1';
const server = externalBaseUrl ? null : await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4316, 4317, 4318, 4319]
});
const baseUrl = externalBaseUrl || `http://127.0.0.1:${server.port}/app/?deflock-browser=1`;

await fs.mkdir(outputDir, { recursive: true });
assert.equal(fixtureCameras.length, 2, 'browser fixture must contain exactly two surveillance cameras');

const browser = await chromium.launch({ headless, channel: 'chrome' });
const report = {
  ok: false,
  browser: 'Google Chrome',
  baseUrl,
  fixtureRequests: 0,
  desktop: null,
  mobile: null,
  providerWarnings: [],
  fatalErrors: []
};

function isDeFlockOverpassRequest(request) {
  if (request.method() !== 'POST' || !/\/api\/interpreter(?:\?|$)/.test(request.url())) return false;
  const form = new URLSearchParams(request.postData() || '');
  const query = form.get('data') || '';
  return /node\["man_made"="surveillance"\]/.test(query);
}

function isRecoverableProviderMessage(message = '') {
  return /Failed to load resource|net::ERR_|blocked by CORS|Could not reach Cloud Firestore|\b(?:429|500|502|503|504)\b|Overpass|WorldCover|Shortbread|Terrarium|tile/i.test(message);
}

async function instrumentPage(page) {
  await page.route(/https:\/\/[^/]+\/api\/interpreter(?:\?.*)?$/, async (route) => {
    if (!isDeFlockOverpassRequest(route.request())) {
      await route.continue();
      return;
    }
    report.fixtureRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: fixtureBody
    });
  });
  page.on('pageerror', (error) => report.fatalErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (isRecoverableProviderMessage(text)) report.providerWarnings.push(text);
    else report.fatalErrors.push(text);
  });
}

async function waitForRuntime(page) {
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true &&
      typeof ctx.triggerTitleStart === 'function' &&
      typeof ctx.getDeFlockSnapshot === 'function' &&
      typeof ctx.geoToWorld === 'function';
  }, null, { timeout: 90000 });
}

async function prepareTitle(page, { clearProgress = false } = {}) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForRuntime(page);
  if (clearProgress) {
    await page.evaluate(() => {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith('worldExplorer3D.deflock.progress.v1:')) localStorage.removeItem(key);
      }
    });
  }
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#globeFavoritesTabBtn').click();
  await page.locator('#globeCityList').getByText('Baltimore', { exact: true }).click();
  await page.locator('[data-globe-destination="games"]').click();
  await page.locator('#globeHubOverlay:not([hidden])').waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('#tab-games .mode-grid > .mode').first().getAttribute('data-mode'),
    'deflock',
    'DeFlock must be the first entry in the shared Missions and Games list'
  );
  await page.locator('.mode[data-mode="deflock"]').click();
  await page.waitForFunction(() => document.querySelector('.mode[data-mode="deflock"]')?.classList.contains('sel'));
}

async function launchSelectedMode(page) {
  await page.locator('#globeHubOverlayCloseBtn').click();
  await page.locator('#globeSelectorStartBtn:not([disabled])').waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const snapshot = globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock;
    return snapshot?.active === true && snapshot.loading === false && snapshot.progress?.total === 2;
  }, null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading');
    return !loading?.classList.contains('show') && document.getElementById('deFlockHud')?.classList.contains('show');
  }, null, { timeout: 30000 });
  await page.waitForTimeout(500);
}

async function inspectPlacement(page) {
  return page.evaluate((expected) => {
    const ctx = globalThis.getWorldExplorerRuntimeDiagnostics ? globalThis.ctx : null;
    return import('/app/js/shared-context.js?v=55').then(({ ctx: appCtx }) => {
      const group = appCtx.scene?.getObjectByName?.('DeFlockCameraLayer');
      const cameraMesh = group?.children?.find((child) => (
        child?.isInstancedMesh && child.geometry?.type === 'BoxGeometry'
      ));
      const markers = Array.isArray(appCtx.deFlockMapMarkers) ? appCtx.deFlockMapMarkers : [];
      const rows = markers.map((marker, index) => {
        const matrix = new globalThis.THREE.Matrix4();
        const position = new globalThis.THREE.Vector3();
        const quaternion = new globalThis.THREE.Quaternion();
        const scale = new globalThis.THREE.Vector3();
        cameraMesh?.getMatrixAt?.(index, matrix);
        matrix.decompose(position, quaternion, scale);
        const forward = new globalThis.THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
        const world = appCtx.geoToWorld(expected[index].lat, expected[index].lon);
        const terrainY = Number(appCtx.SurfaceQuery?.terrainAt?.(marker.x, marker.z)?.position?.y);
        return {
          ...marker,
          expectedWorld: { x: Number(world?.x), z: Number(world?.z) },
          rendered: { x: position.x, y: position.y, z: position.z },
          groundY: position.y - 3.15,
          terrainY,
          forward: { x: forward.x, z: forward.z }
        };
      });
      return {
        snapshot: appCtx.getDeFlockSnapshot?.(),
        groupAttached: group?.parent === appCtx.scene,
        groupVisible: group?.visible !== false,
        cameraCount: Number(cameraMesh?.count || 0),
        rows
      };
    });
  }, fixtureCameras.map(({ lat, lon }) => ({ lat, lon })));
}

function assertPlacement(placement) {
  assert.equal(placement.snapshot?.renderInstances, 2, 'DeFlock snapshot did not report two rendered instances');
  assert(placement.groupAttached && placement.groupVisible, 'DeFlock camera layer was not visible in the Earth scene');
  assert.equal(placement.cameraCount, 2, 'DeFlock instanced camera mesh did not render two instances');
  assert.deepEqual(placement.rows.map((row) => row.sourceId), ['osm:node:101', 'osm:node:102']);
  assert.deepEqual(placement.rows.map((row) => row.direction), [45, 270]);
  for (const row of placement.rows) {
    assert(Math.hypot(row.x - row.expectedWorld.x, row.z - row.expectedWorld.z) < 0.01,
      `${row.sourceId} was not placed by the canonical geographic transform`);
    assert(Number.isFinite(row.terrainY), `${row.sourceId} did not receive a finite terrain sample`);
    assert(Math.abs(row.groundY - row.terrainY) < 0.05,
      `${row.sourceId} camera body was not based on terrain height`);
    assert(Math.hypot(row.rendered.x - row.x, row.rendered.z - row.z) < 0.01,
      `${row.sourceId} rendered instance diverged from its map/world placement`);
    const radians = row.direction * Math.PI / 180;
    const expectedForward = { x: Math.sin(radians), z: -Math.cos(radians) };
    assert(Math.hypot(row.forward.x - expectedForward.x, row.forward.z - expectedForward.z) < 0.01,
      `${row.sourceId} rendered direction did not match its mapped compass bearing`);
  }
}

async function moveActorNear(page, markerIndex = 0) {
  return page.evaluate((index) => import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
    const marker = ctx.deFlockMapMarkers?.[index];
    if (!marker) throw new Error(`Missing DeFlock marker ${index}`);
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(marker.x, marker.z)?.position?.y) || 0;
    ctx.setTravelMode?.('walk', { source: 'deflock-browser', force: true, emitTutorial: false });
    const walker = ctx.Walk?.state?.walker;
    if (!walker) throw new Error('Walking actor is unavailable');
    Object.assign(walker, { x: marker.x + 1.2, y: terrainY + 1.7, z: marker.z + 1.2, vx: 0, vy: 0, vz: 0 });
    if (ctx.Walk.state.characterMesh) {
      ctx.Walk.state.characterMesh.position.set(walker.x, terrainY, walker.z);
      ctx.Walk.state.characterMesh.updateMatrixWorld(true);
    }
    ctx.updateDeFlockMode?.(0.016);
    ctx.setPauseReason?.('deflock-browser-visual', true);
    ctx.camera.position.set(marker.x + 9.5, terrainY + 7, marker.z + 9.5);
    ctx.camera.lookAt(marker.x, terrainY + 2.2, marker.z);
    ctx.camera.updateMatrixWorld(true);
    ctx.renderer?.render?.(ctx.scene, ctx.camera);
    return { marker, terrainY, nearbySourceId: ctx.getDeFlockSnapshot?.().nearbySourceId };
  }), markerIndex);
}

async function aimAtMarker(page, markerIndex = 0) {
  await page.evaluate((index) => import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
    const marker = ctx.deFlockMapMarkers?.[index];
    if (!marker) return;
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(marker.x, marker.z)?.position?.y) || 0;
    ctx.camera.position.set(marker.x + 9.5, terrainY + 7, marker.z + 9.5);
    ctx.camera.lookAt(marker.x, terrainY + 2.2, marker.z);
    ctx.camera.updateMatrixWorld(true);
    ctx.renderer?.render?.(ctx.scene, ctx.camera);
  }), markerIndex);
}

async function assertHudLayout(page) {
  const layout = await page.evaluate(() => {
    const bounds = (id) => {
      const rect = document.getElementById(id)?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width } : null;
    };
    return { viewport: { width: innerWidth, height: innerHeight }, hud: bounds('hud'), deflock: bounds('deFlockHud') };
  });
  assert(layout.deflock && layout.deflock.left >= 0 && layout.deflock.right <= layout.viewport.width,
    `DeFlock HUD escaped the desktop viewport: ${JSON.stringify(layout)}`);
  const overlaps = layout.hud && !(
    layout.deflock.right <= layout.hud.left || layout.deflock.left >= layout.hud.right ||
    layout.deflock.bottom <= layout.hud.top || layout.deflock.top >= layout.hud.bottom
  );
  assert(!overlaps, `DeFlock HUD overlaps the main status panel: ${JSON.stringify(layout)}`);
  return layout;
}

async function openAndInspectLargeMap(page, markerIndex = 0) {
  await page.locator('#minimap').click({ force: true });
  await page.locator('#largeMap.show').waitFor({ state: 'visible', timeout: 10000 });
  const marker = await page.evaluate((index) => import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
    ctx.drawLargeMap?.();
    const first = ctx.deFlockMapMarkers?.[index];
    const point = first ? ctx.worldToScreenLarge?.(first.x, first.z) : null;
    if (!first || !point) return null;
    const canvas = document.getElementById('largeMapCanvas');
    const pixels = canvas.getContext('2d').getImageData(
      Math.max(0, Math.floor(point.x - 5)), Math.max(0, Math.floor(point.y - 5)), 11, 11
    ).data;
    let coloredPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      if ((red > 210 && green < 130 && blue < 160) || (red > 210 && green > 150 && blue < 100) || (red < 80 && green > 170 && blue > 170)) coloredPixels++;
    }
    return { point, coloredPixels, state: first.state, sourceId: first.sourceId };
  }), markerIndex);
  assert(marker && marker.coloredPixels > 0, `large map did not paint a DeFlock marker: ${JSON.stringify(marker)}`);
  const box = await page.locator('#largeMapCanvas').boundingBox();
  assert(box, 'large map canvas was not visible');
  await page.mouse.click(
    box.x + marker.point.x * box.width / 800,
    box.y + marker.point.y * box.height / 800
  );
  await page.waitForFunction(() => document.getElementById('mapInfoTitle')?.textContent?.includes('Mapped Virtual Camera'));
  assert.match(await page.locator('#mapInfoContent').innerText(), /OpenStreetMap/);
  return marker;
}

async function verifyEnvironmentLifecycle(page) {
  const lifecycle = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    document.getElementById('mapClose')?.click();
    ctx.setPauseReason?.('deflock-browser-visual', false);
    const group = ctx.scene?.getObjectByName?.('DeFlockCameraLayer');
    const before = { active: ctx.getDeFlockSnapshot?.().active, visible: group?.visible !== false };
    ctx.switchEnv(ctx.ENV.MOON);
    ctx.updateDeFlockMode?.(0.016);
    const away = {
      active: ctx.getDeFlockSnapshot?.().active,
      visible: group?.visible !== false,
      hud: document.getElementById('deFlockHud')?.classList.contains('show')
    };
    ctx.switchEnv(ctx.ENV.EARTH);
    ctx.updateDeFlockMode?.(0.016);
    const returned = {
      active: ctx.getDeFlockSnapshot?.().active,
      visible: group?.visible !== false,
      hud: document.getElementById('deFlockHud')?.classList.contains('show'),
      instances: ctx.getDeFlockSnapshot?.().renderInstances
    };
    return { before, away, returned };
  });
  assert(lifecycle.before.active && lifecycle.before.visible, 'DeFlock was not active before leaving Earth');
  assert(lifecycle.away.active && !lifecycle.away.visible && !lifecycle.away.hud, 'DeFlock leaked into the non-Earth environment');
  assert(lifecycle.returned.active && lifecycle.returned.visible && lifecycle.returned.hud && lifecycle.returned.instances === 2,
    'DeFlock did not restore when returning to Earth');
  return lifecycle;
}

async function verifyCleanup(page) {
  await page.locator('#mainMenuBtn').click({ force: true });
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
  const cleanup = await page.evaluate(() => import('/app/js/shared-context.js?v=55').then(({ ctx }) => ({
    snapshot: ctx.getDeFlockSnapshot?.(),
    groups: ctx.scene?.children?.filter((child) => child?.userData?.deFlockLayer).length || 0,
    markers: ctx.deFlockMapMarkers?.length || 0,
    hud: document.getElementById('deFlockHud')?.classList.contains('show'),
    prompt: document.getElementById('deFlockPrompt')?.classList.contains('show'),
    help: document.getElementById('deFlockHelp')?.classList.contains('show')
  })));
  assert.equal(cleanup.snapshot?.active, false, 'Main Menu left the DeFlock plugin active');
  assert.equal(cleanup.groups, 0, 'Main Menu left DeFlock scene geometry attached');
  assert.equal(cleanup.markers, 0, 'Main Menu left DeFlock map markers published');
  assert(!cleanup.hud && !cleanup.prompt && !cleanup.help, 'Main Menu left DeFlock UI visible');
  return cleanup;
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await instrumentPage(page);
  await prepareTitle(page, { clearProgress: true });
  assert.equal(await page.locator('.mode[data-mode="deflock"] .mode-name').innerText(), 'DeFlock Hunt');
  await page.screenshot({ path: path.join(outputDir, 'title-selected.png'), fullPage: true });
  await launchSelectedMode(page);
  const tutorialClose = page.locator('[aria-label="Dismiss tutorial hint"]');
  if (await tutorialClose.isVisible()) await tutorialClose.click();
  const placement = await inspectPlacement(page);
  assertPlacement(placement);
  const hudLayout = await assertHudLayout(page);

  const near = await moveActorNear(page, 1);
  assert.equal(near.nearbySourceId, 'osm:node:102', 'approaching the fixture camera did not make it interactive');
  await page.waitForFunction(() => document.getElementById('deFlockPrompt')?.classList.contains('show'));
  const discovered = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.progress);
  assert(discovered.discovered >= 1, 'nearby fixture camera was not discovered');
  await aimAtMarker(page, 1);
  await page.screenshot({ path: path.join(outputDir, 'near-virtual-camera.png'), fullPage: false });

  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.progress?.disabled === 1);
  assert.match(await page.locator('#deFlockStatus').innerText(), /Virtual Camera Disabled/);
  await aimAtMarker(page, 1);
  await page.screenshot({ path: path.join(outputDir, 'virtually-disabled.png'), fullPage: false });

  const mapMarker = await openAndInspectLargeMap(page, 1);
  assert.equal(mapMarker.state, 'disabled');
  await page.screenshot({ path: path.join(outputDir, 'large-map-markers.png'), fullPage: false });
  const lifecycle = await verifyEnvironmentLifecycle(page);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForRuntime(page);
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#globeFavoritesTabBtn').click();
  await page.locator('#globeCityList').getByText('Baltimore', { exact: true }).click();
  await page.locator('[data-globe-destination="games"]').click();
  await page.locator('.mode[data-mode="deflock"]').click();
  await launchSelectedMode(page);
  const restored = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.progress);
  assert.equal(restored.disabled, 1, 'virtually disabled camera did not persist after reload');
  assert(restored.discovered >= 1, 'discovered camera did not persist after reload');
  const cleanup = await verifyCleanup(page);

  await context.close();
  return { placement, hudLayout, discovered, restored, mapMarker, lifecycle, cleanup };
}

async function runMobile() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await instrumentPage(page);
  await prepareTitle(page);
  await launchSelectedMode(page);
  await moveActorNear(page, 1);
  await page.evaluate(() => import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
    ctx.updateControlsModeUI?.();
    ctx.setPauseReason?.('deflock-browser-visual', false);
  }));
  await page.waitForFunction(() => {
    const button = document.getElementById('mobileActionSecondary');
    return button?.textContent === 'DeFlock' && !button.classList.contains('hidden') &&
      document.getElementById('mobileTouchControls')?.classList.contains('show');
  });
  const tutorialClose = page.locator('[aria-label="Dismiss tutorial hint"]');
  if (await tutorialClose.isVisible()) await tutorialClose.click();
  const layout = await page.evaluate(() => {
    const action = document.getElementById('mobileActionSecondary')?.getBoundingClientRect();
    const hud = document.getElementById('deFlockHud')?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      action: action ? { left: action.left, top: action.top, right: action.right, bottom: action.bottom } : null,
      hud: hud ? { left: hud.left, top: hud.top, right: hud.right, bottom: hud.bottom } : null
    };
  });
  assert(layout.scrollWidth <= layout.viewport.width && layout.bodyScrollWidth <= layout.viewport.width,
    `DeFlock mobile UI introduced horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.action && layout.action.left >= 0 && layout.action.right <= layout.viewport.width,
    `DeFlock mobile action escaped the viewport: ${JSON.stringify(layout)}`);
  assert(layout.hud && layout.hud.left >= 0 && layout.hud.right <= layout.viewport.width,
    `DeFlock mobile HUD escaped the viewport: ${JSON.stringify(layout)}`);
  await aimAtMarker(page, 1);
  await page.screenshot({ path: path.join(outputDir, 'mobile-gameplay.png'), fullPage: false });
  const beforeDisabled = Number((await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.progress?.disabled)) || 0);
  await page.locator('#mobileActionSecondary').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(100);
  await page.locator('#mobileActionSecondary').dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await page.waitForFunction((before) => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.progress?.disabled > before, beforeDisabled);
  const progress = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.progress);
  await context.close();
  return { layout, progress };
}

try {
  report.desktop = await runDesktop();
  report.mobile = await runMobile();
  assert(report.fixtureRequests >= 2, `expected fixture interception in desktop and mobile journeys, received ${report.fixtureRequests}`);
  assert.equal(report.fatalErrors.length, 0, `fatal application console errors: ${JSON.stringify(report.fatalErrors)}`);
  report.ok = true;
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    browser: report.browser,
    fixtureRequests: report.fixtureRequests,
    screenshots: [
      'title-selected.png',
      'near-virtual-camera.png',
      'virtually-disabled.png',
      'large-map-markers.png',
      'mobile-gameplay.png'
    ],
    providerWarningCount: report.providerWarnings.length,
    report: path.join(outputDir, 'report.json')
  }, null, 2));
} catch (error) {
  report.error = String(error?.stack || error);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
  await server?.close?.();
}
