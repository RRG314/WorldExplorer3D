import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4383, 4384, 4385] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
});

async function discoveryCatchRecords() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('world-explorer-discovery');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['items', 'fieldGuide'], 'readonly');
      const itemsRequest = transaction.objectStore('items').getAll();
      const guideRequest = transaction.objectStore('fieldGuide').getAll();
      transaction.oncomplete = () => {
        db.close();
        resolve({
          items: itemsRequest.result.filter((entry) => String(entry.instanceId || '').startsWith('fish-catch:')),
          guide: guideRequest.result.filter((entry) => String(entry.stableTaxonId || '').startsWith('we3d-game-fish:'))
        });
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

try {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.28305', lon: '-76.61270', lname: 'Baltimore Inner Harbor',
    launch: 'earth', gm: 'free', mode: 'walking', rx: '54', rz: '-3'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.gameStarted === true && diagnostics.worldLoading === false && diagnostics.worldDiscovery?.active === true &&
      Number(diagnostics.visualOwners?.water?.surfaceCount || 0) > 0;
  }, null, { timeout: 300_000 });
  await page.waitForTimeout(4_000);

  await page.locator('#exploreBtn').click();
  const preBoatEntry = await page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const button = document.querySelector('#fBoat');
    return {
      activeActor: diagnostics.activeActor || null,
      waterSurfaceCount: Number(diagnostics.visualOwners?.water?.surfaceCount || 0),
      boatButtonDisplay: button ? getComputedStyle(button).display : 'missing',
      boatPrompt: document.querySelector('#boatPrompt')?.textContent || ''
    };
  });
  assert.notEqual(preBoatEntry.boatButtonDisplay, 'none', `Boat Mode was unavailable through the normal menu: ${JSON.stringify(preBoatEntry)}`);
  await page.locator('#fBoat').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.boat === true, null, { timeout: 30_000 });
  const activeBoatEntry = await page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return {
      started: diagnostics.modes?.boat === true,
      activeActorMode: diagnostics.activeActor?.mode || null
    };
  });
  const boatEntry = {
    setupMethod: 'player-facing-walk-link-then-boat-menu',
    requestedPose: { x: 54, z: -3 },
    preBoatEntry,
    ...activeBoatEntry
  };
  assert.equal(boatEntry.started, true, `Could not enter boat through the shared-link gameplay path: ${JSON.stringify(boatEntry)}`);

  await page.locator('#fishingDockBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.open === true, null, { timeout: 30_000 });
  const controlGeometry = await page.evaluate(() => {
    const snapshot = (selector) => {
      const element = document.querySelector(selector);
      const bounds = element?.getBoundingClientRect?.();
      return bounds ? {
        visible: getComputedStyle(element).display !== 'none' && bounds.width > 0 && bounds.height > 0,
        left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
        width: bounds.width, height: bounds.height
      } : null;
    };
    return { action: snapshot('#fishingActionBtn'), close: snapshot('#fishingCloseBtn') };
  });
  await page.locator('#fishingActionBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'bite', null, { timeout: 20_000 });
  await page.locator('#fishingActionBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'fighting', null, { timeout: 10_000 });
  await page.locator('#fishingDrag').evaluate((element) => {
    element.value = '34';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

  for (let index = 0; index < 700; index += 1) {
    const fishing = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});
    if (fishing.stage === 'landed' || fishing.stage === 'lost') break;
    if (fishing.stage !== 'fighting') continue;
    const counterKey = Number(fishing.fishDirection) < 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.press(counterKey);
    const pressureKey = Number(fishing.tension) > 0.76 ? 'KeyQ' : 'Space';
    await page.keyboard.down(pressureKey);
    await page.evaluate(() => globalThis.advanceTime?.(120));
    await page.keyboard.up(pressureKey);
  }

  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'landed', null, { timeout: 20_000 });
  const fishing = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});
  await page.waitForFunction(async () => {
    const request = indexedDB.open('world-explorer-discovery');
    return new Promise((resolve) => {
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('items', 'readonly');
        const all = tx.objectStore('items').getAll();
        all.onsuccess = () => { db.close(); resolve(all.result.some((entry) => String(entry.instanceId || '').startsWith('fish-catch:'))); };
        all.onerror = () => { db.close(); resolve(false); };
      };
    });
  }, null, { timeout: 20_000 });
  const records = await discoveryCatchRecords();
  const item = records.items[0] || {};
  const guide = records.guide[0] || {};
  const fishMeta = await page.locator('#fishingFishMeta').textContent();
  const fishMetaVisible = await page.locator('#fishingFishMeta').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
  });
  const bodyText = await page.locator('body').innerText();
  await mkdir('output/release-evidence/current', { recursive: true });
  await page.screenshot({ path: 'output/release-evidence/current/unified-boat-fishing-mobile.png', fullPage: true });

  await page.locator('#fishingCloseBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.open === false, null, { timeout: 10_000 });
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open #fWorldDiscovery', { timeout: 10_000 });
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show', { timeout: 10_000 });
  if (await page.locator('#discoverySectionTutorial:not([hidden])').isVisible().catch(() => false)) {
    await page.locator('#discoverySectionTutorialDoneBtn').click();
  }
  const journalText = await page.locator('#discoveryJournalList').innerText();
  await page.locator('[data-discovery-tab="guide"]').click();
  await page.locator('#discoveryGuideScope').selectOption('world');
  await page.waitForFunction((species) => document.querySelector('#discoveryFieldGuideList')?.innerText?.includes(species), fishing.fish.species, { timeout: 10_000 });
  if (await page.locator('#discoverySectionTutorial:not([hidden])').isVisible().catch(() => false)) {
    await page.locator('#discoverySectionTutorialDoneBtn').click();
  }
  const guideText = await page.locator('#discoveryFieldGuideList').innerText();
  await page.locator('#discoveryGuideHelpBtn').click();
  const guideHelpText = await page.locator('#discoveryGuideHelp').innerText();
  await page.screenshot({ path: 'output/release-evidence/current/unified-fishing-guide-mobile.png', fullPage: true });
  await page.locator('#discoveryGuideHelpBtn').click();
  await page.locator('#discoveryFieldGuideList').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/release-evidence/current/unified-fishing-guide-catch-mobile.png', fullPage: true });

  const inViewport = (entry) => entry?.visible === true && entry.left >= 0 && entry.top >= 0 && entry.right <= 390 && entry.bottom <= 844;

  const checks = {
    mappedBoatEntry: boatEntry.started === true && boatEntry.activeActorMode === 'boat' &&
      fishing.populationContext?.waterbody?.sourceTruth === 'published-water-surface',
    boatCastFightCatch: fishing.accessMode === 'boat' && fishing.stage === 'landed' && fishing.catches >= 1,
    sharedAuthority: fishing.populationContext?.authorityVersion === 'water-fish-authority-v2' &&
      fishing.fish?.fishingAuthorityVersion === fishing.populationContext?.authorityVersion,
    mappedWaterIdentity: !!fishing.populationContext?.waterbody?.id &&
      fishing.populationContext?.waterbody?.sourceTruth === 'published-water-surface',
    boatAccessProfile: fishing.populationContext?.access?.mode === 'boat' &&
      fishing.populationContext?.access?.reachableDepthClass === 'surface-boat',
    mobileEntryActionExitControls: inViewport(controlGeometry.action) && inViewport(controlGeometry.close) &&
      controlGeometry.action.width >= 80 && controlGeometry.action.height >= 80 &&
      controlGeometry.close.width >= 42 && controlGeometry.close.height >= 42,
    honestCatchTruth: fishing.populationContext?.evidence?.populationTruth === 'gameplay-model-only' &&
      fishing.populationContext?.evidence?.livePresenceClaim === false &&
      fishing.fish?.livePresenceClaim === false && fishMetaVisible && /virtual catch/i.test(fishMeta || ''),
    journalAuthorityPersisted: item.evidenceContractId === 'virtual-fishing-catch' &&
      item.evidencePayload?.fishingAuthorityVersion === 'water-fish-authority-v2' &&
      item.evidencePayload?.livePresenceClaim === false,
    guideAuthorityPersisted: guide.fishingAuthorityVersion === 'water-fish-authority-v2' &&
      guide.populationEvidence === 'gameplay-model-only' && guide.livePresenceClaim === false,
    regionalLifeListNotInvented: !item.regionalPackId && String(guide.stableTaxonId || '').startsWith('we3d-game-fish:'),
    generalizedCatchPrivacy: fishing.fish?.locationPrecision === 'generalized-100m' &&
      Math.abs(Number(fishing.fish?.lat) * 1000 - Math.round(Number(fishing.fish?.lat) * 1000)) < 1e-8 &&
      Math.abs(Number(fishing.fish?.lon) * 1000 - Math.round(Number(fishing.fish?.lon) * 1000)) < 1e-8,
    waterTruthPersistsThroughCatch: fishing.fish?.waterClass === fishing.populationContext?.waterbody?.waterClass &&
      fishing.fish?.waterSourceTruth === fishing.populationContext?.waterbody?.sourceTruth &&
      fishing.fish?.depthTruth === fishing.populationContext?.environment?.depthTruth,
    journalAndGuideVisible: journalText.includes(fishing.fish.species) && guideText.includes(fishing.fish.species),
    gameFacingFieldLeadHelp: /field lead/i.test(guideHelpText) && !/procedural encounter/i.test(guideHelpText),
    noPlayerFacingProceduralEncounter: !/procedural encounter/i.test(bodyText),
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'unified-water-fish-authority-boat-catch-journal-guide',
    checks,
    boatEntry,
    controlGeometry,
    fishing,
    item: {
      catalogId: item.catalogId,
      evidenceContractId: item.evidenceContractId,
      evidencePayload: item.evidencePayload,
      stableTaxonId: item.stableTaxonId,
      regionalPackId: item.regionalPackId || null
    },
    guide,
    browserErrors,
    localFailures
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Unified boat fishing authority journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
