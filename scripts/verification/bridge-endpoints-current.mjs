import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';

const root = process.cwd();
const server = await startStaticServer({ rootDir: process.env.WE3D_VERIFY_ROOT || root, ports: [4521, 4522, 4523] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const outputDir = path.resolve(process.env.WE3D_VERIFY_OUTPUT_DIR || path.join(root, 'output', 'verification', 'bridge-endpoints-current'));
const reportPath = path.join(outputDir, 'report.json');
const screenshotPath = path.join(outputDir, 'baltimore-jfx-after.png');
const owned = await chromium.launchServer({ headless: false, channel: 'chrome' });
const browser = await chromium.connect(owned.wsEndpoint());
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
await configureStagingAppCheck(page,baseUrl);
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
    localFailures.push({
      kind: 'request',
      reason: request.failure()?.errorText || 'failed',
      url: request.url()
    });
  }
});

// This is the product's normal worldwide fallback path, which is the path in
// the player report. Exact OSM transport remains covered by the separate JFX
// surface verifier.
await page.route(/https:\/\/[^/]*overpass[^/]*\/.*interpreter/i, (route) =>
  route.abort('failed'));

try {
  await fs.mkdir(outputDir, { recursive: true });
  const params = new URLSearchParams({
    loc: 'custom',
    lat: '39.3091',
    lon: '-76.6205',
    lname: 'Baltimore Bridge',
    launch: 'earth',
    gm: 'free',
    mode: 'walking'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  console.log('[bridge-endpoints] document loaded');
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, {
    timeout: 120_000
  });
  console.log('[bridge-endpoints] runtime ready');
  await page.evaluate(async()=>{globalThis.bridgeCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
  const consent = page.locator('#analyticsConsentDenyBtn');
  if (await consent.isVisible()) await consent.click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  console.log('[bridge-endpoints] Explore selected');
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true &&
      !bridgeCtx.worldLoading && bridgeCtx.worldLoadRuntimeState?.status === 'ready' &&
      Number(diagnostics.worldCounts?.roads || 0) > 0 &&
      Number(diagnostics.transportStructures?.publishedBodies || 0) > 0 &&
      diagnostics.transportStructures?.generalizedEndpointIntegrity?.authority ===
        'compiled-generalized-structure-endpoints';
  }, null, { timeout: 240_000 });
  console.log('[bridge-endpoints] compiled bridge authority published');
  await page.waitForTimeout(3000);

  const snapshot = await page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return {
      environment: diagnostics.environment || null,
      activeActor: diagnostics.activeActor || null,
      surfaceChain: diagnostics.surfaceChain || null,
      provider: diagnostics.worldLoad?.transportProviderDecision || null,
      transportNetwork: diagnostics.transportStructures?.transportNetwork || null,
      endpointIntegrity: diagnostics.transportStructures?.generalizedEndpointIntegrity || null,
      continuity: diagnostics.transportStructures?.junctionContinuity || null,
      runtimeErrors: diagnostics.runtimeErrors || [],
      worldCounts: diagnostics.worldCounts || {}
    };
  });
  const checks = {
    earthWalkingGameplay:
      snapshot.environment === 'EARTH' && snapshot.activeActor?.mode === 'walk',
    worldwideFallbackSelected:
      snapshot.provider?.selected === 'shortbread-vector' &&
      snapshot.provider?.exactTransportLoaded === false,
    generalizedConnectionsExpanded:
      Number(snapshot.transportNetwork?.generalizedExpandedEndpointConnections || 0) > 0,
    noUnsupportedElevatedEndpoints:
      snapshot.endpointIntegrity?.authority === 'compiled-generalized-structure-endpoints' &&
      Number(snapshot.endpointIntegrity?.unsupportedOpenBoundaryCount || 0) === 0,
    allStructureJoinsSampled:
      Number(snapshot.continuity?.auditedConnectionCount || 0) > 0 &&
      snapshot.continuity?.sampledConnectionCount === snapshot.continuity?.auditedConnectionCount,
    noVerticalSteps:
      snapshot.continuity?.discontinuityCount === 0,
    playerOwnsCompiledRoadSurface:
      snapshot.surfaceChain?.surfaces?.walk?.kind === 'road' &&
      snapshot.surfaceChain?.surfaces?.walk?.feature?.structureAssembly?.authority ===
        'compiled_transport_structure_assembly',
    noRuntimeErrors: browserErrors.length === 0 && snapshot.runtimeErrors.length === 0,
    noBrokenLocalAssets: localFailures.length === 0
  };

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const report = {
    generatedAt: new Date().toISOString(),
    target: { lat: 39.3091, lon: -76.6205, name: 'Baltimore Bridge' },
    snapshot,
    checks,
    browserErrors,
    localFailures,
    screenshot: path.relative(root, screenshotPath)
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.deepEqual(Object.entries(checks).filter(([, passed]) => passed !== true), [],
    `Bridge endpoint verification failed; see ${path.relative(root, reportPath)}`);
  console.log(JSON.stringify({ report: path.relative(root, reportPath), checks }, null, 2));
} finally {
  await context.close();
  await closeOwnedBrowser(owned);
  await server.close();
}
