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
const sourceModuleUrls = {
  rooms: '/app/js/multiplayer/rooms.js?v=67',
  artifacts: '/app/js/multiplayer/artifacts.js?v=57'
};
const moduleUrls = requestedRoot
  ? await fs.readFile(path.join(servedRoot, 'build-manifest.json'), 'utf8').then((text) => {
    const entries = JSON.parse(text)?.runtimePackaging?.entries || {};
    const rooms = String(entries['multiplayer-rooms'] || '');
    const artifacts = String(entries['multiplayer-artifacts'] || '');
    if (!rooms || !artifacts) {
      throw new Error('Production artifact does not publish its multiplayer verification entries.');
    }
    return { rooms: `/app/${rooms}`, artifacts: `/app/${artifacts}` };
  })
  : sourceModuleUrls;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const firebaseProjectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
const functionsOrigin = `http://127.0.0.1:5001/${firebaseProjectId}/us-central1`;
const emulatorFirebaseConfig = JSON.parse(await fs.readFile(path.join(root, 'config/firebase.staging.json'), 'utf8'));

async function createPlayer(label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(({ functionsBase, firebaseConfig }) => {
    // Firestore emulator data is namespaced by the Firebase app project ID.
    // Match the Functions emulator project so browser writes and Admin SDK
    // reads exercise the same isolated database rather than two empty projects.
    globalThis.WORLD_EXPLORER_FIREBASE = Object.freeze({ ...firebaseConfig });
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = Object.freeze({
      enabled: true,
      host: '127.0.0.1',
      authPort: 9099,
      firestorePort: 8080
    });
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = functionsBase;
  }, { functionsBase: functionsOrigin, firebaseConfig: emulatorFirebaseConfig });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.2904', lon: '-76.6122', lname: 'Baltimore',
    launch: 'earth', gm: 'free', mode: 'walk'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120000 });
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

function wrapYaw(value) {
  let result = Number(value) || 0;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

async function inputStep(page, key, milliseconds) {
  await page.keyboard.down(key);
  await page.evaluate((duration) => globalThis.advanceTime?.(duration), milliseconds);
  await page.keyboard.up(key);
}

async function launchRoomWorld(player) {
  const alreadyStarted = await player.page.evaluate(() =>
    globalThis.getWorldExplorerRuntimeDiagnostics?.().gameStarted === true);
  if (!alreadyStarted) {
    const hubClose = player.page.locator('#globeHubOverlayCloseBtn');
    if (await hubClose.isVisible().catch(() => false)) {
      await hubClose.click();
      await player.page.locator('#globeHubOverlay').waitFor({ state: 'hidden' });
    }
    const start = player.page.locator('#globeSelectorStartBtn');
    if (!await start.isVisible().catch(() => false)) {
      const locationDestination = player.page.locator('[data-globe-destination="location"]:visible').first();
      await locationDestination.click();
      await start.waitFor({ state: 'visible' });
    }
    await start.click();
  }
  await player.page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.activeActor?.mode === 'walk' &&
      state.urbanSandbox?.active === true && Number(state.urbanSandbox?.vehicleCount || 0) > 0;
  }, null, { timeout: 360_000 });
  await player.page.waitForTimeout(1_500);
  const skip = player.page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible().catch(() => false)) {
    try {
      await skip.click({ timeout: 5_000 });
    } catch (error) {
      // The guide can finish closing between the visibility probe and click.
      // Only fail setup when it is still present and would block real inputs.
      if (await skip.isVisible().catch(() => false)) throw error;
    }
  }
  try {
    await player.page.waitForFunction(() => {
      const authority = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.authority;
      return authority?.mode === 'room' && !!authority.roomCode && !!authority.actorUid;
    }, null, { timeout: 20_000 });
  } catch (error) {
    const diagnostics = await player.page.evaluate(() => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        gameStarted: runtime.gameStarted === true,
        multiplayerStatus: document.getElementById('mpTitleStatus')?.textContent || '',
        urbanAuthority: runtime.urbanSandbox?.authority || null
      };
    });
    throw new Error(`Room authority did not bind after the world loaded: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
}

async function walkToVehicle(player, vehicleId, maxSteps = 1_200) {
  let previousDistance = Infinity;
  let stagnant = 0;
  let recoveries = 0;
  let lastState = null;
  const recoveryTrace = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await player.page.evaluate((id) => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const actor = diagnostics.activeActor || {};
      const vehicle = diagnostics.urbanSandbox?.vehicles?.find((entry) => entry.id === id);
      const position = actor.position || {};
      if (!vehicle?.driverDoor) return { missing: true };
      return {
        x: Number(position.x), z: Number(position.z), yaw: Number(actor.orientation?.yaw),
        targetX: Number(vehicle.driverDoor.x), targetZ: Number(vehicle.driverDoor.z),
        distance: Math.hypot(Number(vehicle.driverDoor.x) - Number(position.x), Number(vehicle.driverDoor.z) - Number(position.z)),
        interaction: diagnostics.urbanSandbox?.interaction || null,
        nearbyVehicleId: diagnostics.urbanSandbox?.nearbyVehicleId || ''
      };
    }, vehicleId);
    lastState = state;
    if (state.missing) throw new Error(`Room vehicle ${vehicleId} is unavailable to this client.`);
    if (state.interaction?.action === 'enter_vehicle' && state.nearbyVehicleId === vehicleId) {
      return { reached: true, step, recoveries, state, recoveryTrace };
    }
    const desired = Math.atan2(state.targetX - state.x, state.targetZ - state.z);
    const delta = wrapYaw(desired - state.yaw);
    if (Math.abs(delta) > 0.13) await inputStep(player.page, delta > 0 ? 'ArrowLeft' : 'ArrowRight', 55);
    else await inputStep(player.page, 'ArrowUp', state.distance > 18 ? 140 : 90);
    stagnant = state.distance >= previousDistance - 0.008 ? stagnant + 1 : 0;
    previousDistance = state.distance;
    if (stagnant > 32) {
      if (recoveries >= 6) {
        return { reached: false, reason: 'stagnant', step, recoveries, state, recoveryTrace };
      }
      recoveryTrace.push({ x: state.x, z: state.z, distance: state.distance });
      await inputStep(player.page, 'ArrowDown', 260);
      await inputStep(player.page, recoveries % 2 === 0 ? 'ArrowLeft' : 'ArrowRight', 640);
      await inputStep(player.page, 'ArrowUp', 1_200);
      recoveries += 1;
      stagnant = 0;
      previousDistance = Infinity;
    }
  }
  return { reached: false, reason: 'step-limit', step: maxSteps, recoveries, state: lastState, recoveryTrace };
}

let owner;
let member;
try {
  owner = await createPlayer('owner');
  member = await createPlayer('member');
  async function openMultiplayerTitleControls(player) {
    const legacyTab = player.page.locator('button.tab-btn[data-tab="multiplayer"]');
    if (await legacyTab.isVisible().catch(() => false)) await legacyTab.click();
    else await player.page.locator('[data-globe-destination="multiplayer"]').click();
    await player.page.locator('#mpTitleCodeInput').waitFor({ state: 'visible' });
    await player.page.waitForFunction(() =>
      String(document.getElementById('mpTitleStatus')?.textContent || '').includes('Multiplayer ready.'),
    null, { timeout: 20_000 });
  }

  await openMultiplayerTitleControls(owner);
  await owner.page.locator('#mpTitleRoomNameInput').fill('Release multiplayer verification');
  await owner.page.locator('#mpTitleLocationTagInput').fill('Baltimore');
  await owner.page.locator('#mpTitleCreateBtn').click();
  try {
    await owner.page.waitForFunction(() =>
      /\b[A-Z2-9]{6}\b/.test(String(document.getElementById('roomPanelRoomCode')?.textContent || '').trim()),
    null, { timeout: 30_000 });
  } catch (error) {
    const ui = await owner.page.evaluate(() => ({
      titleStatus: document.getElementById('mpTitleStatus')?.textContent || '',
      panelStatus: document.getElementById('roomPanelStatus')?.textContent || '',
      panelRoomCode: document.getElementById('roomPanelRoomCode')?.textContent || ''
    }));
    throw new Error(`Normal room creation did not activate a room: ${JSON.stringify(ui)}`, { cause: error });
  }
  const roomCodeText = await owner.page.locator('#roomPanelRoomCode').textContent();
  const roomCode = String(roomCodeText || '').match(/\b[A-Z2-9]{6}\b/)?.[0] || '';
  assert.match(roomCode, /^[A-Z2-9]{6}$/);
  const room = await owner.page.evaluate(async (code) => {
    const services = globalThis.WorldExplorerFirebase.initFirebase();
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const snapshot = await firestore.getDoc(firestore.doc(services.db, 'rooms', code));
    const data = snapshot.data() || {};
    return { code, visibility: String(data.visibility || ''), maxPlayers: Number(data.maxPlayers || 0) };
  }, roomCode);

  async function joinThroughNormalControls(player, roomCode) {
    await openMultiplayerTitleControls(player);
    await player.page.locator('#mpTitleCodeInput').fill(roomCode);
    await player.page.locator('#mpTitleJoinBtn').click();
    try {
      await player.page.waitForFunction((code) => {
        const roomCodeText = document.getElementById('roomPanelRoomCode')?.textContent || '';
        return String(roomCodeText).includes(code);
      }, roomCode, { timeout: 20_000 });
    } catch (error) {
      const ui = await player.page.evaluate(() => ({
        titleStatus: document.getElementById('mpTitleStatus')?.textContent || '',
        panelStatus: document.getElementById('roomPanelStatus')?.textContent || '',
        panelRoomCode: document.getElementById('roomPanelRoomCode')?.textContent || ''
      }));
      throw new Error(`Normal room join did not activate the requested room: ${JSON.stringify(ui)}`, { cause: error });
    }
    const activeRoomText = await player.page.locator('#roomPanelRoomCode').textContent();
    return String(activeRoomText || '').match(/\b[A-Z2-9]{6}\b/)?.[0] || '';
  }

  const memberJoinedRoomCode = await joinThroughNormalControls(member, room.code);

  const artifactTitle = `Shared release artifact ${runId}`;
  await member.page.evaluate(async ({ roomCode, artifactsModuleUrl }) => {
    const artifacts = await import(artifactsModuleUrl);
    globalThis.__WE3D_MULTIPLAYER_VERIFY__ = { rows: [], error: '' };
    globalThis.__WE3D_MULTIPLAYER_VERIFY_UNSUB__ = artifacts.listenArtifacts(roomCode, (rows) => {
      globalThis.__WE3D_MULTIPLAYER_VERIFY__.rows = rows;
    }, {
      onError(error) {
        globalThis.__WE3D_MULTIPLAYER_VERIFY__.error = String(error?.message || error);
      }
    });
  }, { roomCode: room.code, artifactsModuleUrl: moduleUrls.artifacts });

  await owner.page.evaluate(async ({ roomCode, title, artifactsModuleUrl }) => {
    const artifacts = await import(artifactsModuleUrl);
    await artifacts.createArtifact(roomCode, {
      type: 'pin',
      title,
      text: 'Two-client production contract',
      visibility: 'room',
      anchor: { kind: 'earth', lat: 39.2904, lon: -76.6122, x: 0, y: 0, z: 0 }
    });
  }, { roomCode: room.code, title: artifactTitle, artifactsModuleUrl: moduleUrls.artifacts });

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

  await Promise.all([launchRoomWorld(owner), launchRoomWorld(member)]);
  const sharedVehicleCandidates = await owner.page.evaluate(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = state.activeActor?.position || {};
    return (state.urbanSandbox?.vehicles || [])
      .filter((vehicle) => vehicle.source === 'deterministic-parked-vehicle' &&
        vehicle.driverDoor && !vehicle.occupied && !vehicle.attachedToPlayer)
      .map((vehicle) => ({ id: vehicle.id, distance: Math.hypot(vehicle.driverDoor.x - actor.x, vehicle.driverDoor.z - actor.z) }))
      .sort((left, right) => left.distance - right.distance);
  });
  let sharedVehicle = null;
  for (const candidate of sharedVehicleCandidates) {
    const ownerReach = await walkToVehicle(owner, candidate.id);
    if (ownerReach.reached) {
      sharedVehicle = candidate;
      break;
    }
  }
  assert.ok(sharedVehicle?.id, 'Room owner could not reach any published persistent vehicle with normal walking input.');
  await member.page.waitForFunction((vehicleId) =>
    globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.vehicles?.some((vehicle) => vehicle.id === vehicleId),
  sharedVehicle.id, { timeout: 15_000 });

  const claimResponsePromise = owner.page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/claimUrbanVehicle(?:\?|$)/.test(response.url()),
  { timeout: 30_000 });
  await owner.page.keyboard.press('KeyE');
  const claimResponse = await claimResponsePromise;
  const claimResult = {
    status: claimResponse.status(),
    body: await claimResponse.json().catch(() => null)
  };
  try {
    await owner.page.waitForFunction((vehicleId) => {
      const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
      return urban?.phase === 'driving' && urban.activeVehicleId === vehicleId && urban.authority?.mode === 'room';
    }, sharedVehicle.id, { timeout: 20_000 });
  } catch (error) {
    const vehicleEntryState = await owner.page.evaluate((vehicleId) => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const urban = diagnostics.urbanSandbox || {};
      const vehicle = urban.vehicles?.find((entry) => entry.id === vehicleId) || null;
      const actor = diagnostics.activeActor?.position || {};
      return {
        phase: urban.phase,
        activeVehicleId: urban.activeVehicleId,
        authority: urban.authority,
        interaction: urban.interaction,
        nearbyVehicleId: urban.nearbyVehicleId,
        statusMessage: urban.statusMessage,
        actorMode: diagnostics.activeActor?.mode,
        actorPosition: actor,
        vehicle,
        driverDoorDistance: vehicle?.driverDoor
          ? Math.hypot(Number(vehicle.driverDoor.x) - Number(actor.x), Number(vehicle.driverDoor.z) - Number(actor.z))
          : null,
        prompt: document.getElementById('urbanVehiclePrompt')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    }, sharedVehicle.id);
    throw new Error(`Claimed room vehicle did not enter driving mode: ${JSON.stringify({ claimResult, vehicleEntryState })}`, { cause: error });
  }
  const ownerClaimed = await owner.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox);
  await member.page.waitForFunction((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    const vehicle = urban?.vehicles?.find((entry) => entry.id === vehicleId);
    return urban?.authority?.mode === 'room' && urban.authority.synchronizedEntities > 0 &&
      vehicle?.roomOccupiedByOther === true && !!vehicle.roomLeaseOwnerUid;
  }, sharedVehicle.id, { timeout: 20_000 });
  const memberObservedLease = await member.page.evaluate((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return { authority: urban.authority, vehicle: urban.vehicles.find((entry) => entry.id === vehicleId) };
  }, sharedVehicle.id);

  await owner.page.keyboard.down('ArrowUp');
  await owner.page.waitForTimeout(1_100);
  await owner.page.keyboard.up('ArrowUp');
  await owner.page.keyboard.down('Space');
  await owner.page.waitForTimeout(850);
  await owner.page.keyboard.up('Space');
  await owner.page.keyboard.press('KeyE');
  await owner.page.waitForFunction((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return urban?.phase === 'walking' && !urban.activeVehicleId &&
      urban.vehicles.some((entry) => entry.id === vehicleId && entry.attachedToPlayer === false);
  }, sharedVehicle.id, { timeout: 12_000 });
  const ownerReleased = await owner.page.evaluate((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return { authority: urban.authority, vehicle: urban.vehicles.find((entry) => entry.id === vehicleId) };
  }, sharedVehicle.id);
  await member.page.waitForFunction((vehicleId) => {
    const vehicle = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.vehicles?.find((entry) => entry.id === vehicleId);
    return vehicle && vehicle.roomOccupiedByOther === false && !vehicle.roomLeaseOwnerUid;
  }, sharedVehicle.id, { timeout: 20_000 });
  const memberReach = await walkToVehicle(member, sharedVehicle.id);
  assert.ok(memberReach.reached,
    `Room member could not reach the released shared vehicle with normal walking input: ${JSON.stringify(memberReach)}`);
  await member.page.keyboard.press('KeyE');
  await member.page.waitForFunction((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return urban?.phase === 'driving' && urban.activeVehicleId === vehicleId && urban.authority?.mode === 'room';
  }, sharedVehicle.id, { timeout: 20_000 });
  const memberClaimedAfterRelease = await member.page.evaluate((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return { authority: urban.authority, vehicle: urban.vehicles.find((entry) => entry.id === vehicleId) };
  }, sharedVehicle.id);
  await member.page.keyboard.press('KeyE');
  await member.page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.phase === 'walking', null, { timeout: 12_000 });

  const checks = {
    distinctAuthenticatedPlayers: owner.identity.uid !== member.identity.uid,
    ownerCreatedBoundedPrivateRoom:
      room.visibility === 'private' && Number(room.maxPlayers) >= 2 && Number(room.maxPlayers) <= 32,
    secondClientJoinedSameRoom: memberJoinedRoomCode === room.code,
    bothPresenceRecordsVisible: playerCount === 2,
    sharedArtifactConverged: sharedArtifact.title === artifactTitle && sharedArtifact.text === 'Two-client production contract',
    roomVehicleLeaseVisibleToSecondClient:
      ownerClaimed.activeVehicleId === sharedVehicle.id &&
      memberObservedLease.vehicle?.roomOccupiedByOther === true &&
      memberObservedLease.vehicle?.roomLeaseOwnerUid === owner.identity.uid,
    roomVehicleReleasePreservesOneIdentity:
      ownerReleased.vehicle?.id === sharedVehicle.id && ownerReleased.vehicle?.attachedToPlayer === false,
    roomVehicleHandoffAcceptedAfterRelease:
      memberClaimedAfterRelease.vehicle?.id === sharedVehicle.id &&
      memberClaimedAfterRelease.vehicle?.attachedToPlayer === true &&
      memberClaimedAfterRelease.vehicle?.roomLeaseOwnerUid === member.identity.uid,
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
      artifactTitle: sharedArtifact.title,
      sharedVehicleId: sharedVehicle.id,
      firstLeaseOwnerUid: memberObservedLease.vehicle?.roomLeaseOwnerUid,
      secondLeaseOwnerUid: memberClaimedAfterRelease.vehicle?.roomLeaseOwnerUid
    }
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  // Firebase keeps streaming connections open in both player contexts. Closing
  // either context sequentially can wait forever and prevent Playwright from
  // reaching browser shutdown, even after every multiplayer assertion passed.
  // Start all Playwright shutdown work together so browser.close() can release
  // those connections and allow the verification process to terminate.
  await Promise.allSettled([
    owner?.context?.close(),
    member?.context?.close(),
    browser.close()
  ]);
  await server.close().catch(() => {});
}
