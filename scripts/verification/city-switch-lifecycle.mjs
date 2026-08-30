import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const initialOnly = process.env.WE3D_VERIFY_INITIAL_ONLY === '1';
const server = externalUrl ? null : await startStaticServer({ rootDir: root, ports: [4431, 4432, 4433] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = `${root}/output/verification/city-switch-lifecycle`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');

const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ url: response.url(), status: response.status() });
  }
});
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) {
    localFailures.push({ url: request.url(), reason: request.failure()?.errorText || 'failed' });
  }
});

function metric(metrics, name) {
  return Number(metrics.find((entry) => entry.name === name)?.value || 0);
}

async function memorySnapshot(collect = false) {
  if (collect) await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const { metrics = [] } = await cdp.send('Performance.getMetrics');
  return {
    jsHeapUsedBytes: metric(metrics, 'JSHeapUsedSize'),
    jsHeapTotalBytes: metric(metrics, 'JSHeapTotalSize'),
    nodes: metric(metrics, 'Nodes'),
    documents: metric(metrics, 'Documents'),
    listeners: metric(metrics, 'JSEventListeners')
  };
}

async function frameHeartbeat(durationMs = 1200) {
  return page.evaluate((sampleMs) => new Promise((resolve) => {
    let frames = 0;
    let worstFrameMs = 0;
    const startedAt = performance.now();
    let previous = startedAt;
    const tick = (now) => {
      frames += 1;
      worstFrameMs = Math.max(worstFrameMs, now - previous);
      previous = now;
      if (now - startedAt >= sampleMs) resolve({ frames, worstFrameMs, elapsedMs: now - startedAt });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), durationMs);
}

async function runtimeSnapshot(label) {
  const runtime = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
  return {
    label,
    earthOrigin: runtime.earthOrigin || null,
    worldLoading: runtime.worldLoading === true,
    loadStatus: runtime.worldLoad?.status || null,
    loadSequence: Number(runtime.worldLoad?.sequence || 0),
    locationName: runtime.worldLoad?.location?.name || null,
    worldCounts: runtime.worldCounts || null,
    renderer: runtime.renderer || null,
    runtimeErrorCount: Array.isArray(runtime.runtimeErrors) ? runtime.runtimeErrors.length : 0,
    heartbeat: await frameHeartbeat(),
    memory: await memorySnapshot(true)
  };
}

async function waitForWorld(latitude, longitude, timeout = 300_000) {
  await page.waitForFunction(({ lat, lon }) => {
    const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const origin = runtime.earthOrigin || {};
    return runtime.gameStarted === true && runtime.worldLoading === false &&
      runtime.worldLoad?.status === 'ready' &&
      Math.abs(Number(origin.lat) - lat) < 0.001 &&
      Math.abs(Number(origin.lon) - lon) < 0.001 &&
      Number(runtime.worldCounts?.roads || 0) > 0;
  }, { lat: latitude, lon: longitude }, { timeout });
  await page.waitForTimeout(1500);
}

function logStep(message) {
  console.log(`[city-switch] ${message}`);
}

let report;
try {
  await mkdir(outputDir, { recursive: true });
  await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, {
    waitUntil: 'load',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
    await page.locator('#analyticsConsentDenyBtn').click();
  }
  await page.locator('#globeSelectorStartBtn').click();
  logStep('waiting for initial Baltimore world');
  await waitForWorld(39.2904, -76.6122);
  const baseline = await runtimeSnapshot('custom-baltimore');

  let sameAreaReload = null;
  let hollywood = null;
  let repeatProbe = null;
  let repeatOriginBefore = null;
  if (!initialOnly) {
    logStep('switching custom Baltimore to preset Baltimore');
    await page.keyboard.press('KeyN');
    await waitForWorld(39.2904, -76.6122);
    sameAreaReload = await runtimeSnapshot('preset-baltimore');

    logStep('switching Baltimore to Hollywood');
    await page.keyboard.press('KeyN');
    await waitForWorld(34.0928, -118.3287);
    hollywood = await runtimeSnapshot('hollywood');

    repeatOriginBefore = hollywood.earthOrigin;
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'KeyN',
        key: 'n',
        repeat: true
      }));
    });
    await page.waitForTimeout(750);
    repeatProbe = await page.evaluate(() => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        earthOrigin: runtime.earthOrigin || null,
        worldLoading: runtime.worldLoading === true,
        loadStatus: runtime.worldLoad?.status || null,
        loadSequence: Number(runtime.worldLoad?.sequence || 0)
      };
    });
  }

  await page.screenshot({
    path: `${outputDir}/${initialOnly ? 'baltimore-initial-ready.png' : 'hollywood-after-city-switch.png'}`,
    fullPage: false
  });
  const snapshots = [baseline, sameAreaReload, hollywood].filter(Boolean);
  const checks = {
    liveFramesAfterEachSwitch: snapshots.every((entry) =>
      Number(entry.heartbeat?.frames || 0) >= 10 && Number(entry.heartbeat?.worstFrameMs || Infinity) <= 500),
    rendererContextHealthy: snapshots.every((entry) => entry.renderer?.contextLost !== true && Number(entry.renderer?.glError || 0) === 0),
    worldCoverageAfterEachSwitch: snapshots.every((entry) => Number(entry.worldCounts?.roads || 0) > 0),
    noRuntimeErrors: snapshots.every((entry) => entry.runtimeErrorCount === 0) && browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0,
    heldKeyDoesNotStartAnotherWorldLoad: initialOnly || (
      repeatProbe.worldLoading === false &&
      Number(repeatProbe.earthOrigin?.lat) === Number(repeatOriginBefore?.lat) &&
      Number(repeatProbe.earthOrigin?.lon) === Number(repeatOriginBefore?.lon)
    )
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    baseUrl,
    scope: initialOnly ? 'initial-world-only' : 'in-session-city-switches',
    checks,
    snapshots,
    repeatProbe,
    browserErrors,
    localFailures
  };
  await writeFile(`${outputDir}/${initialOnly ? 'report-initial.json' : 'report.json'}`, `${JSON.stringify(report, null, 2)}\n`);
  Object.entries(checks).forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  assert.equal(report.ok, true, `City-switch lifecycle verification failed: ${JSON.stringify(checks)}`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server?.close().catch(() => {});
}
