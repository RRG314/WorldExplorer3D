import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/curated-player-car-current');
const mobile = process.env.WE3D_VERIFY_VIEWPORT === 'mobile';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
const failures = [];
const externalAssetRequests = [];
const bundledAssetRequests = [];

page.on('pageerror', (error) => failures.push(String(error?.stack || error)));
page.on('request', (request) => {
  if (/sketchfab\.com/i.test(request.url())) externalAssetRequests.push(request.url());
  if (/\/app\/assets\/models\/vehicles\/bmw-525i-e34\.glb(?:\?|$)/i.test(request.url())) {
    bundledAssetRequests.push(request.url());
  }
});
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failures.push(`${response.status()} ${response.url()}`);
  }
});

try {
  await page.goto(`${baseUrl}/app/?curated-car=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  const deny = page.locator('#analyticsConsentDenyBtn');
  if (await deny.isVisible().catch(() => false)) await deny.click();
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  let earthReady = false;
  for (let attempt = 0; attempt < 720 && !earthReady; attempt += 1) {
    earthReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return !!(ctx.gameStarted && ctx.initialEarthWorldReady && !ctx.worldLoading && ctx.carMesh?.parent);
    });
    if (!earthReady) await page.waitForTimeout(250);
  }
  assert.equal(earthReady, true, 'Earth did not become playable.');
  assert.equal(bundledAssetRequests.length, 0, 'The curated car must not delay startup or the initial Earth load.');
  await page.locator('#travelBtn').click();
  await page.waitForSelector('#travelMenu.open', { timeout: 10_000 });
  await page.locator('#fDriving').click();
  await page.waitForFunction(() =>
    globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'drive',
  null, { timeout: 20_000 });
  let curatedReady = false;
  for (let attempt = 0; attempt < 120 && !curatedReady; attempt += 1) {
    curatedReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.carMesh?.userData?.curatedVehicleAssetId === 'vehicle-bmw-525i-e34';
    });
    if (!curatedReady) await page.waitForTimeout(250);
  }
  assert.equal(curatedReady, true, 'The bundled E34 did not become ready in Drive mode.');
  assert.equal(bundledAssetRequests.length, 1, 'Drive mode should request the bundled car exactly once.');

  const before = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const visual = ctx.carMesh.userData.curatedVehicleVisual;
    const bounds = new THREE.Box3().setFromObject(visual);
    const size = bounds.getSize(new THREE.Vector3());
    return {
      car: { x: ctx.car.x, y: ctx.car.y, z: ctx.car.z },
      assetId: ctx.carMesh.userData.curatedVehicleAssetId,
      visualVisible: visual.visible,
      visibleFallbackParts: ctx.carMesh.children.filter((child) =>
        child.userData?.defaultPlayerVehicleFallback === true && child.visible
      ).length,
      curatedVisualCount: ctx.carMesh.children.filter((child) =>
        child.userData?.curatedVehicleAssetId === 'vehicle-bmw-525i-e34'
      ).length,
      importDimensions: visual.userData?.importDimensions || null,
      size: { x: size.x, y: size.y, z: size.z },
      collisionPolicy: visual.userData?.collisionPolicy || ''
    };
  });
  console.log('E34 pre-drive visual', JSON.stringify(before, null, 2));
  assert.equal(before.assetId, 'vehicle-bmw-525i-e34');
  assert.equal(before.visualVisible, true);
  assert.equal(before.visibleFallbackParts, 0);
  assert.equal(before.curatedVisualCount, 1);
  assert.equal(before.collisionPolicy, 'existing-player-vehicle-envelope');
  assert.ok(Math.abs(before.importDimensions.normalized.x - 1.8817) < 0.02);
  assert.ok(Math.abs(before.importDimensions.normalized.y - 1.3637) < 0.02);
  assert.ok(Math.abs(before.importDimensions.normalized.z - 4.72) < 0.02);
  assert.ok(before.size.y > 0.8 && before.size.y < 1.8, `Unexpected E34 height ${before.size.y}`);
  assert.ok(Math.max(before.size.x, before.size.z) > 4.2, `Unexpected E34 length ${JSON.stringify(before.size)}`);
  assert.ok(Math.min(before.size.x, before.size.z) > 1.5, `Unexpected E34 width ${JSON.stringify(before.size)}`);

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1_600);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(450);
  const after = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      car: { x: ctx.car.x, y: ctx.car.y, z: ctx.car.z },
      assetId: ctx.carMesh?.userData?.curatedVehicleAssetId || '',
      visualVisible: ctx.carMesh?.userData?.curatedVehicleVisual?.visible === true,
      activeMode: globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode || ''
    };
  });
  const distance = Math.hypot(after.car.x - before.car.x, after.car.z - before.car.z);
  assert.ok(distance > 0.5, `Existing vehicle controller did not move the E34 (${distance.toFixed(2)} m).`);
  assert.equal(after.assetId, 'vehicle-bmw-525i-e34');
  assert.equal(after.visualVisible, true);
  assert.equal(after.activeMode, 'drive');
  assert.deepEqual(externalAssetRequests, [], 'The bundled player car must not contact Sketchfab at runtime.');
  assert.deepEqual(failures, []);

  await page.screenshot({
    path: path.join(outputDir, mobile ? 'e34-driving-mobile.png' : 'e34-driving-desktop.png'),
    fullPage: true
  });
  console.log(JSON.stringify({
    ok: true,
    before,
    after,
    distanceMeters: Number(distance.toFixed(2)),
    bundledAssetRequests: bundledAssetRequests.length,
    externalAssetRequests,
    failures
  }, null, 2));
} finally {
  await browser.close();
}
