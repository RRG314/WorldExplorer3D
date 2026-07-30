import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { classifyEvidence } from './production-readiness.mjs';

const rootDir = process.cwd();
const outputDir = path.join(
  rootDir,
  'output',
  'playwright',
  'player-input-drive'
);
const reportPath = path.join(outputDir, 'report.json');
const requestedSeconds = Number(process.env.PLAYER_DRIVE_SECONDS || 60);
const targetSeconds = Math.max(20, requestedSeconds);
const headed = process.env.PLAYER_DRIVE_HEADED === '1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function signedAngleDelta(from, to) {
  let delta = Number(to) - Number(from);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = Number(server.address()?.port);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startPreviewServer() {
  const port = await reservePort();
  const child = spawn(process.execPath, ['scripts/serve-local-preview.mjs'], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Preview server did not start: ${stderr}`));
    }, 20000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview server exited with status ${code}: ${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      if (!String(chunk).includes('Local preview server running')) return;
      clearTimeout(timeout);
      resolve();
    });
  });
  return {
    port,
    close: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  };
}

async function launchFromUserInterface(page) {
  await page.waitForFunction(() => {
    const globe = document.getElementById('globeSelectorScreen');
    const start = document.getElementById('startBtn');
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0;
    };
    return visible(globe) || (visible(start) && !start.disabled);
  }, { timeout: 60000 });
  let globeVisible = await page.locator('#globeSelectorScreen').isVisible();
  if (!globeVisible) {
    const gamesTab = page.locator('.tab-btn[data-tab="games"]');
    if (await gamesTab.isVisible()) await gamesTab.click();
    const freeMode = page.locator('.mode[data-mode="free"]');
    if (await freeMode.isVisible()) await freeMode.click();
    await page.locator('#startBtn').click();
    await page.waitForFunction(() => {
      const titleHidden =
        document.getElementById('titleScreen')?.classList.contains('hidden');
      const selectorVisible =
        document.getElementById('globeSelectorScreen')?.classList.contains('show');
      return titleHidden || selectorVisible;
    }, { timeout: 60000 });
    globeVisible = await page.locator('#globeSelectorScreen').isVisible();
  }
  if (globeVisible) {
    await page.locator('#globeLocationSearch').fill('Baltimore, USA');
    await page.locator('#globeCustomLat').fill('39.2904');
    await page.locator('#globeCustomLon').fill('-76.6122');
    await page.locator('#globeSelectorStartBtn').click();
  }

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const deadline = performance.now() + 120000;
    let consecutiveReadySamples = 0;
    while (performance.now() < deadline && consecutiveReadySamples < 6) {
      const loading = document.getElementById('loading');
      const ready = (
        ctx?.gameStarted === true &&
        ctx?.worldLoading === false &&
        Array.isArray(ctx?.roads) &&
        ctx.roads.length > 300 &&
        Number.isFinite(Number(ctx?.car?.x)) &&
        Number.isFinite(Number(ctx?.car?.z)) &&
        !loading?.classList.contains('show')
      );
      consecutiveReadySamples = ready ? consecutiveReadySamples + 1 : 0;
      if (consecutiveReadySamples < 6) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (consecutiveReadySamples < 6) {
      throw new Error('Earth runtime never reached a stable player-ready state');
    }
  });
}

async function pose(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const surface = ctx?.SurfaceQuery?.driveAt?.(
      Number(ctx?.car?.x),
      Number(ctx?.car?.z),
      Number(ctx?.car?.y) - 1.2
    );
    const buildingCheck = ctx?.checkBuildingCollision?.(
      Number(ctx?.car?.x),
      Number(ctx?.car?.z),
      2,
      {
        actorBaseY: Number(ctx?.car?.y) - 1.2,
        actorHeight: 1.9
      }
    ) || { collision: false };
    return {
      timestamp: performance.now(),
      gameStarted: ctx?.gameStarted === true,
      paused: ctx?.paused === true,
      mode: String(ctx?.getCurrentTravelMode?.() || ''),
      actions: ctx?.readControlActions?.('drive') || null,
      x: Number(ctx?.car?.x),
      y: Number(ctx?.car?.y),
      z: Number(ctx?.car?.z),
      angle: Number(ctx?.car?.angle),
      speed: Number(ctx?.car?.speed),
      surfaceY: Number(surface?.position?.y),
      buildingCollision: buildingCheck.collision === true,
      buildingInside: buildingCheck.inside === true,
      camera: {
        x: Number(ctx?.camera?.position?.x),
        y: Number(ctx?.camera?.position?.y),
        z: Number(ctx?.camera?.position?.z)
      }
    };
  });
}

async function resetBuildingClearDriveRoute(page, route) {
  return page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const resolved = ctx.resolveSafeWorldSpawn?.(target.x, target.z, {
      mode: 'drive',
      angle: target.angle,
      preferRoad: true,
      source: 'player_drive_release_route_reset'
    });
    if (!resolved || typeof ctx.applyResolvedWorldSpawn !== 'function') {
      throw new Error('Release drive route reset could not be resolved');
    }
    const resolvedDistance = Math.hypot(
      Number(resolved.x) - Number(target.x),
      Number(resolved.z) - Number(target.z)
    );
    if (resolvedDistance > 20) {
      throw new Error(`Release drive route reset moved ${resolvedDistance.toFixed(2)} m`);
    }
    ctx.applyResolvedWorldSpawn(resolved, {
      mode: 'drive',
      syncCar: true,
      syncWalker: true
    });
    ctx.clearControlInputState?.('player-drive-route-reset');
    await new Promise((resolve) => setTimeout(resolve, 750));
    const settledDistance = Math.hypot(
      Number(ctx.car?.x) - Number(resolved.x),
      Number(ctx.car?.z) - Number(resolved.z)
    );
    const settledCollision = ctx.checkBuildingCollision?.(
      Number(ctx.car?.x),
      Number(ctx.car?.z),
      5,
      {
        actorBaseY: Number(ctx.car?.y) - 1.2,
        actorHeight: 2
      }
    );
    if (settledDistance > 5 || settledCollision?.collision) {
      throw new Error(
        `Release drive route reset was unstable (${settledDistance.toFixed(2)} m)`
      );
    }
    return {
      x: Number(ctx.car?.x),
      z: Number(ctx.car?.z),
      angle: Number(ctx.car?.angle),
      source: String(resolved.source || ''),
      onRoad: resolved.onRoad === true
    };
  }, route);
}

async function captureSpawnDiagnostic(page, name) {
  const diagnostic = await page.evaluate(async (diagnosticName) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { getWorldExplorerRuntimeDiagnostics } =
      await import('/app/js/runtime-diagnostics.js?v=1');
    const actor = ctx?.activeTransportActor?.() || null;
    const actorX = Number(actor?.position?.x);
    const actorZ = Number(actor?.position?.z);
    const actorY = Number(actor?.position?.y);
    const actorFeetOffset = {
      drive: 1.2,
      walk: 1.7,
      plane: 0.72,
      drone: 0.25,
      boat: 1.1
    }[actor?.mode] ?? 0;
    const actorFeetY = actorY - actorFeetOffset;
    const cameraX = Number(ctx?.camera?.position?.x);
    const cameraY = Number(ctx?.camera?.position?.y);
    const cameraZ = Number(ctx?.camera?.position?.z);
    const actorCollision = ctx?.checkBuildingCollision?.(
      actorX,
      actorZ,
      Number(actor?.bounds?.radius) || 2,
      {
        actorBaseY: actorFeetY,
        actorHeight: Number(actor?.bounds?.height) || 1.9
      }
    ) || { collision: false };
    const cameraBuilding = ctx?.buildingContainingPoint?.(
      cameraX,
      cameraZ,
      0.1,
      {
        y: cameraY,
        actorHeight: 0.2,
        tolerance: 0.05
      }
    ) || null;
    return {
      generatedAt: new Date().toISOString(),
      name: diagnosticName,
      actor: {
        mode: String(actor?.mode || ''),
        x: actorX,
        y: actorY,
        z: actorZ,
        feetY: actorFeetY,
        collision: actorCollision?.collision === true,
        inside: actorCollision?.inside === true,
        buildingSourceId: String(actorCollision?.building?.sourceId || '')
      },
      camera: {
        x: cameraX,
        y: cameraY,
        z: cameraZ,
        insideBuilding: !!cameraBuilding,
        buildingSourceId: String(cameraBuilding?.sourceId || '')
      },
      plane: ctx?.planeMode?.active
        ? {
            airborne: ctx.planeMode.airborne === true,
            launchKind: String(ctx.planeMode.launchKind || ''),
            launchClearanceY: Number(ctx.planeMode.launchClearanceY)
          }
        : null,
      runtime: getWorldExplorerRuntimeDiagnostics()
    };
  }, name);
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: false
  });
  await fs.writeFile(
    path.join(outputDir, `${name}.json`),
    JSON.stringify(diagnostic, null, 2)
  );
  return diagnostic;
}

async function enterDriveModeFromKeyboard(page) {
  const transitions = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const mode = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return String(ctx?.getCurrentTravelMode?.() || '');
    });
    if (mode === 'drive') return { mode, keyPresses: attempt, transitions };
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);
    const diagnostic = await captureSpawnDiagnostic(
      page,
      `mode-transition-${attempt + 1}`
    );
    transitions.push({
      mode: diagnostic.actor.mode,
      actorCollision: diagnostic.actor.collision,
      actorInside: diagnostic.actor.inside,
      cameraInsideBuilding: diagnostic.camera.insideBuilding,
      planeAirborne: diagnostic.plane?.airborne ?? null,
      planeLaunchKind: diagnostic.plane?.launchKind || null
    });
  }
  const mode = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return String(ctx?.getCurrentTravelMode?.() || '');
  });
  return { mode, keyPresses: 5, transitions };
}

async function prepareBuildingClearDriveRoute(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const candidates = [];
    const rejections = {
      unresolved: 0,
      resolvedAway: 0,
      initialCollision: 0,
      unstableSettle: 0,
      mobility: 0,
      unstableReset: 0
    };
    for (const road of ctx.roads || []) {
      const vehicleRoad = !!road &&
        road.driveable !== false &&
        (!road.networkKind || road.networkKind === 'road');
      if (!vehicleRoad || !Array.isArray(road.pts)) continue;
      const roadType = String(road.type || '').toLowerCase();
      if (/motorway|trunk|service|track/.test(roadType)) continue;
      for (let index = 0; index < road.pts.length - 1; index += 1) {
        const start = road.pts[index];
        const end = road.pts[index + 1];
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        if (length < 140) continue;
        const x = (start.x + end.x) * 0.5;
        const z = (start.z + end.z) * 0.5;
        const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y);
        const collision = ctx.checkBuildingCollision?.(x, z, 8, {
          actorBaseY: terrainY,
          actorHeight: 2
        });
        if (collision?.collision) continue;
        const angle = Math.atan2(end.x - start.x, end.z - start.z);
        const score = length + Math.min(20, Number(road.width) || 0) * 3;
        candidates.push({
          x,
          z,
          angle,
          score,
          segmentLength: length,
          roadId: String(road.id || ''),
          roadName: String(road.name || '')
        });
      }
    }
    candidates.sort((left, right) => right.score - left.score);
    let selected = null;
    for (const candidate of candidates.slice(0, 240)) {
      const resolved = ctx.resolveSafeWorldSpawn?.(candidate.x, candidate.z, {
        mode: 'drive',
        angle: candidate.angle,
        preferRoad: true,
        source: 'player_drive_release_route'
      });
      if (!resolved) {
        rejections.unresolved += 1;
        continue;
      }
      if (Math.hypot(resolved.x - candidate.x, resolved.z - candidate.z) > 20) {
        rejections.resolvedAway += 1;
        continue;
      }
      const collision = ctx.checkBuildingCollision?.(
        Number(resolved.x),
        Number(resolved.z),
        5,
        {
          actorBaseY: Number(resolved.carY) - 1.2,
          actorHeight: 2
        }
      );
      if (collision?.collision) {
        rejections.initialCollision += 1;
        continue;
      }
      ctx.applyResolvedWorldSpawn(resolved, {
        mode: 'drive',
        syncCar: true,
        syncWalker: true
      });
      ctx.clearControlInputState?.('player-drive-route-candidate');
      await new Promise((resolve) => setTimeout(resolve, 750));
      const settledDistance = Math.hypot(
        Number(ctx.car?.x) - Number(resolved.x),
        Number(ctx.car?.z) - Number(resolved.z)
      );
      const settledCollision = ctx.checkBuildingCollision?.(
        Number(ctx.car?.x),
        Number(ctx.car?.z),
        5,
        {
          actorBaseY: Number(ctx.car?.y) - 1.2,
          actorHeight: 2
        }
      );
      if (settledDistance > 5 || settledCollision?.collision) {
        rejections.unstableSettle += 1;
        continue;
      }
      const probeStartX = Number(ctx.car?.x);
      const probeStartZ = Number(ctx.car?.z);
      ctx.keys.ArrowUp = true;
      try {
        await new Promise((resolve) => setTimeout(resolve, 6000));
      } finally {
        ctx.keys.ArrowUp = false;
        ctx.clearControlInputState?.('player-drive-route-probe');
      }
      const probeDistance = Math.hypot(
        Number(ctx.car?.x) - probeStartX,
        Number(ctx.car?.z) - probeStartZ
      );
      const probeSpeed = Math.abs(Number(ctx.car?.speed) || 0);
      const probeCollision = ctx.checkBuildingCollision?.(
        Number(ctx.car?.x),
        Number(ctx.car?.z),
        2,
        {
          actorBaseY: Number(ctx.car?.y) - 1.2,
          actorHeight: 2
        }
      );
      if (
        probeDistance < 40 ||
        probeSpeed < 8 ||
        probeCollision?.collision
      ) {
        rejections.mobility += 1;
        continue;
      }
      ctx.applyResolvedWorldSpawn(resolved, {
        mode: 'drive',
        syncCar: true,
        syncWalker: true
      });
      ctx.clearControlInputState?.('player-drive-route-probe-reset');
      await new Promise((resolve) => setTimeout(resolve, 750));
      const resetDistance = Math.hypot(
        Number(ctx.car?.x) - Number(resolved.x),
        Number(ctx.car?.z) - Number(resolved.z)
      );
      if (resetDistance > 5) {
        rejections.unstableReset += 1;
        continue;
      }
      selected = {
        candidate,
        mobilityProbe: {
          distance: probeDistance,
          speed: probeSpeed
        },
        resolved: {
          ...resolved,
          x: Number(ctx.car?.x),
          z: Number(ctx.car?.z),
          angle: Number(ctx.car?.angle),
          carY: Number(ctx.car?.y)
        }
      };
      break;
    }
    if (!selected || typeof ctx.applyResolvedWorldSpawn !== 'function') {
      throw new Error(`Building-clear road spawn could not be resolved: ${JSON.stringify({
        candidateCount: candidates.length,
        attempted: Math.min(240, candidates.length),
        rejections
      })}`);
    }
    const { candidate: best, mobilityProbe, resolved } = selected;
    const collision = ctx.checkBuildingCollision?.(
      Number(ctx.car?.x),
      Number(ctx.car?.z),
      5,
      {
        actorBaseY: Number(ctx.car?.y) - 1.2,
        actorHeight: 2
      }
    );
    if (collision?.collision) {
      throw new Error('Resolved release drive route was not building-clear');
    }
    return {
      ...best,
      resolvedX: Number(resolved.x),
      resolvedZ: Number(resolved.z),
      resolvedSource: String(resolved.source || ''),
      onRoad: resolved.onRoad === true,
      mobilityProbe: {
        distance: Number(mobilityProbe.distance.toFixed(2)),
        speed: Number(mobilityProbe.speed.toFixed(2))
      }
    };
  });
}

async function holdAndSample(page, keys, durationMs, samples) {
  for (const key of keys) await page.keyboard.down(key);
  const deadline = Date.now() + durationMs;
  try {
    while (Date.now() < deadline) {
      await page.waitForTimeout(Math.min(200, Math.max(1, deadline - Date.now())));
      samples.push(await pose(page));
    }
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
}

async function holdAndSampleUntil(
  page,
  keys,
  timeoutMs,
  samples,
  predicate
) {
  for (const key of keys) await page.keyboard.down(key);
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  try {
    while (Date.now() < deadline) {
      await page.waitForTimeout(200);
      latest = await pose(page);
      samples.push(latest);
      if (predicate(latest)) return latest;
    }
    return latest;
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
}

await fs.mkdir(outputDir, { recursive: true });
const server = await startPreviewServer();
const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

let report = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/app/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await launchFromUserInterface(page);
  const launchDiagnostic = await captureSpawnDiagnostic(page, 'launch');
  const gpu = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const gl = ctx?.renderer?.getContext?.();
    const extension = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const vendor = extension ?
      gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) :
      gl?.getParameter?.(gl.VENDOR) || '';
    const renderer = extension ?
      gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) :
      gl?.getParameter?.(gl.RENDERER) || '';
    return { vendor: String(vendor), renderer: String(renderer) };
  });
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(
    `${gpu.vendor} ${gpu.renderer}`
  );
  const driveModeEntry = await enterDriveModeFromKeyboard(page);
  assert(
    driveModeEntry.mode === 'drive',
    `player input could not enter drive mode (got ${driveModeEntry.mode})`
  );
  assert(
    driveModeEntry.transitions.every((transition) =>
      !transition.actorCollision &&
      !transition.actorInside &&
      !transition.cameraInsideBuilding
    ),
    `travel transition entered building geometry: ${JSON.stringify(driveModeEntry.transitions)}`
  );
  const planeTransition = driveModeEntry.transitions.find(
    (transition) => transition.mode === 'plane'
  );
  assert(
    !planeTransition || (
      planeTransition.planeAirborne &&
      planeTransition.planeLaunchKind === 'urban_airborne'
    ),
    `dense-city plane entry was not airborne-safe: ${JSON.stringify(planeTransition)}`
  );
  const driveEntryDiagnostic = await captureSpawnDiagnostic(page, 'drive-entry');
  const driveRoute = await prepareBuildingClearDriveRoute(page);
  const driveRouteDiagnostic = await captureSpawnDiagnostic(page, 'drive-route');
  assert(
    Math.hypot(
      driveRouteDiagnostic.actor.x - driveRoute.resolvedX,
      driveRouteDiagnostic.actor.z - driveRoute.resolvedZ
    ) <= 5,
    `drive route drifted before input: ${JSON.stringify({
      route: driveRoute,
      actor: driveRouteDiagnostic.actor
    })}`
  );

  const maneuverSamples = [await pose(page)];
  const wallClockStartedAt = Date.now();

  const forwardReady = await holdAndSampleUntil(
    page,
    ['ArrowUp'],
    4000,
    maneuverSamples,
    (sample) => sample.speed > 5
  );
  if (!softwareRenderer) {
    assert(
      forwardReady?.speed > 5,
      `real input never reached forward steering speed (got ${forwardReady?.speed})`
    );
  }
  const forwardRightStart = await pose(page);
  await holdAndSample(page, ['ArrowUp', 'ArrowRight'], 1200, maneuverSamples);
  const forwardRightEnd = await pose(page);
  await resetBuildingClearDriveRoute(page, driveRoute);
  const reverseReady = await holdAndSampleUntil(
    page,
    ['ArrowDown'],
    6000,
    maneuverSamples,
    (sample) => sample.speed < -1
  );
  const reverseMotionObserved = reverseReady?.speed < -1;
  if (!softwareRenderer) {
    assert(
      reverseMotionObserved,
      `real input never reached reverse speed (got ${reverseReady?.speed})`
    );
  }

  const reverseRightStart = await pose(page);
  await holdAndSample(page, ['ArrowDown', 'ArrowRight'], 1200, maneuverSamples);
  const reverseRightEnd = await pose(page);

  const soakRoute = await resetBuildingClearDriveRoute(page, driveRoute);
  const samples = [await pose(page)];
  let direction = 1;
  let directionChanges = 0;
  let maximumRouteOffset = 0;
  const routeOffsetLimit = Math.max(
    20,
    Math.min(150, Number(driveRoute.segmentLength) * 0.5 - 80)
  );
  let remaining = Math.max(
    0,
    targetSeconds * 1000 - (Date.now() - wallClockStartedAt)
  );
  while (remaining > 0) {
    const duration = Math.min(250, remaining);
    const latest = samples.at(-1);
    const forwardX = Math.sin(soakRoute.angle);
    const forwardZ = Math.cos(soakRoute.angle);
    const routeOffset =
      (latest.x - soakRoute.x) * forwardX +
      (latest.z - soakRoute.z) * forwardZ;
    maximumRouteOffset = Math.max(maximumRouteOffset, Math.abs(routeOffset));
    if (direction > 0 && routeOffset >= routeOffsetLimit) {
      direction = -1;
      directionChanges += 1;
    } else if (direction < 0 && routeOffset <= -routeOffsetLimit) {
      direction = 1;
      directionChanges += 1;
    }
    await holdAndSample(
      page,
      [direction > 0 ? 'ArrowUp' : 'ArrowDown'],
      duration,
      samples
    );
    remaining = Math.max(
      0,
      targetSeconds * 1000 - (Date.now() - wallClockStartedAt)
    );
  }

  const wallClockSeconds = (Date.now() - wallClockStartedAt) / 1000;
  const displacements = samples.slice(1).map((sample, index) =>
    Math.hypot(
      sample.x - samples[index].x,
      sample.z - samples[index].z
    )
  );
  const sampleVelocities = samples.slice(1).map((sample, index) => {
    const elapsedSeconds = Math.max(
      0.001,
      (sample.timestamp - samples[index].timestamp) / 1000
    );
    return displacements[index] / elapsedSeconds;
  });
  const first = samples[0];
  const last = samples.at(-1);
  const cameraSpan = Math.max(
    0,
    ...samples.map((sample) => Math.hypot(
      sample.camera.x - first.camera.x,
      sample.camera.y - first.camera.y,
      sample.camera.z - first.camera.z
    ))
  );
  const finiteSurfaceSamples = samples.filter((sample) =>
    Number.isFinite(sample.surfaceY)
  );
  const maximumSurfaceGap = Math.max(
    0,
    ...finiteSurfaceSamples.map((sample) =>
      Math.abs((sample.y - 1.2) - sample.surfaceY)
    )
  );
  const forwardRightAngleDelta = signedAngleDelta(
    forwardRightStart.angle,
    forwardRightEnd.angle
  );
  const reverseRightAngleDelta = signedAngleDelta(
    reverseRightStart.angle,
    reverseRightEnd.angle
  );

  report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    location: 'Baltimore',
    targetSeconds,
    wallClockSeconds: Number(wallClockSeconds.toFixed(2)),
    sampleCount: samples.length,
    initialRuntime: {
      gameStarted: first.gameStarted,
      paused: first.paused,
      mode: first.mode,
      actions: first.actions
    },
    finalRuntime: {
      gameStarted: last.gameStarted,
      paused: last.paused,
      mode: last.mode,
      actions: last.actions
    },
    maximumObservedThrottle: Math.max(
      0,
      ...[...maneuverSamples, ...samples].map(
        (sample) => Number(sample.actions?.throttle || 0)
      )
    ),
    maximumObservedReverse: Math.max(
      0,
      ...[...maneuverSamples, ...samples].map(
        (sample) => Number(sample.actions?.reverse || 0)
      )
    ),
    reverseMotionObserved,
    maneuverSampleCount: maneuverSamples.length,
    soakDirectionChanges: directionChanges,
    routeOffsetLimit: Number(routeOffsetLimit.toFixed(2)),
    maximumRouteOffset: Number(maximumRouteOffset.toFixed(2)),
    displacement: Number(
      Math.hypot(last.x - first.x, last.z - first.z).toFixed(2)
    ),
    pathDistance: Number(
      displacements.reduce((sum, value) => sum + value, 0).toFixed(2)
    ),
    maximumStep: Number(Math.max(0, ...displacements).toFixed(3)),
    maximumSampleVelocity: Number(
      Math.max(0, ...sampleVelocities).toFixed(3)
    ),
    maximumSurfaceGap: Number(maximumSurfaceGap.toFixed(3)),
    surfaceSampleCount: finiteSurfaceSamples.length,
    cameraSpan: Number(cameraSpan.toFixed(2)),
    forwardRightAngleDelta: Number(forwardRightAngleDelta.toFixed(4)),
    reverseRightAngleDelta: Number(reverseRightAngleDelta.toFixed(4)),
    gpu: { ...gpu, softwareRenderer },
    functionalMinimums: softwareRenderer
      ? {
          sampleCount: 8,
          pathDistance: 2,
          cameraSpan: 5,
          budgetEligible: false
        }
      : {
          sampleCount: Math.max(20, targetSeconds),
          pathDistance: Math.max(20, targetSeconds * 2),
          cameraSpan: Math.max(5, targetSeconds * 0.05),
          budgetEligible: true
        },
    driveModeEntry,
    driveRoute,
    soakRoute,
    spawnDiagnostics: {
      launch: launchDiagnostic,
      driveEntry: driveEntryDiagnostic,
      driveRoute: driveRouteDiagnostic
    },
    consoleErrors,
    evidence: classifyEvidence({
      kind: 'player-gameplay',
      realInput: true,
      wallClockSeconds,
      softwareRenderer,
      visualReviewApproved: false
    })
  };

  await page.screenshot({
    path: path.join(outputDir, 'final.png'),
    fullPage: false
  });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  assert(
    wallClockSeconds >= targetSeconds - 0.5,
    `real-input drive ended early at ${wallClockSeconds.toFixed(2)} seconds`
  );
  assert(
    samples.length >= report.functionalMinimums.sampleCount,
    `real-input sampling was too sparse: ${samples.length} samples`
  );
  assert(
    report.pathDistance >= report.functionalMinimums.pathDistance,
    `real-input drive moved only ${report.pathDistance} m`
  );
  assert(
    report.maximumSampleVelocity <= 160,
    `real-input drive exceeded modeled velocity at ${report.maximumSampleVelocity} m/s`
  );
  assert(
    report.maximumRouteOffset <= driveRoute.segmentLength * 0.5 + 30,
    `real-input drive left its measured route corridor at ${report.maximumRouteOffset} m`
  );
  assert(report.surfaceSampleCount >= samples.length * 0.9, 'drive surface was unavailable for too many real-input samples');
  assert(report.maximumSurfaceGap <= 1, `real-input suspension gap reached ${report.maximumSurfaceGap} m`);
  assert(
    samples.every((sample) => !sample.buildingInside),
    'real-input drive entered a building footprint'
  );
  assert(
    report.cameraSpan >= report.functionalMinimums.cameraSpan,
    'camera did not follow the real-input drive'
  );
  assert(
    Math.abs(forwardRightAngleDelta) >= 0.02,
    'forward-right input did not steer'
  );
  if (reverseMotionObserved) {
    assert(
      Math.abs(reverseRightAngleDelta) >= 0.02,
      'reverse-right input did not steer'
    );
    assert(
      Math.sign(forwardRightAngleDelta) !== Math.sign(reverseRightAngleDelta),
      `forward/reverse steering signs did not invert: ${JSON.stringify({
        forwardRightAngleDelta,
        reverseRightAngleDelta
      })}`
    );
  }
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join('; ')}`);

  report.ok = true;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await fs.writeFile(reportPath, JSON.stringify({
    ...(report || {}),
    ok: false,
    error: String(error?.message || error)
  }, null, 2));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
