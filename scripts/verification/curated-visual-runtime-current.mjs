import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4565, 4566, 4567] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/curated-visual-runtime-current';
const mobile = process.env.WE3D_VERIFY_MOBILE === '1';
const profile = mobile ? 'mobile' : 'desktop';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext(mobile ? {
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 }
} : { viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const localFailures = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ status: response.status(), url: response.url() });
});

let diagnostics = null;
let beforeMove = null;
let aircraftEvidence = null;
const aircraftProfiles = [];
try {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.2898', lon: '-76.6102', lname: 'Baltimore',
    launch: 'earth', gm: 'free', mode: 'walking', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  try {
    await page.waitForFunction(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
      return state?.gameStarted && !state?.worldLoading && state?.urbanSandbox?.active && state?.livingWorld?.active;
    }, null, { timeout: 240_000 });
    await page.waitForFunction(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
      return state?.modelAssets?.playerAssetId === 'character-field-navigator';
    }, null, { timeout: 30_000 });
    beforeMove = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || null);
    await page.screenshot({ path: `${outputDir}/earth-character-ready-${profile}.png`, fullPage: true });
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1800);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(2200);
  } finally {
    diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || null);
    await page.screenshot({ path: `${outputDir}/earth-player-npc-vehicles-${profile}.png`, fullPage: true });
  }

  await page.locator('#travelBtn').click();
  await page.locator('#fPlane').click();
  const planeStarted = await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.plane === true, null, { timeout: 15_000 }).then(() => true);
  if (planeStarted === true) {
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.plane === true);
    await page.waitForTimeout(500);
    aircraftEvidence = await page.evaluate(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        actor: state.activeActor || null,
        performanceProfile: state.transportVisuals?.activeAircraft || null
      };
    });
    await page.screenshot({ path: `${outputDir}/personal-aircraft-${profile}.png`, fullPage: true });
    aircraftProfiles.push({ catalogId: 'personal-prop', ...aircraftEvidence.performanceProfile });
  }

  const vehicles = diagnostics?.urbanSandbox?.vehicles || [];
  const npcs = diagnostics?.urbanSandbox?.interactiveNpcs || [];
  const movedMeters = Math.hypot(
    Number(diagnostics?.activeActor?.position?.x || 0) - Number(beforeMove?.activeActor?.position?.x || 0),
    Number(diagnostics?.activeActor?.position?.z || 0) - Number(beforeMove?.activeActor?.position?.z || 0)
  );
  const checks = Object.freeze({
    worldReachedPlayableState: diagnostics?.gameStarted === true && diagnostics?.worldLoading === false,
    oneSharedModelLoaderServedPlayer: diagnostics?.modelAssets?.playerAssetId === 'character-field-navigator' && Number(diagnostics?.modelAssets?.loads || 0) >= 1,
    boundedModelInstances: Number(diagnostics?.modelAssets?.activeInstances || 0) <= 2,
    currentWalkingInputMovesPlayer: movedMeters > 0.25,
    personalAircraftUsesQualityContract: aircraftEvidence?.performanceProfile?.visualAuthority === 'aircraft-visual-recipe' &&
      aircraftEvidence?.performanceProfile?.qualityTier === (mobile ? 'mobile' : 'promoted') &&
      Number(aircraftEvidence?.performanceProfile?.meshCount || 0) >= 30,
    activeAircraftUsesOneVisualAuthority: aircraftProfiles.length === 1 && aircraftProfiles.every((entry) =>
      entry.visualAuthority === 'aircraft-visual-recipe' && Number(entry.meshCount || 0) >= 30),
    roadVehiclesUseQualityContract: vehicles.length === 0 || vehicles.every((entry) => entry.visualQuality?.visualAuthority === 'road-vehicle-visual-recipe'),
    promotedNpcsUseQualityContract: npcs.length === 0 || npcs.every((entry) => entry.visualQuality?.qualityTier === 'promoted-procedural'),
    noRuntimeErrors: (diagnostics?.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const report = { ok: Object.values(checks).every(Boolean), profile, checks, movedMeters, modelAssets: diagnostics?.modelAssets || null, aircraftEvidence, aircraftProfiles, vehicleCount: vehicles.length, npcCount: npcs.length, pageErrors, localFailures };
  await fs.writeFile(`${outputDir}/report-${profile}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Curated visual runtime journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
