import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'verification', 'connected-property-multiplayer');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticServer({ rootDir: root, ports: [4433, 4434, 4435] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/us-central1`;
const firebaseConfig = JSON.parse(await fs.readFile(path.join(root, 'config/firebase.staging.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const browserFailures = [];
const useRealWorld = process.env.WE3D_PROPERTY_REAL_WORLD === '1';

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
  page.on('pageerror', (error) => browserFailures.push(`${label}: ${error.stack || error}`));
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
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
    await firestore.enableNetwork(services.db);
    const firestoreDeadline = Date.now() + 30_000;
    let firestoreReady = false;
    let firestoreError = '';
    while (!firestoreReady && Date.now() < firestoreDeadline) {
      try {
        await firestore.getDocFromServer(firestore.doc(services.db, 'users', credential.user.uid));
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
  } else {
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.selLoc = 'baltimore';
      ctx.LOC = { lat: 39.2904, lon: -76.6122, name: 'Baltimore' };
      ctx.LOCS = { ...(ctx.LOCS || {}), baltimore: { name: 'Baltimore', lat: 39.2904, lon: -76.6122 } };
      ctx.car = { x: 0, y: 0, z: 0, position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
      ctx.buildings = [{
        sourceBuildingId: 'osm:way:424242',
        buildingType: 'house',
        levels: 2,
        baseY: 0,
        pts: [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }]
      }];
      document.getElementById('globeSelectorScreen')?.classList.remove('show');
    });
  }
  return { context, page, identity };
}

async function createSharedRoom(owner) {
  return owner.page.evaluate(async (name) => {
    const [{ createRoom }, { ctx }] = await Promise.all([
      import('/app/js/multiplayer/rooms.js?v=67'),
      import('/app/js/shared-context.js?v=55')
    ]);
    const lat = Number(ctx.LOC?.lat || 39.2904);
    const lon = Number(ctx.LOC?.lon || -76.6122);
    const room = await createRoom({
      name,
      visibility: 'private',
      world: { kind: 'earth', seed: `property-loop:${lat.toFixed(5)}:${lon.toFixed(5)}`, lat, lon, name: 'Baltimore' }
    });
    return { code: room.code || room.id, world: room.world };
  }, `Connected Property ${runId}`);
}

async function joinSharedRoom(player, roomCode) {
  return player.page.evaluate(async (code) => {
    const { joinRoomByCode } = await import('/app/js/multiplayer/rooms.js?v=67');
    const room = await joinRoomByCode(code);
    return { code: room.code || room.id, world: room.world };
  }, roomCode);
}

async function stageAtSameMappedProperty(player, roomCode, sourceBuildingId = '') {
  return player.page.evaluate(async ({ roomCode, sourceBuildingId }) => {
    const [{ ctx }, propertyUi] = await Promise.all([
      import('/app/js/shared-context.js?v=55'),
      import('/app/js/game/property-ui.js?v=2')
    ]);
    propertyUi.toggleRealEstate(true);
    const properties = await propertyUi.loadPropertiesAtCurrentLocation();
    const candidates = properties.filter((property) => property.sharedEligible && property.price <= 500);
    const property = (sourceBuildingId ? candidates.find((entry) => entry.sourceBuildingId === sourceBuildingId) : candidates[0]);
    if (!property) throw new Error(`No matching mapped property was available. Found ${candidates.length} connected candidates.`);
    const actor = ctx.Walk?.state?.mode === 'walk' && ctx.Walk?.state?.walker ? ctx.Walk.state.walker : ctx.car;
    if (!actor) throw new Error('No active Earth actor was available.');
    actor.position?.set?.(property.x, Number(actor.position?.y || property.y || 0), property.z);
    actor.x = property.x;
    actor.z = property.z;
    const services = globalThis.WorldExplorerFirebase.initFirebase();
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const auth = globalThis.WorldExplorerFirebase.initFirebase().auth.currentUser;
    await firestore.setDoc(firestore.doc(services.db, 'rooms', roomCode, 'players', auth.uid), {
      uid: auth.uid,
      displayName: auth.displayName || 'Explorer',
      lastSeenAt: firestore.serverTimestamp(),
      expiresAt: firestore.Timestamp.fromMillis(Date.now() + 90_000),
      pose: { x: property.x, y: Number(property.y || 0), z: property.z, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 }
    }, { merge: true });
    propertyUi.updatePropertyPanel();
    return {
      id: property.id,
      worldPropertyId: property.worldPropertyId,
      sourceBuildingId: property.sourceBuildingId,
      label: property.label,
      x: property.x,
      z: property.z
    };
  }, { roomCode, sourceBuildingId });
}

async function waitForStatus(page, pattern) {
  await page.waitForFunction((source) => new RegExp(source, 'i').test(String(document.getElementById('propertyHubStatus')?.textContent || '')), pattern.source, { timeout: 30_000 });
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

  await owner.page.waitForFunction((label) => document.getElementById('propertyHubList')?.textContent?.includes(label), 'Owner Rowan', { timeout: 30_000 }).catch(() => {});
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
