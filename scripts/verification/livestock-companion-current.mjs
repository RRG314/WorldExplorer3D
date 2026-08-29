import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'verification', 'livestock-companion-current');
const server = await startStaticServer({ rootDir: root, ports: [4511, 4512, 4513] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
const consoleErrors = [];
const consoleWarnings = [];
const livestockIds = ['pasture-cow', 'wool-sheep', 'hill-goat', 'yard-chicken', 'heritage-pig', 'field-horse'];
const livestockNames = ['Clover', 'Moss', 'Juniper', 'Pip', 'Truffle', 'Willow'];

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
  if (message.type() === 'warning') consoleWarnings.push(message.text());
});
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ status: response.status(), url: response.url() });
});
page.on('requestfailed', (request) => {
  const reason = request.failure()?.errorText || 'failed';
  if (request.url().startsWith(baseUrl) && reason !== 'net::ERR_ABORTED') localFailures.push({ reason, url: request.url() });
});

async function launch() {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.2904', lon: '-76.6122', lname: 'Baltimore Inner Harbor',
    launch: 'earth', gm: 'free', mode: 'walk', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return runtime.gameStarted === true && runtime.worldLoading === false && !!globalThis.__WE3D_COMPANION_SUPPORT__;
    });
    if (ready) break;
    if (browserErrors.length || consoleErrors.some((message) => /SyntaxError|ReferenceError|TypeError|failed to fetch dynamically imported module/i.test(message))) {
      throw new Error(`Runtime load failed: ${JSON.stringify({ browserErrors, consoleErrors: consoleErrors.slice(-8) })}`);
    }
    await page.waitForTimeout(1000);
  }
  const loaded = await page.evaluate(() => {
    const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return { ready: runtime.gameStarted === true && runtime.worldLoading === false && !!globalThis.__WE3D_COMPANION_SUPPORT__, runtime };
  });
  if (!loaded.ready) throw new Error(`Runtime load timed out: ${JSON.stringify({
    gameStarted: loaded.runtime?.gameStarted,
    worldLoading: loaded.runtime?.worldLoading,
    worldDiscovery: loaded.runtime?.worldDiscovery,
    runtimeErrors: loaded.runtime?.runtimeErrors,
    browserErrors,
    consoleErrors: consoleErrors.slice(-12),
    consoleWarnings: consoleWarnings.filter((message) => /discover|companion|runtime|first play/i.test(message)).slice(-20),
    localFailures
  })}`);
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function openCompanions() {
  if (!await page.locator('#discoveryPanel.show').isVisible().catch(() => false)) {
    if (await page.locator('#discoveryQuickToolBtn').isVisible().catch(() => false)) await page.locator('#discoveryQuickToolBtn').click();
    else {
      await page.locator('#exploreBtn').click();
      await page.waitForSelector('#exploreMenu.open');
      await page.locator('#fWorldDiscovery').click();
    }
  }
  await page.waitForSelector('#discoveryPanel.show');
  await page.locator('#discoveryProfileBtn').click();
  await page.waitForSelector('.discoveryPane[data-discovery-pane="profile"].active');
}

await mkdir(outputDir, { recursive: true });
let report;
try {
  await launch();
  const farmPlan = await page.evaluate(async () => {
    const { createEnvironmentFixture } = await import('/app/js/discovery/environment-context.js?v=2');
    const { compileAmbientWildlifePlan } = await import('/app/js/discovery/wildlife-runtime.js?v=4');
    const plan = compileAmbientWildlifePlan(createEnvironmentFixture('farm'), { maxActors: 2 });
    return plan.actors.map((actor) => ({ speciesId: actor.speciesId, policy: actor.companionPolicy, evidence: actor.supportingEvidence }));
  });

  const profiles = [];
  for (let index = 0; index < livestockIds.length; index += 1) {
    const catalogId = livestockIds[index];
    await page.evaluate(async ({ catalogId, name, index }) => {
      await globalThis.__WE3D_COMPANION_SUPPORT__.adopt(catalogId, {
        name, discoveryId: `livestock-browser:${catalogId}:${index}`
      });
    }, { catalogId, name: livestockNames[index], index });
    await page.waitForFunction((catalogId) => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot().activeCatalogId === catalogId, catalogId);
    await page.waitForTimeout(250);
    profiles.push(await page.evaluate(() => {
      const snapshot = globalThis.__WE3D_COMPANION_SUPPORT__.snapshot();
      const active = snapshot.companions.find((entry) => entry.active);
      return { catalogId: snapshot.activeCatalogId, specialty: active.training.specialization, archetype: active.speciesArchetype, presentation: snapshot.presentation };
    }));
  }

  await openCompanions();
  const companionText = await page.locator('#discoveryCompanionList').innerText();
  livestockNames.forEach((name) => assert.match(companionText, new RegExp(name)));
  profiles.forEach((profile) => assert.match(companionText, new RegExp(profile.specialty)));
  await page.screenshot({ path: path.join(outputDir, 'desktop-livestock-collection.png'), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, 'mobile-livestock-collection.png'), fullPage: false });

  await page.locator('#discoveryCloseBtn').click();
  const vehicleId = await page.evaluate(() => globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.snapshot?.().vehicles?.find((vehicle) => !vehicle.occupied)?.id || '');
  assert.ok(vehicleId, 'No enterable vehicle was available for the livestock travel check.');
  await page.evaluate((id) => globalThis.__WE3D_URBAN_CRASH_SUPPORT__.enterVehicle(id), vehicleId);
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot().presentation.travelState === 'waiting');
  const vehicleTravel = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot().presentation);

  const checks = {
    farmContextGeneratesLivestock: farmPlan.length > 0 && farmPlan.every((actor) => livestockIds.includes(actor.speciesId) && actor.policy === 'trust-sequence-required' && actor.evidence.includes('habitat-plausible')),
    namedLivestockCompanion: /Clover/.test(companionText),
    allSixIndividualsVisible: livestockNames.every((name) => companionText.includes(name)),
    distinctSpecialties: new Set(profiles.map((profile) => profile.specialty)).size === 6,
    modelBudgets: profiles.every((profile) => profile.presentation.meshes <= 30 && profile.presentation.triangles <= 1800 && profile.presentation.materials <= 8),
    scaledModels: profiles.every((profile) => profile.presentation.renderedHeight > .2 && profile.presentation.renderedHeight < 3.2),
    livestockWaitsForVehicle: vehicleTravel.travelState === 'waiting' && vehicleTravel.visible === false,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'livestock-companion-current-v1',
    checks,
    evidence: { farmPlan, profiles, vehicleTravel },
    browserErrors,
    consoleErrors,
    consoleWarnings,
    localFailures
  };
  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Livestock companion journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
