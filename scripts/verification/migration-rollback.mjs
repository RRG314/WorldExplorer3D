// Disposable same-origin browser storage, served by two real immutable builds.
// Owner APIs perform writes; this is save/protocol compatibility, not player UX.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { artifactIdentity, sameArtifactIdentity } from './artifact-identity.mjs';
import { sourceFingerprint, sameAcceptanceSource } from './source-fingerprint.mjs';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { closeOwnedBrowser } from './owned-browser.mjs';
import { assertReviewedRollbackRuntime } from './rollback-runtime-contract.mjs';

const root = process.cwd(), candidateRoot = process.env.WE3D_VERIFY_ROOT || 'dist';
const fallbackRoot = process.argv.find(arg => arg.startsWith('--fallback='))?.slice(11);
assert.ok(fallbackRoot?.startsWith('output/') && !fallbackRoot.split('/').includes('..'), 'Pass --fallback=output/path/to/preserved/artifact');
assert.ok((await realpath(path.resolve(root, fallbackRoot))).startsWith((await realpath(path.join(root, 'output'))) + path.sep));
const output = 'output/release-evidence/current/migration-rollback';
await mkdir(output, { recursive: true });
const baseline = sourceFingerprint(root), candidate = artifactIdentity(root, candidateRoot), fallback = artifactIdentity(root, fallbackRoot);
assert.equal(baseline.dirty, false, 'Commit inputs before immutable verification');
assert.equal(sameArtifactIdentity(candidate, fallback), false, 'Fallback must be a distinct build');
const manifests = await Promise.all([candidateRoot, fallbackRoot].map(dir => readFile(path.join(dir, 'build-manifest.json'), 'utf8').then(JSON.parse)));
assert.equal(manifests[0].sourceInputFingerprint, baseline.acceptanceFingerprint, 'Candidate must match current accepted inputs');
assert.equal(manifests[0].firebaseProjectId, manifests[1].firebaseProjectId);
assert.equal(manifests[0].firebaseProjectId, 'we3d-staging-20260712', 'This test cannot target production');

// Pin every changed runtime file to the reviewed before/after bytes. A later
// edit to even an already-listed path requires another compatibility review.
const compatibility = JSON.parse(await readFile(path.join(root, 'scripts/verification/rollback-runtime-review.json'), 'utf8'));
const changed = await assertReviewedRollbackRuntime(root, manifests[1].commit, manifests[0].commit, compatibility);
const report = { passed: false, scope: 'Packaged IndexedDB v4→v5 upgrade, fallback owner reads/writes, candidate return, Backpack controls and unchanged pending account data; identical remaining client/backend protocol bytes. SDK authority tests remain separate.',
  baseline, artifactIdentity: candidate, fallbackArtifactIdentity: fallback, fallbackArtifactRoot: fallbackRoot,
  compatibilityContract: compatibility.id,
  runtimeDifferences: changed, stages: [], errors: [], localFailures: [], providerDegradations: [] };
let server, browserServer, browser, page, stage = 'seed';
try {
  server = await startStaticServer({ rootDir: candidateRoot, ports: [4497] });
  const base = `http://127.0.0.1:${server.port}`;
  browserServer = await chromium.launchServer({ channel: 'chrome', headless: true });
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ stage, message: error.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300) }));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== base || response.status() < 400) return;
    const record = { stage, path: url.pathname, status: response.status() };
    if (record.status === 503 && ['/api/geospatial/reverse', '/api/geospatial/search'].includes(record.path)) report.providerDegradations.push(record);
    else report.localFailures.push(record);
  });
  await configureStagingAppCheck(page, base);
  await page.route('**/save-compatibility-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Disposable save fixture</title>' }));
  await page.goto(`${base}/save-compatibility-fixture`);
  const seed = await page.evaluate(async () => {
    const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); });
    if ((await indexedDB.databases()).length) throw Error('Fixture requires a fresh disposable browser context');
    const opening = indexedDB.open('world-explorer-discovery', 4);
    opening.onupgradeneeded = () => {
      for (const [name, key] of [['profiles', 'id'], ['items', 'instanceId'], ['claims', 'claimId'], ['fieldGuide', 'catalogId'], ['companions', 'instanceId'], ['events', 'eventId'], ['migrationBackups', 'id'], ['receiptOutbox', 'id']]) opening.result.createObjectStore(name, { keyPath: key });
      for (const [store, key] of [['items', 'catalogId'], ['items', 'collectedAt'], ['events', 'occurredAt'], ['events', 'regionId'], ['events', 'eventType'], ['receiptOutbox', 'ownerUid']]) opening.transaction.objectStore(store).createIndex(key, key);
    };
    const db = await request(opening), tx = db.transaction(['profiles', 'items', 'claims', 'events', 'receiptOutbox'], 'readwrite'), saved = done(tx);
    tx.objectStore('profiles').put({ id: 'local-explorer', schemaVersion: 4, tutorials: {}, retainedUnknownProfileField: 'preserve-me' });
    const items = [], events = [];
    for (let i = 0; i < 64; i++) {
      const item = { instanceId: `legacy:item:${i}`, claimId: `legacy:claim:${i}`, catalogId: `legacy:catalog:${i}`, name: `Existing specimen ${i}`, collectedAt: 1000 + i, unknown: { preserved: true, index: i } };
      const event = { eventId: `legacy:event:${i}`, eventType: 'discovery-recorded', occurredAt: 1000 + i, name: `Existing record ${i}`, unknown: item.unknown };
      tx.objectStore('items').put(item); tx.objectStore('claims').put({ claimId: item.claimId, item }); tx.objectStore('events').put(event);
      items.push(item); events.push(event);
    }
    const pendingReceipt = { id: 'pending:legacy', ownerUid: 'disposable-unrelated-account', instanceId: items[0].instanceId, status: 'pending', nextAttemptAt: 0, attempts: 2, payload: { claimId: items[0].claimId, catalogId: items[0].catalogId } };
    tx.objectStore('receiptOutbox').put(pendingReceipt);
    await saved; db.close();
    localStorage.setItem('world-explorer:character-backpack:v1', JSON.stringify({ schemaVersion: 1, revision: 7,
      items: [{ instanceId: 'starter:hands', catalogId: 'hands' }], hotbar: ['starter:hands'], equippedInstanceId: 'starter:hands', ammo: { 'pulse-sidearm': { magazine: 4, reserve: 12 } } }));
    const pendingCondition = JSON.stringify({ uid: 'disposable-unrelated-account', pending: { condition: .42, reason: 'offline-existing-intent' } });
    localStorage.setItem('world-explorer:condition-outbox:v1:disposable-unrelated-account', pendingCondition);
    return { items, events, pendingReceipt, pendingCondition };
  });
  for (const [label, dir, manifest, expectedMagazine, writeMagazine] of [
    ['candidate-upgrade', candidateRoot, manifests[0], 4, 3],
    ['fallback-write', fallbackRoot, manifests[1], 3, 2],
    ['candidate-return', candidateRoot, manifests[0], 2, 1]
  ]) {
    stage = label;
    await page.goto('about:blank'); await server.close();
    server = await startStaticServer({ rootDir: dir, ports: [4497] });
    await page.goto(`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__, null, { timeout: 120000 });
    if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
    // Runtime module readiness precedes the async title/globe presentation.
    // Every stage deliberately starts from the title; an instantaneous
    // isVisible check can skip Start entirely on a warm artifact replacement.
    await page.locator('#globeSelectorStartBtn').waitFor({state: 'visible', timeout: 60000});
    await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(() => { const d = globalThis.getWorldExplorerRuntimeDiagnostics?.(); return d?.gameStarted && !d.worldLoading && d.worldDiscovery?.active; }, null, { timeout: 180000 });
    assert.equal(await page.evaluate(() => fetch('/build-manifest.json', { cache: 'no-store' }).then(r => r.json()).then(m => m.buildId)), manifest.buildId);
    const result = await page.evaluate(async ({ seed, label, expectedMagazine, writeMagazine, previous }) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const check = (value, message) => { if (!value) throw Error(message); };
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const store = ctx.discoveryProfileStore, backpack = ctx.playerBackpackStore;
      check(store?.type === 'IndexedDbDiscoveryProfileStore' && backpack, 'Packaged save owners unavailable');
      const before = await store.exportData();
      check(before.schemaVersion === 5, 'Upgraded Journal must use v5');
      check(before.profile.retainedUnknownProfileField === 'preserve-me', 'Unknown profile field lost');
      for (const item of seed.items) check(same(before.items.find(row => row.instanceId === item.instanceId), item), 'Existing item changed');
      for (const event of seed.events) check(same(before.events.find(row => row.eventId === event.eventId), event), 'Existing event changed');
      for (const event of previous) check(same(before.events.find(row => row.eventId === event.eventId), event), 'Newer-build write changed across fallback');
      check((await store.listPendingReceipts('disposable-unrelated-account')).some(row => same(row, seed.pendingReceipt)), 'Another account pending receipt changed');
      check(localStorage.getItem('world-explorer:condition-outbox:v1:disposable-unrelated-account') === seed.pendingCondition, 'Another account offline intent changed');
      check(backpack.load().ammo['pulse-sidearm'].magazine === expectedMagazine, 'Backpack controls lost across artifact switch');
      check(!!localStorage.getItem('world-explorer:character-backpack:migration-backup:v1'), 'Legacy Backpack backup lost');
      const record = { eventId: `compat:${label}`, eventType: 'location-visit', sourceId: 'compatibility-test', name: `Save compatibility: ${label}`, occurredAt: Date.now(), points: 1, metadata: { retained: label } };
      const saved = await store.recordExplorerEvent(record);
      check(saved.recorded === true, 'New Journal write did not commit');
      check((await store.recordExplorerEvent(record)).recorded === false, 'Duplicate Journal write was credited twice');
      // Exercise the live equipment owner and its persistence subscription.
      // Writing storage behind that owner's back is not a gameplay mutation.
      const equipment = ctx.urbanSandboxRuntime?.equipment;
      check(equipment, 'Packaged equipment owner unavailable');
      equipment.equip('pulse-sidearm');
      check(equipment.equipped()?.id === 'pulse-sidearm', 'Sidearm selection failed');
      check(equipment.prepareUse(Date.now()).ok, 'Equipment consumption failed');
      equipment.equip('hands');
      check(equipment.exportControls().ammo['pulse-sidearm'].magazine === writeMagazine, 'Equipment owner consumption differs');
      check(backpack.load().ammo['pulse-sidearm'].magazine === writeMagazine, 'Backpack control write did not persist');
      ctx.setTimeOfDay?.('day'); ctx.openWorldDiscoverySection?.('journal');
      return { label, schemaVersion: before.schemaVersion, retainedItems: seed.items.length, retainedEvents: seed.events.length + previous.length, event: saved.event, magazine: writeMagazine };
    }, { seed, label, expectedMagazine, writeMagazine, previous: report.stages.map(row => row.event) });
    await page.locator('#discoveryJournalList').getByText(`Save compatibility: ${label}`, { exact: false }).first().waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${output}/${label}.png` });
    report.stages.push(result); console.log(`[migration-rollback] PASS ${label}`);
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.localFailures, []);
  assert.ok(sameAcceptanceSource(baseline, sourceFingerprint(root)), 'Inputs changed during verification');
  assert.ok(sameArtifactIdentity(candidate, artifactIdentity(root, candidateRoot)));
  assert.ok(sameArtifactIdentity(fallback, artifactIdentity(root, fallbackRoot)));
  report.passed = true;
} catch (error) {
  report.error = error.stack;
  if (page && !page.isClosed()) {
    report.failureState = await page.evaluate(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {runtimeReady: globalThis.__WE3D_RUNTIME_READY__, gameStarted: state.gameStarted,
        worldLoading: state.worldLoading, titleVisible: state.titleVisible,
        worldLoad: state.worldLoad, discoveryActive: state.worldDiscovery?.active,
        loadingText: document.getElementById('loading')?.textContent?.trim().slice(0, 500)};
    }).catch(() => null);
    await page.screenshot({path: `${output}/${stage}-failed.png`}).catch(() => {});
  }
  throw error;
}
finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  try { await page?.close().catch(() => {}); await browser?.close().catch(() => {}); if (browserServer) await closeOwnedBrowser(browserServer); }
  finally { await server?.close(); }
}
const evidenceFiles = [];
for (const file of ['report.json', ...report.stages.map(row => `${row.label}.png`)]) {
  const relative = `${output}/${file}`;
  evidenceFiles.push({ path: relative, sha256: createHash('sha256').update(await readFile(relative)).digest('hex') });
}
await mkdir('output/release-evidence/current/acceptance', { recursive: true });
await writeFile('output/release-evidence/current/acceptance/migration-rollback.json', JSON.stringify({
  contract: 'world-explorer-acceptance-class-v1', evidenceClass: 'migration-rollback', result: 'passed',
  artifactIdentity: candidate, acceptanceFingerprint: baseline.acceptanceFingerprint,
  fallbackArtifactIdentity: fallback, fallbackArtifactRoot: fallbackRoot, compatibilityContract: report.compatibilityContract,
  reviewer: 'Codex automated packaged save-owner verification', observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  checks: { existingSaveUpgrade: true, compatibleFallbackReadsUpgradedSave: true, fallbackWriteAndReturn: true, backendCompatibility: true, artifactRetained: true }, evidenceFiles
}, null, 2));
