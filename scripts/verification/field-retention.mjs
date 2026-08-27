import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4421, 4422, 4423] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
});

try {
  await mkdir('output/release-evidence/current', { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('world-explorer-discovery');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('world-explorer-discovery', 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('profiles')) database.createObjectStore('profiles', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('items')) database.createObjectStore('items', { keyPath: 'instanceId' });
        if (!database.objectStoreNames.contains('claims')) database.createObjectStore('claims', { keyPath: 'claimId' });
        if (!database.objectStoreNames.contains('fieldGuide')) database.createObjectStore('fieldGuide', { keyPath: 'catalogId' });
        if (!database.objectStoreNames.contains('companions')) database.createObjectStore('companions', { keyPath: 'instanceId' });
        if (!database.objectStoreNames.contains('events')) database.createObjectStore('events', { keyPath: 'eventId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = Date.now();
    const regionId = 'world-identity:v1:earth:392904000:-766122000:custom:fixed-earth-living-world-v1';
    const records = [
      ['retention-raccoon', 'taxon-5218786', 'Raccoon', 'mammal', 'community-survey', 'community'],
      ['retention-mallard', 'taxon-9761484', 'Mallard', 'bird', 'photograph', 'photography'],
      ['retention-monarch', 'taxon-5133088', 'Monarch', 'insect-arachnid', 'insect-macro', 'insect-macro']
    ];
    const transaction = db.transaction(['profiles', 'claims', 'fieldGuide', 'events'], 'readwrite');
    const events = transaction.objectStore('events');
    const claims = transaction.objectStore('claims');
    const guide = transaction.objectStore('fieldGuide');
    for (let index = 0; index < records.length; index += 1) {
      const [claimId, catalogId, name, group, activityId, evidenceContractId] = records[index];
      const occurredAt = now - (records.length - index) * 1_000;
      const event = {
        type: 'ExplorerEvent', schemaVersion: 1, eventId: `event:${claimId}`, eventType: 'discovery-recorded',
        claimId, occurredAt, activityId, toolId: '', catalogId, name, family: `${group}-taxon`, specialtyId: 'nature',
        resolution: 'recorded', evidenceClass: 'virtual-field-record', evidenceContractId,
        evidencePayload: { contractId: evidenceContractId, livePresenceClaim: false },
        regionalPackId: 'us-md-baltimore-chesapeake-pilot', regionalPackVersion: '2026.08.24-a3.2',
        stableTaxonId: `gbif-backbone-2023:${catalogId.replace('taxon-', '')}`, taxonGroup: group,
        regionId, regionLabel: 'Baltimore', locationKey: '', worldIdentity: regionId, environment: 'EARTH',
        localPosition: { x: null, y: null, z: null }, projections: { journal: true, fieldGuide: true, collection: false },
        progress: { points: 3, reason: 'new-identification' }
      };
      events.put(event);
      claims.put({ claimId, claimedAt: occurredAt, item: null, event });
      guide.put({
        catalogId, name, family: `${group}-taxon`, firstObservedAt: occurredAt, lastObservedAt: occurredAt,
        observations: 1, evidenceClass: 'virtual-field-record', evidenceContractIds: [evidenceContractId],
        regionalPackId: 'us-md-baltimore-chesapeake-pilot', regionalPackVersion: '2026.08.24-a3.2',
        stableTaxonId: `gbif-backbone-2023:${catalogId.replace('taxon-', '')}`, taxonGroup: group,
        livePresenceClaim: false, sourceRefs: [], regions: [regionId], regionLabels: ['Baltimore']
      });
    }
    transaction.objectStore('profiles').put({
      id: 'local-explorer', schemaVersion: 2, createdAt: now - 10_000, updatedAt: now,
      equippedToolId: 'field-lens', favoriteToolIds: ['field-lens', 'field-camera', 'metal-detector'],
      activeCompanionId: null, tutorials: {}, disciplineProgress: { nature: { discoveries: 3, regions: [regionId] } },
      toolMastery: {}, collectionCount: 0, fieldGuideCount: 3,
      explorerProgress: {
        schemaVersion: 1, points: 9, totalRecords: 3, uniqueDiscoveries: 3, regions: [regionId],
        specialties: {
          nature: { points: 9, records: 3, uniqueDiscoveries: 3 },
          earth: { points: 0, records: 0, uniqueDiscoveries: 0 },
          places: { points: 0, records: 0, uniqueDiscoveries: 0 }
        }, milestones: []
      }
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false && state.worldDiscovery?.active === true;
  }, null, { timeout: 240_000 });
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open');
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show');
  const sectionTutorial = page.locator('#discoverySectionTutorial:not([hidden])');
  if (await sectionTutorial.isVisible()) await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.waitForFunction(() => /NO STREAK LOSS/.test(document.getElementById('discoveryRetentionDashboard')?.textContent || ''));

  const today = await page.locator('#discoveryRetentionDashboard').textContent();
  assert.match(today || '', /Field Today/i);
  assert.match(today || '', /Weekly Expedition/i);
  assert.match(today || '', /Regional Survey/i);
  assert.match(today || '', /NO STREAK LOSS/);
  assert.match(today || '', /3\/3/);
  assert.doesNotMatch(today || '', /procedural encounter/i);
  await page.locator('#discoveryRetentionDashboard').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/release-evidence/current/baltimore-field-rhythm-mobile.png', fullPage: true });

  await page.locator('[data-discovery-tab="guide"]').click();
  if (await sectionTutorial.isVisible()) await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.waitForFunction(() => /REGIONAL LIFE LIST/.test(document.getElementById('discoveryLifeList')?.textContent || ''));
  const guide = await page.locator('#discoveryLifeList').textContent();
  assert.match(guide || '', /3\/60/);
  assert.match(guide || '', /Mammals/);
  assert.match(guide || '', /Birds/);
  assert.match(guide || '', /Insects & Arachnids/);
  assert.match(guide || '', /EVIDENCE SPECIALTIES/);
  assert.match(guide || '', /60 reference fallbacks/);
  assert.match(guide || '', /not a live-presence count/i);
  await page.locator('#discoveryLifeList').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/release-evidence/current/baltimore-life-list-mobile.png', fullPage: true });

  const report = {
    ok: browserErrors.length === 0 && localFailures.length === 0,
    contract: 'field-retention-v1',
    servedRoot,
    checks: {
      fieldToday: /Field Today/i.test(today || ''),
      weeklyExpedition: /Weekly Expedition/i.test(today || ''),
      seasonalSurvey: /Regional Survey/i.test(today || ''),
      noStreakLoss: /NO STREAK LOSS/.test(today || ''),
      lifeList: /3\/60/.test(guide || ''),
      evidenceSpecialties: /EVIDENCE SPECIALTIES/.test(guide || ''),
      creatureQualityFallback: /60 reference fallbacks/.test(guide || ''),
      honestPresenceLanguage: /not a live-presence count/i.test(guide || ''),
      noInternalEncounterCopy: !/procedural encounter/i.test(`${today} ${guide}`)
    },
    browserErrors,
    localFailures
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
