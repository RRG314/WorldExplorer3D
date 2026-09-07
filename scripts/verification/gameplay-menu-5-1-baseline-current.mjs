import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/player-navigation-current');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const browserErrors = [];

async function startEarth(page) {
  await page.goto(`${baseUrl}/app/?navigation=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) await page.locator('#analyticsConsentDenyBtn').click();
  if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) await page.locator('#globeSelectorStartBtn').click();
  else await page.locator('#startBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!(ctx.gameStarted && ctx.initialEarthWorldReady && !ctx.worldLoading && ctx.worldDiscoveryRuntime && ctx.urbanSandboxRuntime && ctx.openWorldDiscoverySection);
  }, null, { timeout: 180_000 });
}

async function openMenu(page, buttonId, menuId) {
  await page.locator(`#${buttonId}`).click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator(`#${menuId}`).evaluate((menu) => menu.classList.contains('open')), true, `${buttonId} did not stay open`);
  assert.equal(await page.locator(`#${buttonId}`).getAttribute('aria-expanded'), 'true');
}

async function verify(viewport, name) {
  const touch = viewport.width <= 760;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const runtimeRequests = [];
  page.on('request', (request) => runtimeRequests.push(request.url()));
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  await startEarth(page);

  const labels = await page.locator('#floatMenuContainer > .floatMenu:not(.contextualMenuControl) > .floatBtn .btnText').allTextContents();
  assert.deepEqual(labels.map((label) => label.trim()), ['Explore', 'Travel', 'Backpack', 'Community', 'Real Estate']);
  assert.equal(await page.locator('#gameBtn, #gameMenu').count(), 0);
  assert.equal(await page.getByText('My Explorer', { exact: true }).count(), 0);

  await openMenu(page, 'exploreBtn', 'exploreMenu');
  const exploreText = (await page.locator('#exploreMenu .floatItems').textContent()).replace(/\s+/g, ' ').trim();
  assert.match(exploreText, /Today & Nearby.*Explore with Live GPS.*DeFlock Hunt.*Historic Places/s);
  await page.locator('#fWorldDiscovery').click();
  await page.locator('#discoveryPanel[aria-hidden="false"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#discoveryCloseBtn').click();

  await openMenu(page, 'travelBtn', 'travelMenu');
  const travelText = (await page.locator('#travelMenu .floatItems').textContent()).replace(/\s+/g, ' ').trim();
  assert.match(travelText, /World Map & Search.*Walk.*Drive.*Earth.*Pathfinder.*Return to Safe Ground/s);
  await page.locator('#fWorldMap').click();
  await page.locator('#largeMap').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#mapClose').click();

  await openMenu(page, 'backpackBtn', 'backpackMenu');
  const backpackText = (await page.locator('#backpackMenu .floatItems').textContent()).replace(/\s+/g, ' ').trim();
  assert.match(backpackText, /Items & Quick Slots.*Journal.*Field Guide.*Profile, Skills & Companions/s);
  await page.locator('#fBackpack').click();
  await page.locator('#urbanEquipment.show').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#urbanEquipmentCloseBtn').click();
  await openMenu(page, 'backpackBtn', 'backpackMenu');
  await page.locator('#fExplorerJournal').click();
  await page.locator('.discoveryPane[data-discovery-pane="journal"].active').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#discoveryCloseBtn').click();
  await openMenu(page, 'backpackBtn', 'backpackMenu');
  await page.locator('#fExplorerGuide').click();
  await page.locator('.discoveryPane[data-discovery-pane="guide"].active').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#discoveryCloseBtn').click();
  await openMenu(page, 'backpackBtn', 'backpackMenu');
  await page.locator('#fExplorerProfile').click();
  await page.locator('.discoveryPane[data-discovery-pane="profile"].active').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#discoveryCloseBtn').click();

  await openMenu(page, 'communityBtn', 'communityMenu');
  const communityText = (await page.locator('#communityMenu .floatItems').textContent()).replace(/\s+/g, ' ').trim();
  assert.match(communityText, /Multiplayer.*Community Board.*Memory Marker.*Share This Place/s);

  await openMenu(page, 'realEstateFloatBtn', 'realEstateMenu');
  const realEstateText = (await page.locator('#realEstateMenu .floatItems').textContent()).replace(/\s+/g, ' ').trim();
  assert.equal(realEstateText, '⌂ Property Hub 🧱 Quick Build');
  await page.locator('#fRealEstate').click();
  await page.locator('#propertyPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
  assert.deepEqual(await page.locator('.propertyHubTabs button').allTextContents(), ['My Properties', 'Find a Property']);
  assert.equal(await page.locator('.propertyHubTabs [data-property-view="offers"], .propertyHubTabs [data-property-view="storage"], .propertyHubTabs [data-property-view="market"]').count(), 0);
  await page.locator('.propertyHubTabs [data-property-view="nearby"]').click();
  assert.equal(await page.locator('.propertyHubTabs [data-property-view="nearby"]').getAttribute('aria-selected'), 'true');
  await page.locator('.propertyHubTabs [data-property-view="home"]').click();
  assert.equal(await page.locator('.propertyHubTabs [data-property-view="home"]').getAttribute('aria-selected'), 'true');
  await page.screenshot({ path: path.join(outputDir, `${name}-real-estate.png`), fullPage: true });
  await page.locator('#closePropertyPanelBtn').click();

  await openMenu(page, 'realEstateFloatBtn', 'realEstateMenu');
  await page.locator('#fQuickBuild').click();
  await page.locator('#blockBuilderPanel[aria-hidden="false"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#blockBuilderClose').click();

  await page.locator('#controlsBarBtn').click();
  assert.equal(await page.locator('#ctrlContent').evaluate((element) => element.classList.contains('hidden')), false);
  if (touch) assert.notEqual(await page.locator('#controlsTab').evaluate((element) => getComputedStyle(element).display), 'none');

  assert.deepEqual(runtimeRequests.filter((url) => /\/js\/(?:editor|activity-editor)\//.test(url)), []);
  await page.screenshot({ path: path.join(outputDir, `${name}-navigation.png`), fullPage: true });
  await context.close();
  return { viewport, labels, exploreText, travelText, backpackText, communityText, realEstateText };
}

const mobileOnly = process.argv.includes('--mobile-only');
const desktopOnly = process.argv.includes('--desktop-only');
let result = null;
try {
  result = {
    desktop: mobileOnly ? null : await verify({ width: 1440, height: 900 }, 'desktop'),
    mobile: desktopOnly ? null : await verify({ width: 390, height: 844 }, 'mobile')
  };
} catch (error) {
  failures.push(String(error?.stack || error));
} finally {
  await browser.close();
}

failures.push(...browserErrors);
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
