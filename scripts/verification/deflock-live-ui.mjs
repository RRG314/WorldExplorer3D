import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const verifyRoot = process.env.WE3D_VERIFY_ROOT || process.cwd();
const server = externalUrl ? null : await startStaticServer({ rootDir: verifyRoot, ports: [4421, 4422, 4423] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const pageErrors = [];

async function dragGlobe(page, context, start, deltaX, touchInput) {
  if (!touchInput) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + deltaX, start.y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: start.x, y: start.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]
  });
  for (let step = 1; step <= 8; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start.x + deltaX * step / 8, y: start.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function openDeFlock(context, screenshotName, touchInput = false) {
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const consent = page.locator('#analyticsConsentDenyBtn');
  if (await consent.isVisible()) await consent.click();
  await page.locator('[data-globe-destination="live-earth"]').click();

  assert.equal(await page.locator('#globeHubOverlay:not([hidden])').count(), 0, 'Live Data must not cover its own globe.');
  assert.equal(await page.locator('.globe-selector-side > #globeSelectorLiveEarthPanel.active').count(), 1, 'Live Data controls must remain beside the globe.');
  const stage = await page.locator('.globe-selector-stage').boundingBox();
  assert.ok(stage && stage.width >= 300 && stage.height >= 200, 'The DeFlock globe must remain visible and navigable.');
  const entry = await page.evaluate(() => {
    const panel = document.getElementById('globeSelectorLiveEarthPanel')?.getBoundingClientRect();
    const heading = document.querySelector('.globe-selector-live-header')?.getBoundingClientRect();
    const rail = document.querySelector('[data-globe-destination="live-earth"]');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: panel ? { top: panel.top, bottom: panel.bottom, width: panel.width } : null,
      heading: heading ? { top: heading.top, bottom: heading.bottom } : null,
      railActive: rail?.classList.contains('active') || false
    };
  });
  const maximumEntryTop = entry.viewport.width <= 900 ? entry.viewport.height * 0.76 : 220;
  assert.equal(entry.railActive, true, 'The Live Data destination must visibly activate on the first click.');
  assert.ok(entry.panel && entry.panel.top <= maximumEntryTop, 'The Live Data workspace must enter the visible viewport on the first click.');
  assert.ok(entry.heading && entry.heading.bottom < entry.viewport.height - 68, 'The Live Data heading must be visible above the navigation dock.');
  await page.screenshot({ path: `output/verification/deflock-live-ui/${screenshotName.replace('camera-selected', 'live-data-open')}`, fullPage: false });

  await page.getByRole('button', { name: 'DeFlock', exact: true }).click();
  await page.waitForFunction(() => /[1-9][\d,]+ mapped/.test(document.querySelector('.globe-selector-live-layer-status')?.textContent || ''), null, { timeout: 60_000 });
  const mappedCount = Number((await page.locator('.globe-selector-live-layer-status').textContent())?.replace(/\D/g, '') || 0);
  assert.ok(mappedCount > 100_000, 'The complete DeFlock point index must be loaded.');

  const nearest = page.getByRole('button', { name: /Select Nearest Camera/ });
  assert.equal(await nearest.isEnabled(), true, 'The selected location must offer an accessible camera choice.');
  await nearest.click();
  await page.waitForFunction(() => {
    const details = document.querySelector('.deflock-live-detail')?.textContent || '';
    const button = [...document.querySelectorAll('[data-live-earth-action="travel-deflock"]')][0];
    const detailResolved = /osm:(?:node|way):\d+|Exact camera direction and metadata are temporarily unavailable/i.test(details);
    return detailResolved && button instanceof HTMLButtonElement && button.disabled === false;
  }, null, { timeout: 90_000 });

  const start = page.getByRole('button', { name: 'Start DeFlock Here' });
  const focus = page.getByRole('button', { name: 'Focus Camera' });
  assert.equal(await start.isEnabled(), true);
  assert.equal(await focus.isEnabled(), true);
  await focus.click();

  const canvas = page.locator('#globeSelectorCanvas');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await page.waitForFunction(() => {
    const projection = globalThis.getWorldExplorerRuntimeDiagnostics?.()?.liveEarth?.selectedDeFlockProjection;
    return projection?.visible === true;
  }, null, { timeout: 10_000 });
  const focusedState = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics().liveEarth);
  const focusedProjection = focusedState.selectedDeFlockProjection;
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox, 'The DeFlock globe canvas must have a measurable hit region.');
  const dragStart = {
    x: canvasBox.x + canvasBox.width * 0.5,
    y: canvasBox.y + canvasBox.height * 0.5
  };
  await dragGlobe(page, context, dragStart, 48, touchInput);
  await page.waitForTimeout(250);
  const movedProjection = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics().liveEarth.selectedDeFlockProjection);
  assert.equal(movedProjection?.visible, true, 'The selected camera must remain visible after navigating the globe.');
  const navigationDistance = Math.hypot(movedProjection.x - focusedProjection.x, movedProjection.y - focusedProjection.y);
  assert.ok(navigationDistance >= 10, `The globe drag must move the selected point enough to exercise picking (moved ${navigationDistance.toFixed(1)} px).`);
  assert.ok(
    movedProjection.x >= canvasBox.x && movedProjection.x <= canvasBox.x + canvasBox.width &&
      movedProjection.y >= canvasBox.y && movedProjection.y <= canvasBox.y + canvasBox.height,
    'The moved selected camera must remain inside the globe canvas.'
  );

  const clickPoint = { x: movedProjection.x, y: movedProjection.y };
  await page.screenshot({ path: `output/verification/deflock-live-ui/${screenshotName.replace('camera-selected', 'picking-before-click')}`, fullPage: false });
  if (touchInput) await page.touchscreen.tap(clickPoint.x, clickPoint.y);
  else await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForFunction(() => {
    const details = document.querySelector('.deflock-live-detail')?.textContent || '';
    const button = [...document.querySelectorAll('[data-live-earth-action="travel-deflock"]')][0];
    const detailResolved = /osm:(?:node|way):\d+|Exact camera direction and metadata are temporarily unavailable/i.test(details);
    return detailResolved && button instanceof HTMLButtonElement && button.disabled === false;
  }, null, { timeout: 90_000 });
  const clickedState = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics().liveEarth);
  const clickedProjection = clickedState.selectedDeFlockProjection;
  const pointerErrorPx = Math.hypot(clickedProjection.x - clickPoint.x, clickedProjection.y - clickPoint.y);
  assert.ok(pointerErrorPx <= 8, `The selected DeFlock target must stay under the pointer (error ${pointerErrorPx.toFixed(1)} px; ${JSON.stringify({ focusedState, movedProjection, clickedState })}).`);

  const coverage = page.getByRole('button', { name: 'Show View Coverage' });
  let coverageToggle = 'not-mapped';
  if (await coverage.count()) {
    await coverage.click();
    await page.waitForSelector('[data-live-earth-action="toggle-deflock-coverage"]', { state: 'visible' });
    coverageToggle = (await page.getByRole('button', { name: 'Hide View Coverage' }).count()) ? 'working' : 'failed';
    assert.equal(coverageToggle, 'working');
  }
  await page.screenshot({ path: `output/verification/deflock-live-ui/${screenshotName}`, fullPage: true });
  return {
    mappedCount,
    stage,
    entry,
    coverageToggle,
    picking: {
      navigationDistancePx: Number(navigationDistance.toFixed(1)),
      pointerErrorPx: Number(pointerErrorPx.toFixed(1))
    },
    selectedText: (await page.locator('.deflock-live-detail').textContent())?.replace(/\s+/g, ' ').trim() || ''
  };
}

try {
  await mkdir('output/verification/deflock-live-ui', { recursive: true });
  const desktop = await browser.newContext({ viewport: { width: 1200, height: 500 } });
  const desktopResult = await openDeFlock(desktop, 'desktop-camera-selected.png');
  await desktop.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mobileResult = await openDeFlock(mobile, 'mobile-camera-selected.png', true);
  await mobile.close();
  const report = {
    ok: pageErrors.length === 0,
    contract: 'deflock-live-globe-and-actions-v3',
    desktop: desktopResult,
    mobile: mobileResult,
    pageErrors
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await browser.close();
  await server?.close();
}
