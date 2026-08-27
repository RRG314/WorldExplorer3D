import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4394, 4395, 4396] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const origin = new URL(baseUrl).origin;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const browserErrors = [];
const localFailures = [];

async function instrument(page) {
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
  });
}

async function waitForWorld(page) {
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false && state.worldDiscovery?.active === true;
  }, null, { timeout: 240_000 });
}

async function inspectDirectPromptPlacement(page) {
  return page.evaluate(() => {
    const prompt = document.getElementById('urbanVehiclePrompt');
    if (!prompt?.classList.contains('show') || getComputedStyle(prompt).display === 'none') {
      return { visible: false, clearsMobileControls: true };
    }
    const overlaps = (left, right) => !!left && !!right &&
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    const promptBox = prompt.getBoundingClientRect();
    const controls = ['exploreBtn', 'mobileMovePad', 'mobileLookPad']
      .map((id) => document.getElementById(id)?.getBoundingClientRect())
      .filter(Boolean);
    return {
      visible: true,
      label: document.getElementById('urbanVehiclePromptTitle')?.textContent || '',
      clearsMobileControls: controls.every((box) => !overlaps(promptBox, box))
    };
  });
}

async function holdMobileMove(page, cdp, deltaX, deltaY, holdMs) {
  const box = await page.locator('#mobileMovePad').boundingBox();
  if (!box) throw new Error('Mobile movement pad is not available.');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const point = (x, y) => ({ x, y, id: 0, radiusX: 5, radiusY: 5, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start.x, start.y)] });
  await page.waitForTimeout(70);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point(start.x + deltaX, start.y + deltaY)]
  });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function moveAwayFromDirectInteraction(page, cdp) {
  const turnOffsets = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
  for (let attempt = 0; attempt < turnOffsets.length; attempt += 1) {
    const visible = await page.locator('#urbanVehiclePrompt.show, #interiorPrompt.show').count();
    if (!visible) return true;
    const gesture = await page.evaluate((turnOffset) => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const actor = diagnostics.activeActor?.position || {};
      const camera = diagnostics.camera?.position || {};
      const urban = diagnostics.urbanSandbox || {};
      const vehicle = urban.vehicles?.find((entry) => entry.id === urban.nearbyVehicleId);
      const target = vehicle?.driverDoor || null;
      if (!target) {
        return { x: Math.sin(turnOffset) * 54, y: Math.cos(turnOffset) * 54 };
      }
      const viewX = Number(actor.x) - Number(camera.x);
      const viewZ = Number(actor.z) - Number(camera.z);
      const viewLength = Math.hypot(viewX, viewZ) || 1;
      const forwardX = viewX / viewLength;
      const forwardZ = viewZ / viewLength;
      const rightX = -forwardZ;
      const rightZ = forwardX;
      const awayX = Number(actor.x) - Number(target.x);
      const awayZ = Number(actor.z) - Number(target.z);
      const rightAmount = awayX * rightX + awayZ * rightZ;
      const forwardAmount = awayX * forwardX + awayZ * forwardZ;
      const length = Math.hypot(rightAmount, forwardAmount) || 1;
      const screenX = rightAmount / length;
      const screenY = -forwardAmount / length;
      return {
        x: (screenX * Math.cos(turnOffset) - screenY * Math.sin(turnOffset)) * 54,
        y: (screenX * Math.sin(turnOffset) + screenY * Math.cos(turnOffset)) * 54
      };
    }, turnOffsets[attempt]);
    await holdMobileMove(page, cdp, gesture.x, gesture.y, 2_800);
    await page.waitForTimeout(350);
  }
  return await page.locator('#urbanVehiclePrompt.show, #interiorPrompt.show').count() === 0;
}

async function waitForLead(page, expectedMode, movePastDirectInteraction) {
  await page.waitForFunction((mode) => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.worldDiscovery?.encounterLead?.available === true &&
      state.worldDiscovery.encounterLead.mode === mode;
  }, expectedMode, { timeout: 30_000 });
  const directInteraction = await page.evaluate(() => {
    const direct = document.getElementById('urbanVehiclePrompt');
    const lead = document.getElementById('discoveryContextPrompt');
    return direct?.classList.contains('show') ? {
      label: document.getElementById('urbanVehiclePromptTitle')?.textContent || '',
      leadCorrectlyDeferred: !lead?.classList.contains('show')
    } : null;
  });
  if (directInteraction || await page.locator('#urbanVehiclePrompt.show, #interiorPrompt.show').count()) {
    await movePastDirectInteraction?.();
  }
  await page.waitForFunction(() => {
    const prompt = document.getElementById('discoveryContextPrompt');
    return prompt?.classList.contains('show') && getComputedStyle(prompt).display !== 'none';
  }, null, { timeout: 20_000 });
  const tutorialClose = page.locator('#tutorialHintCard .tutorial-icon-btn');
  if (await tutorialClose.isVisible()) await tutorialClose.click();
  const snapshotHandle = await page.waitForFunction((mode) => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    const prompt = document.getElementById('discoveryContextPrompt');
    const overlaps = (left, right) => !!left && !!right &&
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    const promptBox = prompt?.getBoundingClientRect();
    const promptButton = document.getElementById('discoveryContextOpenBtn');
    const promptButtonBox = promptButton?.getBoundingClientRect();
    const moveBox = document.getElementById('mobileMovePad')?.getBoundingClientRect();
    const lookBox = document.getElementById('mobileLookPad')?.getBoundingClientRect();
    const promptText = document.getElementById('discoveryContextText')?.textContent || '';
    if (!state?.worldDiscovery?.encounterLead?.available ||
      state.worldDiscovery.encounterLead.mode !== mode ||
      !prompt?.classList.contains('show') || getComputedStyle(prompt).display === 'none' ||
      !promptText.includes(state.worldDiscovery.encounterLead.leadLabel) ||
      !promptButtonBox || promptButtonBox.width < 44 || promptButtonBox.height < 44) return null;
    const visiblePromptLayers = [...document.querySelectorAll('body *')].filter((element) => {
      const text = String(element.textContent || '').trim();
      if (!/(Building|Equitable|Track Lead|Resume Photograph)/i.test(text)) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).map((element) => {
      const box = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        id: element.id || '',
        className: typeof element.className === 'string' ? element.className : '',
        text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        zIndex: getComputedStyle(element).zIndex,
        box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
      };
    });
    return {
      lead: state.worldDiscovery.encounterLead,
      promptText,
      promptButton: document.getElementById('discoveryContextOpenBtn')?.textContent || '',
      promptMode: prompt?.dataset.mode || '',
      promptClearsMobileControls: !overlaps(promptBox, moveBox) && !overlaps(promptBox, lookBox),
      promptButtonUsable: !!promptButtonBox && promptButtonBox.width >= 44 && promptButtonBox.height >= 44 &&
        promptButtonBox.left >= 0 && promptButtonBox.right <= innerWidth &&
        promptButtonBox.left >= promptBox.left && promptButtonBox.right <= promptBox.right,
      regionalEcology: state.worldDiscovery.regionalEcology,
      creatureQuality: state.worldDiscovery.creatureQuality,
      wildlife: state.worldDiscovery.wildlife,
      visiblePromptLayers
    };
  }, expectedMode, { timeout: 20_000 });
  const result = await snapshotHandle.jsonValue();
  await snapshotHandle.dispose();
  return { ...result, directInteraction };
}

async function acceptLead(page, lead) {
  await page.locator('#discoveryContextOpenBtn').click();
  try {
    await page.waitForFunction((slotId) => {
      const discovery = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery;
      return discovery?.interaction?.active === true && discovery.interaction.targetId === slotId &&
        discovery.encounterLead?.available === false;
    }, lead.slotId, { timeout: 20_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const discovery = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery;
      return { encounterLead: discovery?.encounterLead, interaction: discovery?.interaction };
    });
    throw new Error(`Encounter lead did not start: ${JSON.stringify({ requested: lead, diagnostics })}`, { cause: error });
  }
  return page.evaluate(() => {
    const discovery = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery;
    const quick = document.getElementById('discoveryQuickToolBtn');
    const overlaps = (left, right) => !!left && !!right &&
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    const quickBox = quick?.getBoundingClientRect();
    const controls = ['exploreBtn', 'mobileMovePad', 'mobileLookPad', 'urbanEquipmentToggle']
      .map((id) => document.getElementById(id)?.getBoundingClientRect())
      .filter(Boolean);
    return {
      activeActivityId: discovery.activeActivityId,
      interaction: discovery.interaction,
      quickVisible: !!quick && getComputedStyle(quick).display !== 'none',
      quickClearsMobileControls: controls.every((box) => !overlaps(quickBox, box)),
      journalOpen: document.getElementById('discoveryPanel')?.classList.contains('show') || false
    };
  });
}

try {
  await mkdir('output/release-evidence/current', { recursive: true });

  const freeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const freePage = await freeContext.newPage();
  const freeCdp = await freeContext.newCDPSession(freePage);
  await instrument(freePage);
  await freePage.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await freePage.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await freePage.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await freePage.locator('#globeSelectorStartBtn').click();
  await waitForWorld(freePage);
  const freeDirectPromptPlacement = await inspectDirectPromptPlacement(freePage);
  await freePage.locator('#exploreBtn').click();
  await freePage.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await freePage.locator('#fWalk').click();
  await freePage.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'walk', null, { timeout: 20_000 });
  const freeLead = await waitForLead(freePage, 'free-roam', async () => {
    assert.equal(await moveAwayFromDirectInteraction(freePage, freeCdp), true,
      'Normal mobile walking must clear the nearby direct interaction before the field lead appears.');
  });
  await freePage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-free-roam-lead-mobile.png', fullPage: true });
  const freeAccepted = await acceptLead(freePage, freeLead.lead);
  await freePage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-free-roam-tracking-mobile.png', fullPage: true });
  await freeContext.close();

  const gpsContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    geolocation: { latitude: 39.2904, longitude: -76.6122, accuracy: 6 }, permissions: ['geolocation']
  });
  await gpsContext.grantPermissions(['geolocation'], { origin });
  const gpsPage = await gpsContext.newPage();
  await instrument(gpsPage);
  await gpsPage.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await gpsPage.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await gpsPage.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const analyticsBannerWasOpen = await gpsPage.locator('#analyticsConsentBanner').isVisible();
  await gpsPage.locator('#globeSelectorLiveGpsBtn').click();
  await gpsPage.waitForSelector('#liveGpsPermissionPanel.show', { timeout: 30_000 });
  const consentOwnsAnalyticsLayer = await gpsPage.evaluate(() => {
    const consent = document.getElementById('liveGpsPermissionPanel');
    const analytics = document.getElementById('analyticsConsentBanner');
    return !!consent && getComputedStyle(consent).display !== 'none' &&
      (!analytics || getComputedStyle(analytics).visibility === 'hidden');
  });
  await gpsPage.locator('#liveGpsPermissionContinue').click();
  await waitForWorld(gpsPage);
  await gpsPage.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.active === true, null, { timeout: 60_000 });
  const gpsDirectPromptPlacement = await inspectDirectPromptPlacement(gpsPage);
  const gpsLead = await waitForLead(gpsPage, 'live-gps', async () => {
    await gpsContext.setGeolocation({ latitude: 39.2907, longitude: -76.6122, accuracy: 6 });
  });
  await gpsPage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-live-gps-lead-mobile.png', fullPage: true });
  const gpsAccepted = await acceptLead(gpsPage, gpsLead.lead);
  await gpsPage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-live-gps-tracking-mobile.png', fullPage: true });
  await gpsContext.close();

  const checks = {
    freeRoamLeadVisible: freeLead.lead.available && freeLead.promptMode === 'free-roam' && freeLead.promptText.includes(freeLead.lead.leadLabel) && /field lead/i.test(freeLead.promptText),
    freeRoamLeadClearsControls: freeLead.promptClearsMobileControls === true,
    freeRoamLeadButtonUsable: freeLead.promptButtonUsable === true,
    freeRoamStartsExistingFieldSession: freeAccepted.activeActivityId === freeLead.lead.activityId && freeAccepted.interaction.targetId === freeLead.lead.slotId,
    freeRoamKeepsJournalOutOfTheWay: freeAccepted.quickVisible === true && freeAccepted.journalOpen === false,
    freeRoamTrackingClearsControls: freeAccepted.quickClearsMobileControls === true,
    liveGpsLeadVisible: gpsLead.lead.available && gpsLead.promptMode === 'live-gps' && gpsLead.promptText.includes(gpsLead.lead.leadLabel) && /field lead/i.test(gpsLead.promptText),
    liveGpsLeadClearsControls: gpsLead.promptClearsMobileControls === true,
    liveGpsLeadButtonUsable: gpsLead.promptButtonUsable === true,
    liveGpsUsesSameEncounterContract: gpsAccepted.activeActivityId === gpsLead.lead.activityId && gpsAccepted.interaction.targetId === gpsLead.lead.slotId,
    liveGpsKeepsJournalOutOfTheWay: gpsAccepted.quickVisible === true && gpsAccepted.journalOpen === false,
    liveGpsTrackingClearsControls: gpsAccepted.quickClearsMobileControls === true,
    gpsConsentOwnsAnalyticsLayer: analyticsBannerWasOpen === true && consentOwnsAnalyticsLayer === true,
    directInteractionDefersBroadLead: [freeLead, gpsLead]
      .filter((entry) => entry.directInteraction)
      .every((entry) => entry.directInteraction.leadCorrectlyDeferred === true),
    directPromptsClearMobileControls: [freeDirectPromptPlacement, gpsDirectPromptPlacement]
      .every((entry) => entry.clearsMobileControls === true),
    freeRoamHasVisibleWildlife: Number(freeLead.wildlife?.active || 0) >= 1,
    liveGpsHasVisibleWildlife: Number(gpsLead.wildlife?.active || 0) >= 1,
    regionalEcologyLoadedInBothModes: [freeLead, gpsLead].every((entry) =>
      entry.regionalEcology?.packId === 'us-md-baltimore-chesapeake-pilot' &&
      entry.regionalEcology?.taxonCount === 60 &&
      entry.regionalEcology?.truthClass === 'habitat-plausible' &&
      entry.regionalEcology?.livePresenceClaim === false),
    creatureQualityFallbackInBothModes: [freeLead, gpsLead].every((entry) =>
      entry.creatureQuality?.taxonCount === 60 &&
      entry.creatureQuality?.tiers?.['reference-fallback'] === 60 &&
      entry.creatureQuality?.promotionReadyCount === 0),
    regionalTaxonReachesLiveGameplay: [freeLead, gpsLead].some((entry) =>
      /^taxon-\d+$/.test(String(entry.lead.catalogId || ''))),
    typedEvidenceContractInBothModes: [freeAccepted, gpsAccepted].every((entry) =>
      entry.interaction.evidenceContract?.id && entry.interaction.evidenceContract?.recordKind),
    gameFacingEvidenceLanguageInBothModes: [freeAccepted, gpsAccepted].every((entry) =>
      entry.interaction.evidenceClass === 'guided-field-lead'),
    liveGpsApproachTruthIsBounded:
      gpsAccepted.interaction.approachEvidence?.stableSurface === true &&
      gpsAccepted.interaction.approachEvidence?.buildingClear === true &&
      gpsAccepted.interaction.approachEvidence?.accessEvidence === 'unknown' &&
      gpsAccepted.interaction.approachEvidence?.accessClaim === false,
    liveGpsRewardIsPersonalOnly:
      gpsAccepted.interaction.rewardEligibility?.competitive === false &&
      gpsAccepted.interaction.rewardEligibility?.locationReward === false,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = { ok: Object.values(checks).every(Boolean), contract: 'walking-encounters-v2', checks, freeDirectPromptPlacement, freeLead, freeAccepted, gpsDirectPromptPlacement, gpsLead, gpsAccepted, browserErrors, localFailures };
  const output = process.env.WE3D_VERIFY_VERBOSE === '1' ? report : {
    ok: report.ok,
    contract: report.contract,
    checks: report.checks,
    freeRoam: {
      catalogId: freeLead.lead.catalogId,
      leadLabel: freeLead.lead.leadLabel,
      regionalEcology: freeLead.regionalEcology,
      creatureQuality: freeLead.creatureQuality,
      acceptedActivityId: freeAccepted.activeActivityId,
      evidenceContract: freeAccepted.interaction.evidenceContract
    },
    liveGps: {
      catalogId: gpsLead.lead.catalogId,
      leadLabel: gpsLead.lead.leadLabel,
      regionalEcology: gpsLead.regionalEcology,
      creatureQuality: gpsLead.creatureQuality,
      acceptedActivityId: gpsAccepted.activeActivityId,
      evidenceContract: gpsAccepted.interaction.evidenceContract
    },
    browserErrors,
    localFailures
  };
  console.log(JSON.stringify(output, null, 2));
  assert.equal(report.ok, true, 'Walking encounter journey failed.');
} finally {
  await browser.close();
  await server?.close();
}
