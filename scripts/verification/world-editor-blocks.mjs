import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const projectId = String(process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT_ID || '').trim();
const authHost = String(process.env.FIREBASE_AUTH_EMULATOR_HOST || '').trim();
const firestoreHost = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
const scope = String(process.env.WE3D_BLOCKS_SCOPE || '').trim().toLowerCase();
const requireImmutableSource = process.env.WE3D_REQUIRE_IMMUTABLE === '1';
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const relevantWorktreeChanges = execFileSync(
  'git',
  ['status', '--porcelain=v1', '--untracked-files=all'],
  { cwd: root, encoding: 'utf8' }
).split('\n').filter(Boolean).filter((line) => {
  const file = line.slice(3).split(' -> ').at(-1);
  return file !== 'docs/SYSTEM_INVENTORY.md';
});

assert.ok(projectId, 'world-editor-blocks must run inside firebase emulators:exec.');
assert.ok(authHost, 'world-editor-blocks requires the Auth emulator.');
assert.ok(firestoreHost, 'world-editor-blocks requires the Firestore emulator.');
assert.ok(['desktop', 'mobile', 'room', 'vehicle', 'local'].includes(scope), 'Set WE3D_BLOCKS_SCOPE to desktop, mobile, room, vehicle, or local. The rejected all-in-one draft is retired.');
if (requireImmutableSource) {
  assert.deepEqual(relevantWorktreeChanges, [], `Release evidence requires an immutable source checkpoint. Relevant changes: ${relevantWorktreeChanges.join(', ')}`);
}

const authPort = Number(authHost.split(':').at(-1));
const firestorePort = Number(firestoreHost.split(':').at(-1));
assert.ok(Number.isInteger(authPort) && authPort > 0, `Invalid Auth emulator host: ${authHost}`);
assert.ok(Number.isInteger(firestorePort) && firestorePort > 0, `Invalid Firestore emulator host: ${firestoreHost}`);

const server = await startStaticServer({ rootDir: servedRoot, ports: [4395, 4396, 4397] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'WorldEditor-Blocks-Emulator-Only-2026';
const evidenceDir = path.join(root, 'output', 'release-evidence', 'current');
const reportPath = path.join(root, 'output', 'verification', 'world-editor-blocks', 'report.json');
const launchUrl = (() => {
  const params = new URLSearchParams({
    loc: 'custom',
    lat: '39.28305',
    lon: '-76.61270',
    lname: 'Baltimore Inner Harbor',
    launch: 'earth',
    gm: 'free',
    mode: 'walk'
  });
  return `${baseUrl}/app/?${params}`;
})();
const alternateLaunchUrl = (() => {
  const params = new URLSearchParams({
    loc: 'custom',
    lat: '39.29670',
    lon: '-76.61530',
    lname: 'Baltimore North Location Isolation',
    launch: 'earth',
    gm: 'free',
    mode: 'walk'
  });
  return `${baseUrl}/app/?${params}`;
})();
const roomTitleUrl = `${baseUrl}/app/?tab=multiplayer`;

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const runAuthority = Object.freeze({
  sourceRevision,
  relevantWorktreeChanges,
  browserVersion: browser.version(),
  emulatorProject: projectId,
  emulatorPorts: { auth: authPort, firestore: firestorePort, functions: 5101 },
  staticServerPort: server.port,
  world: { latitude: 39.28305, longitude: -76.61270, label: 'Baltimore Inner Harbor', mode: 'walk' },
  productionWritesPossible: false
});
const watchdog = setTimeout(() => {
  console.error('[world-editor-blocks] FAIL overall verification exceeded 12 minutes.');
  process.exit(1);
}, 12 * 60 * 1000);
watchdog.unref();

function phase(message) {
  console.log(`[world-editor-blocks] ${message}`);
}

function collectBrowserDiagnostics(page) {
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400 && !response.url().endsWith('/build-manifest.json')) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  return { browserErrors, localFailures };
}

async function createExplorer(label, viewport = { width: 1280, height: 720 }, initialUrl = launchUrl) {
  const touchViewport = viewport.width <= 640;
  const context = await browser.newContext({
    viewport,
    hasTouch: touchViewport,
    isMobile: touchViewport
  });
  await context.addInitScript(({ emulatorProjectId, emulatorAuthPort, emulatorFirestorePort }) => {
    globalThis.WORLD_EXPLORER_FIREBASE = Object.freeze({
      projectId: emulatorProjectId,
      apiKey: 'emulator-key',
      appId: 'emulator-app'
    });
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = Object.freeze({
      enabled: true,
      host: '127.0.0.1',
      authPort: emulatorAuthPort,
      firestorePort: emulatorFirestorePort
    });
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = `http://127.0.0.1:5101/${emulatorProjectId}/us-central1`;
  }, {
    emulatorProjectId: projectId,
    emulatorAuthPort: authPort,
    emulatorFirestorePort: firestorePort
  });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page);
  await page.goto(initialUrl, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  const identity = await page.evaluate(async ({ email, displayName, accountPassword }) => {
    const services = globalThis.WorldExplorerFirebase?.initFirebase?.();
    if (!services?.auth || !services?.db) throw new Error('Firebase emulator services did not initialize.');
    const authApi = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const credential = await authApi.createUserWithEmailAndPassword(services.auth, email, accountPassword);
    await authApi.updateProfile(credential.user, { displayName });
    const authUi = await import('/js/auth-ui.js?v=55');
    const deadline = Date.now() + 15_000;
    while (authUi.getCurrentUser()?.uid !== credential.user.uid && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (authUi.getCurrentUser()?.uid !== credential.user.uid) {
      throw new Error('Application auth state did not adopt the emulator user.');
    }
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const profileRef = firestore.doc(services.db, 'users', credential.user.uid);
    const profileDeadline = Date.now() + 30_000;
    let profile = null;
    while (Date.now() < profileDeadline) {
      const snapshot = await firestore.getDoc(profileRef);
      const data = snapshot.exists() ? snapshot.data() : null;
      if (data && Number.isInteger(data.roomCreateCount) && Number.isInteger(data.roomCreateLimit)) {
        profile = data;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!profile) throw new Error('Application account profile did not become room-ready after sign-in.');
    return { uid: credential.user.uid, email, displayName };
  }, {
    email: `${label}-${runId}@example.test`,
    displayName: label.replaceAll('-', ' '),
    accountPassword: password
  });
  return { context, page, identity, ...diagnostics };
}

async function startBaltimoreWorld(page) {
  if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
    await page.locator('#globeSelectorStartBtn').click();
    await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 30_000 });
  }
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 300_000 });
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.modes?.walking === true;
  }, null, { timeout: 300_000 });
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const loadingVisible = document.getElementById('loading')?.classList.contains('show') === true;
    const ready = state.gameStarted === true && state.worldLoading === false && state.modes?.walking === true && !loadingVisible;
    if (!ready) {
      globalThis.__WE3D_STABLE_WALKING_READY_SINCE__ = 0;
      return false;
    }
    globalThis.__WE3D_STABLE_WALKING_READY_SINCE__ ||= performance.now();
    return performance.now() - globalThis.__WE3D_STABLE_WALKING_READY_SINCE__ >= 1_500;
  }, null, { timeout: 300_000, polling: 100 });
}

async function navigateAndStartWorld(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await startBaltimoreWorld(page);
}

async function openIntegratedBlocks(page) {
  await page.locator('#realEstateFloatBtn').click();
  await page.locator('#fEditorMode').click();
  await page.locator('#editorPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#starInfo').isVisible().catch(() => false), false, 'A star-information card remained above the opened World Editor.');
  if (await page.locator('#editorTutorialStartBtn').isVisible().catch(() => false)) {
    await page.locator('#editorTutorialStartBtn').click();
  }
  await page.locator('#editorTabBlocks').click();
  await page.locator('#blockBuilderPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder?.enabled === true, null, { timeout: 30_000 });
}

async function installEditorEntryStarObstruction(page) {
  await page.evaluate(() => {
    let info = document.getElementById('starInfo');
    if (!info) {
      info = document.createElement('div');
      info.id = 'starInfo';
      document.body.appendChild(info);
    }
    info.textContent = 'Injected visible star selection for editor-entry acceptance';
    Object.assign(info.style, {
      display: 'block',
      position: 'fixed',
      left: '28%',
      top: '0',
      width: '44%',
      height: '180px',
      zIndex: '99999',
      pointerEvents: 'auto'
    });
  });
}

async function exposedCanvasPoint(page, avoidPoint = null) {
  const point = await page.evaluate((avoid) => {
    const canvas = [...document.querySelectorAll('canvas')].find((entry) => {
      const rect = entry.getBoundingClientRect();
      const style = getComputedStyle(entry);
      return rect.width >= innerWidth * 0.8 && rect.height >= innerHeight * 0.8 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const yRatios = innerWidth <= 640
      ? [0.44, 0.40, 0.36, 0.32, 0.28]
      : [0.58, 0.66, 0.50, 0.74];
    for (const yRatio of yRatios) {
      for (const xRatio of [0.44, 0.52, 0.36, 0.60]) {
        const x = rect.left + rect.width * xRatio;
        const y = rect.top + rect.height * yRatio;
        const farEnough = !avoid || Math.hypot(x - avoid.x, y - avoid.y) >= 120;
        if (farEnough && document.elementFromPoint(x, y) === canvas) return { x, y };
      }
    }
    return null;
  }, avoidPoint);
  assert.ok(point, 'The integrated Blocks panel did not leave a visible world-canvas point for placement.');
  return point;
}

async function projectedBlockPoint(page) {
  const readPoint = () => page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const group = ctx.scene?.getObjectByName?.('buildBlocksGroup');
      const canvas = ctx.renderer?.domElement;
      const meshes = (group?.children || []).filter((entry) => entry?.userData?.isBuildBlock === true);
      if (meshes.length === 0 || !canvas || !ctx.camera) return null;
      group.updateMatrixWorld(true);
      ctx.camera.updateMatrixWorld(true);
      const rect = canvas.getBoundingClientRect();
      const raycaster = new globalThis.THREE.Raycaster();
      const pointer = new globalThis.THREE.Vector2();
      let lastCover = '';
      for (const mesh of meshes) {
        const box = new globalThis.THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new globalThis.THREE.Vector3()).project(ctx.camera);
        const candidates = [
          [center.x, center.y],
          [center.x - 0.01, center.y],
          [center.x + 0.01, center.y],
          [center.x, center.y - 0.01],
          [center.x, center.y + 0.01]
        ];
        for (const [ndcX, ndcY] of candidates) {
          const x = rect.left + (ndcX + 1) * 0.5 * rect.width;
          const y = rect.top + (1 - ndcY) * 0.5 * rect.height;
          const target = document.elementFromPoint(x, y);
          if (target !== canvas) {
            lastCover = `${target?.tagName || 'none'}#${target?.id || ''}.${target?.className || ''}`;
            continue;
          }
          pointer.set(ndcX, ndcY);
          raycaster.setFromCamera(pointer, ctx.camera);
          const hit = raycaster.intersectObjects(meshes, false)[0];
          if (hit?.object === mesh) return { x, y, canvasExposed: true, rayHitsBlock: true, coveringElement: '' };
        }
      }
      return { x: NaN, y: NaN, canvasExposed: false, rayHitsBlock: false, coveringElement: lastCover || 'no visible ray-hit pixel' };
    });
  let point = await readPoint();
  for (let attempt = 0; point && !point.canvasExposed && attempt < 8; attempt++) {
    const dragStart = await exposedCanvasPoint(page);
    const deltaX = attempt % 2 === 0 ? 90 + attempt * 12 : -110 - attempt * 12;
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(dragStart.x + deltaX, dragStart.y, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(150);
    point = await readPoint();
  }
  assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'Could not project a rendered block to the interaction canvas.');
  assert.equal(point.canvasExposed, true, `Projected block point was covered by ${point.coveringElement || 'an unknown element'}.`);
  assert.equal(point.rayHitsBlock, true, 'Projected block point did not produce a real camera ray hit on the rendered block.');
  return point;
}

async function waitForBlockCount(page, count, shared = null) {
  try {
    await page.waitForFunction(({ expectedCount, expectedShared }) => {
      const snapshot = globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder || {};
      return Number(snapshot.count) === expectedCount &&
        (expectedShared === null || snapshot.shared === expectedShared);
    }, { expectedCount: count, expectedShared: shared }, { timeout: 30_000 });
  } catch (error) {
    const evidence = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const room = ctx.getCurrentMultiplayerRoom?.() || null;
      return {
        blockBuilder: globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder || null,
        blockStatus: document.getElementById('blockBuilderStatus')?.textContent || '',
        roomStatus: document.getElementById('roomPanelStatus')?.textContent || document.getElementById('mpTitleStatus')?.textContent || '',
        roomCode: String(room?.code || '')
      };
    });
    throw new Error(`Timed out waiting for ${count} ${shared === null ? '' : shared ? 'shared ' : 'local '}block(s): ${JSON.stringify(evidence)}`, { cause: error });
  }
  return page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder || null);
}

async function inspectFirstBlockCollision(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const group = ctx.scene?.getObjectByName?.('buildBlocksGroup');
    const mesh = group?.children?.find((entry) => entry?.userData?.isBuildBlock === true);
    if (!mesh) return null;
    const centerY = Number(mesh.userData.gy);
    const feetY = centerY - 0.5;
    return {
      block: {
        gx: mesh.userData.gx,
        gy: mesh.userData.gy,
        gz: mesh.userData.gz,
        shape: mesh.userData.shape
      },
      pedestrian: ctx.getBuildCollisionAtWorldXZ?.(mesh.position.x, mesh.position.z, feetY, 0.65, 1.7) || null,
      topSurfaceY: ctx.getBuildTopSurfaceAtWorldXZ?.(mesh.position.x, mesh.position.z, Infinity) ?? null
    };
  });
}

async function runWalkingCollisionJourney(page, bypassBlockCollision = false) {
  const setup = await page.evaluate(async (bypass) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const group = ctx.scene?.getObjectByName?.('buildBlocksGroup');
    const mesh = group?.children?.find((entry) => entry?.userData?.isBuildBlock === true);
    const walker = ctx.Walk?.state?.walker;
    if (!mesh || !walker) return null;
    if (!globalThis.__WE3D_ORIGINAL_BLOCK_COLLISION__) {
      globalThis.__WE3D_ORIGINAL_BLOCK_COLLISION__ = ctx.getBuildCollisionAtWorldXZ;
    }
    ctx.getBuildCollisionAtWorldXZ = bypass
      ? () => ({ blocked: false, stepTopY: null, shape: null })
      : globalThis.__WE3D_ORIGINAL_BLOCK_COLLISION__;
    const blockBottomY = Number(mesh.userData.gy) - 0.5;
    walker.x = mesh.position.x;
    walker.z = mesh.position.z - 2;
    walker.y = blockBottomY + 1.7;
    walker.vy = 0;
    walker.angle = 0;
    walker.yaw = 0;
    walker.lookYawOffset = 0;
    walker.pitch = 0;
    return { blockX: mesh.position.x, blockZ: mesh.position.z, startZ: walker.z };
  }, bypassBlockCollision);
  assert.ok(setup, 'Could not create the walking collision fixture from the rendered block.');
  const samples = [];
  await page.keyboard.down('ArrowUp');
  for (let index = 0; index < 80; index += 1) {
    await page.waitForTimeout(25);
    samples.push(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const walker = ctx.Walk?.state?.walker;
      return walker ? { x: Number(walker.x), z: Number(walker.z) } : null;
    }));
  }
  await page.keyboard.up('ArrowUp');
  const validSamples = samples.filter((sample) => Number.isFinite(sample?.x) && Number.isFinite(sample?.z));
  assert.ok(validSamples.length > 0, 'Walking diagnostics did not publish actor positions.');
  const result = validSamples.at(-1);
  return {
    ...setup,
    endX: result.x,
    endZ: result.z,
    maxZ: Math.max(...validSamples.map((sample) => sample.z)),
    bypassBlockCollision
  };
}

async function restoreWalkingCollisionAuthority(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (globalThis.__WE3D_ORIGINAL_BLOCK_COLLISION__) {
      ctx.getBuildCollisionAtWorldXZ = globalThis.__WE3D_ORIGINAL_BLOCK_COLLISION__;
    }
  });
}

async function replaceVisibleBlockFixture(page, shape) {
  await openIntegratedBlocks(page);
  const current = await page.evaluate(() => Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder?.count) || 0);
  if (current > 0) {
    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('#blockBuilderClear').click();
    await waitForBlockCount(page, 0, false);
  }
  await page.locator(`[data-block-shape="${shape}"]`).click();
  const point = await exposedCanvasPoint(page);
  await page.mouse.click(point.x, point.y);
  await waitForBlockCount(page, 1, false);
  const rendered = await readRenderedBlocks(page);
  assert.equal(rendered.length, 1, `Visible ${shape} fixture placement did not render exactly one piece.`);
  assert.equal(rendered[0].shape, shape, `Visible fixture selector requested ${shape} but rendered ${rendered[0].shape}.`);
  return rendered[0];
}

async function switchToDrivingThroughVisibleUi(page) {
  if (await page.locator('#blockBuilderClose').isVisible().catch(() => false)) {
    await page.locator('#blockBuilderClose').click();
  }
  await page.locator('#exploreBtn').click();
  await page.locator('#exploreMenu.open #fDriving').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#fDriving').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.modes?.walking === false &&
      document.getElementById('fDriving')?.classList.contains('on') === true;
  }, null, { timeout: 30_000 });
}

async function runVehicleBlockJourney(page, shape, bypassBlockAuthority = false) {
  const setup = await page.evaluate(async ({ expectedShape, bypass }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const group = ctx.scene?.getObjectByName?.('buildBlocksGroup');
    const mesh = group?.children?.find((entry) => entry?.userData?.isBuildBlock === true && entry.userData.shape === expectedShape);
    if (!mesh || !ctx.car) return null;
    if (!globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_CONTACT__) {
      globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_CONTACT__ = ctx.getBuildVehicleContact;
      globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_SURFACE__ = ctx.getBuildVehicleSurfaceAtWorldXZ;
    }
    ctx.getBuildVehicleContact = bypass
      ? () => ({ blocked: false, supportTopY: null, shape: null })
      : globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_CONTACT__;
    ctx.getBuildVehicleSurfaceAtWorldXZ = bypass
      ? () => null
      : globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_SURFACE__;
    const startX = mesh.position.x;
    const startZ = mesh.position.z - 6;
    const driveY = Number(ctx.SurfaceQuery?.driveAt?.(startX, startZ, { preferRoad: false })?.position?.y);
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(startX, startZ)?.position?.y);
    const feetY = Number.isFinite(driveY) ? driveY : Number.isFinite(terrainY) ? terrainY : Number(mesh.userData.gy) - 0.5;
    Object.assign(ctx.car, {
      x: startX,
      z: startZ,
      y: feetY + 1.2,
      angle: 0,
      speed: 0,
      vFwd: 0,
      vLat: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      yawRate: 0,
      throttleSm: 0,
      steerSm: 0,
      rearSlip: 0,
      _lastSurfaceY: feetY
    });
    ctx.carMesh?.position?.set?.(startX, feetY + 1.2, startZ);
    return {
      shape: expectedShape,
      blockX: mesh.position.x,
      blockZ: mesh.position.z,
      startX,
      startZ,
      startY: feetY + 1.2,
      bypassBlockAuthority: bypass
    };
  }, { expectedShape: shape, bypass: bypassBlockAuthority });
  assert.ok(setup, `Could not prepare the visible ${shape} fixture for the driving controller.`);

  const samples = [];
  await page.keyboard.down('ArrowUp');
  for (let index = 0; index < 80; index += 1) {
    await page.waitForTimeout(25);
    samples.push(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return { x: Number(ctx.car?.x), y: Number(ctx.car?.y), z: Number(ctx.car?.z), speed: Number(ctx.car?.speed) };
    }));
  }
  await page.keyboard.up('ArrowUp');
  const validSamples = samples.filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.z));
  assert.ok(validSamples.length > 0, `Driving diagnostics did not publish actor positions for ${shape}.`);
  const end = validSamples.at(-1);
  const closestToFixture = validSamples.reduce((closest, sample) =>
    Math.abs(sample.z - setup.blockZ) < Math.abs(closest.z - setup.blockZ) ? sample : closest
  );
  const fixtureSamples = validSamples.filter((sample) => Math.abs(sample.z - setup.blockZ) <= 0.65);
  return {
    ...setup,
    endX: end.x,
    endY: end.y,
    endZ: end.z,
    maxY: Math.max(...validSamples.map((sample) => sample.y)),
    maxZ: Math.max(...validSamples.map((sample) => sample.z)),
    maxSpeed: Math.max(...validSamples.map((sample) => Math.abs(sample.speed))),
    closestFixtureDistance: Math.abs(closestToFixture.z - setup.blockZ),
    closestFixtureY: closestToFixture.y,
    peakFixtureY: fixtureSamples.length > 0 ? Math.max(...fixtureSamples.map((sample) => sample.y)) : null
  };
}

async function restoreVehicleBlockAuthority(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_CONTACT__) {
      ctx.getBuildVehicleContact = globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_CONTACT__;
      ctx.getBuildVehicleSurfaceAtWorldXZ = globalThis.__WE3D_ORIGINAL_VEHICLE_BLOCK_SURFACE__;
    }
  });
}

async function resetWalkerFacingFirstBlock(page) {
  const reset = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const group = ctx.scene?.getObjectByName?.('buildBlocksGroup');
    const mesh = group?.children?.find((entry) => entry?.userData?.isBuildBlock === true);
    const walker = ctx.Walk?.state?.walker;
    if (!mesh || !walker) return false;
    walker.x = mesh.position.x;
    walker.z = mesh.position.z - 2;
    walker.y = Number(mesh.userData.gy) - 0.5 + 1.7;
    walker.vy = 0;
    walker.angle = 0;
    walker.yaw = 0;
    walker.lookYawOffset = 0;
    walker.pitch = 0;
    return true;
  });
  assert.equal(reset, true, 'Could not reset the walker for the second visible placement.');
  await page.waitForTimeout(300);
}

async function injectPrimaryStorageFailure(page) {
  await page.evaluate(() => {
    if (!globalThis.__WE3D_ORIGINAL_STORAGE_SET_ITEM__) {
      globalThis.__WE3D_ORIGINAL_STORAGE_SET_ITEM__ = Storage.prototype.setItem;
    }
    Storage.prototype.setItem = function setItemWithBlockFailure(key, value) {
      if (key === 'worldExplorer3D.buildBlocks.v1') throw new Error('injected Blocks primary write failure');
      return globalThis.__WE3D_ORIGINAL_STORAGE_SET_ITEM__.call(this, key, value);
    };
  });
}

async function restoreStorageWrites(page) {
  await page.evaluate(() => {
    if (globalThis.__WE3D_ORIGINAL_STORAGE_SET_ITEM__) {
      Storage.prototype.setItem = globalThis.__WE3D_ORIGINAL_STORAGE_SET_ITEM__;
    }
  });
}

async function readLocalRows(page) {
  return page.evaluate(() => {
    const parse = (key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    };
    return {
      primary: parse('worldExplorer3D.buildBlocks.v1'),
      backup: parse('worldExplorer3D.buildBlocks.backup.v1')
    };
  });
}

async function readLocalRawCopies(page) {
  return page.evaluate(() => ({
    primary: localStorage.getItem('worldExplorer3D.buildBlocks.v1'),
    backup: localStorage.getItem('worldExplorer3D.buildBlocks.backup.v1')
  }));
}

async function writeLocalRawCopies(page, copies) {
  await page.evaluate(({ primary, backup }) => {
    const write = (key, value) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    };
    write('worldExplorer3D.buildBlocks.v1', primary);
    write('worldExplorer3D.buildBlocks.backup.v1', backup);
  }, copies);
}

async function corruptLocalCopies(page, target) {
  await page.evaluate((copyTarget) => {
    if (copyTarget === 'primary' || copyTarget === 'both') {
      localStorage.setItem('worldExplorer3D.buildBlocks.v1', '{damaged-primary');
    }
    if (copyTarget === 'both') {
      localStorage.setItem('worldExplorer3D.buildBlocks.backup.v1', '{damaged-backup');
    }
  }, target);
}

async function readLocalPersistence(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      persistence: ctx.getBuildPersistenceStatus?.() || null,
      status: document.getElementById('blockBuilderStatus')?.textContent || ''
    };
  });
}

async function openVisibleMultiplayerTab(page) {
  const multiplayerRailButton = page.locator('[data-globe-destination="multiplayer"]');
  await multiplayerRailButton.waitFor({ state: 'visible', timeout: 30_000 });
  await multiplayerRailButton.click();
  await page.locator('#globeHubOverlay:not([hidden])').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#tab-multiplayer').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = document.getElementById('mpPlanState')?.textContent || '';
    return !/sign in to access/i.test(state);
  }, null, { timeout: 30_000 });
}

async function readCurrentRoom(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const room = ctx.getCurrentMultiplayerRoom?.() || null;
    return room ? {
      id: String(room.id || room.code || ''),
      code: String(room.code || room.id || ''),
      name: String(room.name || ''),
      ownerUid: String(room.ownerUid || '')
    } : null;
  });
}

async function waitForCurrentRoom(page, expectedCode = '') {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const room = await readCurrentRoom(page);
    if (room?.code && (!expectedCode || room.code === expectedCode)) return room;
    await page.waitForTimeout(100);
  }
  const status = await page.locator('#mpTitleStatus').textContent().catch(() => '');
  throw new Error(`Visible room state did not activate${expectedCode ? ` ${expectedCode}` : ''}. UI status: ${status || 'none'}`);
}

async function createRoomThroughVisibleTitleUi(page) {
  await openVisibleMultiplayerTab(page);
  await page.locator('#mpTitleVisibilitySelect').selectOption('private');
  await page.locator('#mpTitleRoomNameInput').fill(`Blocks acceptance ${runId}`);
  await page.locator('#mpTitleLocationTagInput').fill('Baltimore Inner Harbor');
  await page.locator('#mpTitleCreateBtn').click();
  return waitForCurrentRoom(page);
}

async function joinRoomThroughVisibleTitleUi(page, roomCode) {
  await openVisibleMultiplayerTab(page);
  await page.locator('#mpTitleCodeInput').fill(roomCode);
  await page.locator('#mpTitleJoinBtn').click();
  return waitForCurrentRoom(page, roomCode);
}

async function readRenderedBlocks(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const group = ctx.scene?.getObjectByName?.('buildBlocksGroup');
    return (group?.children || []).filter((entry) => entry?.userData?.isBuildBlock === true).map((mesh) => ({
      id: `${mesh.userData.gx}_${mesh.userData.gy}_${mesh.userData.gz}`,
      gx: Number(mesh.userData.gx),
      gy: Number(mesh.userData.gy),
      gz: Number(mesh.userData.gz),
      materialIndex: Number(mesh.userData.materialIndex),
      shape: String(mesh.userData.shape || ''),
      rotation: Number(mesh.userData.rotation)
    })).sort((a, b) => a.id.localeCompare(b.id));
  });
}

async function readRoomBlockDocumentCount(page, roomCode) {
  return page.evaluate(async (code) => {
    const { initFirebase } = await import('/js/firebase-init.js?v=55');
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const { db } = initFirebase();
    const snapshot = await firestore.getDocs(firestore.collection(db, 'rooms', code, 'blocks'));
    return snapshot.size;
  }, roomCode);
}

async function installFakePrivateBlock(page) {
  await page.evaluate(() => {
    const fake = [{
      id: 'private-cache-negative-control',
      locationKey: '39.28305,-76.61270',
      lat: 39.28305,
      lon: -76.61270,
      gx: 777,
      gy: 0.5,
      gz: 777,
      materialIndex: 1,
      shape: 'cube',
      rotation: 0,
      createdAt: '2026-08-25T00:00:00.000Z'
    }];
    localStorage.setItem('worldExplorer3D.buildBlocks.v1', JSON.stringify(fake));
    localStorage.setItem('worldExplorer3D.buildBlocks.backup.v1', JSON.stringify(fake));
  });
}

async function executeMobileJourney() {
  phase('mobile: create 390x844 authenticated explorer');
  const explorer = await createExplorer('mobile-builder', { width: 390, height: 844 });
  phase('mobile: load Baltimore walking world');
  await startBaltimoreWorld(explorer.page);
  phase('mobile: touch-place exactly once, undo, return, and close');
  await openIntegratedBlocks(explorer.page);
  await explorer.page.locator('[data-block-shape="wall"]').tap();
  await explorer.page.locator('[data-block-material="3"]').tap();
  const placementPoint = await exposedCanvasPoint(explorer.page);
  await explorer.page.touchscreen.tap(placementPoint.x, placementPoint.y);
  const placed = await waitForBlockCount(explorer.page, 1, false);
  await explorer.page.waitForTimeout(900);
  const afterCompatibilityWindow = await waitForBlockCount(explorer.page, 1, false);
  await explorer.page.screenshot({ path: path.join(evidenceDir, 'world-editor-blocks-local-mobile.png'), fullPage: true });
  await explorer.page.locator('#blockBuilderUndo').tap();
  const afterUndo = await waitForBlockCount(explorer.page, 0, false);
  await explorer.page.locator('#blockBuilderBack').tap();
  await explorer.page.locator('#editorPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
  await explorer.page.locator('#editorCloseBtn').tap();
  await explorer.page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.blockBuilder?.enabled === false &&
      document.querySelector('#editorPanel')?.classList.contains('show') !== true;
  }, null, { timeout: 30_000 });
  return { explorer, placed, afterCompatibilityWindow, afterUndo };
}

let localExplorer;
let mobileExplorer;
let roomOwner;
let roomMember;
let roomLate;
try {
  await fs.mkdir(evidenceDir, { recursive: true });

  if (scope === 'mobile') {
    const mobile = await executeMobileJourney();
    mobileExplorer = mobile.explorer;
    const mobileChecks = {
      viewportIs390x844: (await mobileExplorer.page.viewportSize())?.width === 390 && (await mobileExplorer.page.viewportSize())?.height === 844,
      touchPlacedExactlyOnce: mobile.placed.count === 1 && mobile.afterCompatibilityWindow.count === 1,
      undoRemovedPersistedTouchBlock: mobile.afterUndo.count === 0,
      editorExitRecoveredWalkingWorld: (await mobileExplorer.page.evaluate(() => {
        const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return state.gameStarted === true && state.worldLoading === false && state.modes?.walking === true && state.blockBuilder?.enabled === false;
      })) === true,
      noBrowserErrors: mobileExplorer.browserErrors.length === 0,
      noLocalHttpFailures: mobileExplorer.localFailures.length === 0
    };
    assert.ok(Object.values(mobileChecks).every(Boolean), `Mobile World Editor Blocks verification failed: ${JSON.stringify({
      checks: mobileChecks,
      localFailures: mobileExplorer.localFailures
    })}`);
    const mobileReport = {
      ok: true,
      contract: 'integrated-world-editor-mobile-blocks-v1',
      generatedAt: new Date().toISOString(),
      writesProduction: false,
      authority: { ...runAuthority, viewport: { width: 390, height: 844 } },
      checks: mobileChecks,
      unprovedRequirements: ['WEB-03 location isolation/corruption recovery', 'WEB-04 visible Clear fault', 'WEB-05 failed-write history', 'WEB-06 vehicle/ramp physics', 'WEB-07 through WEB-10 room authority', 'WEB-12 provider mutation audit', 'WEB-13 building-system quality'],
      evidence: { screenshots: ['output/release-evidence/current/world-editor-blocks-local-mobile.png'] }
    };
    const mobileReportPath = path.join(root, 'output', 'verification', 'world-editor-blocks-mobile', 'report.json');
    await fs.mkdir(path.dirname(mobileReportPath), { recursive: true });
    await fs.writeFile(mobileReportPath, `${JSON.stringify(mobileReport, null, 2)}\n`, 'utf8');
    phase('PASS 390x844 touch and recovery checks');
    console.log(JSON.stringify(mobileReport, null, 2));
  } else if (scope === 'vehicle') {
    phase('vehicle: create authenticated desktop explorer and load Baltimore walking world');
    localExplorer = await createExplorer('vehicle-builder');
    await startBaltimoreWorld(localExplorer.page);

    const journeys = {};
    await installEditorEntryStarObstruction(localExplorer.page);
    let editorClearedStarObstruction = false;
    for (const shape of ['cube', 'wall', 'ramp']) {
      phase(`vehicle: create ${shape} through visible World Editor controls`);
      await replaceVisibleBlockFixture(localExplorer.page, shape);
      if (shape === 'cube') {
        editorClearedStarObstruction = !(await localExplorer.page.locator('#starInfo').isVisible().catch(() => false));
      }
      await switchToDrivingThroughVisibleUi(localExplorer.page);
      phase(`vehicle: drive toward ${shape} with current block authority`);
      journeys[`${shape}Authority`] = await runVehicleBlockJourney(localExplorer.page, shape, false);
      phase(`vehicle: repeat ${shape} journey with only block vehicle authority bypassed`);
      journeys[`${shape}Bypass`] = await runVehicleBlockJourney(localExplorer.page, shape, true);
      await restoreVehicleBlockAuthority(localExplorer.page);
    }

    const checks = {
      editorEntryClearedWorldSelectionCard: editorClearedStarObstruction,
      cubeStoppedBeforeFixture: journeys.cubeAuthority.maxZ < journeys.cubeAuthority.blockZ - 1,
      cubeBypassPassedFixture: journeys.cubeBypass.maxZ > journeys.cubeBypass.blockZ + 1,
      wallStoppedBeforeFixture: journeys.wallAuthority.maxZ < journeys.wallAuthority.blockZ - 1,
      wallBypassPassedFixture: journeys.wallBypass.maxZ > journeys.wallBypass.blockZ + 1,
      rampWasDriveable: journeys.rampAuthority.maxZ > journeys.rampAuthority.blockZ + 1,
      rampRunsSampledTheFixture: journeys.rampAuthority.closestFixtureDistance <= 0.65 && journeys.rampBypass.closestFixtureDistance <= 0.65,
      rampRaisedVehicleAboveBypass: Number.isFinite(journeys.rampAuthority.peakFixtureY) &&
        Number.isFinite(journeys.rampBypass.peakFixtureY) &&
        journeys.rampAuthority.peakFixtureY > journeys.rampBypass.peakFixtureY + 0.15,
      allJourneysUsedArrowUpAcceleration: Object.values(journeys).every((journey) => journey.maxSpeed > 0),
      noBrowserErrors: localExplorer.browserErrors.length === 0,
      noLocalHttpFailures: localExplorer.localFailures.length === 0
    };
    assert.ok(Object.values(checks).every(Boolean), `Vehicle World Editor Blocks verification failed: ${JSON.stringify({ checks, journeys })}`);

    const vehicleReport = {
      ok: true,
      contract: 'integrated-world-editor-vehicle-blocks-v1',
      generatedAt: new Date().toISOString(),
      writesProduction: false,
      authority: { ...runAuthority, viewport: { width: 1280, height: 720 } },
      checks,
      unprovedRequirements: ['WEB-10 disconnected upsert rollback', 'WEB-12 provider mutation audit', 'WEB-13 building-system quality'],
      evidence: { journeys }
    };
    const vehicleReportPath = path.join(root, 'output', 'verification', 'world-editor-blocks-vehicle', 'report.json');
    await fs.mkdir(path.dirname(vehicleReportPath), { recursive: true });
    await fs.writeFile(vehicleReportPath, `${JSON.stringify(vehicleReport, null, 2)}\n`, 'utf8');
    phase('PASS visible cube/wall/ramp fixtures through real driving controller input');
    console.log(JSON.stringify(vehicleReport, null, 2));
  } else if (scope === 'room') {
    phase('room: create independent owner and member accounts');
    [roomOwner, roomMember] = await Promise.all([
      createExplorer('room-owner', { width: 1280, height: 720 }, roomTitleUrl),
      createExplorer('room-member', { width: 1280, height: 720 }, roomTitleUrl)
    ]);

    phase('room: create through visible title controls');
    const createdRoom = await createRoomThroughVisibleTitleUi(roomOwner.page);
    assert.ok(createdRoom?.code, `Visible room creation did not publish a room code: ${JSON.stringify(createdRoom)}`);
    assert.equal(createdRoom.ownerUid, roomOwner.identity.uid, 'Visible room creation did not assign the authenticated owner.');
    await startBaltimoreWorld(roomOwner.page);

    phase('room: join through visible title controls');
    const joinedRoom = await joinRoomThroughVisibleTitleUi(roomMember.page, createdRoom.code);
    assert.equal(joinedRoom.code, createdRoom.code, 'Visible room join did not activate the owner room.');
    await startBaltimoreWorld(roomMember.page);
    await Promise.all([
      waitForBlockCount(roomOwner.page, 0, true),
      waitForBlockCount(roomMember.page, 0, true)
    ]);

    phase('room: owner places through the integrated editor and member converges');
    await openIntegratedBlocks(roomOwner.page);
    await waitForBlockCount(roomOwner.page, 0, true);
    const firstPlacementPoint = await exposedCanvasPoint(roomOwner.page);
    await roomOwner.page.mouse.click(firstPlacementPoint.x, firstPlacementPoint.y);
    await roomOwner.page.waitForFunction(() => Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder?.count) >= 1, null, { timeout: 30_000 });
    await roomOwner.page.waitForTimeout(1_000);
    const ownerAfterSingleCanvasClick = await roomOwner.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder || null);
    assert.equal(ownerAfterSingleCanvasClick?.count, 1, `One owner canvas click created ${ownerAfterSingleCanvasClick?.count} shared blocks.`);
    await Promise.all([
      waitForBlockCount(roomOwner.page, 1, true),
      waitForBlockCount(roomMember.page, 1, true)
    ]);
    const ownerFirstBlock = (await readRenderedBlocks(roomOwner.page))[0];
    const memberFirstBlock = (await readRenderedBlocks(roomMember.page))[0];
    const memberCollision = await inspectFirstBlockCollision(roomMember.page);
    assert.deepEqual(memberFirstBlock, ownerFirstBlock, 'Connected member did not render the exact owner block.');

    phase('room: offline member stays explicitly stale, then catches up');
    await roomMember.context.setOffline(true);
    await roomMember.page.waitForFunction(() => /offline.*stale/i.test(document.getElementById('roomPanelStatus')?.textContent || ''), null, { timeout: 15_000 });
    const ownerFirstPoint = await projectedBlockPoint(roomOwner.page);
    const secondRoomPoint = await exposedCanvasPoint(roomOwner.page, ownerFirstPoint);
    await roomOwner.page.locator('[data-block-tool="place"]').click();
    await roomOwner.page.mouse.click(secondRoomPoint.x, secondRoomPoint.y);
    await waitForBlockCount(roomOwner.page, 2, true);
    await roomMember.page.waitForTimeout(1_200);
    const memberWhileOffline = await roomMember.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().blockBuilder || null);
    assert.equal(memberWhileOffline?.count, 1, 'Offline member falsely appeared converged with the second block.');
    await roomMember.context.setOffline(false);
    await roomMember.page.waitForFunction(() => /connection restored/i.test(document.getElementById('roomPanelStatus')?.textContent || ''), null, { timeout: 15_000 });
    await waitForBlockCount(roomMember.page, 2, true);
    await roomOwner.page.locator('#blockBuilderUndo').click();
    await Promise.all([
      waitForBlockCount(roomOwner.page, 1, true),
      waitForBlockCount(roomMember.page, 1, true)
    ]);
    const committedBeforeLateJoin = await readRoomBlockDocumentCount(roomOwner.page, createdRoom.code);
    assert.equal(committedBeforeLateJoin, 1, 'Owner/member convergence was not backed by one committed room block before the late join.');

    phase('room: disconnect the original member and join a clean late client');
    await roomMember.context.close();
    roomMember = null;
    roomLate = await createExplorer('room-late', { width: 1280, height: 720 }, roomTitleUrl);
    await installFakePrivateBlock(roomLate.page);
    const lateJoinedRoom = await joinRoomThroughVisibleTitleUi(roomLate.page, createdRoom.code);
    assert.equal(lateJoinedRoom.code, createdRoom.code, 'Late client did not visibly join the owner room.');
    await startBaltimoreWorld(roomLate.page);
    const lateReadableBeforeRender = await readRoomBlockDocumentCount(roomLate.page, createdRoom.code);
    assert.equal(lateReadableBeforeRender, 1, 'Late client could not read the committed room block before render reconciliation.');
    const lateRestored = await waitForBlockCount(roomLate.page, 1, true);
    const lateFirstBlock = (await readRenderedBlocks(roomLate.page))[0];
    assert.deepEqual(lateFirstBlock, ownerFirstBlock, 'Late client did not restore the exact committed room block.');
    assert.equal(await readRoomBlockDocumentCount(roomLate.page, createdRoom.code), 1, 'Late-client render was not backed by one Firestore room block.');
    await openIntegratedBlocks(roomLate.page);
    await Promise.all([
      roomOwner.page.screenshot({ path: path.join(evidenceDir, 'world-editor-blocks-room-owner-desktop.png'), fullPage: true }),
      roomLate.page.screenshot({ path: path.join(evidenceDir, 'world-editor-blocks-room-late-desktop.png'), fullPage: true })
    ]);

    phase('room: disconnected member upsert rolls back, then the same actor recovers');
    const ownerBlockPointOnLateClient = await projectedBlockPoint(roomLate.page);
    const disconnectedPlacementPoint = await exposedCanvasPoint(roomLate.page, ownerBlockPointOnLateClient);
    await roomLate.context.setOffline(true);
    await roomLate.page.waitForFunction(() => /offline.*stale/i.test(document.getElementById('roomPanelStatus')?.textContent || ''), null, { timeout: 15_000 });
    await roomLate.page.locator('[data-block-tool="place"]').click();
    await roomLate.page.mouse.click(disconnectedPlacementPoint.x, disconnectedPlacementPoint.y);
    await roomLate.page.waitForFunction(() => /offline.*not saved|not saved.*reconnect/i.test(document.getElementById('blockBuilderStatus')?.textContent || ''), null, { timeout: 10_000 });
    const lateAfterDisconnectedUpsert = await waitForBlockCount(roomLate.page, 1, true);
    const committedAfterDisconnectedUpsert = await readRoomBlockDocumentCount(roomOwner.page, createdRoom.code);
    assert.equal(committedAfterDisconnectedUpsert, 1, 'Disconnected upsert changed committed room data.');
    await roomLate.context.setOffline(false);
    await roomLate.page.waitForFunction(() => /connection restored/i.test(document.getElementById('roomPanelStatus')?.textContent || ''), null, { timeout: 15_000 });
    await roomLate.page.locator('[data-block-tool="place"]').click();
    await roomLate.page.mouse.click(disconnectedPlacementPoint.x, disconnectedPlacementPoint.y);
    const [lateAfterRecoveredUpsert, ownerAfterRecoveredUpsert] = await Promise.all([
      waitForBlockCount(roomLate.page, 2, true),
      waitForBlockCount(roomOwner.page, 2, true)
    ]);
    assert.equal(await readRoomBlockDocumentCount(roomOwner.page, createdRoom.code), 2, 'Recovered same-actor upsert was not committed.');
    await roomLate.page.locator('#blockBuilderUndo').click();
    const [lateAfterRecoveredUndo, ownerAfterRecoveredUndo] = await Promise.all([
      waitForBlockCount(roomLate.page, 1, true),
      waitForBlockCount(roomOwner.page, 1, true)
    ]);
    assert.equal(await readRoomBlockDocumentCount(roomOwner.page, createdRoom.code), 1, 'Recovered upsert cleanup did not converge.');

    phase('room: rules-denied member removal rolls back honestly');
    await roomLate.page.locator('[data-block-tool="remove"]').click();
    const deniedRemovalPoint = await projectedBlockPoint(roomLate.page);
    await roomLate.page.mouse.click(deniedRemovalPoint.x, deniedRemovalPoint.y);
    await roomLate.page.waitForFunction(() => /could not remove block from this room/i.test(document.getElementById('blockBuilderStatus')?.textContent || ''), null, { timeout: 30_000 });
    const lateAfterDeniedRemoval = await waitForBlockCount(roomLate.page, 1, true);
    const lateAfterRollbackBlock = (await readRenderedBlocks(roomLate.page))[0];
    const ownerAfterDeniedRemoval = await waitForBlockCount(roomOwner.page, 1, true);
    assert.deepEqual(lateAfterRollbackBlock, ownerFirstBlock, 'Rejected member removal did not restore the exact owner block.');
    assert.equal(await readRoomBlockDocumentCount(roomOwner.page, createdRoom.code), 1, 'Rejected member removal changed committed room data.');

    phase('room: authorized owner removal converges and private cache stays hidden');
    await roomOwner.page.locator('[data-block-tool="remove"]').click();
    const authorizedRemovalPoint = await projectedBlockPoint(roomOwner.page);
    await roomOwner.page.mouse.click(authorizedRemovalPoint.x, authorizedRemovalPoint.y);
    const [ownerRemoved, lateRemoved] = await Promise.all([
      waitForBlockCount(roomOwner.page, 0, true),
      waitForBlockCount(roomLate.page, 0, true)
    ]);
    assert.equal(await readRoomBlockDocumentCount(roomOwner.page, createdRoom.code), 0, 'Authorized owner removal did not delete the Firestore room block.');
    const privateRowsStillPresent = await readLocalRows(roomLate.page);

    const roomChecks = {
      ownerCreatedThroughVisibleUi: createdRoom.ownerUid === roomOwner.identity.uid,
      memberJoinedThroughVisibleUi: joinedRoom.code === createdRoom.code,
      connectedMemberRenderedExactBlock: JSON.stringify(memberFirstBlock) === JSON.stringify(ownerFirstBlock),
      connectedMemberCollisionAuthorityObserved: memberCollision?.pedestrian?.blocked === true,
      offlineMemberWasExplicitlyStale: memberWhileOffline?.count === 1,
      reconnectedMemberCaughtUp: true,
      originalMemberDisconnectedBeforeLateJoin: roomMember === null,
      committedRoomBlockExistedBeforeLateJoin: committedBeforeLateJoin === 1,
      lateClientCouldReadCommittedBlockBeforeRender: lateReadableBeforeRender === 1,
      lateClientRestoredExactFirestoreBlock: lateRestored.count === 1 && JSON.stringify(lateFirstBlock) === JSON.stringify(ownerFirstBlock),
      disconnectedUpsertRolledBackWithoutCommit: lateAfterDisconnectedUpsert.count === 1 &&
        committedAfterDisconnectedUpsert === 1 && lateAfterDisconnectedUpsert.persistence?.shared?.connected === false,
      sameActorRecoveredAfterReconnect: lateAfterRecoveredUpsert.count === 2 && ownerAfterRecoveredUpsert.count === 2 &&
        lateAfterRecoveredUndo.count === 1 && ownerAfterRecoveredUndo.count === 1,
      rejectedMemberRemovalRolledBackExactBlock: lateAfterDeniedRemoval.count === 1 && ownerAfterDeniedRemoval.count === 1 && JSON.stringify(lateAfterRollbackBlock) === JSON.stringify(ownerFirstBlock),
      authorizedOwnerRemovalConverged: ownerRemoved.count === 0 && lateRemoved.count === 0,
      privateCacheDidNotMasqueradeAsRoomData: privateRowsStillPresent.primary.length === 1 && lateRemoved.shared === true && lateRemoved.count === 0,
      noBrowserErrors: [roomOwner, roomLate].every((entry) => entry.browserErrors.length === 0),
      noLocalHttpFailures: [roomOwner, roomLate].every((entry) => entry.localFailures.length === 0)
    };
    assert.ok(Object.values(roomChecks).every(Boolean), `Room World Editor Blocks verification failed: ${JSON.stringify(roomChecks)}`);

    const roomReport = {
      ok: true,
      contract: 'integrated-world-editor-room-blocks-v1',
      generatedAt: new Date().toISOString(),
      writesProduction: false,
      authority: { ...runAuthority, viewport: { width: 1280, height: 720 } },
      checks: roomChecks,
      unprovedRequirements: ['WEB-06 vehicle/ramp physics', 'WEB-12 provider mutation audit', 'WEB-13 building-system quality'],
      evidence: {
        roomCode: createdRoom.code,
        ownerBlock: ownerFirstBlock,
        memberCollision,
        memberCountWhileOffline: memberWhileOffline.count,
        disconnectedUpsert: {
          rolledBackCount: lateAfterDisconnectedUpsert.count,
          committedCount: committedAfterDisconnectedUpsert,
          recoveredCount: lateAfterRecoveredUpsert.count,
          recoveredUndoCount: lateAfterRecoveredUndo.count
        },
        screenshots: [
          'output/release-evidence/current/world-editor-blocks-room-owner-desktop.png',
          'output/release-evidence/current/world-editor-blocks-room-late-desktop.png'
        ]
      }
    };
    const roomReportPath = path.join(root, 'output', 'verification', 'world-editor-blocks-room', 'report.json');
    await fs.mkdir(path.dirname(roomReportPath), { recursive: true });
    await fs.writeFile(roomReportPath, `${JSON.stringify(roomReport, null, 2)}\n`, 'utf8');
    phase('PASS visible room, offline recovery, late-client, and rules rollback checks');
    console.log(JSON.stringify(roomReport, null, 2));
  } else {
  phase('local: create authenticated explorer');
  localExplorer = await createExplorer('local-builder');
  phase('local: load Baltimore walking world');
  await startBaltimoreWorld(localExplorer.page);
  phase('local: open integrated Blocks tool and place through canvas');
  await openIntegratedBlocks(localExplorer.page);
  const localPlacementPoint = await exposedCanvasPoint(localExplorer.page);
  await localExplorer.page.mouse.click(localPlacementPoint.x, localPlacementPoint.y);
  const localPlaced = await waitForBlockCount(localExplorer.page, 1, false);
  const localRowsAfterPlacement = await readLocalRows(localExplorer.page);
  const localCollision = await inspectFirstBlockCollision(localExplorer.page);
  await localExplorer.page.screenshot({ path: path.join(evidenceDir, 'world-editor-blocks-local-desktop.png'), fullPage: true });

  phase('local: prove rejected storage removal keeps rendered and committed state');
  await injectPrimaryStorageFailure(localExplorer.page);
  await localExplorer.page.locator('[data-block-tool="remove"]').click();
  const failedRemovalPoint = await projectedBlockPoint(localExplorer.page);
  await localExplorer.page.mouse.click(failedRemovalPoint.x, failedRemovalPoint.y);
  await localExplorer.page.waitForFunction(() => /kept in the world/i.test(document.querySelector('#blockBuilderStatus')?.textContent || ''), null, { timeout: 10_000 });
  const localAfterRejectedRemoval = await waitForBlockCount(localExplorer.page, 1, false);
  const localRowsAfterRejectedRemoval = await readLocalRows(localExplorer.page);
  await restoreStorageWrites(localExplorer.page);

  phase('local: reload full page and restore location build');
  await navigateAndStartWorld(localExplorer.page, launchUrl);
  await openIntegratedBlocks(localExplorer.page);
  const localReloaded = await waitForBlockCount(localExplorer.page, 1, false);

  phase('local: navigate with the same browser storage to a distinct location and require isolation');
  await navigateAndStartWorld(localExplorer.page, alternateLaunchUrl);
  await openIntegratedBlocks(localExplorer.page);
  const alternateLocationEmpty = await waitForBlockCount(localExplorer.page, 0, false);
  const rowsWhileAtAlternateLocation = await readLocalRows(localExplorer.page);

  phase('local: return to Baltimore and require the exact saved build');
  await navigateAndStartWorld(localExplorer.page, launchUrl);
  await openIntegratedBlocks(localExplorer.page);
  const localAfterLocationReturn = await waitForBlockCount(localExplorer.page, 1, false);
  const rowsAfterLocationReturn = await readLocalRows(localExplorer.page);

  phase('local: corrupt the primary copy and require visible backup recovery');
  const healthyRawCopies = await readLocalRawCopies(localExplorer.page);
  await corruptLocalCopies(localExplorer.page, 'primary');
  await navigateAndStartWorld(localExplorer.page, launchUrl);
  await openIntegratedBlocks(localExplorer.page);
  const localAfterBackupRecovery = await waitForBlockCount(localExplorer.page, 1, false);
  const backupRecoveryState = await readLocalPersistence(localExplorer.page);
  const rowsAfterBackupRecovery = await readLocalRows(localExplorer.page);

  phase('local: corrupt both copies and require an honest safe-empty state');
  await corruptLocalCopies(localExplorer.page, 'both');
  await navigateAndStartWorld(localExplorer.page, launchUrl);
  await openIntegratedBlocks(localExplorer.page);
  const localAfterBothCorrupt = await waitForBlockCount(localExplorer.page, 0, false);
  const bothCorruptState = await readLocalPersistence(localExplorer.page);

  phase('local: restore the healthy fixture and resume normal player actions');
  await writeLocalRawCopies(localExplorer.page, healthyRawCopies);
  await navigateAndStartWorld(localExplorer.page, launchUrl);
  await openIntegratedBlocks(localExplorer.page);
  await waitForBlockCount(localExplorer.page, 1, false);

  phase('local: place a distinct second piece and undo through visible controls');
  await resetWalkerFacingFirstBlock(localExplorer.page);
  await localExplorer.page.locator('[data-block-tool="place"]').click();
  const firstBlockPoint = await projectedBlockPoint(localExplorer.page);
  const secondPlacementPoint = await exposedCanvasPoint(localExplorer.page, firstBlockPoint);
  await localExplorer.page.mouse.click(secondPlacementPoint.x, secondPlacementPoint.y);
  await waitForBlockCount(localExplorer.page, 2, false);
  await localExplorer.page.locator('#blockBuilderUndo').click();
  const localAfterUndo = await waitForBlockCount(localExplorer.page, 1, false);

  phase('local: remove and undo the original piece through visible controls');
  await localExplorer.page.locator('[data-block-tool="remove"]').click();
  const normalRemovalPoint = await projectedBlockPoint(localExplorer.page);
  await localExplorer.page.mouse.click(normalRemovalPoint.x, normalRemovalPoint.y);
  await waitForBlockCount(localExplorer.page, 0, false);
  await localExplorer.page.locator('#blockBuilderUndo').click();
  const localAfterRemovalUndo = await waitForBlockCount(localExplorer.page, 1, false);
  const localRowsAfterRemovalUndo = await readLocalRows(localExplorer.page);

  phase('local: prove real ArrowUp controller collision and its negative control');
  await localExplorer.page.locator('#blockBuilderClose').click();
  const walkingBlocked = await runWalkingCollisionJourney(localExplorer.page, false);
  const walkingBypassed = await runWalkingCollisionJourney(localExplorer.page, true);
  await restoreWalkingCollisionAuthority(localExplorer.page);
  await resetWalkerFacingFirstBlock(localExplorer.page);
  await openIntegratedBlocks(localExplorer.page);

  phase('local: prove a failed visible Clear keeps rendered and committed state');
  await injectPrimaryStorageFailure(localExplorer.page);
  localExplorer.page.once('dialog', (dialog) => void dialog.accept());
  await localExplorer.page.locator('#blockBuilderClear').click();
  await localExplorer.page.waitForFunction(() => /could not save that clear.*blocks were kept/i.test(document.querySelector('#blockBuilderStatus')?.textContent || ''), null, { timeout: 10_000 });
  const localAfterRejectedClear = await waitForBlockCount(localExplorer.page, 1, false);
  const localRowsAfterRejectedClear = await readLocalRows(localExplorer.page);
  await restoreStorageWrites(localExplorer.page);

  phase('local: restore storage, reload, and clear through visible confirmed controls');
  await navigateAndStartWorld(localExplorer.page, launchUrl);
  await openIntegratedBlocks(localExplorer.page);
  await waitForBlockCount(localExplorer.page, 1, false);
  localExplorer.page.once('dialog', (dialog) => void dialog.accept());
  await localExplorer.page.locator('#blockBuilderClear').click();
  const localAfterClear = await waitForBlockCount(localExplorer.page, 0, false);
  const localRowsAfterClear = await readLocalRows(localExplorer.page);

  let mobileResult = null;
  if (scope === 'local') {
    mobileResult = await executeMobileJourney();
    mobileExplorer = mobileResult.explorer;
  }

  const localChecks = {
    integratedEditorOpened: localPlaced.enabled === true,
    localPlacementPersistedPrimaryAndBackup: localRowsAfterPlacement.primary.length === 1 && localRowsAfterPlacement.backup.length === 1,
    rejectedRemovalKeptRenderedBlock: localAfterRejectedRemoval.count === 1,
    rejectedRemovalKeptCommittedRecords: localRowsAfterRejectedRemoval.primary.length === 1 && localRowsAfterRejectedRemoval.backup.length === 1,
    localReloadRestoredRenderedBlock: localReloaded.count === 1,
    distinctLocationRenderedNoLeakedBlocks: alternateLocationEmpty.count === 0,
    distinctLocationPreservedOtherLocationRecords: rowsWhileAtAlternateLocation.primary.length === 1 && rowsWhileAtAlternateLocation.backup.length === 1,
    returningToOriginalLocationRestoredExactRecords: localAfterLocationReturn.count === 1 &&
      JSON.stringify(rowsAfterLocationReturn.primary) === JSON.stringify(localRowsAfterPlacement.primary),
    damagedPrimaryRecoveredExactBackup: localAfterBackupRecovery.count === 1 &&
      rowsAfterBackupRecovery.primary.length === 1 && rowsAfterBackupRecovery.backup.length === 1 &&
      JSON.stringify(rowsAfterBackupRecovery.primary) === JSON.stringify(rowsAfterBackupRecovery.backup),
    backupRecoveryWasExplainedInVisibleEditor: backupRecoveryState.persistence?.notice === 'recovered' &&
      /recovered your blocks.*backup.*main saved copy was damaged/i.test(backupRecoveryState.status),
    bothDamagedCopiesStartedSafeAndEmpty: localAfterBothCorrupt.count === 0 && bothCorruptState.persistence?.notice === 'warning',
    bothDamagedCopiesWereExplainedInVisibleEditor: /both saved block copies were damaged.*started empty/i.test(bothCorruptState.status),
    walkingControllerStoppedBeforeBlock: walkingBlocked.maxZ > walkingBlocked.startZ + 0.5 &&
      walkingBlocked.maxZ < walkingBlocked.blockZ - 0.35,
    collisionNegativeControlPassedThroughBlock: walkingBypassed.maxZ > walkingBypassed.blockZ + 0.35,
    localUndoRemovedOnlyLatestAction: localAfterUndo.count === 1,
    localRemovalUndoRestoredExactPiece: localAfterRemovalUndo.count === 1 &&
      ['gx', 'gy', 'gz', 'materialIndex', 'shape', 'rotation'].every((key) =>
        localRowsAfterRemovalUndo.primary[0]?.[key] === localRowsAfterPlacement.primary[0]?.[key]),
    rejectedClearKeptRenderedBlock: localAfterRejectedClear.count === 1,
    rejectedClearKeptCommittedRecords: localRowsAfterRejectedClear.primary.length === 1 && localRowsAfterRejectedClear.backup.length === 1,
    localClearPersisted: localAfterClear.count === 0 && localRowsAfterClear.primary.length === 0 && localRowsAfterClear.backup.length === 0,
    collisionAuthorityObserved: localCollision?.pedestrian?.blocked === true && Number.isFinite(localCollision?.topSurfaceY),
    mobileTouchPlacedExactlyOnce: scope !== 'local' || (mobileResult.placed.count === 1 && mobileResult.afterCompatibilityWindow.count === 1),
    mobileUndoAndExitRecovered: scope !== 'local' || mobileResult.afterUndo.count === 0,
    noLocalBrowserErrors: [localExplorer, mobileExplorer].filter(Boolean).every((entry) => entry.browserErrors.length === 0),
    noLocalHttpFailures: [localExplorer, mobileExplorer].filter(Boolean).every((entry) => entry.localFailures.length === 0)
  };
  assert.ok(Object.values(localChecks).every(Boolean), `Local World Editor Blocks verification failed: ${JSON.stringify({
    checks: localChecks,
    walkingBlocked,
    walkingBypassed,
    localFailures: localExplorer.localFailures,
    mobileFailures: mobileExplorer?.localFailures || []
  })}`);

  if (scope === 'local' || scope === 'desktop') {
    const localReport = {
      ok: true,
      contract: scope === 'desktop' ? 'integrated-world-editor-desktop-blocks-v1' : 'integrated-world-editor-local-blocks-v2',
      generatedAt: new Date().toISOString(),
      writesProduction: false,
      authority: { ...runAuthority, viewport: { width: 1280, height: 720 } },
      checks: localChecks,
      unprovedRequirements: ['WEB-06 vehicle/wall/ramp physics', 'WEB-10 disconnected upsert rollback', 'WEB-12 provider mutation audit', 'WEB-13 building-system quality'],
      evidence: {
        walkingBlocked,
        walkingBypassed,
        screenshots: scope === 'desktop'
          ? ['output/release-evidence/current/world-editor-blocks-local-desktop.png']
          : [
              'output/release-evidence/current/world-editor-blocks-local-desktop.png',
              'output/release-evidence/current/world-editor-blocks-local-mobile.png'
            ]
      }
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(localReport, null, 2)}\n`, 'utf8');
    phase('PASS local desktop, storage-fault, controller, and mobile checks');
    console.log(JSON.stringify(localReport, null, 2));
  }

  }
} finally {
  clearTimeout(watchdog);
  await localExplorer?.context?.close().catch(() => {});
  await mobileExplorer?.context?.close().catch(() => {});
  await roomOwner?.context?.close().catch(() => {});
  await roomMember?.context?.close().catch(() => {});
  await roomLate?.context?.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
