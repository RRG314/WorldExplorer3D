import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.GLOBE_SELECTOR_URL || 'http://127.0.0.1:4302/app/?build=selector-browser-test';
const origin = new URL(baseUrl).origin;
const outputDir = path.resolve('output/playwright/globe-selector');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1365, height: 768 },
  geolocation: { latitude: 39.123456, longitude: -76.654321 },
  permissions: ['geolocation']
});
await context.grantPermissions(['geolocation'], { origin });
const page = await context.newPage();
const errors = [];
const assertCoordinate = (actual, expected, label) => {
  assert(Math.abs(Number(actual) - Number(expected)) < 1e-9, `${label}: expected ${expected}, received ${actual}`);
};
page.on('pageerror', (error) => errors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
});

async function openSelector() {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#globeSelectorCanvas')?.width > 100, null, { timeout: 30000 });
}

async function stubTitleLaunch() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__selectorLaunchCapture = [];
    ctx.triggerTitleStart = async (options = {}) => {
      window.__selectorLaunchCapture.push({
        options,
        selLoc: ctx.selLoc,
        customLoc: ctx.customLoc ? { ...ctx.customLoc } : null,
        loadingScreenMode: ctx.loadingScreenMode
      });
      return true;
    };
  });
}

await openSelector();
await page.getByRole('button', { name: 'Featured Cities' }).click();
const featuredNames = await page.locator('#globeCityList .globe-selector-city-item-name').allTextContents();
assert.deepEqual(featuredNames, [
  'Baltimore', 'Hollywood', 'New York', 'Miami', 'Tokyo', 'Monaco', 'Nürburgring',
  'Las Vegas', 'London', 'Paris', 'Dubai', 'San Francisco', 'Los Angeles', 'Chicago', 'Seattle'
]);
assert.equal(await page.locator('#globeCityList .globe-selector-city-section').count(), 0);
await page.locator('#globeCityList').getByText('Tokyo', { exact: true }).click();
assert.equal(await page.locator('#globeSelectorLatLon').textContent(), '35.676200, 139.650300');
assert.equal(await page.locator('#globeCustomLat').inputValue(), '35.676200');
assert.equal(await page.locator('#globeCustomLon').inputValue(), '139.650300');
await page.screenshot({ path: path.join(outputDir, 'featured-cities.png'), fullPage: true });

const canvas = page.locator('#globeSelectorCanvas');
const canvasBox = await canvas.boundingBox();
assert(canvasBox, 'globe canvas is not visible');
await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
for (let index = 0; index < 14; index += 1) {
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(80);
}
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outputDir, 'close-globe-detail.png'), fullPage: true });

await stubTitleLaunch();
await page.getByRole('button', { name: 'Explore underwater at the selected coordinates' }).click();
await page.waitForFunction(() => window.__selectorLaunchCapture?.length === 1);
const oceanLaunch = (await page.evaluate(() => window.__selectorLaunchCapture))[0];
assertCoordinate(oceanLaunch.customLoc.lat, 35.6762, 'ocean latitude');
assertCoordinate(oceanLaunch.customLoc.lon, 139.6503, 'ocean longitude');
assert.equal(oceanLaunch.loadingScreenMode, 'ocean');

await openSelector();
await page.getByRole('button', { name: 'Featured Cities' }).click();
await stubTitleLaunch();
await page.locator('#globeCityList').getByText('Paris', { exact: true }).dblclick();
await page.waitForFunction(() => window.__selectorLaunchCapture?.length === 1);
const doubleClickLaunch = (await page.evaluate(() => window.__selectorLaunchCapture))[0];
assertCoordinate(doubleClickLaunch.customLoc.lat, 48.8566, 'double-click latitude');
assertCoordinate(doubleClickLaunch.customLoc.lon, 2.3522, 'double-click longitude');

await openSelector();
await stubTitleLaunch();
await page.getByRole('button', { name: 'Use My Location' }).click();
await page.waitForFunction(() => window.__selectorLaunchCapture?.length === 1, null, { timeout: 20000 });
const geolocationLaunch = (await page.evaluate(() => window.__selectorLaunchCapture))[0];
assertCoordinate(geolocationLaunch.customLoc.lat, 39.123456, 'geolocation latitude');
assertCoordinate(geolocationLaunch.customLoc.lon, -76.654321, 'geolocation longitude');

const oceanStarted = await page.evaluate(async () => {
  const { ctx } = await import('/app/js/shared-context.js?v=55');
  ctx.globeSelector?.close?.();
  document.getElementById('titleScreen')?.classList.add('hidden');
  ctx.gameStarted = true;
  return ctx.startOceanMode?.({
    launchSite: { lat: 0, lon: -140, name: 'Pacific test site', region: 'Open Pacific' }
  });
});
assert.equal(oceanStarted, true);
await page.waitForFunction(async () => {
  const { ctx } = await import('/app/js/shared-context.js?v=55');
  return ctx.oceanMode?.globalBathymetryReady === true;
}, null, { timeout: 60000 });
const globalBathymetry = await page.evaluate(async () => {
  const { ctx } = await import('/app/js/shared-context.js?v=55');
  const grid = ctx.oceanMode?.globalBathymetryGrid;
  return {
    launchSite: ctx.oceanMode?.launchSite,
    dataset: grid?.dataset,
    sampleCount: grid?.values?.length || 0,
    negativeDepths: (grid?.values || []).filter((value) => Number(value) < 0).length
  };
});
assert.equal(globalBathymetry.dataset, 'GEBCO_2024 Grid');
assert.equal(globalBathymetry.sampleCount, 25);
assert(globalBathymetry.negativeDepths >= 20);
await page.screenshot({ path: path.join(outputDir, 'pacific-global-bathymetry.png'), fullPage: true });

assert.deepEqual(errors, [], `selector emitted errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({
  ok: true,
  featuredCities: featuredNames.length,
  tokyoCoordinates: [35.6762, 139.6503],
  oceanCoordinates: [oceanLaunch.customLoc.lat, oceanLaunch.customLoc.lon],
  doubleClickCoordinates: [doubleClickLaunch.customLoc.lat, doubleClickLaunch.customLoc.lon],
  geolocationCoordinates: [geolocationLaunch.customLoc.lat, geolocationLaunch.customLoc.lon],
  screenshots: [
    'output/playwright/globe-selector/featured-cities.png',
    'output/playwright/globe-selector/close-globe-detail.png',
    'output/playwright/globe-selector/pacific-global-bathymetry.png'
  ]
}, null, 2));

await browser.close();
