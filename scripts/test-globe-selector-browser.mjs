import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const externalBaseUrl = String(process.env.GLOBE_SELECTOR_URL || '').trim();
const server = externalBaseUrl ? null : await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4302, 4303, 4304, 4305]
});
const baseUrl = externalBaseUrl ||
  `http://127.0.0.1:${server.port}/app/?build=selector-browser-test`;
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

try {
await openSelector();
assert.equal(await page.locator('.globe-system-bar').count(), 0, 'legacy live status strip should be removed');
const destinationButtons = page.locator('.globe-destination-bar button');
assert.equal(await destinationButtons.count(), 5);
assert.deepEqual(await destinationButtons.allTextContents(), ['', '', '', '', '']);
const destinationChrome = await page.evaluate(() => ({
  barBorderTop: getComputedStyle(document.querySelector('.globe-destination-bar')).borderTopWidth,
  buttonBorders: [...document.querySelectorAll('.globe-destination-bar button')].map((button) => ({
    right: getComputedStyle(button).borderRightWidth,
    bottom: getComputedStyle(button).borderBottomWidth
  })),
  worldThumbnails: ['earth', 'moon', 'mars', 'ocean'].map((kind) => {
    const element = document.querySelector(`.destination-thumb.${kind}`);
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      kind,
      width: bounds.width,
      height: bounds.height,
      borderRadius: style.borderRadius,
      clipPath: style.clipPath
    };
  }),
  spaceThumbnail: (() => {
    const element = document.querySelector('.destination-thumb.space');
    const style = getComputedStyle(element);
    return { borderRadius: style.borderRadius, clipPath: style.clipPath };
  })()
}));
assert.equal(destinationChrome.barBorderTop, '0px');
assert(destinationChrome.buttonBorders.every(({ right, bottom }) => right === '0px' && bottom === '0px'));
assert(destinationChrome.worldThumbnails.every(({ width, height }) => Math.abs(width - height) < 0.01));
assert(destinationChrome.worldThumbnails.every(({ borderRadius }) => borderRadius === '999px'));
assert(destinationChrome.worldThumbnails.every(({ clipPath }) => clipPath === 'circle(50% at 50% 50%)'));
assert.equal(destinationChrome.spaceThumbnail.borderRadius, '8px');
assert.equal(destinationChrome.spaceThumbnail.clipPath, 'none');
await page.setViewportSize({ width: 390, height: 844 });
const mobileWorldThumbnails = await page.evaluate(() => (
  ['earth', 'moon', 'mars', 'ocean'].map((kind) => {
    const element = document.querySelector(`.destination-thumb.${kind}`);
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      kind,
      width: bounds.width,
      height: bounds.height,
      borderRadius: style.borderRadius,
      clipPath: style.clipPath
    };
  })
));
assert(mobileWorldThumbnails.every(({ width, height }) => Math.abs(width - height) < 0.01));
assert(mobileWorldThumbnails.every(({ borderRadius }) => borderRadius === '999px'));
assert(mobileWorldThumbnails.every(({ clipPath }) => clipPath === 'circle(50% at 50% 50%)'));
await page.setViewportSize({ width: 1365, height: 768 });

const themeButton = page.locator('#globeHubThemeBtn');
assert.equal(await page.evaluate(() => document.documentElement.dataset.hubTheme), 'night');
await page.screenshot({ path: path.join(outputDir, 'selector-night-clean.png'), fullPage: true });
await themeButton.click();
assert.equal(await page.evaluate(() => document.documentElement.dataset.hubTheme), 'day');
assert.equal(await themeButton.getAttribute('aria-pressed'), 'true');
const daySurfaceColors = await page.evaluate(() => {
  const color = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
  return {
    screen: color('#globeSelectorScreen'),
    shell: color('.globe-selector-shell'),
    side: color('.globe-selector-side'),
    destinationBar: color('.globe-destination-bar'),
    search: color('.globe-hub-search')
  };
});
assert(Object.values(daySurfaceColors).every((value) => !/rgb\((?:[0-2]?\d|3[0-9]),\s*(?:[0-2]?\d|3[0-9]),\s*(?:[0-2]?\d|3[0-9])\)/.test(value)), `day surfaces remained dark: ${JSON.stringify(daySurfaceColors)}`);
await page.screenshot({ path: path.join(outputDir, 'selector-day-clean.png'), fullPage: true });
await page.getByRole('button', { name: 'My Places' }).click();
await page.waitForSelector('#globeHubOverlay:not([hidden])');
const dayOverlayColors = await page.evaluate(() => ({
  overlay: getComputedStyle(document.querySelector('#globeHubOverlay')).backgroundColor,
  header: getComputedStyle(document.querySelector('.globe-hub-overlay-header')).backgroundColor,
  card: getComputedStyle(document.querySelector('.hub-library-grid button')).backgroundColor,
  footer: getComputedStyle(document.querySelector('.globe-hub-footer-host .title-footer')).backgroundColor
}));
assert(Object.values(dayOverlayColors).every((value) => !value.startsWith('rgb(0,') && !value.startsWith('rgb(3,') && !value.startsWith('rgb(5,') && !value.startsWith('rgb(7,')), `day overlay remained dark: ${JSON.stringify(dayOverlayColors)}`);
await page.screenshot({ path: path.join(outputDir, 'selector-day-my-places.png'), fullPage: true });
await page.locator('#globeHubOverlayCloseBtn').click();
await themeButton.click();
assert.equal(await page.evaluate(() => document.documentElement.dataset.hubTheme), 'night');

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
await page.screenshot({ path: path.join(outputDir, 'close-globe-original-imagery.png'), fullPage: true });

await stubTitleLaunch();
await page.getByRole('button', { name: 'Explore underwater at the selected coordinates' }).click();
await page.waitForFunction(() => window.__selectorLaunchCapture?.length === 1);
const oceanLaunch = (await page.evaluate(() => window.__selectorLaunchCapture))[0];
assertCoordinate(oceanLaunch.customLoc.lat, 35.6762, 'ocean latitude');
assertCoordinate(oceanLaunch.customLoc.lon, 139.6503, 'ocean longitude');
assert.equal(oceanLaunch.loadingScreenMode, 'ocean');

await page.route('https://nominatim.openstreetmap.org/reverse?*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ error: 'Unable to geocode' })
}));
await page.route('https://wms.gebco.net/mapserv?*', (route) => route.fulfill({
  status: 200,
  contentType: 'text/plain',
  body: "GetFeatureInfo results:\nvalue_list = '-4300'"
}));
await openSelector();
await page.locator('#globeCustomLat').fill('0');
await page.locator('#globeCustomLon').fill('-140');
await stubTitleLaunch();
await page.getByRole('button', { name: 'Explore', exact: true }).click();
await page.waitForFunction(() => window.__selectorLaunchCapture?.length === 1, null, { timeout: 20000 });
const surfaceOceanLaunch = (await page.evaluate(() => window.__selectorLaunchCapture))[0];
assertCoordinate(surfaceOceanLaunch.customLoc.lat, 0, 'surface-ocean latitude');
assertCoordinate(surfaceOceanLaunch.customLoc.lon, -140, 'surface-ocean longitude');
assert.equal(surfaceOceanLaunch.customLoc.arrivalMode, 'boat');
await page.unroute('https://nominatim.openstreetmap.org/reverse?*');
await page.unroute('https://wms.gebco.net/mapserv?*');

await page.route('https://nominatim.openstreetmap.org/reverse?*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    category: 'boundary',
    type: 'administrative',
    addresstype: 'state_district',
    name: 'Gbêkê',
    display_name: 'Gbêkê, Vallée du Bandama, Côte d’Ivoire',
    address: {
      state_district: 'Gbêkê',
      state: 'Vallée du Bandama',
      country: 'Côte d’Ivoire'
    }
  })
}));
await page.route('https://wms.gebco.net/mapserv?*', (route) => route.fulfill({
  status: 200,
  contentType: 'text/plain',
  body: "GetFeatureInfo results:\nvalue_list = '284'"
}));
await page.locator('#globeCustomLat').fill('7.8939');
await page.locator('#globeCustomLon').fill('-4.9369');
await stubTitleLaunch();
await page.getByRole('button', { name: 'Explore', exact: true }).click();
await page.waitForFunction(() => window.__selectorLaunchCapture?.length === 1, null, { timeout: 20000 });
const africaLandLaunch = (await page.evaluate(() => window.__selectorLaunchCapture))[0];
assertCoordinate(africaLandLaunch.customLoc.lat, 7.8939, 'Africa land latitude');
assertCoordinate(africaLandLaunch.customLoc.lon, -4.9369, 'Africa land longitude');
assert.equal(africaLandLaunch.customLoc.arrivalMode, 'auto');
assert.equal(africaLandLaunch.customLoc.waterKind, null);
assert.equal(africaLandLaunch.customLoc.surfaceEvidence?.kind, 'land');
assert.equal(africaLandLaunch.customLoc.surfaceEvidence?.elevationMeters, 284);
await page.screenshot({ path: path.join(outputDir, 'africa-land-selection.png'), fullPage: true });
await page.unroute('https://nominatim.openstreetmap.org/reverse?*');
await page.unroute('https://wms.gebco.net/mapserv?*');

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

let globalBathymetryRequests = 0;
await page.route('https://wms.gebco.net/mapserv?*', (route) => {
  globalBathymetryRequests += 1;
  return route.fulfill({
    status: 200,
    contentType: 'text/plain',
    body: "GetFeatureInfo results:\nvalue_list = '-4300'"
  });
});
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
  const grid = ctx.oceanMode?.globalBathymetryGrid;
  return ctx.oceanMode?.globalBathymetryReady === true &&
    grid?.dataset === 'GEBCO_2024 Grid' && grid?.values?.length === 25;
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
assert.equal(globalBathymetryRequests, 25);
await page.unroute('https://wms.gebco.net/mapserv?*');
await page.screenshot({ path: path.join(outputDir, 'pacific-global-bathymetry.png'), fullPage: true });

assert.deepEqual(errors, [], `selector emitted errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({
  ok: true,
  featuredCities: featuredNames.length,
  tokyoCoordinates: [35.6762, 139.6503],
  oceanCoordinates: [oceanLaunch.customLoc.lat, oceanLaunch.customLoc.lon],
  surfaceOceanArrival: surfaceOceanLaunch.customLoc.arrivalMode,
  africaLandArrival: africaLandLaunch.customLoc.arrivalMode,
  doubleClickCoordinates: [doubleClickLaunch.customLoc.lat, doubleClickLaunch.customLoc.lon],
  geolocationCoordinates: [geolocationLaunch.customLoc.lat, geolocationLaunch.customLoc.lon],
  screenshots: [
    'output/playwright/globe-selector/selector-night-clean.png',
    'output/playwright/globe-selector/selector-day-clean.png',
    'output/playwright/globe-selector/selector-day-my-places.png',
    'output/playwright/globe-selector/featured-cities.png',
    'output/playwright/globe-selector/close-globe-original-imagery.png',
    'output/playwright/globe-selector/africa-land-selection.png',
    'output/playwright/globe-selector/pacific-global-bathymetry.png'
  ]
}, null, 2));

} finally {
  await browser.close();
  await server?.close();
}
