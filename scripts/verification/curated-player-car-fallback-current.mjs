import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];

page.on('pageerror', (error) => failures.push(String(error?.stack || error)));
await page.route('**/assets/models/vehicles/bmw-525i-e34.glb', (route) => route.abort('failed'));

try {
  await page.goto(`${baseUrl}/app/?curated-car-fallback=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  await page.locator('#travelBtn').click();
  await page.waitForSelector('#travelMenu.open', { timeout: 10_000 });
  await page.locator('#fDriving').click();
  let fallbackReady = false;
  for (let attempt = 0; attempt < 120 && !fallbackReady; attempt += 1) {
    fallbackReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return !!ctx.carMesh && ctx.carMesh.userData.curatedVehicleLoadStarted === false;
    });
    if (!fallbackReady) await page.waitForTimeout(250);
  }
  assert.equal(fallbackReady, true, 'The built-in car did not recover after the curated asset failed.');

  const result = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const fallback = ctx.carMesh.children.filter((child) =>
      child.userData?.defaultPlayerVehicleFallback === true
    );
    return {
      fallbackParts: fallback.length,
      visibleFallbackParts: fallback.filter((child) => child.visible).length,
      curatedAssetId: ctx.carMesh.userData.curatedVehicleAssetId || '',
      curatedVisualCount: ctx.carMesh.children.filter((child) =>
        child.userData?.curatedVehicleAssetId === 'vehicle-bmw-525i-e34'
      ).length
    };
  });

  assert.ok(result.fallbackParts > 0);
  assert.equal(result.visibleFallbackParts, result.fallbackParts);
  assert.equal(result.curatedAssetId, '');
  assert.equal(result.curatedVisualCount, 0);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await browser.close();
}
