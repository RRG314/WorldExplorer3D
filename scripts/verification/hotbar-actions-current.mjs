import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/hotbar-actions-current');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const resumeStage = Number(process.env.WE3D_HOTBAR_RESUME_STAGE || 0);
const onlyAction = String(process.env.WE3D_HOTBAR_ONLY_ACTION || '');
const failures = [];
const completed = [];
const localRequestFailures = [];
const pageErrors = [];

function mark(label, details = '') {
  completed.push({ label, details });
  console.log(`PASS ${label}${details ? ` — ${details}` : ''}`);
}

function watchPage(page) {
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || '';
    if (request.url().startsWith(baseUrl) && !/ERR_ABORTED/i.test(reason)) {
      localRequestFailures.push(`request failed (${reason || 'unknown'}): ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localRequestFailures.push(`${response.status()} ${response.url()}`);
    }
  });
}

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function startEarth(page, suffix) {
  console.log(`LOAD Earth session: ${suffix}`);
  await page.goto(`${baseUrl}/app/?hotbar=${encodeURIComponent(suffix)}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
    await page.locator('#analyticsConsentDenyBtn').click();
  }
  if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
    await page.locator('#globeSelectorStartBtn').click();
  } else {
    await page.locator('#startBtn').click();
  }
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!(ctx.gameStarted && ctx.initialEarthWorldReady && !ctx.worldLoading && ctx.worldDiscoveryRuntime && ctx.urbanSandboxRuntime);
  }, null, { timeout: 180_000 });
}

async function openMenu(page, buttonId, menuId) {
  const button = page.locator(`#${buttonId}`);
  const menu = page.locator(`#${menuId}`);
  if (!await menu.evaluate((element) => element.classList.contains('open'))) await button.click();
  await page.waitForFunction((id) => document.getElementById(id)?.classList.contains('open'), menuId, { timeout: 3_000 });
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
}

async function clickMenuItem(page, buttonId, menuId, itemId) {
  await openMenu(page, buttonId, menuId);
  const item = page.locator(`#${itemId}`);
  assert.equal(await item.isVisible(), true, `${itemId} is not a visible hotbar action in this state`);
  await item.click();
}

async function verifyEarthActions(page) {
  const rootLabels = (await page.locator('#floatMenuContainer > .floatMenu:not(.contextualMenuControl) > .floatBtn .btnText').allTextContents())
    .map((label) => label.trim());
  assert.deepEqual(rootLabels, ['Explore', 'Travel', 'Backpack', 'Community', 'Real Estate']);
  mark('Hotbar roots', rootLabels.join(', '));

  if (resumeStage <= 0) {
  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fWorldDiscovery');
  await page.locator('#discoveryPanel[aria-hidden="false"] .discoveryPane[data-discovery-pane="today"].active').waitFor({ state: 'visible', timeout: 20_000 });
  assert.ok((await page.locator('#discoveryPanel').innerText()).trim().length > 80);
  await page.locator('#discoveryCloseBtn').click();
  mark('Explore · Today & Nearby');

  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fLiveGps');
  await page.locator('#liveGpsPermissionPanel.show').waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await page.locator('#liveGpsPermissionContinue').isEnabled(), true);
  await page.locator('#liveGpsPermissionCancel').click();
  mark('Explore · Live GPS', 'permission and safety flow reached');

  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fDeFlock');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.active === true, null, { timeout: 30_000 });
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('deflock-active')), true);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.stopGameplayPlugin?.('hotbar-verification');
  });
  mark('Explore · DeFlock Hunt', 'gameplay authority active');

  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fFlowerChallenge');
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getFlowerChallengeBackendStatus?.().challengeActive === true;
  }, null, { timeout: 20_000 });
  await page.locator('#flowerChallengeHud.show').waitFor({ state: 'visible', timeout: 10_000 });
  assert.match(await page.locator('#flowerChallengeHudStatus').textContent(), /flower/i);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.stopFlowerChallenge?.();
  });
  mark('Explore · Find Red Flower', 'challenge and marker active');

  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fFishing');
  await page.waitForFunction(() => {
    const fishing = globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing;
    return fishing?.open === true || !!fishing?.accessContext?.outcome;
  }, null, { timeout: 30_000 });
  const fishing = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});
  if (fishing.open) {
    assert.equal(await page.locator('#fishingActionBtn').isVisible(), true);
    await page.locator('#fishingCloseBtn').click();
  } else {
    assert.ok(String(fishing.accessContext?.outcome || '').length > 0, JSON.stringify(fishing));
  }
  mark('Explore · Fishing', fishing.open ? 'playable fishing panel reached' : `honest access result: ${fishing.accessContext.outcome}`);

  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fHistoric');
  await page.locator('#historicPanel.show').waitFor({ state: 'visible', timeout: 20_000 });
  assert.match(await page.locator('#historicCount').innerText(), /\d+ Sites/);
  await page.locator('#closeHistoricPanelBtn').click();
  mark('Explore · Historic Places');

  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fPOI');
  const poi = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return { active: ctx.poiMode === true, count: ctx.poiMeshes?.length || 0, visible: ctx.poiMeshes?.filter((mesh) => mesh?.visible).length || 0 };
  });
  assert.equal(poi.active, true);
  assert.ok(poi.count > 0, JSON.stringify(poi));
  assert.ok(poi.visible > 0, JSON.stringify(poi));
  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fPOI');
  mark('Explore · Nearby Places', `${poi.visible} visible markers`);
  }

  if (resumeStage <= 1) {
  await clickMenuItem(page, 'travelBtn', 'travelMenu', 'fWorldMap');
  await page.locator('#largeMap').waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await page.locator('#mapSearchInput').isVisible().catch(() => false), true);
  const worldSequenceBeforeSearch = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().livingWorld?.sequence || 0);
  await page.locator('#mapSearchInput').fill('39.2904, -76.6122');
  await page.locator('#mapSearchBtn').click();
  await page.locator('#largeMap').waitFor({ state: 'hidden', timeout: 20_000 });
  await page.waitForFunction((priorSequence) => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.worldLoading === false
      && Number(diagnostics.livingWorld?.sequence || 0) > priorSequence;
  }, worldSequenceBeforeSearch, { timeout: 180_000 });
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  const searchedLocation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return { lat: Number(ctx.customLoc?.lat), lon: Number(ctx.customLoc?.lon), name: String(ctx.customLoc?.name || '') };
  });
  assert.ok(Math.abs(searchedLocation.lat - 39.2904) < 0.00001, JSON.stringify(searchedLocation));
  assert.ok(Math.abs(searchedLocation.lon - (-76.6122)) < 0.00001, JSON.stringify(searchedLocation));
  mark('Travel · World Map & Search', 'search selected a location and rebuilt the playable world');

  for (const [id, expectedKey, label] of [
    ['fWalk', 'walking', 'Walk'],
    ['fDriving', null, 'Drive'],
    ['fDrone', 'drone', 'Fly Drone'],
    ['fPlane', 'plane', 'Fly Plane']
  ]) {
    await clickMenuItem(page, 'travelBtn', 'travelMenu', id);
    if (expectedKey) {
      await page.waitForFunction((key) => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.[key] === true, expectedKey, { timeout: 10_000 });
    } else {
      await page.waitForFunction(() => {
        const modes = JSON.parse(globalThis.render_game_to_text?.() || '{}').modes || {};
        return !modes.walking && !modes.drone && !modes.plane && !modes.boat;
      }, null, { timeout: 10_000 });
    }
    mark(`Travel · ${label}`);
  }

  await openMenu(page, 'travelBtn', 'travelMenu');
  const boatVisible = await page.locator('#fBoat').isVisible();
  const boatAvailability = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!(ctx.boatMode?.active || ctx.boatMode?.available || ctx.oceanMode?.active);
  });
  assert.equal(boatVisible, boatAvailability, 'Boat hotbar visibility did not match the boat authority.');
  if (boatVisible) {
    await page.locator('#fBoat').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.boat === true, null, { timeout: 10_000 });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.setTravelMode?.('walk', { source: 'hotbar-verification', force: true });
    });
    mark('Travel · Pilot Boat', 'nearby vessel entered');
  } else {
    await page.locator('#travelBtn').click();
    mark('Travel · Pilot Boat', 'correctly hidden because no vessel is in boarding range');
  }

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk?.state?.walker;
    if (walker) { walker.y = -500; walker.vy = -10; walker.onGround = false; }
  });
  await clickMenuItem(page, 'travelBtn', 'travelMenu', 'fRespawn');
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return Number(ctx.Walk?.state?.walker?.y) > -100 && ctx.Walk?.state?.walker?.onGround === true;
  }, null, { timeout: 20_000 });
  mark('Travel · Return to Safe Ground', 'recovered an invalid player position');
  }

  if (resumeStage <= 2) {
  await clickMenuItem(page, 'backpackBtn', 'backpackMenu', 'fBackpack');
  await page.locator('#urbanEquipment.show').waitFor({ state: 'visible', timeout: 20_000 });
  assert.ok(await page.locator('#urbanEquipment [data-equipment-id]').count() > 0);
  assert.ok(await page.locator('#urbanEquipment .urbanEquipmentSlot').count() > 0);
  await page.locator('#urbanEquipmentCloseBtn').click();
  mark('Backpack · Items & Quick Slots');

  for (const [id, pane, label] of [
    ['fExplorerJournal', 'journal', 'Journal'],
    ['fExplorerGuide', 'guide', 'Field Guide'],
    ['fExplorerProfile', 'profile', 'Profile, Skills & Companions']
  ]) {
    await clickMenuItem(page, 'backpackBtn', 'backpackMenu', id);
    await page.locator(`.discoveryPane[data-discovery-pane="${pane}"].active`).waitFor({ state: 'visible', timeout: 20_000 });
    assert.ok((await page.locator(`.discoveryPane[data-discovery-pane="${pane}"]`).innerText()).trim().length > 40);
    await page.locator('#discoveryCloseBtn').click();
    mark(`Backpack · ${label}`);
  }
  }

  if (resumeStage <= 3) {
  await clickMenuItem(page, 'communityBtn', 'communityMenu', 'fMultiplayer');
  await page.locator('#roomPanelModal.show').waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await page.locator('#roomPanelJoinBtn').isEnabled(), true);
  assert.equal(await page.locator('#roomPanelCreateBtn').isEnabled(), true);
  await page.locator('#roomPanelCloseBtn').click();
  mark('Community · Multiplayer', 'join/create room flow available');

  await clickMenuItem(page, 'communityBtn', 'communityMenu', 'fCommunityBoard');
  await page.locator('#flowerChallengePanel.open').waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await page.locator('#leaderboardTabExplorer').evaluate((el) => el.classList.contains('active')), true);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.closeFlowerChallengeTitlePanel?.();
  });
  mark('Community · Community Board');

  await clickMenuItem(page, 'communityBtn', 'communityMenu', 'fMemoryFlower');
  await page.locator('#memoryComposer.show').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#memoryMessageInput').fill('Hotbar verification marker');
  await page.locator('#memoryPlaceBtn').click();
  await page.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('worldExplorer3D.memories.v1') || '[]').some((entry) => entry.message === 'Hotbar verification marker'); }
    catch { return false; }
  }, null, { timeout: 10_000 });
  assert.equal(await page.locator('#memoryComposer').evaluate((el) => el.classList.contains('show')), false);
  mark('Community · Memory Marker', 'placed and persisted in isolated browser session');

  await clickMenuItem(page, 'communityBtn', 'communityMenu', 'fSharePlace');
  await page.locator('#gameShareMenu.show').waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await page.locator('#gameShareCopy').isEnabled(), true);
  await page.evaluate(() => document.body.click());
  mark('Community · Share This Place');

  await clickMenuItem(page, 'realEstateFloatBtn', 'realEstateMenu', 'fRealEstate');
  await page.locator('#propertyPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
  assert.ok(await page.locator('#propertyList').innerText().then((text) => text.trim().length) > 40);
  await page.locator('.propertyHubTabs [data-property-view="nearby"]').click();
  assert.equal(await page.locator('.propertyHubTabs [data-property-view="nearby"]').getAttribute('aria-selected'), 'true');
  await page.locator('.propertyHubTabs [data-property-view="home"]').click();
  assert.equal(await page.locator('.propertyHubTabs [data-property-view="home"]').getAttribute('aria-selected'), 'true');
  await page.locator('#closePropertyPanelBtn').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    // Reproduce a late parcel/ownership refresh after dismissal. It may update
    // data, but must not reopen Real Estate over the next gameplay action.
    ctx.updatePropertyPanel?.();
  });
  assert.equal(await page.locator('#propertyPanel').evaluate((element) => element.classList.contains('show')), false);
  mark('Real Estate · Property Hub', 'both public root views usable');

  await clickMenuItem(page, 'realEstateFloatBtn', 'realEstateMenu', 'fQuickBuild');
  await page.locator('#blockBuilderPanel[aria-hidden="false"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#blockBuilderPanel [data-block-tool="remove"]').click();
  assert.equal(await page.locator('#blockBuilderPanel [data-block-tool="remove"]').getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator('#blockBuilderShapes [data-block-shape]').count() > 1);
  assert.ok(await page.locator('#blockBuilderSwatches [data-block-material]').count() > 1);
  await page.locator('#blockBuilderClose').click();
  mark('Real Estate · Quick Build', 'tool, shapes, and materials usable');

  await page.locator('#controlsBarBtn').click();
  assert.equal(await page.locator('#ctrlContent').evaluate((el) => el.classList.contains('hidden')), false);
  assert.ok((await page.locator('#ctrlContent').innerText()).trim().length > 80);
  mark('Context · Current Controls');
  }

  await page.screenshot({ path: path.join(outputDir, 'desktop-earth-actions.png'), fullPage: true });
}

async function verifyEnvironmentAndSpaceActions(page) {
  await clickMenuItem(page, 'travelBtn', 'travelMenu', 'fOceanMode');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.ocean === true, null, { timeout: 60_000 });
  mark('Travel · Explore the Ocean');
  await clickMenuItem(page, 'travelBtn', 'travelMenu', 'fEarthMode');
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.environment === 'EARTH' && state.worldLoading === false && state.modes?.ocean === false;
  }, null, { timeout: 120_000 });
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.initialEarthWorldReady && !ctx.worldLoading;
  }, null, { timeout: 120_000 });
  mark('Travel · Return to Earth', 'Earth session resumed');

  await clickMenuItem(page, 'travelBtn', 'travelMenu', 'fDeployPathfinder');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').stagedEarthPathfinder?.active === true, null, { timeout: 30_000 });
  const staged = (await snapshot(page)).stagedEarthPathfinder;
  assert.ok(Number(staged.distance) >= 0, JSON.stringify(staged));
  mark('Travel · Deploy Pathfinder', 'physical Earth craft staged');

  await clickMenuItem(page, 'travelBtn', 'travelMenu', 'fBoardSolisReach');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true, null, { timeout: 120_000 });
  const interior = (await snapshot(page)).expeditionShipInterior;
  assert.ok(interior?.crewActors?.length >= 1, JSON.stringify(interior));
  mark('Travel · Board Solis Reach', 'playable ship interior reached');
  await page.screenshot({ path: path.join(outputDir, 'desktop-solis-reach.png'), fullPage: true });
}

async function verifyIsolatedSpaceAction(actionId, label, predicate) {
  const page = await context.newPage();
  watchPage(page);
  await startEarth(page, actionId);
  await clickMenuItem(page, 'travelBtn', 'travelMenu', actionId);
  try {
    await page.waitForFunction(predicate, null, { timeout: 120_000 });
  } catch (error) {
    const state = await snapshot(page);
    throw new Error(`${label} did not reach its end state. Current state: ${JSON.stringify(state)}\n${error?.stack || error}`);
  }
  mark(label);
  await page.close();
}

async function verifyMobileAccess() {
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await mobileContext.newPage();
  watchPage(page);
  await startEarth(page, 'mobile');
  await clickMenuItem(page, 'exploreBtn', 'exploreMenu', 'fWorldDiscovery');
  await page.locator('#discoveryPanel[aria-hidden="false"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#discoveryCloseBtn').click();
  await clickMenuItem(page, 'travelBtn', 'travelMenu', 'fWorldMap');
  await page.locator('#largeMap.show').waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await page.locator('#mapSearchInput').isVisible(), true);
  await page.locator('#mapClose').click();
  await clickMenuItem(page, 'backpackBtn', 'backpackMenu', 'fBackpack');
  await page.locator('#urbanEquipment.show').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#urbanEquipmentCloseBtn').click();
  await clickMenuItem(page, 'communityBtn', 'communityMenu', 'fCommunityBoard');
  await page.locator('#flowerChallengePanel.open').waitFor({ state: 'visible', timeout: 20_000 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.closeFlowerChallengeTitlePanel?.();
  });
  await clickMenuItem(page, 'realEstateFloatBtn', 'realEstateMenu', 'fRealEstate');
  await page.locator('#propertyPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#closePropertyPanelBtn').click();
  await page.locator('#controlsBarBtn').click();
  assert.notEqual(await page.locator('#controlsTab').evaluate((el) => getComputedStyle(el).display), 'none');
  assert.equal(await page.locator('#ctrlContent').evaluate((el) => el.classList.contains('hidden')), false);
  await page.screenshot({ path: path.join(outputDir, 'mobile-hotbar-access.png'), fullPage: true });
  mark('Mobile 390×844 access', 'all five roots and Controls accept one touch without double-toggle');
  await mobileContext.close();
}

try {
  if (!onlyAction) {
    const page = await context.newPage();
    watchPage(page);
    await startEarth(page, 'main');
    await verifyEarthActions(page);
    await verifyEnvironmentAndSpaceActions(page);
    await page.close();
  }

  if (!onlyAction || onlyAction === 'fSpaceRocket') await verifyIsolatedSpaceAction('fSpaceRocket', 'Travel · Free Space Flight', () => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space === true && state.spaceFlight?.controlMode === 'flying';
  });
  if (!onlyAction || onlyAction === 'fSpaceDirect') await verifyIsolatedSpaceAction('fSpaceDirect', 'Travel · Direct to Moon', () => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.environment === 'MOON' && state.worldLoading === false;
  });
  if (!onlyAction || onlyAction === 'mobile') await verifyMobileAccess();
} catch (error) {
  failures.push(String(error?.stack || error));
} finally {
  await context.close();
  await browser.close();
}

failures.push(...pageErrors, ...localRequestFailures);
const report = { ok: failures.length === 0, baseUrl, completed, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
