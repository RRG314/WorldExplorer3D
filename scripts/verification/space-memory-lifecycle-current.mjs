import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/space-memory-lifecycle-current');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));

async function heapAfterCollection() {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const { metrics = [] } = await cdp.send('Performance.getMetrics');
  return Number(metrics.find((entry) => entry.name === 'JSHeapUsedSize')?.value || 0);
}

async function launchSpace() {
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
    await page.locator('#analyticsConsentDenyBtn').click();
  }
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.modes?.space === true && diagnostics.onDemandModes?.space?.rendererReady === true &&
      !document.getElementById('loading')?.classList.contains('show');
  }, null, { timeout: 180_000 });
  await page.waitForTimeout(1_000);
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    let sceneObjects = 0;
    ctx.spaceFlight.scene?.traverse?.(() => { sceneObjects += 1; });
    return {
      environment: ctx.currentEnvironment,
      rendererReady: Boolean(ctx.spaceFlight.renderer),
      rendererMemory: { ...(ctx.spaceFlight.renderer?.info?.memory || {}) },
      sceneObjects,
      canvas: {
        width: Number(ctx.spaceFlight.canvas?.width || 0),
        height: Number(ctx.spaceFlight.canvas?.height || 0)
      },
      activeScope: ctx.getEnvironmentCoordinatorSnapshot?.()?.lifecycles?.SPACE_FLIGHT || null
    };
  });
}

async function returnToTitle() {
  await page.locator('#mainMenuBtn').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === false && state.titleVisible === true;
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(750);
  const released = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      active: Boolean(ctx.spaceFlight.active),
      animationActive: ctx.spaceFlight.animationId != null,
      rendererReady: Boolean(ctx.spaceFlight.renderer),
      sceneReady: Boolean(ctx.spaceFlight.scene),
      rocketReady: Boolean(ctx.spaceFlight.rocket),
      universeInitialized: Boolean(ctx.universeRuntime?.initialized),
      canvas: {
        width: Number(ctx.spaceFlight.canvas?.width || 0),
        height: Number(ctx.spaceFlight.canvas?.height || 0),
        display: ctx.spaceFlight.canvas?.style?.display || ''
      }
    };
  });
  return { ...released, heapUsedBytes: await heapAfterCollection() };
}

const cycles = [];
try {
  await page.goto(`${baseUrl}/app/?launch=space&memory-lifecycle=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  for (let index = 0; index < 2; index += 1) {
    const active = await launchSpace();
    assert.equal(active.rendererReady, true, `Space renderer was absent in cycle ${index + 1}.`);
    assert.ok(active.sceneObjects > 100, `Space scene did not fully initialize in cycle ${index + 1}.`);
    const released = await returnToTitle();
    assert.equal(released.active, false);
    assert.equal(released.animationActive, false);
    assert.equal(released.rendererReady, false);
    assert.equal(released.sceneReady, false);
    assert.equal(released.rocketReady, false);
    assert.equal(released.universeInitialized, false);
    assert.equal(released.canvas.width, 1);
    assert.equal(released.canvas.height, 1);
    assert.equal(released.canvas.display, 'none');
    cycles.push({ active, released });
  }

  const heapGrowthBytes = cycles[1].released.heapUsedBytes - cycles[0].released.heapUsedBytes;
  assert.ok(heapGrowthBytes <= 24 * 1024 * 1024, `Collected heap grew ${heapGrowthBytes} bytes across equivalent Space cycles.`);
  assert.deepEqual(browserErrors, []);

  const report = {
    ok: true,
    contract: 'space-auxiliary-renderer-lifecycle-current-v1',
    baseUrl,
    cycles,
    heapGrowthBytes,
    browserErrors
  };
  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
}
