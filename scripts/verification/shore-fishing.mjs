import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4380, 4381, 4382] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const startGeo = Object.freeze({ latitude: 39.28305, longitude: -76.61270 });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  geolocation: { ...startGeo, accuracy: 6 },
  permissions: ['geolocation']
});
await context.grantPermissions(['geolocation'], { origin: new URL(baseUrl).origin });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const browserErrors = [];
const localFailures = [];
const movementDebug = {};
let gpsRefreshSequence = 0;
async function refreshGpsFix() {
  gpsRefreshSequence += 1;
  const latitude = Number(movementDebug.targetLatitude ?? startGeo.latitude) + Math.sin(gpsRefreshSequence) * 0.00000002;
  const longitude = Number(movementDebug.targetLongitude ?? startGeo.longitude) + Math.cos(gpsRefreshSequence) * 0.00000002;
  await cdp.send('Emulation.setGeolocationOverride', { latitude, longitude, accuracy: 6, speed: 0.4, heading: 0 });
}
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
});

try {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorLiveGpsBtn').click();
  await page.waitForSelector('#liveGpsPermissionPanel.show', { timeout: 30_000 });
  await page.locator('#liveGpsPermissionContinue').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.worldLoading === false && diagnostics.liveGps?.active === true && diagnostics.activeActor?.mode === 'walk';
  }, null, { timeout: 240_000 });
  await page.locator('#gameBtn').click();
  await page.waitForSelector('#gameMenu.open #fFishing', { timeout: 30_000 });
  await page.locator('#fFishing').click();
  await page.waitForFunction(() => {
    const fishing = globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing;
    return fishing?.open === true || fishing?.accessContext?.outcome;
  }, null, { timeout: 30_000 });
  let diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
  if (diagnostics.fishing?.accessContext?.outcome === 'no_safe_bank' && diagnostics.fishing.accessContext.castTarget) {
    const currentWorld = diagnostics.liveGps.fieldWorld;
    const edge = diagnostics.fishing.accessContext.castTarget;
    const awayX = Number(currentWorld.x) - Number(edge.x);
    const awayZ = Number(currentWorld.z) - Number(edge.z);
    const awayLength = Math.hypot(awayX, awayZ) || 1;
    const bankWorld = { x: Number(edge.x) + awayX / awayLength * 18, z: Number(edge.z) + awayZ / awayLength * 18 };
    const worldUnitsPerDegree = 100_000;
    const targetLatitude = startGeo.latitude - (bankWorld.z - Number(currentWorld.z)) / worldUnitsPerDegree;
    const targetLongitude = startGeo.longitude + (bankWorld.x - Number(currentWorld.x)) /
      (worldUnitsPerDegree * Math.cos(startGeo.latitude * Math.PI / 180));
    Object.assign(movementDebug, { currentWorld, edge, bankWorld, targetLatitude, targetLongitude });
    for (let index = 0; index < 10; index += 1) {
      await cdp.send('Emulation.setGeolocationOverride', { latitude: targetLatitude, longitude: targetLongitude, accuracy: 6, speed: 1.2, heading: 0 });
      await page.waitForTimeout(650);
    }
    const menuOpen = await page.locator('#gameMenu').evaluate((element) => element.classList.contains('open'));
    if (!menuOpen) await page.locator('#gameBtn').click();
    await page.locator('#fFishing').click();
    await page.waitForTimeout(1_500);
    diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
    movementDebug.afterWorld = diagnostics.liveGps?.fieldWorld;
    movementDebug.afterAccess = diagnostics.fishing?.accessContext;
  }
  const fishing = diagnostics.fishing || {};
  let shoreRecord = null;
  let controlGeometry = null;
  let exitRecovered = false;
  let fightAttempts = 0;
  let missedBiteLoss = null;
  if (fishing.open) {
    controlGeometry = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const bounds = element?.getBoundingClientRect?.();
        return bounds ? { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height } : null;
      };
      return { action: rect('#fishingActionBtn'), close: rect('#fishingCloseBtn') };
    });
    await refreshGpsFix();
    await page.waitForFunction(() => {
      const button = document.querySelector('#fishingActionBtn');
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return diagnostics.liveGps?.fieldSession?.eligible === true && diagnostics.fishing?.open === true && button && !button.disabled;
    }, null, { timeout: 10_000 });
    const catchesBeforeMiss = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.catches || 0);
    await page.locator('#fishingActionBtn').click();
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'bite', null, { timeout: 20_000 });
    const missedAttemptId = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.attempt?.attemptId || null);
    await page.evaluate(() => globalThis.advanceTime?.(2_600));
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'lost', null, { timeout: 10_000 });
    missedBiteLoss = await page.evaluate((before) => {
      const snapshot = globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {};
      return {
        attemptId: snapshot.lastOutcome?.attemptId || null,
        expectedAttemptId: document.querySelector('#fishingGamePanel')?.dataset.stage === 'lost' ? snapshot.lastOutcome?.attemptId || null : null,
        status: snapshot.lastOutcome?.status || null,
        reason: snapshot.lastOutcome?.reason || '',
        recordedCatch: snapshot.lastOutcome?.recordedCatch,
        rewardEligible: snapshot.lastOutcome?.rewardEligible,
        catchesBefore: before,
        catchesAfter: snapshot.catches,
        message: document.querySelector('#fishingMessage')?.textContent || '',
        gesture: document.querySelector('#fishingGestureLabel')?.textContent || ''
      };
    }, catchesBeforeMiss);
    missedBiteLoss.expectedAttemptId = missedAttemptId;
    for (fightAttempts = 1; fightAttempts <= 3; fightAttempts += 1) {
      await refreshGpsFix();
      await page.waitForFunction(() => {
        const button = document.querySelector('#fishingActionBtn');
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return diagnostics.liveGps?.fieldSession?.eligible === true && diagnostics.fishing?.open === true && button && !button.disabled;
      }, null, { timeout: 10_000 });
      await page.locator('#fishingActionBtn').click();
      await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'bite', null, { timeout: 20_000 });
      await page.locator('#fishingActionBtn').click();
      await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'fighting', null, { timeout: 10_000 });
      await page.locator('#fishingDrag').evaluate((element) => {
        element.value = '22';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
      for (let index = 0; index < 1_100; index += 1) {
        if (index % 10 === 0) await refreshGpsFix();
        const snapshot = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});
        if (snapshot.stage === 'landed' || snapshot.stage === 'lost') break;
        const counterKey = Number(snapshot.fishDirection) < 0 ? 'ArrowRight' : 'ArrowLeft';
        await page.keyboard.press(counterKey);
        const pressureKey = Number(snapshot.tension) > 0.67 ? 'KeyQ' : 'Space';
        await page.keyboard.down(pressureKey);
        await page.evaluate(() => globalThis.advanceTime?.(80));
        await page.keyboard.up(pressureKey);
      }
      const outcome = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage);
      if (outcome === 'landed') break;
    }
    assert.equal(await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage), 'landed', 'Shore fight did not land within three real attempts.');
    diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
    shoreRecord = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('world-explorer-discovery');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('items', 'readonly');
        const all = tx.objectStore('items').getAll();
        all.onsuccess = () => {
          db.close();
          resolve(all.result.find((entry) => entry.evidenceContractId === 'virtual-fishing-catch' && entry.evidencePayload?.accessMode === 'shore') || null);
        };
        all.onerror = () => { db.close(); reject(all.error); };
      };
    }));
    await mkdir('output/verification/live-gps-field', { recursive: true });
    await page.screenshot({ path: 'output/verification/live-gps-field/shore-fishing-mobile.png', fullPage: true });
    await page.locator('#fishingCloseBtn').click();
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.open === false, null, { timeout: 10_000 });
    exitRecovered = true;
  }
  const verifiedFishing = diagnostics.fishing || fishing;
  const checks = {
    shorelineEvaluated: ['shore_eligible', 'access_unknown'].includes(verifiedFishing.accessContext?.outcome),
    shoreGameOpened: verifiedFishing.open === true && verifiedFishing.accessMode === 'shore',
    shoreCastFightCatch: verifiedFishing.active === false && verifiedFishing.stage === 'landed' && verifiedFishing.catches >= 1,
    missedBiteCreatesNoCatchAndCanRetry: missedBiteLoss?.status === 'lost' && missedBiteLoss?.reason === 'MISSED BITE' &&
      missedBiteLoss?.attemptId === missedBiteLoss?.expectedAttemptId && missedBiteLoss?.recordedCatch === false &&
      missedBiteLoss?.rewardEligible === false && missedBiteLoss?.catchesAfter === missedBiteLoss?.catchesBefore &&
      /missed bite/i.test(missedBiteLoss?.message || '') && /try another cast/i.test(missedBiteLoss?.gesture || ''),
    mappedWaterIdentity: !!verifiedFishing.accessContext?.waterbodyId && verifiedFishing.accessContext?.sourceDataset !== 'synthetic-transition',
    sharedPopulationAuthority: verifiedFishing.populationContext?.authorityVersion === 'water-fish-authority-v2' &&
      verifiedFishing.populationContext?.waterbody?.id === verifiedFishing.accessContext?.waterbodyId &&
      verifiedFishing.populationContext?.access?.mode === 'shore',
    honestVirtualCatchModel: verifiedFishing.populationContext?.evidence?.populationTruth === 'gameplay-model-only' &&
      verifiedFishing.populationContext?.evidence?.livePresenceClaim === false &&
      verifiedFishing.fish?.populationEvidence === 'gameplay-model-only' &&
      verifiedFishing.fish?.livePresenceClaim === false,
    shoreJournalTruthPersisted: shoreRecord?.evidencePayload?.fishingAuthorityVersion === 'water-fish-authority-v2' &&
      shoreRecord?.evidencePayload?.accessMode === 'shore' && shoreRecord?.evidencePayload?.livePresenceClaim === false &&
      shoreRecord?.evidencePayload?.locationPrecision === 'generalized-100m',
    mobileControlsAndExit: controlGeometry?.action?.width >= 80 && controlGeometry?.action?.height >= 80 &&
      controlGeometry?.close?.width >= 42 && controlGeometry?.close?.height >= 42 && exitRecovered,
    privacyGeneralizationReady: verifiedFishing.accessContext?.rewardEligible === false || verifiedFishing.accessContext?.accessTruth === 'mapped-explicit',
    modeledBankAndReturnEvidence: verifiedFishing.accessContext?.bankEvidence?.stableStandingSurface === true &&
      verifiedFishing.accessContext?.bankEvidence?.castCorridorClear === true &&
      verifiedFishing.accessContext?.bankEvidence?.recoverableExit === true &&
      verifiedFishing.accessContext?.bankEvidence?.accessibilityClaim === false,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = { ok: Object.values(checks).every(Boolean), contract: 'live-gps-mapped-shore-fishing-loss-retry-catch-and-recovery', checks, fishing: verifiedFishing, missedBiteLoss, shoreRecord, controlGeometry, fightAttempts, movementDebug, browserErrors, localFailures };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Live GPS shoreline fishing entry failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
