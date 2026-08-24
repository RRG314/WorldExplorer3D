import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4394, 4395, 4396] });
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
  if (directInteraction) {
    await page.locator('#urbanVehiclePromptButton').click();
  }
  if (directInteraction || await page.locator('#urbanVehiclePrompt.show, #interiorPrompt.show').count()) {
    await movePastDirectInteraction?.();
  }
  await page.waitForFunction(() => {
    const prompt = document.getElementById('discoveryContextPrompt');
    return prompt?.classList.contains('show') && getComputedStyle(prompt).display !== 'none';
  }, null, { timeout: 20_000 });
  const tutorialClose = page.locator('#tutorialHintCard .tutorial-icon-btn');
  if (await tutorialClose.isVisible()) await tutorialClose.click();
  return page.evaluate(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    const prompt = document.getElementById('discoveryContextPrompt');
    const overlaps = (left, right) => !!left && !!right &&
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    const promptBox = prompt?.getBoundingClientRect();
    const moveBox = document.getElementById('mobileMovePad')?.getBoundingClientRect();
    const lookBox = document.getElementById('mobileLookPad')?.getBoundingClientRect();
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
      promptText: document.getElementById('discoveryContextText')?.textContent || '',
      promptButton: document.getElementById('discoveryContextOpenBtn')?.textContent || '',
      promptMode: prompt?.dataset.mode || '',
      promptClearsMobileControls: !overlaps(promptBox, moveBox) && !overlaps(promptBox, lookBox),
      wildlife: state.worldDiscovery.wildlife,
      visiblePromptLayers
    };
  }).then((result) => ({ ...result, directInteraction }));
}

async function acceptLead(page, lead) {
  await page.locator('#discoveryContextOpenBtn').click();
  await page.waitForFunction((slotId) => {
    const discovery = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery;
    return discovery?.interaction?.active === true && discovery.interaction.targetId === slotId &&
      discovery.encounterLead?.available === false;
  }, lead.slotId, { timeout: 20_000 });
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
  await mkdir('output/verification/walking-encounters', { recursive: true });

  const freeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const freePage = await freeContext.newPage();
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
    const pad = await freePage.locator('#mobileMovePad').boundingBox();
    if (!pad) throw new Error('Mobile movement pad is not available.');
    const x = pad.x + pad.width / 2;
    const y = pad.y + pad.height / 2;
    await freePage.mouse.move(x, y);
    await freePage.mouse.down();
    await freePage.mouse.move(x, y - pad.height * 0.4, { steps: 4 });
    await freePage.waitForTimeout(3600);
    await freePage.mouse.up();
  });
  await freePage.screenshot({ path: 'output/verification/walking-encounters/free-roam-lead-mobile.png', fullPage: true });
  const freeAccepted = await acceptLead(freePage, freeLead.lead);
  await freePage.screenshot({ path: 'output/verification/walking-encounters/free-roam-tracking-mobile.png', fullPage: true });
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
  await gpsPage.locator('#liveGpsPermissionContinue').click();
  await waitForWorld(gpsPage);
  await gpsPage.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.active === true, null, { timeout: 60_000 });
  const gpsDirectPromptPlacement = await inspectDirectPromptPlacement(gpsPage);
  const gpsLead = await waitForLead(gpsPage, 'live-gps', async () => {
    await gpsContext.setGeolocation({ latitude: 39.2907, longitude: -76.6122, accuracy: 6 });
  });
  await gpsPage.screenshot({ path: 'output/verification/walking-encounters/live-gps-lead-mobile.png', fullPage: true });
  const gpsAccepted = await acceptLead(gpsPage, gpsLead.lead);
  await gpsPage.screenshot({ path: 'output/verification/walking-encounters/live-gps-tracking-mobile.png', fullPage: true });
  await gpsContext.close();

  const checks = {
    freeRoamLeadVisible: freeLead.lead.available && freeLead.promptMode === 'free-roam' && freeLead.promptText.includes(freeLead.lead.leadLabel) && /procedural encounter/i.test(freeLead.promptText),
    freeRoamLeadClearsControls: freeLead.promptClearsMobileControls === true,
    freeRoamStartsExistingFieldSession: freeAccepted.activeActivityId === freeLead.lead.activityId && freeAccepted.interaction.targetId === freeLead.lead.slotId,
    freeRoamKeepsJournalOutOfTheWay: freeAccepted.quickVisible === true && freeAccepted.journalOpen === false,
    freeRoamTrackingClearsControls: freeAccepted.quickClearsMobileControls === true,
    liveGpsLeadVisible: gpsLead.lead.available && gpsLead.promptMode === 'live-gps' && gpsLead.promptText.includes(gpsLead.lead.leadLabel) && /procedural encounter/i.test(gpsLead.promptText),
    liveGpsLeadClearsControls: gpsLead.promptClearsMobileControls === true,
    liveGpsUsesSameEncounterContract: gpsAccepted.activeActivityId === gpsLead.lead.activityId && gpsAccepted.interaction.targetId === gpsLead.lead.slotId,
    liveGpsKeepsJournalOutOfTheWay: gpsAccepted.quickVisible === true && gpsAccepted.journalOpen === false,
    liveGpsTrackingClearsControls: gpsAccepted.quickClearsMobileControls === true,
    directInteractionDefersBroadLead: [freeLead, gpsLead]
      .filter((entry) => entry.directInteraction)
      .every((entry) => entry.directInteraction.leadCorrectlyDeferred === true),
    directPromptsClearMobileControls: [freeDirectPromptPlacement, gpsDirectPromptPlacement]
      .every((entry) => entry.clearsMobileControls === true),
    freeRoamHasVisibleWildlife: Number(freeLead.wildlife?.active || 0) >= 1,
    liveGpsHasVisibleWildlife: Number(gpsLead.wildlife?.active || 0) >= 1,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = { ok: Object.values(checks).every(Boolean), contract: 'walking-encounters-v1', checks, freeDirectPromptPlacement, freeLead, freeAccepted, gpsDirectPromptPlacement, gpsLead, gpsAccepted, browserErrors, localFailures };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Walking encounter journey failed.');
} finally {
  await browser.close();
  await server?.close();
}
