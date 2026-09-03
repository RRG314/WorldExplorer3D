import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const verifyRoot = process.env.WE3D_VERIFY_ROOT || root;
const budgets = JSON.parse(await readFile(`${root}/config/performance-budgets.json`, 'utf8'));
const server = await startStaticServer({ rootDir: verifyRoot, ports: [4421, 4422, 4423] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const requestedProfile = String(process.env.WE3D_VERIFY_PROFILE || 'all').trim().toLowerCase();
const auditOnly = process.env.WE3D_VERIFY_AUDIT_ONLY === '1';
assert.ok(['all', 'desktop', 'mobile'].includes(requestedProfile), `Unsupported WE3D_VERIFY_PROFILE: ${requestedProfile}`);

const percentile = (values, portion) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * portion) - 1))] || 0;
};

function metricValue(metrics, name) {
  return Number(metrics.find((entry) => entry.name === name)?.value || 0);
}

async function createMeasuredClient(contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  const requests = new Map();
  const transfers = new Map();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  cdp.on('Network.requestWillBeSent', (event) => requests.set(event.requestId, event.request.url));
  cdp.on('Network.loadingFinished', (event) => transfers.set(event.requestId, Number(event.encodedDataLength || 0)));
  return { context, page, cdp, requests, transfers, browserErrors, localFailures };
}

async function heapUsedBytes(cdp, collect = false) {
  if (collect) await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const result = await cdp.send('Performance.getMetrics');
  return metricValue(result.metrics || [], 'JSHeapUsedSize');
}

async function storageSnapshot(page) {
  return page.evaluate(async () => {
    let estimate = null;
    try { estimate = await navigator.storage?.estimate?.(); } catch {}
    let localStorageBytes = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      localStorageBytes += (key.length + String(localStorage.getItem(key) || '').length) * 2;
    }
    let cacheNames = [];
    try { cacheNames = await caches?.keys?.() || []; } catch {}
    return {
      usageBytes: Number(estimate?.usage || 0),
      quotaBytes: Number(estimate?.quota || 0),
      localStorageBytes,
      cacheStorageNames: cacheNames.length
    };
  });
}

function transferSnapshot(client) {
  let localTransferBytes = 0;
  let externalTransferBytes = 0;
  let localRequests = 0;
  let externalRequests = 0;
  const externalOrigins = new Set();
  const byOrigin = new Map();
  for (const [requestId, url] of client.requests) {
    if (!/^https?:/i.test(url)) continue;
    const bytes = client.transfers.get(requestId) || 0;
    if (url.startsWith(baseUrl)) {
      localRequests += 1;
      localTransferBytes += bytes;
    } else {
      externalRequests += 1;
      externalTransferBytes += bytes;
      try {
        const origin = new URL(url).origin;
        externalOrigins.add(origin);
        const current = byOrigin.get(origin) || { requests: 0, transferBytes: 0 };
        current.requests += 1;
        current.transferBytes += bytes;
        byOrigin.set(origin, current);
      } catch {}
    }
  }
  return {
    localRequests,
    localTransferBytes,
    externalRequests,
    externalTransferBytes,
    externalOriginCount: externalOrigins.size,
    externalByOrigin: Object.fromEntries([...byOrigin.entries()].sort((a, b) => b[1].requests - a[1].requests))
  };
}

async function waitForPlayable(page) {
  await page.waitForSelector('#loading.show', { timeout: 30_000 });
  await page.waitForFunction(() => !document.getElementById('loading')?.classList.contains('show'), null, { timeout: 300_000 });
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false &&
      Number(state.worldCounts?.buildings || 0) > 0 && Number(state.worldCounts?.roads || 0) > 0;
  }, null, { timeout: 300_000 });
  await page.waitForTimeout(2_500);
}

async function launchWorld(client) {
  const startedAt = Date.now();
  const milestones = {};
  await client.page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, {
    waitUntil: 'load', timeout: 120_000
  });
  milestones.documentLoadedMs = Date.now() - startedAt;
  await client.page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  milestones.runtimeReadyMs = Date.now() - startedAt;
  const titleHeapBytes = await heapUsedBytes(client.cdp, true);
  await client.page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  if (await client.page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
    await client.page.locator('#analyticsConsentDenyBtn').click();
  }
  await client.page.locator('#globeSelectorStartBtn').click();
  milestones.worldRequestedMs = Date.now() - startedAt;
  await waitForPlayable(client.page);
  milestones.playableMs = Date.now() - startedAt;
  const diagnostics = await client.page.evaluate(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return {
      worldLoad: state.worldLoad || null,
      performance: state.performance || null,
      transportCompilation: state.transportCompilation || null
    };
  });
  return { firstPlayableMs: milestones.playableMs, titleHeapBytes, milestones, diagnostics };
}

async function selectMode(page, expected, selector) {
  await page.locator('#travelBtn').click();
  await page.waitForSelector('#travelMenu.open', { timeout: 10_000 });
  assert.equal(await page.locator(selector).isVisible(), true, `${selector} is not a visible Travel action.`);
  const startedAt = performance.now();
  await page.locator(selector).click();
  await page.waitForFunction((mode) => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === mode, expected, { timeout: 20_000 });
  const activationMs = Math.round(performance.now() - startedAt);
  await page.waitForTimeout(1_200);
  return activationMs;
}

async function measureMode(client, id, sampleMs = 5_000) {
  const raw = await client.page.evaluate(async (durationMs) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return new Promise((resolve) => {
    const deltas = [];
    const startedAt = performance.now();
    let previous = startedAt;
    const frame = (now) => {
      if (now > previous) deltas.push(now - previous);
      previous = now;
      if (now - startedAt < durationMs) requestAnimationFrame(frame);
      else {
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        const drawCallsByRoot = new Map();
        ctx.scene?.traverse?.((object) => {
          if (!object?.isMesh) return;
          let visible = object.visible !== false;
          for (let parent = object.parent; visible && parent; parent = parent.parent) visible = parent.visible !== false;
          if (!visible) return;
          let root = object;
          while (root.parent && root.parent !== ctx.scene) root = root.parent;
          const label = String(root.name || object.name || root.type || 'unnamed');
          const estimatedCalls = Math.max(1, Number(object.geometry?.groups?.length || 0));
          const current = drawCallsByRoot.get(label) || { meshes: 0, estimatedCalls: 0 };
          current.meshes += 1;
          current.estimatedCalls += estimatedCalls;
          drawCallsByRoot.set(label, current);
        });
        resolve({
          deltas,
          diagnostics: {
            renderer: diagnostics.renderer || {},
            worldCounts: diagnostics.worldCounts || null,
            drawCallBreakdown: [...drawCallsByRoot.entries()]
              .map(([label, value]) => ({ label, ...value }))
              .sort((left, right) => right.estimatedCalls - left.estimatedCalls)
              .slice(0, 24)
          }
        });
      }
    };
    requestAnimationFrame(frame);
    });
  }, sampleMs);
  const deltas = raw.deltas.filter((value) => Number.isFinite(value) && value > 0);
  const averageFrameMs = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);
  const rawJsHeapUsedBytes = await heapUsedBytes(client.cdp);
  const jsHeapUsedBytes = await heapUsedBytes(client.cdp, true);
  return {
    id,
    sampleMs,
    frames: deltas.length,
    averageFps: 1000 / averageFrameMs,
    averageFrameMs,
    p95FrameMs: percentile(deltas, 0.95),
    p99FrameMs: percentile(deltas, 0.99),
    worstFrameMs: Math.max(...deltas),
    calls: Number(raw.diagnostics.renderer?.calls || 0),
    triangles: Number(raw.diagnostics.renderer?.triangles || 0),
    programs: Number(raw.diagnostics.renderer?.programs || 0),
    geometries: Number(raw.diagnostics.renderer?.geometries || 0),
    textures: Number(raw.diagnostics.renderer?.textures || 0),
    rawJsHeapUsedBytes,
    jsHeapUsedBytes,
    worldCounts: raw.diagnostics.worldCounts || null,
    drawCallBreakdown: raw.diagnostics.drawCallBreakdown || []
  };
}

function modesWithinBudgets(modes, tier) {
  const limit = tier.budgets;
  return modes.every((mode) =>
    mode.averageFps >= limit.minimumAverageFps &&
    mode.p95FrameMs <= limit.maximumP95FrameMs &&
    mode.p99FrameMs <= limit.maximumP99FrameMs &&
    mode.calls <= limit.maximumDrawCalls &&
    mode.triangles <= limit.maximumTriangles &&
    mode.programs <= limit.maximumPrograms &&
    mode.geometries <= limit.maximumGeometries &&
    mode.textures <= limit.maximumTextures &&
    mode.jsHeapUsedBytes <= limit.maximumJsHeapUsedBytes
  );
}

function reloadPreservesCoverage(counts, baseline, retention) {
  const ratio = (current, original) => original > 0 ? current / original : current === 0 ? 1 : 0;
  return ratio(Number(counts?.buildings || 0), Number(baseline?.buildings || 0)) >= retention.minimumReloadBuildingRatio &&
    ratio(Number(counts?.roads || 0), Number(baseline?.roads || 0)) >= retention.minimumReloadRoadRatio &&
    ratio(Number(counts?.terrainTiles || 0), Number(baseline?.terrainTiles || 0)) >= retention.minimumReloadTerrainRatio;
}

function transferWithinBudget(transfer, limit) {
  return transfer.localTransferBytes <= limit.maximumLocalTransferBytes &&
    transfer.externalRequests <= limit.maximumExternalRequests &&
    transfer.externalTransferBytes <= limit.maximumExternalTransferBytes;
}

async function runDesktop() {
  const client = await createMeasuredClient({ viewport: { width: 1440, height: 900 } });
  try {
    const launch = await launchWorld(client);
    const walkActivationMs = await selectMode(client.page, 'walk', '#fWalk');
    const walk = { ...(await measureMode(client, 'walk', auditOnly ? 1_500 : 5_000)), activationMs: walkActivationMs };
    const driveActivationMs = await selectMode(client.page, 'drive', '#fDriving');
    const drive = { ...(await measureMode(client, 'drive', auditOnly ? 1_500 : 5_000)), activationMs: driveActivationMs };
    const planeActivationMs = await selectMode(client.page, 'plane', '#fPlane');
    const plane = { ...(await measureMode(client, 'plane', auditOnly ? 1_500 : 5_000)), activationMs: planeActivationMs };
    const modes = [walk, drive, plane];
    const baselineCounts = walk.worldCounts;
    const releases = [];
    const reloadCounts = [];
    const environmentCycles = auditOnly ? 0 : budgets.retention.minimumEnvironmentCycles;
    for (let cycle = 0; cycle < environmentCycles; cycle += 1) {
      await client.page.locator('#mainMenuBtn').click();
      await client.page.waitForFunction(() => {
        const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return state.gameStarted === false && state.titleVisible === true && state.lastEarthWorldRelease?.released === true;
      }, null, { timeout: 30_000 });
      const release = await client.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().lastEarthWorldRelease || null);
      release.jsHeapUsedBytes = await heapUsedBytes(client.cdp, true);
      releases.push(release);
      await client.page.locator('#globeSelectorStartBtn').click();
      await waitForPlayable(client.page);
      reloadCounts.push(await client.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldCounts || null));
    }
    await client.page.screenshot({ path: 'output/release-evidence/current/performance-desktop.png', fullPage: false });
    const storage = await storageSnapshot(client.page);
    const transfer = transferSnapshot(client);
    const limit = budgets.desktopTier.budgets;
    const releaseGeometries = releases.map((entry) => Number(entry?.after?.rendererGeometries || 0));
    const releaseTextures = releases.map((entry) => Number(entry?.after?.rendererTextures || 0));
    const checks = {
      firstPlayableWithinBudget: launch.firstPlayableMs <= limit.firstPlayableMs,
      modeActivationResponsive: modes.every((mode) => mode.activationMs <= limit.maximumModeActivationMs),
      completeWorld: modes.every((mode) => Number(mode.worldCounts?.buildings) > 0 && Number(mode.worldCounts?.roads) > 0 && Number(mode.worldCounts?.terrainTiles) > 0),
      modesWithinBudgets: modesWithinBudgets(modes, budgets.desktopTier),
      teardownClearsWorldOwners: releases.every((entry) =>
        Number(entry?.after?.roads || 0) <= budgets.retention.maximumRetainedRoads &&
        Number(entry?.after?.buildings || 0) <= budgets.retention.maximumRetainedBuildings &&
        Number(entry?.after?.terrainTiles || 0) <= budgets.retention.maximumRetainedTerrainTiles),
      rendererRetentionBounded: Math.max(...releaseGeometries) - Math.min(...releaseGeometries) <= budgets.retention.maximumGeometryGrowthPerCycle &&
        Math.max(...releaseTextures) - Math.min(...releaseTextures) <= budgets.retention.maximumTextureGrowthPerCycle,
      heapRetentionBounded: releases.every((entry) => Number(entry.jsHeapUsedBytes || 0) <= launch.titleHeapBytes + budgets.retention.maximumHeapGrowthBytes),
      worldCoveragePreserved: reloadCounts.every((counts) => reloadPreservesCoverage(counts, baselineCounts, budgets.retention)),
      transferWithinBudget: transferWithinBudget(transfer, limit),
      storageWithinBudget: storage.usageBytes <= limit.maximumPersistentStorageBytes,
      noBrowserErrors: client.browserErrors.length === 0,
      noFailedLocalResources: client.localFailures.length === 0
    };
    return { ok: Object.values(checks).every(Boolean), tier: budgets.desktopTier, launch, modes, releases, reloadCounts, transfer, storage, checks, browserErrors: client.browserErrors, localFailures: client.localFailures };
  } finally {
    await client.context.close();
  }
}

async function runMobileRegression() {
  const viewport = budgets.mobileRegressionTier.viewport;
  const client = await createMeasuredClient({ ...devices['iPhone 13'], viewport });
  try {
    const launch = await launchWorld(client);
    const walkActivationMs = await selectMode(client.page, 'walk', '#fWalk');
    const modes = [{ ...(await measureMode(client, 'walk-touch-regression')), activationMs: walkActivationMs }];
    await client.page.screenshot({ path: 'output/release-evidence/current/performance-mobile-390x844.png', fullPage: false });
    const storage = await storageSnapshot(client.page);
    const transfer = transferSnapshot(client);
    const limit = budgets.mobileRegressionTier.budgets;
    const checks = {
      viewportIs390x844: await client.page.evaluate(() => innerWidth === 390 && innerHeight === 844),
      firstPlayableWithinBudget: launch.firstPlayableMs <= limit.firstPlayableMs,
      modeActivationResponsive: modes.every((mode) => mode.activationMs <= limit.maximumModeActivationMs),
      completeWorld: modes.every((mode) => Number(mode.worldCounts?.buildings) > 0 && Number(mode.worldCounts?.roads) > 0 && Number(mode.worldCounts?.terrainTiles) > 0),
      modesWithinBudgets: modesWithinBudgets(modes, budgets.mobileRegressionTier),
      transferWithinBudget: transferWithinBudget(transfer, limit),
      storageWithinBudget: storage.usageBytes <= limit.maximumPersistentStorageBytes,
      noBrowserErrors: client.browserErrors.length === 0,
      noFailedLocalResources: client.localFailures.length === 0
    };
    return { ok: Object.values(checks).every(Boolean), tier: budgets.mobileRegressionTier, launch, modes, transfer, storage, checks, browserErrors: client.browserErrors, localFailures: client.localFailures };
  } finally {
    await client.context.close();
  }
}

try {
  await mkdir('output/verification/performance-retention', { recursive: true });
  let desktop = null;
  let mobileRegression = null;
  if (requestedProfile !== 'mobile') {
    console.log('[performance-retention] starting desktop');
    desktop = await runDesktop();
    await writeFile('output/verification/performance-retention/report-desktop.json', `${JSON.stringify(desktop, null, 2)}\n`);
    console.log('[performance-retention] desktop complete');
  }
  if (requestedProfile !== 'desktop') {
    console.log('[performance-retention] starting mobile');
    mobileRegression = await runMobileRegression();
    await writeFile('output/verification/performance-retention/report-mobile.json', `${JSON.stringify(mobileRegression, null, 2)}\n`);
    console.log('[performance-retention] mobile complete');
  }
  const selectedReports = [desktop, mobileRegression].filter(Boolean);
  const report = {
    ok: selectedReports.every((entry) => entry.ok),
    contract: 'world-explorer-minimum-5-performance-retention-v1',
    generatedAt: new Date().toISOString(),
    baseUrl,
    writesProduction: false,
    budgets,
    desktop,
    mobileRegression,
    physicalPhoneEvidence: {
      measured: false,
      battery: null,
      thermal: null,
      sustainedFps: null,
      reason: 'No physical phone is connected; touch emulation is not presented as device evidence.'
    }
  };
  await writeFile('output/verification/performance-retention/report.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Minimum-5 desktop/mobile-regression performance or retention budget failed.');
} finally {
  await browser.close();
  await server.close();
}
