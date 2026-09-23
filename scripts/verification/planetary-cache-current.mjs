import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

// Resource-lifetime integration test: calls the real world transition API.
// This is deliberately diagnostic evidence, not a normal-input travel journey
// or a physical-device performance benchmark.
const root = path.resolve(process.env.WE3D_VERIFY_ROOT || 'dist');
const output = 'output/verification/planetary-cache-current';
const manifest = JSON.parse(await fs.readFile(path.join(root, 'build-manifest.json'), 'utf8'));
await fs.mkdir(output, { recursive: true });
await fs.writeFile(`${output}/report.json`, JSON.stringify({ ok: false, buildId: manifest.buildId, stage: 'started' }));
const server = await startStaticServer({ rootDir: root, ports: [4495, 4496] });
let browser;
const errors = [], worlds = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  if (process.env.WE3D_STAGING_APP_CHECK_FILE) {
    const credential = JSON.parse(await fs.readFile(process.env.WE3D_STAGING_APP_CHECK_FILE, 'utf8'));
    assert.equal(manifest.firebaseProjectId, 'we3d-staging-20260712');
    assert.equal(credential.projectId, manifest.firebaseProjectId);
    await page.addInitScript(token => { globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = token; }, credential.token);
  }
  page.on('pageerror', error => errors.push(String(error)));
  collectBrowserGraphicsErrors(page, errors);
  await page.goto(`http://127.0.0.1:${server.port}/app/?launch=moon&gm=free`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__, null, { timeout: 60000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeSelectorMoonBtn').click();
  await page.waitForFunction(() => {
    const state = window.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted && !state.worldLoading && state.environment === 'MOON';
  }, null, { timeout: 120000 });
  for (const [index, bodyId] of ['mercury', 'venus', 'io', 'mercury'].entries()) {
    const state = await page.evaluate(async bodyId => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const arrived = await ctx.arriveAtSolidWorld(bodyId);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { arrived, bodyId: ctx.activePlanetaryBodyId, cache: ctx.getPlanetaryWorldCacheSnapshot(),
        surfaceAttached: ctx.activeSolidWorldSurface?.parent === ctx.scene,
        surfaceVisible: ctx.activeSolidWorldSurface?.visible,
        surfaceVertices: ctx.activeSolidWorldSurface?.geometry?.attributes?.position?.count,
        renderer: { ...ctx.renderer.info.memory } };
    }, bodyId);
    assert.equal(state.arrived, true);
    assert.equal(state.bodyId, bodyId);
    assert.equal(state.surfaceAttached, true);
    assert.equal(state.surfaceVisible, true);
    assert.ok(state.surfaceVertices > 1000);
    assert.equal(state.cache.size, Math.min(2, index + 1));
    assert.ok(state.cache.bodyIds.includes(bodyId));
    assert.deepEqual(state.cache.attachedBodyIds, [bodyId], 'cached planets must not remain attached to the active scene');
    if (index === 2) assert.equal(state.cache.bodyIds.includes('mercury'), false);
    await page.screenshot({ path: `${output}/${index}-${bodyId}.png` });
    worlds.push(state);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ ok: true, buildId: manifest.buildId,
    evidenceScope: 'Real-renderer world-cache integration through transition API; not a user-input journey or performance measurement', worlds, errors }, null, 2));
} catch (error) {
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ ok: false, buildId: manifest.buildId, worlds, errors, failure: String(error.stack || error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
