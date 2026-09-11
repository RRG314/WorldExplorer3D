import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const servedRoot = path.resolve(process.cwd(), String(process.env.WE3D_VERIFY_ROOT || '.'));
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4471, 4472, 4473] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const evidenceDir = path.resolve('output/verification/maryland-parcel-property');
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];
const parcelRequests = [];
page.on('pageerror', (error) => browserErrors.push(error.stack || String(error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) failedLocalResources.push(`${response.status()} ${response.url()}`);
});
page.on('request', (request) => {
  if (request.url().includes('/MD_ParcelBoundaries/MapServer/0/query')) parcelRequests.push(request.url());
});

async function diagnostics() {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function launchBaltimore() {
  await page.goto(`${baseUrl}/app/?diagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false && document.getElementById('globeSelectorScreen')?.classList.contains('show'), null, { timeout: 120_000 });
  await page.locator('#globeCustomLat').fill('39.2904');
  await page.locator('#globeCustomLon').fill('-76.6122');
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.gameStarted === true && state.worldLoading === false && state.worldCounts?.buildings > 0;
  }, null, { timeout: 180_000 });
}

async function openPropertyHub() {
  await page.locator('#realEstateFloatBtn').click();
  await page.locator('#fRealEstate').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.marylandParcels?.status === 'ready' && state.marylandParcels?.parcelCount > 0;
  }, null, { timeout: 45_000 });
  await page.locator('.propertyHubTabs [data-property-view="nearby"]').click();
  await page.locator('.propertyParcelNotice').waitFor({ state: 'visible' });
}

try {
  await launchBaltimore();
  await openPropertyHub();
  const state = await diagnostics();
  assert.equal(state.marylandParcels.status, 'ready');
  assert.ok(state.marylandParcels.parcelCount > 0);
  assert.ok(state.marylandParcels.parcelPropertyCount > 0);
  assert.ok(parcelRequests.length >= 1);
  for (const requestUrl of parcelRequests) {
    const fields = new URL(requestUrl).searchParams.get('outFields') || '';
    assert.doesNotMatch(fields, /OWNADD|OWNCITY|OWNSTATE|OWNERZIP|OWNZIP|OWNERNAME/i);
    assert.doesNotMatch(fields, /ACCTID/i);
  }
  assert.match(await page.locator('.propertyParcelNotice').innerText(), /Maryland parcel-aware/i);
  assert.equal(await page.locator('#propertyPanel').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.right <= window.innerWidth && rect.bottom <= window.innerHeight && rect.width > 300;
  }), true);
  await page.screenshot({ path: path.join(evidenceDir, '01-desktop-parcel-property-hub.png'), fullPage: true });

  const firstParcelCard = page.locator('.propertyHomeCard.candidate[data-parcel-property="true"]').first();
  await firstParcelCard.locator('[data-property-action="details"]').click();
  await page.locator('[data-property-action="boundary"]').waitFor({ state: 'visible' });
  assert.match(await page.locator('#propertyModal').innerText(), /not a legal survey/i);
  const parcelShape = page.locator('.propertyParcelShape svg polygon');
  await parcelShape.waitFor({ state: 'visible' });
  assert.ok((await parcelShape.getAttribute('points') || '').split(' ').length >= 3);
  await page.screenshot({ path: path.join(evidenceDir, '02-desktop-parcel-details.png'), fullPage: true });
  await page.locator('[data-property-action="boundary"]').click();
  const boundary = await page.evaluate(() => import('/app/js/shared-context.js?v=55').then(({ ctx }) => ({
    present: ctx.scene?.children?.some((child) => String(child.name || '').startsWith('parcel-boundary:')) === true,
    permission: ctx.canPlaceQuickBuildAt?.({ x: Number(ctx.car?.x || 0), z: Number(ctx.car?.z || 0) }) || null
  })));
  assert.equal(boundary.present, true);
  assert.equal(typeof boundary.permission?.allowed, 'boolean');
  await page.locator('#closeModalBtn').click();
  await page.locator('#closePropertyPanelBtn').click();
  await page.screenshot({ path: path.join(evidenceDir, '03-desktop-terrain-boundary.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => import('/app/js/shared-context.js?v=55').then(({ ctx }) => ctx.toggleRealEstate?.(true)));
  await page.locator('.propertyHubTabs [data-property-view="nearby"]').click();
  await page.locator('.propertyParcelNotice').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#propertyPanel').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
  }), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(evidenceDir, '04-mobile-parcel-property-hub.png'), fullPage: true });

  assert.deepEqual(browserErrors, []);
  assert.deepEqual(failedLocalResources, []);
  console.log(JSON.stringify({
    ok: true,
    parcelCount: state.marylandParcels.parcelCount,
    parcelPropertyCount: state.marylandParcels.parcelPropertyCount,
    associatedBuildingCount: state.marylandParcels.associatedBuildingCount,
    vacantParcelCount: state.marylandParcels.vacantParcelCount,
    parcelRequests: parcelRequests.length,
    parcelShapeRendered: true,
    boundaryRendered: boundary.present,
    desktopAndMobileFit: true,
    evidenceDir
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
