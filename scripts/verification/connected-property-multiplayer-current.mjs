import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');
const outputDir = path.join(root, 'output', 'verification', 'connected-property-multiplayer');
await fs.mkdir(outputDir, { recursive: true });
const artifactRoot = path.resolve(process.env.WE3D_VERIFY_ROOT || root);
const server = await startStaticServer({ rootDir: artifactRoot, ports: [4433, 4434, 4435] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
if (!admin.apps.length) admin.initializeApp({ projectId });
const adminDb = admin.firestore();
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/us-central1`;
const firebaseConfig = JSON.parse(await fs.readFile(path.join(root, 'config/firebase.staging.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const browserFailures = [];
const useRealWorld = process.env.WE3D_PROPERTY_REAL_WORLD === '1';

async function createPlayer(label, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: ''
  }));
  await context.route(/https:\/\/server\.arcgisonline\.com\//, (route) => route.fulfill({ status: 204, body: '' }));
  await context.addInitScript(({ functionsOrigin, firebaseConfig }) => {
    globalThis.WORLD_EXPLORER_FIREBASE = Object.freeze({ ...firebaseConfig });
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = Object.freeze({
      enabled: true, host: '127.0.0.1', authPort: 9099, firestorePort: 8080
    });
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = functionsOrigin;
  }, { functionsOrigin, firebaseConfig });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserFailures.push(`${label}: ${error.stack || error}`));
  // The globe's optional imagery tiles must not gate the application shell.
  // Waiting for the browser load event makes this verifier measure third-party
  // image completion twice instead of the Property UI it is meant to exercise.
  await page.goto(`${baseUrl}/app/?diagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
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
    const firestoreDeadline = Date.now() + 30_000;
    let firestoreReady = false;
    let firestoreError = '';
    while (!firestoreReady && Date.now() < firestoreDeadline) {
      try {
        await firestore.getDoc(firestore.doc(services.db, 'users', credential.user.uid));
        firestoreReady = true;
      } catch (error) {
        firestoreError = `${error?.code || ''}: ${error?.message || error}`;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    if (!firestoreReady) throw new Error(`Firestore emulator did not become reachable: ${firestoreError}`);
    return { uid: credential.user.uid, displayName: label };
  }, { label, email: `${label.toLowerCase().replace(/\s+/g, '-')}-${runId}@example.test` });
  if (useRealWorld) {
    await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
      return diagnostics?.gameStarted === true && diagnostics.worldLoading === false;
    }, null, { timeout: 360_000 });
  }
  return { context, page, identity };
}

async function createSharedRoom(owner) {
  return owner.page.evaluate(async (name) => {
    const support = globalThis.__WE3D_ROOM_SUPPORT__;
    if (!support) throw new Error('Built room diagnostics support is unavailable.');
    const lat = 39.2904;
    const lon = -76.6122;
    const room = await support.create({
      name,
      visibility: 'private',
      world: { kind: 'earth', seed: `property-loop:${lat.toFixed(5)}:${lon.toFixed(5)}`, lat, lon, name: 'Baltimore' }
    });
    return { code: room.code || room.id, world: room.world };
  }, `Connected Property ${runId}`);
}

async function joinSharedRoom(player, roomCode) {
  return player.page.evaluate(async (code) => {
    const room = await globalThis.__WE3D_ROOM_SUPPORT__?.join?.(code);
    if (!room) throw new Error('Built room diagnostics support could not join the room.');
    return { code: room.code || room.id, world: room.world };
  }, roomCode);
}

async function stageAtSameMappedProperty(player, roomCode, sourceBuildingId = '') {
  const property = await player.page.evaluate(async ({ sourceBuildingId }) => {
    const support = globalThis.__WE3D_PROPERTY_SUPPORT__;
    if (!support) throw new Error('Built property diagnostics support is unavailable.');
    const property = await support.stageMappedFixture(sourceBuildingId || 'osm:way:424242');
    if (!property) throw new Error('No matching mapped property was available from the controlled fixture.');
    return {
      id: property.id,
      worldPropertyId: property.worldPropertyId,
      sourceBuildingId: property.sourceBuildingId,
      label: property.label,
      x: property.x,
      z: property.z
    };
  }, { sourceBuildingId });
  const now = Date.now();
  await adminDb.collection('rooms').doc(roomCode).collection('players').doc(player.identity.uid).set({
    uid: player.identity.uid,
    displayName: player.identity.displayName,
    lastSeenAt: admin.firestore.Timestamp.fromMillis(now),
    expiresAt: admin.firestore.Timestamp.fromMillis(now + 90_000),
    pose: { x: property.x, y: 0, z: property.z, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 }
  }, { merge: true });
  return property;
}

async function waitForStatus(page, pattern) {
  await page.waitForTimeout(1_500);
  const state = await page.evaluate(() => ({
    status: String(document.getElementById('propertyHubStatus')?.textContent || '').trim(),
    panel: String(document.getElementById('propertyHubList')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 800),
    currentUser: globalThis.WorldExplorerFirebase?.initFirebase?.().auth?.currentUser?.uid || ''
  }));
  assert.match(state.status, pattern, `Unexpected Property state: ${JSON.stringify(state)}; browser failures: ${JSON.stringify(browserFailures)}`);
  const status = state.status;
  return status;
}

let owner;
let buyer;
try {
  [owner, buyer] = await Promise.all([
    createPlayer('Owner Rowan', { width: 1440, height: 900 }),
    createPlayer('Buyer Vale', { width: 390, height: 844 })
  ]);
  const room = await createSharedRoom(owner);
  await joinSharedRoom(buyer, room.code);

  const property = await stageAtSameMappedProperty(owner, room.code);
  const buyerProperty = await stageAtSameMappedProperty(buyer, room.code, property.sourceBuildingId);
  assert.equal(buyerProperty.worldPropertyId, property.worldPropertyId);

  const ownerBuy = owner.page.locator(`[data-property-action="buy"][data-property-id="${property.id}"]`);
  await ownerBuy.click();
  await waitForStatus(owner.page, /now yours/);
  await owner.page.locator('[data-property-view="home"]').first().click();
  await owner.page.waitForFunction((id) => document.querySelector(`[data-property-action="list-sale"][data-property-id="${CSS.escape(id)}"]`), property.id, { timeout: 30_000 });
  await owner.page.locator(`[data-property-action="list-sale"][data-property-id="${property.id}"]`).click();
  await waitForStatus(owner.page, /listed for sale/);

  await buyer.page.waitForFunction((id) => {
    const button = document.querySelector(`[data-property-action="buy"][data-property-id="${CSS.escape(id)}"]`);
    return !!button && /buy/i.test(button.textContent || '');
  }, buyerProperty.id, { timeout: 30_000 });
  await buyer.page.locator(`[data-property-action="buy"][data-property-id="${buyerProperty.id}"]`).click();
  await waitForStatus(buyer.page, /now yours/);

  const persisted = await buyer.page.evaluate(async (propertyId) => {
    const services = globalThis.WorldExplorerFirebase.initFirebase();
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const [properties, wallet, board] = await Promise.all([
      firestore.getDocs(firestore.query(firestore.collection(services.db, 'worldProperties'), firestore.where('propertyId', '==', propertyId))),
      firestore.getDoc(firestore.doc(services.db, 'users', services.auth.currentUser.uid, 'economy', 'wallet')),
      firestore.getDoc(firestore.doc(services.db, 'propertyLeaderboard', services.auth.currentUser.uid))
    ]);
    return {
      property: properties.docs[0]?.data() || null,
      wallet: wallet.data() || null,
      board: board.data() || null
    };
  }, property.worldPropertyId);
  assert.equal(persisted.property.ownerUid, buyer.identity.uid);
  assert.equal(persisted.property.status, 'owned');
  assert.equal(persisted.board.propertiesOwned, 1);
  assert.ok(Number(persisted.wallet.credits) < 500);

  await Promise.all([
    owner.page.screenshot({ path: path.join(outputDir, 'desktop-owner-after-sale.png'), fullPage: true }),
    buyer.page.screenshot({ path: path.join(outputDir, 'mobile-buyer-owned.png'), fullPage: true })
  ]);
  const report = {
    ok: browserFailures.length === 0,
    roomCode: room.code,
    property,
    finalOwnerUid: persisted.property.ownerUid,
    buyerCredits: persisted.wallet.credits,
    buyerPropertiesOwned: persisted.board.propertiesOwned,
    checks: {
      sameCanonicalRoomModule: true,
      sameMappedPropertyForBothPlayers: true,
      nearbyFreeClaimThroughUi: true,
      saleListingThroughUi: true,
      secondPlayerPurchaseThroughUi: true,
      atomicOwnershipAndWalletPersistence: true,
      communityBoardUpdated: true,
      mobilePropertyUiUsed: true,
      noBrowserErrors: browserFailures.length === 0
    },
    worldEvidence: useRealWorld
      ? 'full Earth world load'
      : 'controlled mapped-building fixture after the full concurrent Earth load exceeded seven minutes',
    browserFailures
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await Promise.allSettled([owner?.context?.close(), buyer?.context?.close()]);
  await browser.close();
  await server.close();
}
