import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4394, 4395, 4396] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const origin = new URL(baseUrl).origin;
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--js-flags=--max-old-space-size=1024'] });
const browserErrors = [];
const localFailures = [];

async function instrument(page) {
  await configureStagingAppCheck(page, baseUrl);
  // A seven-second invitation may expire while a remote runner completes the
  // preceding click. Observe its actual visible layout when it is presented;
  // the journey below still accepts the same lead through its persistent UI.
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const prompt = document.getElementById('discoveryContextPrompt');
      if (!prompt) return;
      const observer = new MutationObserver(() => {
        if (globalThis.__WE3D_WALKING_NOTICE_EVIDENCE__ || !prompt.classList.contains('show') ||
            getComputedStyle(prompt).display === 'none') return;
        const lead = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.encounterLead;
        if (!lead?.available) return;
        const rect = element => {
          const box = element?.getBoundingClientRect();
          return box ? {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height} : null;
        };
        const box = rect(prompt), button = rect(document.getElementById('discoveryContextOpenBtn'));
        const overlaps = other => !!box && !!other && box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top;
        globalThis.__WE3D_WALKING_NOTICE_EVIDENCE__ = {
          slotId: lead.slotId, mode: lead.mode,
          covered: document.getElementById('loading')?.classList.contains('show') === true,
          promptText: document.getElementById('discoveryContextText')?.textContent || '',
          promptButton: document.getElementById('discoveryContextOpenBtn')?.textContent || '',
          promptMode: prompt.dataset.mode,
          promptClearsMobileControls: ['mobileMovePad','mobileLookPad'].every(id => !overlaps(rect(document.getElementById(id)))),
          promptButtonUsable: !!button && button.width >= 44 && button.height >= 44 && button.left >= 0 && button.right <= innerWidth && button.left >= box.left && button.right <= box.right
        };
        observer.disconnect();
      });
      observer.observe(prompt, {attributes:true, childList:true, subtree:true});
    });
  });
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
  });
}

async function waitForWorld(page) {
  await page.waitForFunction(() => {
    if (document.getElementById('loading')?.classList.contains('show')) return false;
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false && state.worldDiscovery?.active === true;
  }, null, { timeout: 240_000, polling: 500 });
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
  }, expectedMode, { timeout: process.env.CI ? 120_000 : 30_000, polling:500 });
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
    return globalThis.__WE3D_WALKING_NOTICE_EVIDENCE__ || (prompt?.classList.contains('show') && getComputedStyle(prompt).display !== 'none');
  }, null, { timeout: process.env.CI ? 120_000 : 20_000, polling: 250 });
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
    const observed = globalThis.__WE3D_WALKING_NOTICE_EVIDENCE__;
    if (observed?.mode === mode && observed.slotId === state?.worldDiscovery?.encounterLead?.slotId) {
      if (observed.covered) throw new Error('Walking invitation was consumed behind the loading cover.');
      if (!observed.promptText.includes(state.worldDiscovery.encounterLead.leadLabel)) return null;
      return {...observed, lead:state.worldDiscovery.encounterLead,
        regionalEcology:state.worldDiscovery.regionalEcology, creatureQuality:state.worldDiscovery.creatureQuality,
        wildlife:state.worldDiscovery.wildlife, noticeEvidence:'observed-visible-layout-before-expiry'};
    }
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
  }, expectedMode, { timeout: process.env.CI ? 120_000 : 20_000, polling: 250 });
  const result = await snapshotHandle.jsonValue();
  await snapshotHandle.dispose();
  return { ...result, directInteraction };
}

async function acceptLead(page, lead) {
  // A short notice can expire or yield to a closer world action before a
  // person taps it. Verify the persistent normal-input route after expiry.
  await page.waitForTimeout(8000);
  assert.equal(await page.locator('#discoveryContextPrompt.show').isVisible(), false,
    'The transient field lead should expire while the underlying lead remains available.');
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('#discoveryPanel.show').waitFor({ state: 'visible' });
  await page.locator('[data-discovery-tab="today"]').click();
  const persistentLead = page.locator('#discoveryEncounterLeadBtn');
  await persistentLead.waitFor({ state: 'visible', timeout: 10000 });
  await persistentLead.scrollIntoViewIfNeeded();
  const leadBox = await persistentLead.boundingBox();
  assert.ok(leadBox && leadBox.height >= 44 && leadBox.x >= 0 && leadBox.x + leadBox.width <= 390,
    'Persistent Track Lead must provide a usable phone-sized target without horizontal overflow.');
  const currentLead = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.encounterLead);
  assert.equal(currentLead?.slotId, lead.slotId, 'Today must retain the same offered lead.');
  await page.screenshot({ path: `output/release-evidence/current/baltimore-ecology-${lead.mode}-persistent-lead-mobile.png` });
  await persistentLead.click();
  try {
    await page.waitForFunction((slotId) => {
      const discovery = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery;
      return discovery?.interaction?.active === true && discovery.interaction.targetId === slotId &&
        discovery.encounterLead?.available === false;
    }, lead.slotId, { timeout: process.env.CI ? 120_000 : 20_000, polling: 250 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const discovery = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery;
      return { encounterLead: discovery?.encounterLead, interaction: discovery?.interaction };
    });
    throw new Error(`Encounter lead did not start: ${JSON.stringify({ requested: lead, diagnostics })}`, { cause: error });
  }
  assert.equal(await page.locator('#discoveryEncounterLeadBtn').evaluate(button => button.hidden), true,
    'The persistent invitation must hide after its lead is accepted.');
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
  await freePage.locator('#travelBtn').click();
  await freePage.waitForSelector('#travelMenu.open', { timeout: 10_000 });
  await freePage.locator('#fWalk').click();
  await freePage.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'walk', null, { timeout: process.env.CI ? 120_000 : 20_000, polling: 250 });
  const freeLead = await waitForLead(freePage, 'free-roam', async () => {
    assert.equal(await moveAwayFromDirectInteraction(freePage, freeCdp), true,
      'Normal mobile walking must clear the nearby direct interaction before the field lead appears.');
  });
  await freePage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-free-roam-lead-mobile.png', fullPage: false });
  const freeAccepted = await acceptLead(freePage, freeLead.lead);
  await freePage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-free-roam-tracking-mobile.png', fullPage: false });
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
  await gpsPage.locator('#globeSelectorLiveGpsBtn').click();
  await gpsPage.waitForSelector('#liveGpsPermissionPanel.show', { timeout: 30_000 });
  const consentOwnsAnalyticsLayer = await gpsPage.evaluate(() => {
    const consent = document.getElementById('liveGpsPermissionPanel');
    const analytics = document.getElementById('analyticsConsentBanner');
    const analyticsStyle = analytics ? getComputedStyle(analytics) : null;
    return !!consent && getComputedStyle(consent).display !== 'none' &&
      (!analytics || analyticsStyle.display === 'none' || analyticsStyle.visibility === 'hidden');
  });
  await gpsPage.locator('#liveGpsPermissionContinue').click();
  await waitForWorld(gpsPage);
  await gpsPage.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.active === true, null, { timeout: 60_000 });
  const gpsDirectPromptPlacement = await inspectDirectPromptPlacement(gpsPage);
  const gpsLead = await waitForLead(gpsPage, 'live-gps', async () => {
    await gpsContext.setGeolocation({ latitude: 39.2907, longitude: -76.6122, accuracy: 6 });
  });
  await gpsPage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-live-gps-lead-mobile.png', fullPage: false });
  const gpsAccepted = await acceptLead(gpsPage, gpsLead.lead);
  await gpsPage.screenshot({ path: 'output/release-evidence/current/baltimore-ecology-live-gps-tracking-mobile.png', fullPage: false });
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
    gpsConsentOwnsAnalyticsLayer: consentOwnsAnalyticsLayer === true,
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
} catch (error) {
  const pages = browser.contexts().flatMap(context => context.pages());
  const states = [];
  for (const page of pages) {
    states.push(await page.evaluate(() => ({
      ...globalThis.getWorldExplorerRuntimeDiagnostics?.(),
      noticeEvidence:globalThis.__WE3D_WALKING_NOTICE_EVIDENCE__ || null,
      promptState:['loading','discoveryContextPrompt','urbanVehiclePrompt','interiorPrompt'].map(id => {
        const element=document.getElementById(id);
        return {id,classes:element?.className,hidden:element?.hidden,display:element?getComputedStyle(element).display:null};
      })
    })).catch(() => null));
  }
  await writeFile('output/release-evidence/current/walking-field-failure.json', JSON.stringify({
    error: String(error?.stack || error), states, browserErrors, localFailures
  }, null, 2));
  throw error;
} finally {
  await browser.close();
  await server?.close();
}
