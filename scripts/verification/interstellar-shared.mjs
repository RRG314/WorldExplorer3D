import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'verification', 'interstellar-shared');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticServer({ rootDir: root, ports: [4390, 4391, 4392] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/us-central1`;
const firebaseConfig = JSON.parse(await fs.readFile(path.join(root, 'config/firebase.staging.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const failures = [];

async function createPlayer(label, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  await context.addInitScript(({ functionsOrigin, firebaseConfig }) => {
    globalThis.WORLD_EXPLORER_FIREBASE = Object.freeze({ ...firebaseConfig });
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = Object.freeze({
      enabled: true, host: '127.0.0.1', authPort: 9099, firestorePort: 8080
    });
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = functionsOrigin;
  }, { functionsOrigin, firebaseConfig });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${label}: ${error.stack || error}`));
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  const identity = await page.evaluate(async ({ label, email }) => {
    const services = globalThis.WorldExplorerFirebase?.initFirebase?.();
    const auth = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const credential = await auth.createUserWithEmailAndPassword(services.auth, email, 'WorldExplorer3D-Test-Only-93!');
    await auth.updateProfile(credential.user, { displayName: label });
    const authUi = await import('/js/auth-ui.js?v=55');
    const deadline = Date.now() + 12_000;
    while (authUi.getCurrentUser()?.uid !== credential.user.uid && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (authUi.getCurrentUser()?.uid !== credential.user.uid) throw new Error('Application auth state did not adopt the emulator user.');
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const firestoreDeadline = Date.now() + 15_000;
    let firestoreReady = false;
    while (!firestoreReady && Date.now() < firestoreDeadline) {
      try {
        await firestore.getDoc(firestore.doc(services.db, 'users', credential.user.uid));
        firestoreReady = true;
      } catch (_) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    if (!firestoreReady) throw new Error('Firestore emulator did not become reachable.');
    return { uid: credential.user.uid, displayName: label };
  }, { label, email: `${label.toLowerCase().replace(/\s+/g, '-')}-${runId}@example.test` });
  return { context, page, identity };
}

async function openMultiplayer(player) {
  await player.page.locator('[data-globe-destination="multiplayer"]').click();
  await player.page.locator('#mpTitleCodeInput').waitFor({ state: 'visible' });
  await player.page.waitForFunction(() => String(document.getElementById('mpTitleStatus')?.textContent || '').includes('Multiplayer ready.'), null, { timeout: 20_000 });
}

async function openSharedPlanner(player) {
  await player.page.evaluate(async () => {
    const [runtime, rooms] = await Promise.all([
      import('/app/js/expedition/runtime.js?v=13'), import('/app/js/multiplayer/rooms.js?v=67')
    ]);
    runtime.openExpeditionPlanner({
      getCurrentMultiplayerRoom: () => rooms.getCurrentRoom(),
      showToast: () => {},
      updateExpeditionShipRecord: () => {}
    });
  });
  await player.page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await player.page.locator('#expeditionOverlay').evaluate((element) => {
    // This focused verifier opens the room panel before an Earth world is
    // needed. Keep unrelated background map loading from obscuring the panel
    // being inspected; gameplay verifiers exercise the normal world boundary.
    element.style.zIndex = '2147483647';
  });
}

let owner;
let member;
try {
  owner = await createPlayer('Captain Rowan', { width: 1440, height: 900 });
  member = await createPlayer('Engineer Vale', { width: 390, height: 844 });
  await openMultiplayer(owner);
  await owner.page.locator('#mpTitleRoomNameInput').fill('Shared Interstellar Crew');
  await owner.page.locator('#mpTitleLocationTagInput').fill('Solar System');
  await owner.page.locator('#mpTitleCreateBtn').click();
  try {
    await owner.page.waitForFunction(() => /\b[A-Z2-9]{6}\b/.test(String(document.getElementById('roomPanelRoomCode')?.textContent || '')), null, { timeout: 30_000 });
  } catch (error) {
    const status = await owner.page.evaluate(() => ({
      title: document.getElementById('mpTitleStatus')?.textContent || '',
      panel: document.getElementById('roomPanelStatus')?.textContent || '',
      code: document.getElementById('roomPanelRoomCode')?.textContent || ''
    }));
    throw new Error(`Room creation failed: ${JSON.stringify(status)}`, { cause: error });
  }
  const roomCode = String(await owner.page.locator('#roomPanelRoomCode').textContent()).match(/\b[A-Z2-9]{6}\b/)?.[0] || '';
  assert.match(roomCode, /^[A-Z2-9]{6}$/);

  await openMultiplayer(member);
  await member.page.locator('#mpTitleCodeInput').fill(roomCode);
  await member.page.locator('#mpTitleJoinBtn').click();
  await member.page.waitForFunction((code) => String(document.getElementById('roomPanelRoomCode')?.textContent || '').includes(code), roomCode, { timeout: 30_000 });

  const created = await owner.page.evaluate(async (roomCode) => {
    const api = await import('/js/expedition-api.js?v=2');
    return api.mutateSharedExpedition({
      roomCode,
      action: 'create',
      role: 'command',
      configuration: {
        destinationId: 'proxima-centauri',
        shipId: 'long-range-research-vessel',
        propulsionId: 'radiant-plasma-field-drive',
        realism: 'science-inspired',
        survival: 'forgiving'
      }
    });
  }, roomCode);
  assert.equal(created.state.revision, 1);

  const joined = await member.page.evaluate(async (roomCode) => {
    const api = await import('/js/expedition-api.js?v=2');
    return api.mutateSharedExpedition({ roomCode, action: 'join', role: 'engineering' });
  }, roomCode);
  assert.equal(joined.state.participants[member.identity.uid].role, 'engineering');

  const started = await owner.page.evaluate(async ({ roomCode, state }) => {
    const api = await import('/js/expedition-api.js?v=2');
    return api.mutateSharedExpedition({ roomCode, action: 'commit', command: { type: 'start' }, expectedRevision: state.revision });
  }, { roomCode, state: joined.state });
  assert.equal(started.state.revision, 2);

  await Promise.all([
    owner.page.evaluate(async (roomCode) => (await import('/js/expedition-api.js?v=2')).mutateSharedExpedition({ roomCode, action: 'ready' }), roomCode),
    member.page.evaluate(async (roomCode) => (await import('/js/expedition-api.js?v=2')).mutateSharedExpedition({ roomCode, action: 'ready' }), roomCode)
  ]);

  const beforeAdvance = await owner.page.evaluate(async (roomCode) => {
    const services = globalThis.WorldExplorerFirebase.initFirebase();
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    return (await firestore.getDoc(firestore.doc(services.db, 'rooms', roomCode, 'expeditions', 'active'))).data();
  }, roomCode);
  assert.equal(Object.values(beforeAdvance.participants).filter((entry) => entry.readyForRevision === 2).length, 2);

  const advanced = await owner.page.evaluate(async ({ roomCode, state }) => {
    const api = await import('/js/expedition-api.js?v=2');
    return api.mutateSharedExpedition({ roomCode, action: 'commit', command: { type: 'advance' }, expectedRevision: state.revision });
  }, { roomCode, state: beforeAdvance });
  assert.equal(advanced.state.revision, 3);
  assert.ok(advanced.state.expedition.strategicElapsedS > 0);

  await member.page.evaluate(async (roomCode) => (await import('/js/expedition-api.js?v=2')).mutateSharedExpedition({ roomCode, action: 'connection', connected: false }), roomCode);
  const rejoined = await member.page.evaluate(async (roomCode) => (await import('/js/expedition-api.js?v=2')).mutateSharedExpedition({ roomCode, action: 'join' }), roomCode);
  assert.equal(rejoined.state.participants[member.identity.uid].role, 'engineering');
  assert.equal(rejoined.state.participants[member.identity.uid].connected, true);

  const choiceId = advanced.state.expedition.pendingEvent?.choices?.[0];
  assert.ok(choiceId, 'the first server-calculated watch should produce a crew response');
  const responded = await owner.page.evaluate(async ({ roomCode, revision, choiceId }) => (
    await import('/js/expedition-api.js?v=2')
  ).mutateSharedExpedition({
    roomCode,
    action: 'commit',
    command: { type: 'event-response', choiceId },
    expectedRevision: revision
  }), { roomCode, revision: advanced.state.revision, choiceId });
  assert.equal(responded.state.revision, 4);
  assert.equal(responded.state.expedition.pendingEvent, null);

  await Promise.all([openSharedPlanner(owner), openSharedPlanner(member)]);
  await Promise.all([
    owner.page.waitForFunction(() => document.querySelector('.expeditionShared')?.textContent?.includes('REVISION 4'), null, { timeout: 30_000 }),
    member.page.waitForFunction(() => document.querySelector('.expeditionShared')?.textContent?.includes('REVISION 4'), null, { timeout: 30_000 })
  ]);
  await Promise.all([
    owner.page.locator('#expeditionShareReady').click(),
    member.page.locator('#expeditionShareReady').click()
  ]);
  await Promise.all([
    owner.page.waitForFunction(() => document.querySelector('.expeditionShared')?.textContent?.includes('2 ready'), null, { timeout: 30_000 }),
    member.page.waitForFunction(() => document.querySelector('.expeditionShared')?.textContent?.includes('2 ready'), null, { timeout: 30_000 })
  ]);
  await owner.page.locator('#expeditionAdvance').click();
  await Promise.all([
    owner.page.waitForFunction(() => document.querySelector('.expeditionShared')?.textContent?.includes('REVISION 5'), null, { timeout: 30_000 }),
    member.page.waitForFunction(() => document.querySelector('.expeditionShared')?.textContent?.includes('REVISION 5'), null, { timeout: 30_000 })
  ]);
  await owner.page.locator('.expeditionShared').scrollIntoViewIfNeeded();
  await member.page.locator('.expeditionShared').scrollIntoViewIfNeeded();
  await Promise.all([
    owner.page.waitForFunction(() => {
      const panel = document.querySelector('.expeditionPanel');
      const box = panel?.getBoundingClientRect();
      return !!box && box.width > 500 && box.height > 300 && getComputedStyle(panel).visibility === 'visible';
    }),
    member.page.waitForFunction(() => {
      const panel = document.querySelector('.expeditionPanel');
      const box = panel?.getBoundingClientRect();
      return !!box && box.width >= 360 && box.height > 500 && getComputedStyle(panel).visibility === 'visible';
    })
  ]);
  await owner.page.screenshot({ path: path.join(outputDir, 'desktop-shared-crew.png'), fullPage: true });
  await member.page.screenshot({ path: path.join(outputDir, 'mobile-shared-crew.png'), fullPage: true });

  const finalShared = await owner.page.evaluate(async (code) => {
    const services = globalThis.WorldExplorerFirebase.initFirebase();
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    return (await firestore.getDoc(firestore.doc(services.db, 'rooms', code, 'expeditions', 'active'))).data();
  }, roomCode);

  const report = {
    ok: failures.length === 0,
    roomCode,
    revision: finalShared.revision,
    roles: Object.values(finalShared.participants).map((entry) => ({ uid: entry.uid, role: entry.role, connected: entry.connected })),
    strategicElapsedS: finalShared.expedition.strategicElapsedS,
    resolvedChoiceId: choiceId,
    uiAdvanceCompleted: finalShared.revision === 5,
    failures
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(failures, []);
} finally {
  await Promise.allSettled([owner?.context?.close(), member?.context?.close()]);
  await browser.close();
  await server.close();
}
