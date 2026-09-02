import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const servedRoot = path.resolve(process.cwd(), String(process.env.WE3D_VERIFY_ROOT || '.'));
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4440, 4441, 4442] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const evidenceDir = 'output/verification/player-navigation';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

async function openMenu(buttonId, menuId) {
  await page.locator(`#${buttonId}`).click();
  await page.waitForSelector(`#${menuId}.open`);
  assert.equal(await page.locator(`#${buttonId}`).getAttribute('aria-expanded'), 'true');
}

try {
  await mkdir(evidenceDir, { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted === true
      && diagnostics.worldLoading === false
      && diagnostics.worldDiscovery?.active === true
      && !document.getElementById('loading')?.classList.contains('show');
  }, null, { timeout: 360_000 });
  await page.waitForSelector('#tutorialHintCard:not([hidden])', { timeout: 20_000 });
  await page.locator('#tutorialHintCard .tutorial-text-btn').click();

  const hubPresentation = await page.locator('#floatMenuContainer > .floatMenuRow > .floatMenu > .floatBtn').evaluateAll((buttons) => buttons.map((button) => ({
    label: button.querySelector('.btnText')?.textContent?.trim(),
    mobileLabel: button.getAttribute('data-mobile-label'),
    accessibleLabel: button.getAttribute('aria-label'),
    hasVectorIcon: Boolean(button.querySelector('.btnIcon[aria-hidden="true"] svg'))
  })));
  assert.deepEqual(hubPresentation.map((entry) => entry.label), ['Explore', 'Travel', 'Create', 'Community', 'Pack']);
  assert.deepEqual(hubPresentation.map((entry) => entry.mobileLabel), ['Explore', 'Travel', 'Create', 'Community', 'Pack']);
  assert.ok(hubPresentation.every((entry) => entry.accessibleLabel && entry.hasVectorIcon));

  await openMenu('exploreBtn', 'exploreMenu');
  assert.match(await page.locator('#exploreMenu .floatItems').textContent(), /Today & Nearby.*Choose an Activity.*Explore with Live GPS/s);
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show .discoveryPane[data-discovery-pane="today"].active');
  await page.locator('#discoveryCloseBtn').click();

  await openMenu('packBtn', 'packMenu');
  await page.locator('#fExplorerJournal').click();
  await page.waitForSelector('#discoveryPanel.show .discoveryPane[data-discovery-pane="journal"].active');
  await page.locator('#discoveryCloseBtn').click();

  await openMenu('packBtn', 'packMenu');
  await page.locator('#fExplorerProfile').click();
  await page.waitForSelector('#discoveryPanel.show .discoveryPane[data-discovery-pane="profile"].active');
  assert.match(await page.locator('#discoveryJourneyOverview').textContent(), /Choose your next direction.*Discover.*Travel.*Create.*Explore Together.*Companions/is);
  await page.screenshot({ path: `${evidenceDir}/00-my-explorer-story-desktop.png` });
  await page.locator('#discoveryJourneyOverview [data-explorer-route="travel"]').click();
  await page.waitForSelector('#travelMenu.open');
  assert.match(await page.locator('#travelMenu .floatItems').textContent(), /Open World Map.*Drive.*Walk.*Deploy Pathfinder Pod.*Current Controls/is);
  assert.doesNotMatch(await page.locator('#travelMenu .floatItems').textContent(), /Choose Another Place/is);
  const travelMutationCount = await page.evaluate(async () => {
    const menu = document.querySelector('#travelMenu .floatItems');
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(menu, { attributes: true, childList: true, characterData: true, subtree: true });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    observer.disconnect();
    return mutations;
  });
  assert.equal(travelMutationCount, 0, 'Travel content changed without a travel or environment transition.');
  await page.locator('#controlsBarBtn').click();
  await page.waitForFunction(() => !document.getElementById('ctrlContent')?.classList.contains('hidden'));
  assert.equal(await page.locator('#controlsTab').evaluate((element) => element.classList.contains('bar-open')), true);
  await page.mouse.click(720, 420);
  await page.waitForFunction(() => document.getElementById('ctrlContent')?.classList.contains('hidden'));

  await openMenu('realEstateFloatBtn', 'realEstateMenu');
  assert.match(await page.locator('#realEstateMenu .floatItems').textContent(), /Quick Build.*Edit This World.*Home & Property.*Live Sky.*Weather Live.*Satellite View/s);
  await page.locator('#fQuickBuild').click();
  await page.waitForSelector('#blockBuilderPanel.show', { timeout: 30_000 });
  await page.locator('#blockBuilderClose').click();

  await openMenu('realEstateFloatBtn', 'realEstateMenu');
  await page.locator('#fEditorMode').click();
  await page.waitForFunction(() => document.body.classList.contains('editor-workspace-open'), null, { timeout: 30_000 });
  await page.locator('#editorCloseBtn').click();
  await page.waitForFunction(() => !document.body.classList.contains('editor-workspace-open'));

  await openMenu('gameBtn', 'gameMenu');
  assert.match(await page.locator('#gameMenu .floatItems').textContent(), /Rooms & Players.*Community Board.*Memory Marker.*Share This Place/s);
  await page.locator('#fCommunityBoard').click();
  await page.waitForSelector('#flowerChallengePanel.open');
  await page.locator('#flowerChallengeToggleBtn').click();

  await openMenu('gameBtn', 'gameMenu');
  await page.locator('#fMultiplayer').click();
  await page.waitForSelector('#roomPanelModal.show', { timeout: 60_000 });
  await page.locator('#roomPanelCloseBtn').click();

  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);
  await page.screenshot({ path: `${evidenceDir}/01-five-player-choices-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobileLayout = await page.evaluate(() => {
    const bar = document.getElementById('floatMenuContainer')?.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#floatMenuContainer > .floatMenuRow > .floatMenu > .floatBtn')]
      .map((element) => ({ label: element.getAttribute('data-mobile-label'), box: element.getBoundingClientRect().toJSON() }));
    return {
      bar: bar?.toJSON(),
      buttons,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  assert.equal(mobileLayout.buttons.length, 5);
  assert.deepEqual(mobileLayout.buttons.map((entry) => entry.label), ['Explore', 'Travel', 'Create', 'Community', 'Pack']);
  assert.equal(mobileLayout.overflow, false);
  assert.ok(mobileLayout.buttons.every((entry) => entry.box.x >= 0 && entry.box.x + entry.box.width <= 390));
  await page.screenshot({ path: `${evidenceDir}/02-five-player-choices-mobile.png` });

  await openMenu('packBtn', 'packMenu');
  await page.locator('#fExplorerProfile').click();
  await page.waitForSelector('#discoveryPanel.show .discoveryPane[data-discovery-pane="profile"].active');
  const mobileExplorerBox = await page.locator('#discoveryPanel').boundingBox();
  assert.ok(mobileExplorerBox && mobileExplorerBox.x >= 0 && mobileExplorerBox.x + mobileExplorerBox.width <= 390 && mobileExplorerBox.y >= 0 && mobileExplorerBox.y + mobileExplorerBox.height <= 844);
  await page.screenshot({ path: `${evidenceDir}/03-my-explorer-story-mobile.png` });

  const playerCopy = `${await page.locator('#floatMenuContainer').textContent()}`;
  const report = {
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    checks: {
      fiveClearChoices: true,
      exploreOpensToday: true,
      travelIncludesModesWorldViewControlsAndRecovery: true,
      travelMenuStableWithoutStateChange: travelMutationCount === 0,
      createOpensQuickBuildAndExistingEditor: true,
      communitySeparatesRoomsBoardMemoriesAndSharing: true,
      packOpensJournal: true,
      explorerStoryLinksToExistingHubs: true,
      noDuplicateElementIds: duplicateIds.length === 0,
      naturalPlayerLanguage: !/authority|schema|pipeline|scaffold|procedural|generated/i.test(playerCopy),
      mobileFits390x844: mobileLayout.overflow === false,
      explorerStoryFits390x844: !!mobileExplorerBox,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
    browserErrors,
    failedLocalResources
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
