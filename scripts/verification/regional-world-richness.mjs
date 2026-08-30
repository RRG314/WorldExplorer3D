import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4497, 4498, 4499] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const allJourneys = [
  { id: 'tokyo', lat: 35.6762, lon: 139.6503, packId: 'jp-kanto-urban-nature', width: 1365, height: 900 },
  { id: 'london', lat: 51.5074, lon: -0.1278, packId: 'eu-atlantic-urban-nature', width: 1365, height: 900 },
  { id: 'seattle', lat: 47.6062, lon: -122.3321, packId: 'us-wa-puget-sound', width: 1365, height: 900 },
  { id: 'los-angeles', lat: 34.0522, lon: -118.2437, packId: 'us-ca-urban-coast', width: 1365, height: 900 },
  { id: 'miami', lat: 25.7617, lon: -80.1918, packId: 'us-fl-south-florida-coast', width: 390, height: 844, mobile: true },
  { id: 'dubai', lat: 25.2048, lon: 55.2708, packId: 'ae-dubai-desert-gulf', width: 390, height: 844, mobile: true }
];
const journeyFilter = String(process.env.WE3D_VERIFY_JOURNEY || '').trim();
const journeys = journeyFilter ? allJourneys.filter((entry) => entry.id === journeyFilter) : allJourneys;
assert.ok(journeys.length > 0, `Unknown regional journey filter: ${journeyFilter}`);

async function waitForWorld(page) {
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false && state.worldDiscovery?.active === true;
  }, null, { timeout: 300_000 });
}

async function enterCoordinates(page, journey) {
  await page.locator('#globeCustomLat').fill(String(journey.lat));
  await page.locator('#globeCustomLon').fill(String(journey.lon));
  await page.locator('#globeCustomLon').press('Enter');
  await page.waitForFunction(({ lat, lon }) => {
    const value = document.getElementById('globeSelectorLatLon')?.textContent || '';
    return value.includes(Number(lat).toFixed(4)) && value.includes(Number(lon).toFixed(4));
  }, { lat: journey.lat, lon: journey.lon }, { timeout: 20_000 });
}

async function openRegionalGuide(page) {
  const analytics = page.locator('#analyticsConsentBanner');
  if (await analytics.isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator('#fWalk').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'walk', null, { timeout: 20_000 });
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show', { timeout: 20_000 });
  const workspaceTutorial = page.locator('#discoverySectionTutorial:not([hidden])');
  if (await workspaceTutorial.isVisible()) await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.locator('[data-discovery-tab="guide"]').click();
  await page.waitForSelector('[data-discovery-pane="guide"].active', { timeout: 10_000 });
  const guideTutorial = page.locator('#discoverySectionTutorial:not([hidden])');
  if (await guideTutorial.isVisible()) await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.waitForFunction(() => /REGIONAL LIFE LIST/.test(document.getElementById('discoveryLifeList')?.textContent || ''), null, { timeout: 20_000 });
  await page.locator('#discoveryLifeList').scrollIntoViewIfNeeded();
}

async function startRegionalFieldLead(page, journey) {
  await page.locator('[data-discovery-tab="today"]').click();
  await page.waitForSelector('[data-discovery-pane="today"].active', { timeout: 10_000 });
  const regionalActivityIds = [
    'nature-observe', 'photograph', 'community-survey', 'wildlife-track',
    'insect-macro', 'habitat-survey', 'sonar-survey'
  ];
  const availableActivityIds = await page.locator('[data-discovery-action]').evaluateAll((buttons) =>
    buttons.filter((button) => button.offsetParent !== null).map((button) => button.dataset.discoveryAction)
  );
  const regionalActivityId = regionalActivityIds.find((id) => availableActivityIds.includes(id));
  assert.ok(regionalActivityId, `No regional field activity was offered at ${journey.id}: ${availableActivityIds.join(', ')}`);
  const action = page.locator(`[data-discovery-action="${regionalActivityId}"]`);
  await action.click();
  const activityTutorial = page.locator('#discoveryTutorial:not([hidden])');
  if (await activityTutorial.isVisible()) await page.locator('#discoveryTutorialDoneBtn').click();
  await page.locator('#discoveryPrimaryBtn').click();
  await page.waitForFunction(() => {
    const interaction = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction;
    return interaction?.active === true && Boolean(interaction.targetCatalogId);
  }, null, { timeout: 20_000 });
  const result = await page.evaluate(async (packId) => {
    const { REGIONAL_ECOLOGY_PACKS } = await import('./js/discovery/ecology/regional-packs.js?v=1');
    const interaction = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction || {};
    const pack = REGIONAL_ECOLOGY_PACKS.find((entry) => entry.id === packId);
    return {
      activityId: interaction.activityId || null,
      targetCatalogId: interaction.targetCatalogId || null,
      evidenceClass: interaction.evidenceClass || null,
      phase: interaction.phase || null,
      targetBelongsToRegionalPack: pack?.taxa?.some((taxon) => taxon.id === interaction.targetCatalogId) === true
    };
  }, journey.packId);
  await page.screenshot({
    path: `output/release-evidence/current/regional-richness-${journey.id}-field-lead-desktop.png`,
    fullPage: true
  });
  return result;
}

async function inspectJourney(journey) {
  const pageErrors = [];
  const providerWarnings = [];
  const localFailures = [];
  const context = await browser.newContext({
    viewport: { width: journey.width, height: journey.height },
    hasTouch: journey.mobile === true,
    isMobile: journey.mobile === true
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') providerWarnings.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  try {
    await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
    await enterCoordinates(page, journey);
    await page.locator('#globeSelectorStartBtn').click();
    await waitForWorld(page);
    await openRegionalGuide(page);
    const snapshot = await page.evaluate(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const regional = diagnostics.worldDiscovery?.regionalEcology || {};
      const quality = diagnostics.worldDiscovery?.creatureQuality || {};
      const panel = document.getElementById('discoveryPanel')?.getBoundingClientRect();
      const lifeList = document.getElementById('discoveryLifeList')?.getBoundingClientRect();
      const lifeListText = (document.getElementById('discoveryLifeList')?.textContent || '').replace(/\s+/g, ' ').trim();
      const activePane = document.querySelector('[data-discovery-pane="guide"].active');
      const viewportContains = (box) => !!box && box.width > 0 && box.height > 0 &&
        box.left >= -1 && box.right <= innerWidth + 1 && box.top < innerHeight && box.bottom > 0;
      return {
        packId: regional.packId || null,
        packVersion: regional.packVersion || null,
        taxonCount: Number(regional.taxonCount || 0),
        truthClass: regional.truthClass || null,
        livePresenceClaim: regional.livePresenceClaim,
        creatureTaxonCount: Number(quality.taxonCount || 0),
        referenceFallbacks: Number(quality.tiers?.['reference-fallback'] || 0),
        promotionReadyCount: Number(quality.promotionReadyCount || 0),
        activeGuide: !!activePane,
        lifeListText,
        panelVisible: viewportContains(panel),
        lifeListVisible: viewportContains(lifeList),
        viewport: { width: innerWidth, height: innerHeight }
      };
    });
    const screenshotPath = `output/release-evidence/current/regional-richness-${journey.id}-${journey.mobile ? 'mobile' : 'desktop'}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const fieldLead = journey.id === 'tokyo' ? await startRegionalFieldLead(page, journey) : null;
    const checks = {
      correctRegionalPack: snapshot.packId === journey.packId,
      regionalTaxaLoaded: snapshot.taxonCount === 12,
      honestTruthBoundary: snapshot.truthClass === 'habitat-plausible' && snapshot.livePresenceClaim === false,
      creatureBudgetHonest: snapshot.creatureTaxonCount === 12 && snapshot.referenceFallbacks === 12 && snapshot.promotionReadyCount === 0,
      guideOpenedByNormalInput: snapshot.activeGuide === true,
      lifeListShowsRegionalTarget: /0\s*\/\s*12/.test(snapshot.lifeListText),
      lifeListExplainsTruth: /not a live-presence count/i.test(snapshot.lifeListText),
      panelFitsViewport: snapshot.panelVisible === true,
      lifeListVisible: snapshot.lifeListVisible === true,
      noBrowserErrors: pageErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0,
      regionalFieldLeadEnteredGameplay: fieldLead === null || (
        fieldLead.targetBelongsToRegionalPack === true &&
        fieldLead.evidenceClass === 'guided-field-lead' &&
        ['seeking', 'observing'].includes(fieldLead.phase)
      )
    };
    return {
      id: journey.id, mobile: journey.mobile === true, screenshotPath, snapshot, fieldLead, checks,
      pageErrors, providerWarnings, localFailures, ok: Object.values(checks).every(Boolean)
    };
  } finally {
    await context.close();
  }
}

try {
  await mkdir('output/release-evidence/current', { recursive: true });
  const results = [];
  for (const journey of journeys) {
    const result = await inspectJourney(journey);
    results.push(result);
    console.log(JSON.stringify({ id: result.id, ok: result.ok, packId: result.snapshot.packId, fieldLead: result.fieldLead, checks: result.checks }, null, 2));
  }
  const report = { contract: 'regional-world-richness-v1', ok: results.every((entry) => entry.ok), results };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'One or more regional world-richness journeys failed.');
} finally {
  await browser.close();
  await server?.close();
}
