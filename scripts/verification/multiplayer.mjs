import { softwareCompositorArgs } from './software-compositor.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { advanceGameplay, stepGameplayKeys } from './gameplay-simulation.mjs';
import { installRecordedOverpassFixture } from './recorded-overpass-fixture.mjs';
import { pauseWaitingPlayer as pauseWaitingPage } from './pause-waiting-player.mjs';
import { selectLowRenderQuality } from './render-quality-ui.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

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
// Correctness coverage retains both complete worlds; performance is measured
// separately. Bound old-space allocation on the small-memory verification host.
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--js-flags=--max-old-space-size=1024', ...softwareCompositorArgs()] });
// The Linux runner uses software rasterization. Reduce only its backing-store
// pixels, retaining the desktop CSS viewport, complete city data and two live
// clients. This is functional backend evidence, never FPS/visual acceptance.
const deviceScaleFactor = process.env.CI ? 0.5 : 1;
// Admission starts world compilation immediately. A UI receipt must not depend
// on requestAnimationFrame being scheduled by the software GPU while that world
// compiles. Match the CI action allowance; retain the normal local deadline.
const roomStateWait = { timeout: process.env.CI ? 120_000 : 20_000, polling: 250 };
// The live provider may omit curb-width metadata and legitimately publish no
// parked cars. Both parked and ambient traffic are player-enterable vehicles.
// Exercise a vehicle actually present in this full world, retaining normal
// walking, entry and server authority; never fabricate a car or widen a road.
// Select the lane position recorded in the actual 979dea loaded world, not
// the earlier OSM-only preflight point 40 world units east of the street.
const worldLocation = { name: 'Logan Main Street', lat: 41.735329, lon: -111.834912 };
const browserBudget = {
  maxOldSpaceMiB: 1024, worldInitialization: 'sequential', simultaneouslyLoadedWorlds: 2,
  foregroundGameplayWorlds: 1, waitingClient: 'normal manual-pause UI; network listeners remain active',
  viewport: { width: 1280, height: 800 }, deviceScaleFactor, roomStateWait,
  memberViewport: { width: 390, height: 844 },
  navigationTiming: 'bounded fixed-step walking; network-yielding driving',
  mapEvidence: 'exact recorded public Overpass queries; remaining providers use normal loading',
  evidenceScope: 'multiplayer-functional', worldLocation
};
browserBudget.renderQuality = process.env.CI ? 'low (selected through Settings)' : 'default';
async function recordStage(stage) {
  console.log(`[multiplayer] ${stage}`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ ok: false, complete: false, stage, browserBudget }, null, 2)}\n`);
}
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const firebaseProjectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
const functionsOrigin = `http://127.0.0.1:5001/${firebaseProjectId}/us-central1`;
const emulatorFirebaseConfig = JSON.parse(await fs.readFile(path.join(root, 'config/firebase.staging.json'), 'utf8'));

async function createPlayer(label) {
  const mobile = label === 'member';
  const context = await browser.newContext({
    // A touch viewport alone keeps Chromium's desktop user agent and reports
    // one touch point; the app then correctly selects desktop map coverage.
    ...(mobile ? { userAgent: devices['iPhone 13'].userAgent } : {}),
    viewport: mobile ? browserBudget.memberViewport : browserBudget.viewport,
    deviceScaleFactor, isMobile: mobile, hasTouch: mobile
  });
  const providerFixture = await installRecordedOverpassFixture(context, mobile ? 'mobile' : 'desktop');
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
  // Two stable frames on a software GPU can exceed Playwright's 30s default.
  if (process.env.CI) page.setDefaultTimeout(120_000);
  const browserErrors = [];
  collectBrowserGraphicsErrors(page, browserErrors);
  const interactionTrace = [];
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) interactionTrace.push({ type: message.type(), text: message.text() });
  });
  page.on('request', request => {
    if (/UrbanVehicle/.test(request.url())) interactionTrace.push({ type: 'vehicle-request', at: new Date().toISOString(), method: request.method(), url: request.url() });
  });
  page.on('response', async response => {
    if (!/UrbanVehicle/.test(response.url())) return;
    const event = { type: 'vehicle-response', at: new Date().toISOString(), status: response.status(), url: response.url() };
    interactionTrace.push(event);
    if (response.request().method() !== 'POST') return;
    const result = await response.json().catch(() => null);
    if (result) Object.assign(event, { accepted: result.accepted, reason: result.reason || result.error || '', leaseExpiresMs: result.state?.leaseExpiresMs });
  });
  await page.addInitScript(() => {
    globalThis.__multiplayerInputTrace = [];
    globalThis.addEventListener('keydown', event => {
      if (!['KeyE', 'Escape'].includes(event.code)) return;
      globalThis.__multiplayerInputTrace.push({ type: 'keydown', code: event.code, repeat: event.repeat, target: event.target?.tagName, prompt: document.getElementById('urbanVehiclePrompt')?.textContent, urban: globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox });
    }, true);
    globalThis.addEventListener('we3d:context-interaction-completed', event => {
      globalThis.__multiplayerInputTrace.push({ type: 'completed', detail: event.detail });
    });
  });
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  const params = new URLSearchParams({
    loc: 'custom', lat: String(worldLocation.lat), lon: String(worldLocation.lon), lname: worldLocation.name,
    launch: 'earth', gm: 'free', mode: 'walk'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
  if (process.env.CI) {
    // Exercise the shipped low-render-quality path on the shared virtual GPU.
    // City data, physics, room authority and server lease deadlines are unchanged.
    await selectLowRenderQuality(page);
  }
  // Select the requested city through the same fields the player uses, then
  // verify saved and loaded coordinates as well as its human-readable label.
  await page.locator('#globeCustomLat').fill(String(worldLocation.lat));
  await page.locator('#globeCustomLon').fill(String(worldLocation.lon));
  await page.locator('#globeCustomLon').press('Enter');
  await page.waitForFunction(({lat,lon}) => {
    const text=document.getElementById('globeSelectorLatLon')?.textContent || '';
    return text.includes(lat.toFixed(4)) && text.includes(lon.toFixed(4));
  },worldLocation);
  const identity = await page.evaluate(async ({ email, displayName }) => {
    const services = globalThis.WorldExplorerFirebase?.initFirebase?.();
    if (!services?.auth || !services?.db) throw new Error('Firebase emulator services did not initialize.');
    const authApi = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const credential = await authApi.createUserWithEmailAndPassword(services.auth, email, 'WorldExplorer3D-Test-Only-93!');
    await authApi.updateProfile(credential.user, { displayName });
    // Firebase Auth Emulator 15.22 can set validSince in the second after
    // signup's auth_time. Establish a normal authenticated session after setup;
    // token refresh alone retains auth_time and cannot repair that boundary.
    const signedIn = await authApi.signInWithEmailAndPassword(services.auth, email, 'WorldExplorer3D-Test-Only-93!');
    if (signedIn.user.uid !== credential.user.uid) throw new Error('Emulator sign-in changed the fixture account.');
    const authUi = await import('/js/auth-ui.js?v=56');
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
  return { context, page, identity, browserErrors, interactionTrace, providerFixture };
}

function wrapYaw(value) {
  let result = Number(value) || 0;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

async function inputStep(page, key, milliseconds, { yieldToNetwork = true } = {}) {
  const started = Date.now();
  const receipt = await stepGameplayKeys(page, key, milliseconds, { yieldToNetwork });
  const timing = { key, milliseconds, wallMs: Date.now() - started, receipt };
  inputTimings.push(timing);
  await fs.writeFile(path.join(path.dirname(reportPath), 'input-timing.json'), JSON.stringify(inputTimings, null, 2));
  return timing;
}

// No vehicle lease is held while approaching on foot. Use the same fixed-step
// keyboard path as other walking journeys and yield between bounded bursts,
// instead of forcing a software-GPU presentation after every 16ms of physics.
// Driving/braking retain per-frame network yields for real lease heartbeats.
function walkingStep(page, key, milliseconds) {
  return inputStep(page, key, milliseconds, { yieldToNetwork: false });
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
    if (document.getElementById('loading')?.classList.contains('show')) return false;
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.activeActor?.mode === 'walk' &&
      state.urbanSandbox?.active === true && Number(state.urbanSandbox?.vehicleCount || 0) > 0;
  }, null, { timeout: 360_000, polling: 500 });
  assert.ok(player.providerFixture.hits > 0, 'Expected exact recorded map query was not consumed');
  const origin = await player.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().earthOrigin);
  assert.ok(Math.abs(origin?.lat-worldLocation.lat)<1e-6 && Math.abs(origin?.lon-worldLocation.lon)<1e-6,
    `Loaded room world differs from selected city: ${JSON.stringify({expected:worldLocation,actual:origin})}`);
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
  await player.page.bringToFront();
  let previousPosition = null;
  let previousDistance = null;
  let recedingSteps = 0;
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
    if (step % 5 === 0) console.log(JSON.stringify({ stage: 'walk-to-shared-vehicle', vehicleId, step, recoveries, state }));
    if (state.missing) return { reached: false, reason: 'vehicle-left-detail-range', step, recoveries, state, recoveryTrace };
    if (state.interaction?.action === 'enter_vehicle' && state.nearbyVehicleId === vehicleId) {
      return { reached: true, step, recoveries, state, recoveryTrace };
    }
    // Walking cannot catch a car already driving away. Re-observe the live
    // roster instead of exhausting a stale list while every other car leaves.
    recedingSteps = previousDistance !== null && state.distance > previousDistance + .5 ? recedingSteps + 1 : 0;
    previousDistance = state.distance;
    if (recedingSteps >= 4) return { reached: false, reason: 'vehicle-moving-away', step, recoveries, state, recoveryTrace };
    const desired = Math.atan2(state.targetX - state.x, state.targetZ - state.z);
    const delta = wrapYaw(desired - state.yaw);
    if (Math.abs(delta) > 0.13) {
      await walkingStep(player.page, delta > 0 ? 'ArrowLeft' : 'ArrowRight', Math.abs(delta) > 0.7 ? 55 : 16);
      continue; // Only translation can establish a blocked route.
    }
    await walkingStep(player.page, 'ArrowUp', state.distance > 18 ? 140 : 90);
    // A moving car can approach a player who is blocked by a wall. Measure
    // the player's translation, not the changing distance to that car.
    stagnant = previousPosition && Math.hypot(state.x - previousPosition.x, state.z - previousPosition.z) < .008 ? stagnant + 1 : 0;
    previousPosition = { x: state.x, z: state.z };
    if (stagnant > 32) {
      if (recoveries >= 6) {
        return { reached: false, reason: 'stagnant', step, recoveries, state, recoveryTrace };
      }
      recoveryTrace.push({ x: state.x, z: state.z, distance: state.distance });
      await walkingStep(player.page, 'ArrowDown', 260);
      await walkingStep(player.page, recoveries % 2 === 0 ? 'ArrowLeft' : 'ArrowRight', 640);
      await walkingStep(player.page, 'ArrowUp', 1_200);
      recoveries += 1;
      stagnant = 0;
      previousPosition = null;
    }
  }
  return { reached: false, reason: 'step-limit', step: maxSteps, recoveries, state: lastState, recoveryTrace };
}

let owner;
let member;
const inputTimings = [];
const pauseReceipts = [];
const vehicleApproaches = [];
const vehicleExitWaits = [];
async function brakeUntilExitAvailable(player) {
  const started = Date.now();
  for (let simulatedMs = 0; simulatedMs <= 12_000; simulatedMs += 100) {
    const state = await player.page.evaluate(() => {
      const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
      return { phase: urban?.phase, interaction: urban?.interaction, vehicle: urban?.playerVehicle };
    });
    assert.equal(state.phase, 'driving', 'Vehicle authority ended before normal exit');
    if (state.interaction?.action === 'exit_vehicle') {
      vehicleExitWaits.push({ simulatedMs, wallMs: Date.now() - started, state });
      return;
    }
    assert.ok(simulatedMs < 12_000, `Braking did not enable exit: ${JSON.stringify(state)}`);
    await inputStep(player.page, 'Space', 100);
  }
}
async function pauseWaitingPlayer(player) {
  pauseReceipts.push(await pauseWaitingPage(player.page));
}

async function resumePlayer(player) {
  await player.page.bringToFront();
  await player.page.locator('#resumeBtn').click();
  await player.page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().paused === false, null, roomStateWait);
  await player.page.locator('body > canvas:not(#minimap)').click();
}
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
  await owner.page.locator('#mpCreateRoomDetails > summary').click();
  await owner.page.locator('#mpTitleRoomNameInput').fill('Release multiplayer verification');
  await owner.page.locator('#mpTitleLocationTagInput').fill(worldLocation.name);
  await owner.page.locator('#mpTitleCreateBtn').click();
  try {
    await owner.page.waitForFunction(() =>
      /\b[A-Z2-9]{6}\b/.test(String(document.getElementById('roomPanelRoomCode')?.textContent || '').trim()),
    null, { ...roomStateWait, timeout: process.env.CI ? roomStateWait.timeout : 30_000 });
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
    return { code, world: data.world, visibility: String(data.visibility || ''), maxPlayers: Number(data.maxPlayers || 0) };
  }, roomCode);

  assert.ok(Math.abs(room.world?.lat-worldLocation.lat)<1e-6 && Math.abs(room.world?.lon-worldLocation.lon)<1e-6,
    `Created room differs from selected city: ${JSON.stringify(room.world)}`);

  async function joinThroughNormalControls(player, roomCode) {
    await openMultiplayerTitleControls(player);
    await player.page.locator('#mpTitleCodeInput').fill(roomCode);
    await player.page.locator('#mpTitleJoinBtn').click();
    try {
      await player.page.waitForFunction((code) => {
        const roomCodeText = document.getElementById('roomPanelRoomCode')?.textContent || '';
        return String(roomCodeText).includes(code);
      }, roomCode, roomStateWait);
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

  // Creating/joining a room itself launches its world. Wait here, before the
  // second join, rather than merely serializing waits after both have started.
  await recordStage('owner room created; loading owner world before member joins');
  await launchRoomWorld(owner);
  await pauseWaitingPlayer(owner);
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

  await owner.page.evaluate(async ({ roomCode, title, artifactsModuleUrl, worldLocation }) => {
    const artifacts = await import(artifactsModuleUrl);
    await artifacts.createArtifact(roomCode, {
      type: 'pin',
      title,
      text: 'Two-client production contract',
      visibility: 'room',
      anchor: { kind: 'earth', lat: worldLocation.lat, lon: worldLocation.lon, x: 0, y: 0, z: 0 }
    });
  }, { roomCode: room.code, title: artifactTitle, artifactsModuleUrl: moduleUrls.artifacts, worldLocation });

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

  await recordStage('room UI and shared artifact completed; loading member world');
  await launchRoomWorld(member);
  await pauseWaitingPlayer(member);
  await resumePlayer(owner);
  await recordStage('both worlds ready; verifying shared vehicle and movement');
  await owner.page.screenshot({ path: path.join(path.dirname(reportPath), 'owner-before-vehicle.png'), timeout: 15000 });
  const memberInitialVehicleIds = await member.page.evaluate(() =>
    (globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.vehicles || []).map(vehicle => vehicle.id));
  const parkingSource = await owner.page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const actor = ctx.activeEarthActorPosition?.() || ctx.Walk?.state?.walker || ctx.car || {};
    return (ctx.livingWorldRuntime?.publication?.trafficGraph?.edges || [])
      .filter(edge => Math.hypot((edge.p1.x + edge.p2.x) / 2 - actor.x, (edge.p1.z + edge.p2.z) / 2 - actor.z) <= 80)
      .slice(0, 80).map(edge => ({ sourceFeatureId: edge.sourceFeatureId, roadWidth: edge.roadWidth, laneOffset: edge.laneOffset, roadClass: edge.roadClass, laneProvenance: edge.laneProvenance }));
  });
  console.log(JSON.stringify({ stage: 'published-parking-source', edges: parkingSource }));
  const readVehicleCandidates = () => owner.page.evaluate(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = state.activeActor?.position || {};
    return (state.urbanSandbox?.vehicles || [])
      .filter((vehicle) => ['deterministic-parked-vehicle', 'living-world-detailed-traffic'].includes(vehicle.source) &&
        vehicle.driverDoor && !vehicle.occupied && !vehicle.attachedToPlayer)
      .map((vehicle) => ({ id: vehicle.id, source: vehicle.source, distance: Math.hypot(vehicle.driverDoor.x - actor.x, vehicle.driverDoor.z - actor.z) }))
      .sort((left, right) => left.distance - right.distance);
  });
  let sharedVehicle = null;
  const attempted = new Set();
  // Retain normal walking and server claims. Each observation is fresh; never
  // teleport an actor, immobilize traffic, or manufacture an enterable car.
  for (let attempt = 0; attempt < 30 && !sharedVehicle; attempt++) {
    const candidates = await readVehicleCandidates();
    candidates.sort((a, b) => Number(a.source !== 'deterministic-parked-vehicle') - Number(b.source !== 'deterministic-parked-vehicle') || a.distance - b.distance);
    const candidate = candidates.find(row => !attempted.has(row.id));
    if (!candidate) {
      await advanceGameplay(owner.page, 1000);
      attempted.clear();
      continue;
    }
    attempted.add(candidate.id);
    const ownerReach = await walkToVehicle(owner, candidate.id);
    vehicleApproaches.push({ candidate, ownerReach });
    if (ownerReach.reached) sharedVehicle = candidate;
  }
  assert.ok(sharedVehicle?.id, 'Room owner could not reach any published vehicle with normal walking input.');

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
    }, sharedVehicle.id, roomStateWait);
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
  await pauseWaitingPlayer(owner);
  const ownerClaimed = await owner.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox);
  assert.equal(ownerClaimed.phase, 'driving', 'Vehicle ownership ended before the owner could pause.');
  await member.page.waitForFunction((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    const vehicle = urban?.vehicles?.find((entry) => entry.id === vehicleId);
    return urban?.authority?.mode === 'room' && urban.authority.synchronizedEntities > 0 &&
      vehicle?.roomOccupiedByOther === true && !!vehicle.roomLeaseOwnerUid;
  }, sharedVehicle.id, roomStateWait);
  const memberObservedLease = await member.page.evaluate((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return { authority: urban.authority, vehicle: urban.vehicles.find((entry) => entry.id === vehicleId) };
  }, sharedVehicle.id);

  // Cross the server's 15-second lease interval before testing release. This
  // proves liveness, rather than a claim observed only before its first expiry.
  await owner.page.waitForTimeout(16_000);
  const retainedLease = await owner.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox);
  assert.equal(retainedLease?.phase, 'driving', 'The room vehicle lease expired while its driver remained active.');
  assert.equal(retainedLease?.activeVehicleId, sharedVehicle.id);
  await member.page.waitForFunction((vehicleId) => {
    const vehicle = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.vehicles?.find(entry => entry.id === vehicleId);
    return vehicle?.roomOccupiedByOther === true && !!vehicle.roomLeaseOwnerUid;
  }, sharedVehicle.id, roomStateWait);

  await resumePlayer(owner);
  // Use the same normal DOM-input/fixed-step contract as walking. Wall-clock
  // sleeps on a software GPU do not establish a known physics interval.
  // The server lease test above deliberately remains real wall-clock time.
  await inputStep(owner.page, 'ArrowUp', 1_100);
  await brakeUntilExitAvailable(owner);
  await owner.page.keyboard.press('KeyE');
  await owner.page.waitForFunction((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return urban?.phase === 'walking' && !urban.activeVehicleId &&
      urban.vehicles.some((entry) => entry.id === vehicleId && entry.attachedToPlayer === false);
  }, sharedVehicle.id, roomStateWait);
  const ownerReleased = await owner.page.evaluate((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return { authority: urban.authority, vehicle: urban.vehicles.find((entry) => entry.id === vehicleId) };
  }, sharedVehicle.id);
  await member.page.waitForFunction((vehicleId) => {
    const vehicle = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.vehicles?.find((entry) => entry.id === vehicleId);
    return vehicle && vehicle.roomOccupiedByOther === false && !vehicle.roomLeaseOwnerUid;
  }, sharedVehicle.id, roomStateWait);
  const memberReleasedPose = await member.page.evaluate((vehicleId) =>
    globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.vehicles?.find(entry => entry.id === vehicleId),
  sharedVehicle.id);
  assert.ok(Math.abs(memberReleasedPose.pitch - ownerReleased.vehicle.pitch) <= .0002 &&
    Math.abs(memberReleasedPose.roll - ownerReleased.vehicle.roll) <= .0002,
  'Released shared vehicle lost its road pitch or bank on the receiving client.');
  await pauseWaitingPlayer(owner);
  await resumePlayer(member);
  const memberReach = await walkToVehicle(member, sharedVehicle.id);
  assert.ok(memberReach.reached,
    `Room member could not reach the released shared vehicle with normal walking input: ${JSON.stringify(memberReach)}`);
  await member.page.keyboard.press('KeyE');
  await member.page.waitForFunction((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return urban?.phase === 'driving' && urban.activeVehicleId === vehicleId && urban.authority?.mode === 'room';
  }, sharedVehicle.id, roomStateWait);
  const memberClaimedAfterRelease = await member.page.evaluate((vehicleId) => {
    const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
    return { authority: urban.authority, vehicle: urban.vehicles.find((entry) => entry.id === vehicleId) };
  }, sharedVehicle.id);
  await recordStage('shared-car claim, lease renewal, release and member handoff accepted; waiting for member exit');
  // Driving starts before the normal exit stability interval is complete.
  // Wait for the same visible action used by the owner's exit above.
  await brakeUntilExitAvailable(member);
  await member.page.keyboard.press('KeyE');
  await member.page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.phase === 'walking', null, roomStateWait);

  const checks = {
    recordedMapQueriesConsumed: owner.providerFixture.hits > 0 && member.providerFixture.hits > 0,
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
    vehicleApproaches,
    ok: true,
    complete: true,
    browserBudget,
    providerFixtures: {owner: owner.providerFixture, member: member.providerFixture},
    pauseReceipts,
    contract: 'two-authenticated-clients-bounded-room-convergence',
    generatedAt: new Date().toISOString(),
    checks,
    vehicleExitWaits,
    interactionTrace: {
      owner: await owner.page.evaluate(() => globalThis.__multiplayerInputTrace || []),
      member: await member.page.evaluate(() => globalThis.__multiplayerInputTrace || [])
    },
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
      memberInitiallySeededVehicle: memberInitialVehicleIds.includes(sharedVehicle.id),
      selectedVehicleSource: sharedVehicle.source,
      firstLeaseOwnerUid: memberObservedLease.vehicle?.roomLeaseOwnerUid,
      secondLeaseOwnerUid: memberClaimedAfterRelease.vehicle?.roomLeaseOwnerUid,
      leaseHeldBeyondInitialExpiry: retainedLease.phase === 'driving',
      releasedPose: { owner: ownerReleased.vehicle, member: memberReleasedPose }
    }
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const clients = {};
  for (const [label, player] of [['owner', owner], ['member', member]]) {
    if (!player?.page) continue;
    clients[label] = await player.page.evaluate(() => ({
      diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.() || null,
      focusedElement: document.activeElement?.id || document.activeElement?.tagName || '',
      vehiclePrompt: document.getElementById('urbanVehiclePrompt')?.textContent || '',
      inputTrace: globalThis.__multiplayerInputTrace || []
    })).catch(failure => ({ captureError: String(failure) }));
    clients[label].providerFixture = player.providerFixture;
    clients[label].interactionTrace = player.interactionTrace;
    clients[label].browserErrors = player.browserErrors;
    await player.page.screenshot({ path: path.join(path.dirname(reportPath), `${label}-failure.png`), timeout: 5000 }).catch(() => {});
  }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ ok: false, complete: false, error: String(error?.stack || error), browserBudget, pauseReceipts, vehicleApproaches, vehicleExitWaits, clients }, null, 2)}\n`);
  throw error;
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
