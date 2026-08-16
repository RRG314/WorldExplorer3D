import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const candidateRoot = process.cwd();
const outputPath = path.join(candidateRoot, 'output', 'playwright', 'load-performance', 'report.json');
const referenceTag = String(process.env.WE3D_PERF_REFERENCE_TAG || 'v4.2.0');
const allowedRatio = 1.1;
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-performance-reference-'));
const referenceRoot = path.join(temporaryRoot, 'reference');
const archivePath = path.join(temporaryRoot, 'reference.tar');
let browser;
let referenceServer;
let candidateServer;

function ratio(candidate, reference) {
  if (!(candidate > 0) || !(reference > 0)) return null;
  return Number((candidate / reference).toFixed(4));
}

async function runLoad(page, baseUrl, build, cacheState) {
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource|Could not reach Cloud Firestore|blocked by CORS/i.test(text)) return;
    consoleErrors.push(text);
  });
  const navigationStartedAt = performance.now();
  await page.goto(`${baseUrl}/app/?load-performance=${build}-${cacheState}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  const navigationMs = performance.now() - navigationStartedAt;
  const result = await page.evaluate(async () => {
    const bootstrapStartedAt = performance.now();
    const deadline = bootstrapStartedAt + 120000;
    let ctx = null;
    while (performance.now() < deadline) {
      ({ ctx } = await import('/app/js/shared-context.js?v=55'));
      if (
        typeof ctx?.loadRoads === 'function' &&
        typeof ctx?.selectPresetLocation === 'function' &&
        ctx?.ENV?.EARTH
      ) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (typeof ctx?.loadRoads !== 'function') throw new Error('Runtime bootstrap timed out');
    const bootstrapMs = performance.now() - bootstrapStartedAt;
    if (!ctx.selectPresetLocation('baltimore')) throw new Error('Baltimore selection failed');
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');

    const loadStartedAt = performance.now();
    await ctx.loadRoads();
    const loadMs = performance.now() - loadStartedAt;
    const providers = ctx.worldLoadRuntimeState?.session?.providers || {};
    const publication = ctx.verifyWorldPublicationStable?.() || null;
    const resourceEntries = performance.getEntriesByType('resource');
    return {
      bootstrapMs,
      loadMs,
      requestId: ctx.worldPublication?.requestId || null,
      status: ctx.worldLoadRuntimeState?.status || null,
      publication,
      counts: ctx.worldPublication?.counts || null,
      providerInFlight: Object.fromEntries(Object.entries(providers).map(([id, value]) => [
        id,
        Number(value?.inFlight || 0)
      ])),
      phases: ctx.worldLoadRuntimeState?.phaseTotals || null,
      farTerrain: ctx.farTerrainClipmapState ? {
        status: ctx.farTerrainClipmapState.status,
        elevationMaxInFlight: Number(ctx.farTerrainClipmapState.elevationMaxInFlight || 0)
      } : null,
      resources: {
        count: resourceEntries.length,
        transferSize: resourceEntries.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0),
        decodedBodySize: resourceEntries.reduce((sum, entry) => sum + Number(entry.decodedBodySize || 0), 0)
      },
      heapBytes: Number(performance.memory?.usedJSHeapSize || 0)
    };
  });
  return {
    build,
    cacheState,
    navigationMs: Number(navigationMs.toFixed(2)),
    ...result,
    bootstrapMs: Number(result.bootstrapMs.toFixed(2)),
    loadMs: Number(result.loadMs.toFixed(2)),
    consoleErrors
  };
}

async function runBuild(context, baseUrl, build, cacheState) {
  const page = await context.newPage({ viewport: { width: 1365, height: 768 } });
  try {
    return await runLoad(page, baseUrl, build, cacheState);
  } finally {
    await page.close();
  }
}

async function clearHttpCache(context) {
  const page = await context.newPage();
  try {
    const session = await context.newCDPSession(page);
    await session.send('Network.clearBrowserCache');
    await session.detach();
  } finally {
    await page.close();
  }
}

try {
  await fs.mkdir(referenceRoot, { recursive: true });
  execFileSync('git', ['archive', '--format=tar', referenceTag, '-o', archivePath], {
    cwd: candidateRoot,
    stdio: 'pipe'
  });
  execFileSync('tar', ['-xf', archivePath, '-C', referenceRoot], { stdio: 'pipe' });

  referenceServer = await startStaticRootServer({
    rootDir: referenceRoot,
    host: '127.0.0.1',
    candidatePorts: [4250]
  });
  browser = await chromium.launchPersistentContext(path.join(temporaryRoot, 'browser-profile'), { headless: true });
  const referenceUrl = `http://127.0.0.1:${referenceServer.port}`;

  // Prime IndexedDB-backed provider caches once, then serve both revisions from
  // the exact same origin and profile. Clearing only the HTTP cache between
  // revisions prevents old app modules from leaking into the candidate while
  // keeping provider inputs identical and removing external-response variance.
  await runBuild(browser, referenceUrl, 'reference', 'provider-prime');
  await clearHttpCache(browser);
  const referenceCold = await runBuild(browser, referenceUrl, 'reference', 'cold');
  const referenceWarm = await runBuild(browser, referenceUrl, 'reference', 'warm');
  await referenceServer.close();
  referenceServer = null;
  candidateServer = await startStaticRootServer({
    rootDir: candidateRoot,
    host: '127.0.0.1',
    candidatePorts: [4250]
  });
  await clearHttpCache(browser);
  const candidateUrl = `http://127.0.0.1:${candidateServer.port}`;
  const candidateCold = await runBuild(browser, candidateUrl, 'candidate', 'cold');
  const candidateWarm = await runBuild(browser, candidateUrl, 'candidate', 'warm');

  const comparisons = {
    coldLoadRatio: ratio(candidateCold.loadMs, referenceCold.loadMs),
    warmLoadRatio: ratio(candidateWarm.loadMs, referenceWarm.loadMs),
    coldBootstrapRatio: ratio(candidateCold.bootstrapMs, referenceCold.bootstrapMs),
    warmBootstrapRatio: ratio(candidateWarm.bootstrapMs, referenceWarm.bootstrapMs),
    coldHeapRatio: ratio(candidateCold.heapBytes, referenceCold.heapBytes),
    warmHeapRatio: ratio(candidateWarm.heapBytes, referenceWarm.heapBytes)
  };
  const report = {
    generatedAt: new Date().toISOString(),
    reference: { tag: referenceTag, commit: execFileSync('git', ['rev-parse', referenceTag], { cwd: candidateRoot, encoding: 'utf8' }).trim() },
    candidate: {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: candidateRoot, encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { cwd: candidateRoot, encoding: 'utf8' }).trim().length > 0
    },
    allowedLoadRatio: allowedRatio,
    runs: { referenceCold, candidateCold, referenceWarm, candidateWarm },
    comparisons
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  for (const run of Object.values(report.runs)) {
    assert.equal(run.status, 'ready', `${run.build} ${run.cacheState} did not reach ready`);
    assert.equal(run.publication?.stable, true, `${run.build} ${run.cacheState} publication was unstable`);
    assert.ok(
      Object.values(run.providerInFlight || {}).every((value) => value === 0),
      `${run.build} ${run.cacheState} retained provider work`
    );
    assert.deepEqual(run.consoleErrors, [], `${run.build} ${run.cacheState} emitted console errors`);
  }
  for (const [candidateRun, referenceRun, label] of [
    [candidateCold, referenceCold, 'cold'],
    [candidateWarm, referenceWarm, 'warm']
  ]) {
    assert.ok(Math.abs(ratio(candidateRun.counts?.roads, referenceRun.counts?.roads) - 1) <= 0.02, `${label} comparison used materially different road inputs`);
    assert.ok(Math.abs(ratio(candidateRun.counts?.buildings, referenceRun.counts?.buildings) - 1) <= 0.02, `${label} comparison used materially different building inputs`);
  }
  assert.ok(
    comparisons.coldLoadRatio <= allowedRatio,
    `cold load regressed ${(comparisons.coldLoadRatio * 100 - 100).toFixed(1)}% from ${referenceTag}`
  );
  assert.ok(
    comparisons.warmLoadRatio <= allowedRatio,
    `warm load regressed ${(comparisons.warmLoadRatio * 100 - 100).toFixed(1)}% from ${referenceTag}`
  );
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser?.close();
  await referenceServer?.close();
  await candidateServer?.close();
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
