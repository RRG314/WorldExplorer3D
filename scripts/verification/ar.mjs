import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4437, 4438, 4439] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const reportPath = path.join(root, 'output', 'verification', 'ar', 'report.json');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ kind: 'response', status: response.status(), url: response.url() });
  }
});
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) {
    localFailures.push({ kind: 'request', reason: request.failure()?.errorText || 'failed', url: request.url() });
  }
});

async function snapshot() {
  return page.evaluate(() => ({
    runtime: globalThis.getWorldExplorerRuntimeDiagnostics?.() || {},
    ar: globalThis.getWorldExplorerRuntimeDiagnostics?.()?.augmentedReality ||
      globalThis.getWorldExplorerRuntimeDiagnostics?.()?.ar ||
      globalThis.getArPlatformSnapshot?.() || null,
    platform: globalThis.getWorldExplorerRuntimeDiagnostics?.()?.platformServices || null,
    ui: {
      shellOpen: document.getElementById('arExperience')?.classList.contains('show') === true,
      ariaHidden: document.getElementById('arExperience')?.getAttribute('aria-hidden') || '',
      title: document.getElementById('arTitle')?.textContent?.trim() || '',
      mode: document.getElementById('arModeBadge')?.textContent?.trim() || '',
      status: document.getElementById('arStatus')?.textContent?.trim() || '',
      intro: document.getElementById('arIntroCopy')?.textContent?.trim() || '',
      safety: document.querySelector('#arIntro .arSafety')?.textContent?.trim() || '',
      privacy: document.querySelector('#arIntro .arPrivacyCopy')?.textContent?.trim() || '',
      privacyBadge: document.getElementById('arPrivacyBadge')?.textContent?.trim() || '',
      instruction: document.getElementById('arInstruction')?.textContent?.trim() || '',
      metric: document.getElementById('arMetric')?.textContent?.trim() || '',
      continueLabel: document.getElementById('arContinueBtn')?.textContent?.trim() || '',
      fieldChallengeHidden: document.getElementById('discoveryArChallengeBtn')?.hidden === true,
      fieldChallengeDisplay: getComputedStyle(document.getElementById('discoveryArChallengeBtn')).display
    }
  }));
}

function arSnapshotInPage() {
  const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
  return runtime.augmentedReality || runtime.ar || null;
}

async function dismissTutorials() {
  const hintClose = page.locator('#tutorialHintCard .tutorial-icon-btn');
  if (await hintClose.isVisible().catch(() => false)) await hintClose.click();
  const sectionDone = page.locator('#discoverySectionTutorialDoneBtn');
  if (await sectionDone.isVisible().catch(() => false)) await sectionDone.click();
}

async function openJournal() {
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show', { timeout: 10_000 });
  await dismissTutorials();
}

async function photographVisibleTargets() {
  for (let round = 0; round < 24; round += 1) {
    const current = await snapshot();
    if (current.ar?.challenge?.completed) return current;
    const visibleTargets = (current.ar?.presentation?.targetHitPoints || []).filter((target) => target.visible && !target.captured);
    if (!visibleTargets.length) {
      await page.waitForTimeout(180);
      continue;
    }
    for (const target of visibleTargets) {
      await page.touchscreen.tap(target.clientX, target.clientY);
      const progress = await page.evaluate(arSnapshotInPage).then((ar) => ar?.challenge?.photographed || 0);
      if (progress >= 4) return snapshot();
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(180);
  }
  return snapshot();
}

let report = null;
try {
  const launchParams = new URLSearchParams({
    loc: 'custom',
    lat: '39.28305',
    lon: '-76.61270',
    lname: 'Baltimore Inner Harbor',
    launch: 'earth',
    gm: 'free',
    mode: 'driving'
  });
  await page.goto(`${baseUrl}/app/?${launchParams}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false && state.worldDiscovery?.active === true;
  }, null, { timeout: 240_000 });
  await dismissTutorials();

  // The same visible Journal action must not offer AR while the player is still driving.
  await openJournal();
  const drivingContext = await snapshot();
  const drivingChallengeHidden = await page.locator('#discoveryArChallengeBtn').isHidden();
  await page.locator('#discoveryCloseBtn').click();

  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator('#fWalk').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.()?.activeActor?.mode === 'walk', null, { timeout: 20_000 });

  await openJournal();
  await page.waitForTimeout(500);
  const walkingContext = await snapshot();
  assert.equal(walkingContext.runtime?.worldDiscovery?.arFieldChallenge?.allowed, true,
    `Walking AR habitat was unavailable: ${JSON.stringify(walkingContext.runtime?.worldDiscovery?.arHabitatContext || null)}`);
  const challengeButton = page.locator('#discoveryArChallengeBtn');
  assert.equal(await challengeButton.isVisible(), true, 'Eligible walking AR challenge must be visible in the Journal');
  const walkingChallengeLabel = (await page.locator('#discoveryArChallengeBtn').textContent() || '').replace(/\s+/g, ' ').trim();
  await page.locator('#discoveryArChallengeBtn').click();
  await page.waitForSelector('#arExperience.show', { timeout: 20_000 });
  const preview = await snapshot();

  // Headless Chrome cannot satisfy the camera request. The player must get an
  // honest recovery action and then reach the equivalent interactive 3D view.
  await page.locator('#arContinueBtn').click();
  await page.waitForFunction(() => {
    const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const snap = runtime.augmentedReality || runtime.ar || null;
    return snap?.phase === 'active' || (snap?.phase === 'error' && document.getElementById('arContinueBtn')?.textContent?.includes('Open 3D'));
  }, null, { timeout: 20_000 });
  let afterCameraAttempt = await snapshot();
  const cameraFallbackOffered = afterCameraAttempt.ar?.phase === 'error' && /Open 3D/i.test(afterCameraAttempt.ui.continueLabel);
  if (afterCameraAttempt.ar?.phase === 'error') {
    await page.locator('#arContinueBtn').click();
    await page.waitForFunction(() => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return (runtime.augmentedReality || runtime.ar || null)?.phase === 'active';
    }, null, { timeout: 20_000 });
    afterCameraAttempt = await snapshot();
  }

  const completed = await photographVisibleTargets();
  await page.locator('#arCloseBtn').click();
  await page.waitForFunction(() => {
    const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return (runtime.augmentedReality || runtime.ar || null)?.phase === 'idle';
  }, null, { timeout: 10_000 });
  const exited = await snapshot();

  const copy = `${preview.ui.intro} ${preview.ui.safety} ${preview.ui.privacy} ${afterCameraAttempt.ui.status} ${afterCameraAttempt.ui.instruction}`;
  const checks = {
    drivingModeBlocksFieldAr: drivingChallengeHidden,
    walkingHabitatOffersVisibleChallenge: /AR FIELD CHALLENGE/i.test(walkingChallengeLabel) && /virtual waterfowl/i.test(walkingChallengeLabel),
    visibleLaunchOpenedPreview: preview.ui.shellOpen && preview.ui.ariaHidden === 'false' && preview.ar?.phase === 'preview',
    safetyCopyRequiresStationaryUse: /Do not use AR while driving, cycling, or crossing traffic/i.test(preview.ui.safety),
    privacyCopyRejectsRecordingAndUpload: /does not record, upload, or analyze/i.test(preview.ui.privacy),
    cameraFailureHasPlayerRecovery: afterCameraAttempt.ar?.capability?.level !== 'interactive-3d' || cameraFallbackOffered,
    fallbackReachedActiveViewer: afterCameraAttempt.ar?.active === true && afterCameraAttempt.ar?.capability?.level === 'interactive-3d',
    virtualOnlyChallengeAuthority: afterCameraAttempt.ar?.challenge?.virtualTargetsOnly === true && afterCameraAttempt.ar?.challenge?.realAnimalImpact === false,
    fourRenderedTargetsOwnedByChallenge: afterCameraAttempt.ar?.challenge?.total === 4 && afterCameraAttempt.ar?.presentation?.actorCount === 4,
    normalPointerInputCompletedSurvey: completed.ar?.challenge?.completed === true && completed.ar?.challenge?.photographed === 4 && completed.ar?.presentation?.captured === 4,
    honestVirtualLanguage: /virtual/i.test(copy) && !/real animal is (here|present)|animal detected/i.test(copy),
    noCameraFramesRetained: afterCameraAttempt.ar?.cameraFramesStored === false && afterCameraAttempt.ar?.cameraFramesUploaded === false,
    closeReturnsToWorld: exited.ar?.phase === 'idle' && !exited.ui.shellOpen && exited.runtime?.gameStarted === true && exited.runtime?.worldLoading === false,
    noBrowserErrors: browserErrors.length === 0,
    noLocalHttpFailures: localFailures.length === 0
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'contextual-ar-normal-input-v1',
    generatedAt: new Date().toISOString(),
    servedRoot,
    checks,
    evidence: { drivingContext, walkingContext, walkingChallengeLabel, preview, afterCameraAttempt, completed, exited },
    browserErrors,
    localFailures
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: report.ok, contract: report.contract, checks: report.checks }, null, 2));
  assert.equal(report.ok, true, `Contextual AR verification failed; see ${path.relative(root, reportPath)}`);
} catch (error) {
  const failureSnapshot = await snapshot().catch(() => null);
  if (!report) report = {
    ok: false,
    contract: 'contextual-ar-normal-input-v1',
    generatedAt: new Date().toISOString(),
    servedRoot,
    error: String(error?.stack || error),
    failureSnapshot,
    browserErrors,
    localFailures
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await browser.close().catch(() => {});
  await server?.close().catch(() => {});
}
