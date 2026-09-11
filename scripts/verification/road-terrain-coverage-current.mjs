import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const journeys = Object.freeze([
  Object.freeze({ id: 'baltimore', name: 'East Lafayette Avenue, Baltimore', lat: 39.3098, lon: -76.6147, profile: 'dense-rolling' }),
  Object.freeze({ id: 'san-francisco', name: 'San Francisco, California', lat: 37.7749, lon: -122.4194, profile: 'dense-steep' }),
  Object.freeze({ id: 'iowa', name: 'Boone County, Iowa', lat: 42.080024688, lon: -93.870219182, profile: 'sparse-flat' })
]);
const requestedJourney = String(process.env.WE3D_ROAD_TERRAIN_JOURNEY || '').trim();
const selectedJourneys = requestedJourney
  ? journeys.filter((journey) => journey.id === requestedJourney)
  : journeys;
assert.ok(selectedJourneys.length > 0, `Unknown road-terrain journey: ${requestedJourney}`);

const root = process.cwd();
const server = await startStaticServer({ rootDir: root, ports: [4526, 4527, 4528] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const outputDir = path.join(root, 'output', 'verification', 'road-terrain-coverage-current');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const results = [];

try {
  for (const journey of selectedJourneys) {
    const page = await context.newPage();
    const pageErrors = [];
    const localFailures = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
    page.on('response', (response) => {
      if (response.url().startsWith(baseUrl) && response.status() >= 400) {
        localFailures.push({ status: response.status(), url: response.url() });
      }
    });
    page.on('requestfailed', (request) => {
      if (request.url().startsWith(baseUrl)) {
        localFailures.push({
          status: 0,
          url: request.url(),
          reason: request.failure()?.errorText || 'failed'
        });
      }
    });

    const params = new URLSearchParams({
      loc: 'custom',
      lat: String(journey.lat),
      lon: String(journey.lon),
      lname: journey.name,
      launch: 'earth',
      gm: 'free',
      mode: 'driving',
      diagnostics: '1'
    });
    await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.waitForFunction(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const conformance = diagnostics.transportStructures?.roadTerrainConformance;
      return diagnostics.gameStarted === true && diagnostics.worldLoading === false &&
        Number(diagnostics.worldCounts?.roads || 0) > 0 &&
        diagnostics.farTerrainClipmap?.status === 'ready' &&
        Number(conformance?.totalSamples || 0) > 0;
    }, null, { timeout: 420_000 });

    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1800);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(700);

    const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
    const conformance = diagnostics.transportStructures?.roadTerrainConformance || null;
    const selection = diagnostics.worldLoad?.regionalTransportSelection || null;
    const roadSurfaceIntegrity = diagnostics.transportStructures?.roadSurfaceIntegrity || null;
    const checks = Object.freeze({
      worldReady: diagnostics.gameStarted === true && diagnostics.worldLoading === false,
      mappedRoadsPublished: Number(diagnostics.worldCounts?.roads || 0) > 0,
      roadMeshesPublished: Number(diagnostics.worldCounts?.roadMeshes || 0) > 0,
      outerTerrainReady: diagnostics.farTerrainClipmap?.status === 'ready',
      atGradeAuditRan: Number(conformance?.totalSamples || 0) > 0,
      noAtGradeRoadBelowTerrain: Number(conformance?.issuesFound ?? -1) === 0,
      roadGeometryValid: Number(roadSurfaceIntegrity?.foldedTriangles || 0) === 0 &&
        Number(roadSurfaceIntegrity?.degenerateTriangles || 0) === 0,
      selectionWithinGlobalBudget: Number(selection?.uniqueSelected || 0) <= 20_000,
      substantialRegionalCoverage: Number(selection?.available || 0) === 0 ||
        Number(selection?.uniqueSelected || 0) >= Math.min(20_000, Number(selection?.available || 0)) * 0.9,
      noRuntimeErrors: (diagnostics.runtimeErrors || []).length === 0,
      noPageErrors: pageErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    });
    const screenshotPath = path.join(outputDir, `${journey.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const result = {
      ok: Object.values(checks).every(Boolean),
      journey,
      checks,
      conformance,
      selection,
      roadSurfaceIntegrity,
      atGradeTerrainAuthority: diagnostics.transportStructures?.atGradeTerrainAuthority || null,
      farTerrainClipmap: diagnostics.farTerrainClipmap || null,
      worldCounts: diagnostics.worldCounts || null,
      activeActor: diagnostics.activeActor || null,
      runtimeErrors: diagnostics.runtimeErrors || [],
      pageErrors,
      localFailures,
      screenshotPath
    };
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
    await page.close();
  }

  const report = {
    ok: results.every((result) => result.ok),
    generatedAt: new Date().toISOString(),
    journeys: results
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'One or more road-terrain coverage journeys failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
