import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4386, 4387, 4388] });
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

async function catchRecordCount() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('world-explorer-discovery');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('items', 'readonly');
      const all = transaction.objectStore('items').getAll();
      all.onsuccess = () => {
        db.close();
        resolve(all.result.filter((entry) => String(entry.instanceId || '').startsWith('fish-catch:')).length);
      };
      all.onerror = () => { db.close(); reject(all.error); };
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
  await page.waitForSelector('#exploreMenu.open #fBoat', { timeout: 10_000 });
  await page.locator('#fBoat').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.boat === true, null, { timeout: 30_000 });
  const boatEntry = await page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return {
      setupMethod: 'player-facing-walk-link-then-boat-menu',
      requestedPose: { x: 54, z: -3 },
      started: diagnostics.modes?.boat === true,
      activeActorMode: diagnostics.activeActor?.mode || null
    };
  });
  assert.equal(boatEntry.started, true, `Could not enter boat through the shared-link gameplay path: ${JSON.stringify(boatEntry)}`);

  const recordsBefore = await catchRecordCount();
  await page.locator('#fishingDockBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.open === true, null, { timeout: 30_000 });
  const catchesBefore = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.catches || 0);

  await page.locator('#fishingActionBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'bite', null, { timeout: 20_000 });
  await page.locator('#fishingActionBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'fighting', null, { timeout: 10_000 });
  const firstAttemptId = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.attempt?.attemptId || null);
  await page.locator('#fishingDrag').evaluate((element) => {
    element.value = '90';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

  for (let index = 0; index < 500; index += 1) {
    const fishing = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});
    if (fishing.stage === 'lost') break;
    assert.equal(fishing.stage, 'fighting', `Unexpected stage while forcing line overload: ${fishing.stage}`);
    const wrongDirection = Number(fishing.fishDirection) < 0 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(wrongDirection);
    await page.keyboard.down('Space');
    await page.evaluate(() => globalThis.advanceTime?.(180));
    await page.keyboard.up('Space');
  }

  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'lost', null, { timeout: 10_000 });
  const loss = await page.evaluate(() => ({
    fishing: globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {},
    meta: document.querySelector('#fishingFishMeta')?.textContent || '',
    message: document.querySelector('#fishingMessage')?.textContent || '',
    gesture: document.querySelector('#fishingGestureLabel')?.textContent || ''
  }));
  await mkdir('output/release-evidence/current', { recursive: true });
  await page.screenshot({ path: 'output/release-evidence/current/fishing-line-loss-mobile.png', fullPage: true });

  const recordsAfterLoss = await catchRecordCount();
  await page.locator('#fishingActionBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'bite', null, { timeout: 20_000 });
  await page.locator('#fishingActionBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'fighting', null, { timeout: 10_000 });
  const retry = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});

  await page.keyboard.down('Space');
  await page.locator('#fishingCloseBtn').click();
  await page.keyboard.up('Space');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.open === false, null, { timeout: 10_000 });
  const teardown = await page.evaluate(() => {
    const fishing = globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {};
    const button = document.querySelector('#exploreBtn');
    const bounds = button?.getBoundingClientRect?.();
    const hit = bounds ? document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) : null;
    return {
      fishing,
      panelOpen: document.querySelector('#fishingGamePanel')?.classList.contains('open') === true,
      modesButtonVisible: !!bounds && bounds.width > 0 && bounds.height > 0,
      modesButtonOwnsHit: !!button && (hit === button || button.contains(hit))
    };
  });
  await page.screenshot({ path: 'output/release-evidence/current/fishing-teardown-recovery-mobile.png', fullPage: true });
  const recordsAfterClose = await catchRecordCount();

  await page.locator('#fishingDockBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.open === true, null, { timeout: 10_000 });
  const reopened = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});
  await page.locator('#fishingCloseBtn').click();

  const checks = {
    mappedBoatEntry: boatEntry.started === true && boatEntry.activeActorMode === 'boat' &&
      loss.fishing.populationContext?.waterbody?.sourceTruth === 'published-water-surface',
    lineSnapsFromRealInput: loss.fishing.stage === 'lost' && loss.fishing.lineIntegrity <= 0.001 && /line snapped/i.test(loss.message),
    lossOutcomeIsExplicit: loss.fishing.lastOutcome?.status === 'lost' && loss.fishing.lastOutcome?.attemptId === firstAttemptId &&
      loss.fishing.lastOutcome?.recordedCatch === false && loss.fishing.lastOutcome?.rewardEligible === false,
    lossCopyIsGameFacing: /virtual fish/i.test(loss.meta) && /not recorded/i.test(loss.meta) && /try another cast/i.test(loss.gesture),
    lossCreatesNoCatchOrJournalRecord: loss.fishing.catches === catchesBefore && recordsAfterLoss === recordsBefore,
    retryCreatesANewAttempt: retry.stage === 'fighting' && !!retry.attempt?.attemptId && retry.attempt.attemptId !== firstAttemptId,
    closeCancelsTheRetry: teardown.fishing.lastOutcome?.status === 'cancelled' &&
      teardown.fishing.lastOutcome?.attemptId === retry.attempt?.attemptId && teardown.fishing.lastOutcome?.recordedCatch === false,
    teardownClearsFishingOwnership: teardown.fishing.open === false && teardown.fishing.active === false && teardown.fishing.stage === 'idle' &&
      teardown.fishing.accessMode === null && teardown.fishing.populationContext === null && teardown.fishing.attempt === null &&
      teardown.fishing.reeling === false && teardown.fishing.givingLine === false && teardown.panelOpen === false,
    mobileControlsRecoverAfterClose: teardown.modesButtonVisible && teardown.modesButtonOwnsHit,
    reopenStartsClean: reopened.open === true && reopened.active === false && reopened.stage === 'idle' &&
      reopened.accessMode === 'boat' && reopened.populationContext?.authorityVersion === 'water-fish-authority-v2',
    cancellationCreatesNoCatchOrJournalRecord: teardown.fishing.catches === catchesBefore && recordsAfterClose === recordsBefore,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'fishing-line-loss-retry-close-teardown-v1',
    checks,
    boatEntry,
    firstAttemptId,
    loss,
    retry: {
      stage: retry.stage,
      attempt: retry.attempt,
      accessMode: retry.accessMode,
      populationContextId: retry.populationContext?.contextId || null
    },
    teardown,
    reopened: {
      open: reopened.open,
      active: reopened.active,
      stage: reopened.stage,
      accessMode: reopened.accessMode,
      authorityVersion: reopened.populationContext?.authorityVersion || null
    },
    recordCounts: { before: recordsBefore, afterLoss: recordsAfterLoss, afterClose: recordsAfterClose },
    browserErrors,
    localFailures
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Fishing loss/recovery journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
