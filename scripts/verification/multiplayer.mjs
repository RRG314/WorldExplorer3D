import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4380, 4381, 4382, 4383] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const reportPath = path.join(root, 'output', 'verification', 'multiplayer', 'report.json');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function createPlayer(label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = Object.freeze({
      enabled: true,
      host: '127.0.0.1',
      authPort: 9099,
      firestorePort: 8080
    });
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
  const identity = await page.evaluate(async ({ email, displayName }) => {
    const services = globalThis.WorldExplorerFirebase?.initFirebase?.();
    if (!services?.auth || !services?.db) throw new Error('Firebase emulator services did not initialize.');
    const authApi = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const credential = await authApi.createUserWithEmailAndPassword(services.auth, email, 'WorldExplorer3D-Test-Only-93!');
    await authApi.updateProfile(credential.user, { displayName });
    const authUi = await import('/js/auth-ui.js?v=55');
    const deadline = Date.now() + 10000;
    while (authUi.getCurrentUser()?.uid !== credential.user.uid && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (authUi.getCurrentUser()?.uid !== credential.user.uid) throw new Error('Application auth state did not adopt the emulator user.');
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const firestoreDeadline = Date.now() + 15000;
    let firestoreReady = false;
    let lastFirestoreError = null;
    while (!firestoreReady && Date.now() < firestoreDeadline) {
      try {
        await firestore.getDoc(firestore.doc(services.db, 'users', credential.user.uid));
        firestoreReady = true;
      } catch (error) {
        lastFirestoreError = error;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    if (!firestoreReady) throw new Error(`Firestore emulator did not become reachable: ${lastFirestoreError?.message || 'unknown error'}`);
    return { uid: credential.user.uid, email, displayName, emulator: services.emulator };
  }, {
    email: `${label}-${runId}@example.test`,
    displayName: label === 'owner' ? 'Room Owner' : 'Room Member'
  });
  return { context, page, identity, browserErrors };
}

let owner;
let member;
try {
  owner = await createPlayer('owner');
  member = await createPlayer('member');
  const room = await owner.page.evaluate(async () => {
    const rooms = await import('/app/js/multiplayer/rooms.js?v=67');
    return rooms.createRoom({
      code: 'QA42MP',
      name: 'Release multiplayer verification',
      visibility: 'private',
      maxPlayers: 8,
      displayName: 'Room Owner',
      world: { kind: 'earth', seed: 'latlon:39.2904,-76.6122', lat: 39.2904, lon: -76.6122 },
      locationName: 'Baltimore',
      locationTag: { label: 'Baltimore', city: 'Baltimore', cityKey: 'baltimore', kind: 'earth' }
    });
  });
  assert.equal(room.code, 'QA42MP');

  const joined = await member.page.evaluate(async (roomCode) => {
    const rooms = await import('/app/js/multiplayer/rooms.js?v=67');
    const joinedRoom = await rooms.joinRoomByCode(roomCode, { displayName: 'Room Member' });
    return { joinedRoom, currentRoom: rooms.getCurrentRoom() };
  }, room.code);
  assert.equal(joined.joinedRoom.code, room.code);
  assert.equal(joined.currentRoom.code, room.code);

  const artifactTitle = `Shared release artifact ${runId}`;
  await member.page.evaluate(async (roomCode) => {
    const artifacts = await import('/app/js/multiplayer/artifacts.js?v=57');
    globalThis.__WE3D_MULTIPLAYER_VERIFY__ = { rows: [], error: '' };
    globalThis.__WE3D_MULTIPLAYER_VERIFY_UNSUB__ = artifacts.listenArtifacts(roomCode, (rows) => {
      globalThis.__WE3D_MULTIPLAYER_VERIFY__.rows = rows;
    }, {
      onError(error) {
        globalThis.__WE3D_MULTIPLAYER_VERIFY__.error = String(error?.message || error);
      }
    });
  }, room.code);

  await owner.page.evaluate(async ({ roomCode, title }) => {
    const artifacts = await import('/app/js/multiplayer/artifacts.js?v=57');
    await artifacts.createArtifact(roomCode, {
      type: 'pin',
      title,
      text: 'Two-client production contract',
      visibility: 'room',
      anchor: { kind: 'earth', lat: 39.2904, lon: -76.6122, x: 0, y: 0, z: 0 }
    });
  }, { roomCode: room.code, title: artifactTitle });

  await member.page.waitForFunction((title) => {
    const verification = globalThis.__WE3D_MULTIPLAYER_VERIFY__;
    if (verification?.error) throw new Error(verification.error);
    return verification?.rows?.some((row) => row.title === title) === true;
  }, artifactTitle, { timeout: 15000 });
  const sharedArtifact = await member.page.evaluate((title) => {
    const match = globalThis.__WE3D_MULTIPLAYER_VERIFY__?.rows?.find((row) => row.title === title);
    globalThis.__WE3D_MULTIPLAYER_VERIFY_UNSUB__?.();
    return match || null;
  }, artifactTitle);
  const playerCount = await member.page.evaluate(async (roomCode) => {
    const services = globalThis.WorldExplorerFirebase.initFirebase();
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const snapshot = await firestore.getDocs(firestore.collection(services.db, 'rooms', roomCode, 'players'));
    return snapshot.size;
  }, room.code);

  const checks = {
    distinctAuthenticatedPlayers: owner.identity.uid !== member.identity.uid,
    ownerCreatedBoundedPrivateRoom: room.code === 'QA42MP' && room.visibility === 'private' && Number(room.maxPlayers) === 8,
    secondClientJoinedSameRoom: joined.currentRoom.code === room.code,
    bothPresenceRecordsVisible: playerCount === 2,
    sharedArtifactConverged: sharedArtifact.title === artifactTitle && sharedArtifact.text === 'Two-client production contract',
    noBrowserErrors: owner.browserErrors.length === 0 && member.browserErrors.length === 0
  };
  assert.ok(Object.values(checks).every(Boolean), 'Two-client multiplayer verification failed.');
  const report = {
    ok: true,
    contract: 'two-authenticated-clients-bounded-room-convergence',
    generatedAt: new Date().toISOString(),
    checks,
    evidence: {
      roomCode: room.code,
      roomVisibility: room.visibility,
      roomMaxPlayers: room.maxPlayers,
      playerCount,
      ownerUid: owner.identity.uid,
      memberUid: member.identity.uid,
      artifactId: sharedArtifact.id,
      artifactTitle: sharedArtifact.title
    }
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await owner?.context?.close().catch(() => {});
  await member?.context?.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
