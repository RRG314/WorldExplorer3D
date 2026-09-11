import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/home-property-current');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon|ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(message.text())) pageErrors.push(message.text());
});

await page.addInitScript(() => {
  localStorage.removeItem('world-explorer:homes:v1');
  localStorage.setItem('world-explorer:local-commerce:v1', JSON.stringify({ schemaVersion: 2, credits: 1000, purchases: {}, claimedTrades: {}, transactions: [] }));
});

try {
  await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });

  await page.evaluate(() => document.getElementById('flowerChallengeToggleBtn')?.click());
  await page.waitForFunction(() => document.getElementById('flowerChallengePanel')?.classList.contains('open'), null, { timeout: 20_000 });
  await page.evaluate(() => document.getElementById('leaderboardTabProperty')?.click());
  await page.waitForFunction(() => document.getElementById('gameLeaderboardBadge')?.textContent?.trim() === 'Property', null, { timeout: 20_000 });
  assert.match(await page.locator('#gameLeaderboardScope').innerText(), /Global/);
  assert.doesNotMatch(await page.locator('#gameLeaderboardScope').innerText(), /This device/);
  await page.evaluate(() => document.getElementById('flowerChallengeToggleBtn')?.click());

  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForTimeout(800);
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return Array.isArray(ctx.buildings) && ctx.buildings.length > 0;
  }, null, { timeout: 180_000 });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.gameStarted && !state.worldLoading;
  }, null, { timeout: 360_000 });
  const staleLoadingOverlay = await page.evaluate(() => document.getElementById('loading')?.classList.contains('show') === true);
  if (staleLoadingOverlay) await page.addStyleTag({ content: '#loading{display:none!important;pointer-events:none!important}' });
  await page.waitForTimeout(1800);

  await page.evaluate(() => document.getElementById('fRealEstate')?.click());
  await page.waitForSelector('#propertyPanel.show', { timeout: 30_000 });
  assert.match(await page.locator('#propertyPanel').innerText(), /Real Estate/);
  assert.doesNotMatch(await page.locator('#propertyPanel').innerText(), /Demo Property|Demo Data/);

  await page.locator('[data-property-view="nearby"]').first().click();
  await page.waitForTimeout(1200);
  const propertyDebug = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      buildingCount: Array.isArray(ctx.buildings) ? ctx.buildings.length : null,
      propertyCount: Array.isArray(ctx.properties) ? ctx.properties.length : null,
      sampleBuilding: ctx.buildings?.[0] ? {
        sourceBuildingId: ctx.buildings[0].sourceBuildingId,
        buildingType: ctx.buildings[0].buildingType,
        pointCount: ctx.buildings[0].pts?.length,
        minX: ctx.buildings[0].minX,
        maxX: ctx.buildings[0].maxX
      } : null,
      text: document.getElementById('propertyList')?.innerText || '',
      loadingText: document.getElementById('loading')?.innerText || ''
    };
  });
  propertyDebug.pageErrors = pageErrors.slice();
  assert.ok(await page.locator('.propertyHomeCard.candidate').count() > 0, `No mapped property candidates were visible: ${JSON.stringify(propertyDebug)}`);
  assert.match(await page.locator('#propertyList').innerText(), /Estimated market value/);
  assert.match(await page.locator('#propertyList').innerText(), /Explore first, then sign in to choose/);
  assert.equal(await page.locator('[data-property-action="buy"]').count(), 0);
  assert.ok(await page.locator('[data-property-action="sign-in"]').count() > 0);
  const routeTarget = await page.locator('.propertyHomeCard.candidate').first().locator('[data-property-id]').first().getAttribute('data-property-id');
  assert.match(String(routeTarget), /^home:/);

  await page.locator('.propertyHomeCard.candidate [data-property-action="navigate"]').first().click();
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.showNavigation === true && !!ctx.selectedProperty;
  }, null, { timeout: 20_000 });

  await page.screenshot({ path: path.join(outputDir, 'home-property-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const panelBox = await page.locator('#propertyPanel').boundingBox();
  assert.ok(panelBox && panelBox.x >= 0 && panelBox.width <= 390 && panelBox.height <= 844);
  assert.equal(await page.locator('.propertyHubTabs button').count(), 2);
  await page.screenshot({ path: path.join(outputDir, 'home-property-mobile.png'), fullPage: true });

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    communityBoard: 'property',
    candidateId: routeTarget,
    guestBoundary: 'passed',
    route: 'visible',
    mobile: '390x844',
    staleLoadingOverlay
  }, null, 2));
} finally {
  await browser.close();
}
