import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { artifactIdentity, sameArtifactIdentity } from './artifact-identity.mjs';
import { sourceFingerprint, sameAcceptanceSource } from './source-fingerprint.mjs';
import { completeWorldReady } from './complete-world-readiness.mjs';
import { closeOwnedBrowser } from './owned-browser.mjs';

// Browser actions use visible UI. Operator access only provisions and removes
// two disposable staging identities; it never grants admission or edits saves.
const project = 'we3d-staging-20260712';
const base = new URL(process.argv[2]).origin;
assert.match(new URL(base).hostname, /^we3d-staging-20260712(?:--[a-z0-9-]+)?\.web\.app$/);
assert.equal(new URL(base).protocol, 'https:');
assert.ok(!process.env.WE3D_STAGING_APP_CHECK_FILE, 'Ordinary acceptance must not use debug attestation');
const diagnostic = process.argv.includes('--diagnostic');
const root = process.cwd(), candidateRoot = process.env.WE3D_VERIFY_ROOT;
assert.ok(candidateRoot, 'Select the immutable candidate with WE3D_VERIFY_ROOT');
const baseline = sourceFingerprint(root), artifact = artifactIdentity(root, candidateRoot);
const manifest = JSON.parse(await readFile(`${candidateRoot}/build-manifest.json`));
assert.ok(artifact);
if (!diagnostic) assert.equal(baseline.dirty, false);
assert.equal(manifest.firebaseProjectId, project);
if (!diagnostic) assert.equal(manifest.sourceInputFingerprint, baseline.acceptanceFingerprint);
const config = JSON.parse(await readFile('config/firebase.staging.json'));
const cli = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/firebase-tools/package.json');
const auth = cli('./lib/auth'), { requireAuth } = cli('./lib/requireAuth'), { Client } = cli('./lib/apiv2');
const operator = auth.getGlobalDefaultAccount();
await requireAuth({ project, user: operator?.user, tokens: operator?.tokens });
const db = new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true });
const adminAuth = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true });
const documentBase = `/v1/projects/${project}/databases/(default)/documents`;
const output = diagnostic ? 'output/production-readiness-20261012/ordinary-diagnostic' : 'output/release-evidence/current/ordinary-hosted';
await mkdir(output, { recursive: true });
const report = { passed: false, diagnostic, base, buildId: manifest.buildId, artifactIdentity: artifact,
  scope: 'Ordinary hosted Chrome, live providers, visible email sign-in, private room creation/join, shared vessel controls and personal save recovery. Two disposable staging accounts; no seeded rooms, saves, provider interception, debug attestation or runtime mutations.',
  checks: {}, errors: [], failedRequests: [], cleanupErrors: [] };
const users = [], rooms = new Set();
let owned, browser, stage = 'provision';
const redact = value => {
  let text = String(value);
  for (const user of users) for (const key of ['password', 'email']) text = text.replaceAll(user[key], '[disposable account]');
  return text.replace(/https?:\/\/[^\s"']+/g, '[URL]').slice(0, 1600);
};
async function attach(page) {
  page.on('pageerror', error => report.errors.push({ stage, message: redact(error.message) }));
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.status() >= 400 && (url.origin === base || /firebaseappcheck|identitytoolkit|firestore/.test(url.hostname))) {
      report.failedRequests.push({ stage, origin: url.origin, path: url.pathname, status: response.status() });
    }
  });
}
async function ready(page) {
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__, null, { timeout: 120000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(async () => { globalThis.marineCtx = (await import('/app/js/shared-context.js?v=55')).ctx; });
  assert.equal(await page.evaluate(() => globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN || false), false);
  assert.equal(await page.evaluate(() => fetch('/build-manifest.json').then(r => r.json()).then(b => b.buildId)), manifest.buildId);
}
async function open(user) {
  user.context = await browser.newContext({ viewport: { width: 1360, height: 850 } });
  const page = user.page = await user.context.newPage(); await attach(page);
  await page.goto(`${base}/app/?launch=earth&gm=free&loc=baltimore&mode=walking`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.locator('#appSignInBtn').click();
  await page.locator('#authEmailInput').fill(user.email);
  await page.locator('#authPasswordInput').fill(user.password);
  await page.locator('#authEmailSubmitBtn').click();
  await page.waitForFunction(() => document.getElementById('authSignedInBlock')?.hidden === false, null, { timeout: 45000 });
  await page.locator('#appSignInBtn').click();
  return page;
}
async function roomCode(page) {
  return page.evaluate(async () => {
    const build = await fetch('/build-manifest.json').then(r => r.json());
    const entry = build.runtimePackaging.entries['multiplayer-rooms'];
    const room = await import(entry ? `/app/${entry}` : '/app/js/multiplayer/rooms.js?v=67');
    return room.getCurrentRoom()?.code || '';
  });
}
async function title(page) {
  if (!await page.locator('#globeSelectorStartBtn').isVisible()) await page.locator('#mainMenuBtn').click();
  await page.locator('#globeSelectorStartBtn').waitFor({ state: 'visible' });
}
async function ocean(page) {
  await title(page); await page.locator('#coralResearchStart').click();
  await page.waitForFunction(() => marineCtx.boatDeck?.active && !marineCtx.titleLaunchPending, null, { timeout: 120000 });
  await page.getByText('Vessel options', { exact: true }).click();
  await page.locator('#researchSharedCrew').click();
  await page.locator('#sharedMarineControls').waitFor();
}
async function voyage(page, expected) {
  await page.waitForFunction(expected => {
    const s = marineCtx.sharedMarine?.snapshot();
    return s?.active && !s.transition && !s.error && s.state?.stage === expected &&
      (expected === 'underwater' ? marineCtx.oceanMode?.active : marineCtx.boatMode?.active && !marineCtx.oceanMode?.active);
  }, expected, { timeout: 120000 });
}
// Enumerate and remove only document trees owned by accounts created above.
async function deleteTree(relative) {
  assert.ok(users.some(user => ['users', 'explorerProfiles', 'explorerLeaderboard', 'propertyLeaderboard', 'creatorProfiles'].some(collection => relative === `${collection}/${user.uid}` || relative.startsWith(`${collection}/${user.uid}/`))) ||
    [...rooms].some(code => relative === `rooms/${code}` || relative.startsWith(`rooms/${code}/`)));
  const path = `${documentBase}/${relative}`;
  let cursor;
  do {
    const { body } = await db.post(`${path}:listCollectionIds`, { pageSize: 100, ...(cursor ? { pageToken: cursor } : {}) });
    for (const collection of body.collectionIds || []) {
      let token;
      do {
        const suffix = `?pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
        const { body: rows } = await db.get(`${path}/${collection}${suffix}`);
        for (const doc of rows.documents || []) await deleteTree(doc.name.split('/documents/')[1]);
        token = rows.nextPageToken;
      } while (token);
    }
    cursor = body.nextPageToken;
  } while (cursor);
  try { await db.delete(path); } catch (error) { if (error.status !== 404) throw error; }
}
try {
  for (const name of ['captain', 'pilot']) {
    const user = { name, email: `release-ui-${randomUUID()}@example.test`, password: randomBytes(24).toString('base64url') };
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true })
    });
    assert.equal(response.status, 200, 'Disposable staging account creation failed');
    user.uid = (await response.json()).localId; users.push(user);
  }
  owned = await chromium.launchServer({ channel: 'chrome', headless: false });
  browser = await chromium.connect(owned.wsEndpoint());
  stage = 'cold-start-sign-in'; const captain = await open(users[0]); report.checks.signIn = true;
  await captain.locator('#globeLocationSearch').fill('Baltimore, Maryland');
  await captain.locator('#globeLocationSearchBtn').click();
  await captain.locator('#globeLocationSearchResults button').first().waitFor({ state: 'visible', timeout: 45000 });
  await captain.locator('#globeLocationSearchResults button').first().click(); report.checks.locationSearch = true;
  await captain.locator('#globeSelectorStartBtn').click();
  await captain.waitForFunction(completeWorldReady, null, { timeout: 240000 }); report.checks.coldStart = true;
  await captain.screenshot({ path: `${output}/cold-start.png` });
  stage = 'warm-start'; await captain.reload(); await ready(captain);
  await captain.locator('#globeSelectorStartBtn').click();
  await captain.waitForFunction(completeWorldReady, null, { timeout: 240000 }); report.checks.warmStart = true;
  stage = 'private-room';
  await captain.locator('#communityBtn').click(); await captain.locator('#fMultiplayer').click();
  await captain.locator('#roomPanelCreateNameInput').fill('Release verification — private crew');
  await captain.locator('#roomPanelVisibilitySelect').selectOption('private');
  await captain.locator('#roomPanelCreateBtn').click();
  await captain.waitForFunction(() => /[A-Z0-9]{6}/.test(document.getElementById('roomPanelRoomCode')?.textContent || ''), null, { timeout: 120000 });
  const code = await roomCode(captain); assert.match(code, /^[A-Z0-9]{6}$/); rooms.add(code);
  if (await captain.locator('#roomPanelCloseBtn').isVisible()) await captain.locator('#roomPanelCloseBtn').click();
  await captain.waitForFunction(completeWorldReady, null, { timeout: 240000 });
  await ocean(captain); await captain.locator('#sharedMarineCreate').click(); await voyage(captain, 'aboard');
  const pilot = await open(users[1]);
  await pilot.locator('[data-globe-destination="multiplayer"]').click();
  await pilot.locator('#mpTitleCodeInput').fill(code); await pilot.locator('#mpTitleJoinBtn').click();
  await pilot.waitForFunction(completeWorldReady, null, { timeout: 240000 });
  assert.equal(await roomCode(pilot), code);
  await ocean(pilot); await pilot.locator('#sharedMarineJoin').click(); await voyage(pilot, 'aboard');
  stage = 'shared-voyage'; await pilot.locator('#sharedMarinePilot').click();
  await pilot.waitForFunction(() => !!marineCtx.sharedMarine.snapshot().state.seats.pilot);
  if (await captain.locator('#sharedMarineHelm').isVisible()) await captain.locator('#sharedMarineHelm').click();
  await captain.locator('#sharedMarineDeploy').click();
  await voyage(captain, 'underwater'); await voyage(pilot, 'underwater');
  const before = await pilot.evaluate(() => ({ ...marineCtx.sharedMarine.snapshot().state.submarine.pose }));
  await pilot.keyboard.down('KeyW'); try { await pilot.waitForTimeout(2000); } finally { await pilot.keyboard.up('KeyW'); }
  await captain.waitForFunction(before => {
    const p = marineCtx.sharedMarine.snapshot().state.submarine.pose;
    return Math.hypot(p.x - before.x, p.z - before.z) > .5;
  }, before, { timeout: 20000 });
  await captain.screenshot({ path: `${output}/shared-voyage.png` });
  await captain.locator('#sharedMarineRecover').click(); await voyage(captain, 'aboard'); await voyage(pilot, 'aboard');
  report.checks.sharedVoyage = true;
  stage = 'personal-save-recovery';
  await pilot.locator('#sharedMarineLeave').click();
  await captain.locator('#sharedMarineLeave').click();
  await captain.waitForFunction(() => !marineCtx.sharedMarine && marineCtx.boatDeck?.active, null, { timeout: 120000 });
  const saved = await captain.evaluate(() => ({ ship: marineCtx.oceanVoyage.current.ship.transportEntityId, sub: marineCtx.oceanVoyage.current.subId }));
  await captain.reload(); await ready(captain); await captain.locator('#oceanVoyageResume').click();
  await captain.waitForFunction(() => marineCtx.boatDeck?.active && !marineCtx.titleLaunchPending, null, { timeout: 120000 });
  assert.deepEqual(await captain.evaluate(() => ({ ship: marineCtx.oceanVoyage.current.ship.transportEntityId, sub: marineCtx.oceanVoyage.current.subId })), saved);
  await captain.screenshot({ path: `${output}/save-recovery.png` }); report.checks.saveRecovery = true;
  assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []);
  assert.ok(sameAcceptanceSource(baseline, sourceFingerprint(root)));
  assert.ok(sameArtifactIdentity(artifact, artifactIdentity(root, candidateRoot)));
  report.passed = true;
} catch (error) {
  report.failure = { stage, message: redact(error.stack || error) }; process.exitCode = 1;
  await users[0]?.page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
} finally {
  try { if (owned) await closeOwnedBrowser(owned); }
  catch { report.cleanupErrors.push('Owned browser cleanup failed'); }
  report.ownedFixtureIds = { users: users.map(user => ({ name: user.name, uid: user.uid })), rooms: [...rooms] };
  // Recover any room whose UI finished creating before a later read failed.
  for (const user of users) try {
    const { body } = await db.post(`${documentBase}:runQuery`, { structuredQuery: {
      from: [{ collectionId: 'rooms' }], where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: user.uid } } }, limit: 20
    } });
    for (const row of body || []) if (row.document) rooms.add(row.document.name.split('/').at(-1));
  } catch { report.cleanupErrors.push(`Could not enumerate ${user.name}'s disposable rooms`); }
  report.ownedFixtureIds.rooms = [...rooms];
  for (const code of rooms) try { await deleteTree(`rooms/${code}`); } catch { report.cleanupErrors.push('Disposable room cleanup failed'); }
  for (const user of users) {
    for (const collection of ['users', 'explorerProfiles', 'explorerLeaderboard', 'propertyLeaderboard', 'creatorProfiles']) {
      try { await deleteTree(`${collection}/${user.uid}`); } catch { report.cleanupErrors.push(`Disposable ${user.name} ${collection} cleanup failed`); }
    }
    try { await adminAuth.post(`/v1/projects/${project}/accounts:delete`, { localId: user.uid }); } catch { report.cleanupErrors.push(`Disposable ${user.name} account cleanup failed`); }
  }
  if (report.cleanupErrors.length) { report.passed = false; process.exitCode = 1; }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
if (report.passed && !diagnostic) {
  const evidenceFiles = [];
  for (const file of ['report.json', 'cold-start.png', 'shared-voyage.png', 'save-recovery.png']) {
    const path = `${output}/${file}`;
    evidenceFiles.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
  await mkdir('output/release-evidence/current/acceptance', { recursive: true });
  await writeFile('output/release-evidence/current/acceptance/ordinary-hosted.json', JSON.stringify({
    contract: 'world-explorer-acceptance-class-v1', evidenceClass: 'ordinary-hosted', result: 'passed',
    artifactIdentity: artifact, acceptanceFingerprint: baseline.acceptanceFingerprint,
    reviewer: 'Codex normal-input hosted browser verification', observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), checks: report.checks,
    attestationMode: 'ordinary', providerMode: 'live', debugAttestation: false, evidenceFiles
  }, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failure: report.failure, cleanupErrors: report.cleanupErrors }));
