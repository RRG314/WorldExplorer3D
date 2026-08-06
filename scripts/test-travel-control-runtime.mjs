import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'travel-control-runtime');
await fs.mkdir(outputDir, { recursive: true });

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4220, 4221, 4222, 4223]
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?travel-control-runtime=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  const report = await page.evaluate(async () => {
    let ctx = null;
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      ({ ctx } = await import('/app/js/shared-context.js?v=55'));
      if (
        typeof ctx?.loadRoads === 'function' &&
        typeof ctx?.update === 'function' &&
        typeof ctx?.updateDrone === 'function' &&
        typeof ctx?.updatePlane === 'function'
      ) break;
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    if (!ctx?.loadRoads) throw new Error('Runtime bootstrap timed out');

    ctx.selLoc = 'baltimore';
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    await ctx.loadRoads();
    ctx.stopRuntimeKernel?.('travel-control-contract');
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.droneMode = false;
    if (ctx.boatMode) ctx.boatMode.active = false;
    if (ctx.planeMode) ctx.planeMode.active = false;
    if (ctx.Walk?.state) ctx.Walk.state.mode = 'drive';
    ctx.policeOn = false;
    ctx.clearPolice?.();

    const originalReadControlActions = ctx.readControlActions;
    let activeActions = {};
    ctx.readControlActions = () => activeActions;
    const stepCar = (steps = 12) => {
      const frames = [];
      for (let index = 0; index < steps; index += 1) {
        const previousAngle = ctx.car.angle;
        ctx.update(1 / 60);
        frames.push({
          index,
          delta: ctx.car.angle - previousAngle,
          speed: ctx.car.speed,
          yawRate: ctx.car.yawRate,
          steer: ctx.car.steerSm,
          driveDirection: ctx.car._driveDirection
        });
      }
      return frames;
    };
    const nearest = ctx.findNearestRoad(0, 0, { maxVerticalDelta: 100 });
    const road = nearest?.road || ctx.roads?.[0] || null;
    const roadPoint = nearest?.pt || road?.pts?.[0] || { x: 0, z: 0 };
    const steeringCases = [];
    const steeringCaptures = {};
    for (const spec of [
      { id: 'forward-left', speed: 8, steer: 1, staleSteer: -0.8, expected: 1 },
      { id: 'forward-right', speed: 8, steer: -1, staleSteer: 0.8, expected: -1 },
      { id: 'reverse-left', speed: -8, steer: 1, staleSteer: -0.8, expected: -1 },
      { id: 'reverse-right', speed: -8, steer: -1, staleSteer: 0.8, expected: 1 }
    ]) {
      Object.assign(ctx.car, {
        x: roadPoint.x,
        z: roadPoint.z,
        y: Number(nearest?.y || 0) + 1.2,
        angle: 0,
        speed: spec.speed,
        vFwd: spec.speed,
        vLat: 0,
        vx: 0,
        vz: 0,
        yawRate: 0,
        rearSlip: 0,
        steerSm: spec.staleSteer,
        isDrifting: false,
        _driftHoldTimer: 0,
        boost: false,
        boostDecayTime: 0,
        onRoad: true,
        road,
        _driveDirection: spec.speed < 0 ? -1 : 1,
        _roadContinuityTimer: 0.7
      });
      activeActions = {
        steer: spec.steer,
        throttle: spec.speed > 0 ? 0.35 : 0,
        reverse: spec.speed < 0 ? 0.35 : 0,
        brake: 0,
        boost: 0
      };
      const frames = stepCar(90);
      if (spec.id.startsWith('reverse-')) {
        ctx.updateCamera?.(1 / 60);
        ctx.renderer?.render?.(ctx.scene, ctx.camera);
        const canvas = Array.from(document.querySelectorAll('canvas'))
          .sort((left, right) => right.width * right.height - left.width * left.height)[0];
        steeringCaptures[spec.id] = canvas?.toDataURL('image/png')?.split(',')[1] || '';
      }
      const wrongWayDelta = Math.min(...frames.map((frame) => frame.delta * spec.expected));
      steeringCases.push({
        id: spec.id,
        expectedSign: spec.expected,
        wrongWayDelta,
        totalDelta: frames.reduce((sum, frame) => sum + frame.delta, 0),
        wrongWayFrames: frames.filter((frame) => frame.delta * spec.expected < -1e-5).slice(0, 8)
      });
    }

    const originalRadius = ctx.worldTraversalRadiusWorld;
    ctx.worldTraversalRadiusWorld = 120;

    Object.assign(ctx.car, {
      x: 114,
      z: 0,
      y: ctx.SurfaceQuery.terrainAt(114, 0).position.y + 1.2,
      angle: Math.PI / 2,
      speed: 24,
      vFwd: 24,
      vLat: 0,
      vx: 0,
      vz: 0,
      yawRate: 0,
      rearSlip: 0,
      steerSm: 0,
      onRoad: false,
      road: null,
      _roadContinuityTimer: 0
    });
    activeActions = { steer: 0, throttle: 1, reverse: 0, brake: 0, boost: 0 };
    stepCar(90);
    const carBoundaryDistance = Math.hypot(ctx.car.x, ctx.car.z);

    ctx.Walk.state.mode = 'walk';
    Object.assign(ctx.Walk.state.walker, {
      x: 116,
      z: 0,
      y: ctx.SurfaceQuery.terrainAt(116, 0).position.y + ctx.Walk.CFG.eyeHeight,
      angle: Math.PI / 2,
      yaw: Math.PI / 2,
      vy: 0
    });
    activeActions = { move: 1, turn: 0, lookYaw: 0, lookPitch: 0, sprint: 1, jump: 0 };
    for (let index = 0; index < 90; index += 1) ctx.Walk.update(1 / 60);
    const walkBoundaryDistance = Math.hypot(ctx.Walk.state.walker.x, ctx.Walk.state.walker.z);

    ctx.Walk.state.mode = 'drive';
    Object.assign(ctx.drone, { x: 107, z: 0, y: 100, yaw: -Math.PI / 2 });
    activeActions = { move: 1, turn: 0, lookYaw: 0, lookPitch: 0, vertical: 0 };
    for (let index = 0; index < 90; index += 1) ctx.updateDrone(1 / 60);
    const droneBoundaryDistance = Math.hypot(ctx.drone.x, ctx.drone.z);

    ctx.startPlaneMode?.({ source: 'travel-control-contract' });
    Object.assign(ctx.planeMode, {
      active: true,
      x: 89,
      z: 0,
      yaw: Math.PI / 2,
      speed: 35,
      throttle: 1,
      airborne: true,
      y: ctx.SurfaceQuery.terrainAt(89, 0).position.y + 80
    });
    activeActions = { pitch: 0, roll: 0, throttleAdjust: 0, brake: 0 };
    for (let index = 0; index < 30; index += 1) ctx.updatePlane(1 / 60);
    const planeSnapshot = ctx.getPlaneSnapshot();
    const planeBoundaryDistance = Math.hypot(planeSnapshot.x, planeSnapshot.z);

    ctx.worldTraversalRadiusWorld = originalRadius;
    Object.assign(ctx.planeMode, {
      active: true,
      x: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      pitchRate: 0,
      rollRate: 0,
      barrelRollActive: false,
      barrelRollDirection: 0,
      barrelRollProgress: 0,
      speed: 42,
      throttle: 0.5,
      airborne: true,
      y: ctx.SurfaceQuery.terrainAt(0, 0).position.y + 180
    });
    activeActions = { pitch: 0, roll: 0, aerobaticRoll: 0, throttleAdjust: 0, brake: 0 };
    ctx.clearControlInputState?.('travel-control-plane-double-tap');
    ctx.registerPlaneTurnTap?.('ArrowRight', 1000);
    ctx.registerPlaneTurnTap?.('ArrowRight', 1210);
    let accumulatedTriggeredRoll = 0;
    let triggeredRollStarted = false;
    let triggeredRollCompleted = false;
    for (let index = 0; index < 480; index += 1) {
      const previousRoll = ctx.planeMode.roll;
      ctx.updatePlane(1 / 60);
      const rollDelta = Math.atan2(
        Math.sin(ctx.planeMode.roll - previousRoll),
        Math.cos(ctx.planeMode.roll - previousRoll)
      );
      accumulatedTriggeredRoll += rollDelta;
      if (ctx.planeMode.barrelRollActive) triggeredRollStarted = true;
      if (triggeredRollStarted && !ctx.planeMode.barrelRollActive) {
        triggeredRollCompleted = true;
        break;
      }
    }
    const planeDoubleTap = {
      started: triggeredRollStarted,
      completed: triggeredRollCompleted,
      accumulatedRoll: accumulatedTriggeredRoll,
      finalRoll: ctx.planeMode.roll
    };
    ctx.readControlActions = originalReadControlActions;
    ctx.stopPlaneMode?.({ targetMode: 'drive' });
    ctx.spawnOnRoad?.();
    ctx.setTravelMode?.('drive', { source: 'travel-control-contract', emitTutorial: false, force: true });
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.renderLoop?.();
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    ctx.stopRuntimeKernel?.('travel-control-capture');

    const waterAreas = (ctx.waterAreas || []).filter((body) => body?.shape === 'area' && body?.bounds);
    const pointInsideRing = (x, z, ring) => {
      let inside = false;
      for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
        const a = ring[index];
        const b = ring[previous];
        const crosses = (a.z > z) !== (b.z > z) &&
          x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-9) + a.x;
        if (crosses) inside = !inside;
      }
      return inside;
    };
    let duplicateWaterPairs = 0;
    const duplicateWaterPairPreview = [];
    for (let leftIndex = 0; leftIndex < waterAreas.length; leftIndex += 1) {
      const left = waterAreas[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < waterAreas.length; rightIndex += 1) {
        const right = waterAreas[rightIndex];
        const overlapWidth = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX));
        const overlapDepth = Math.max(0, Math.min(left.maxZ, right.maxZ) - Math.max(left.minZ, right.minZ));
        const leftArea = Math.max(1, (left.maxX - left.minX) * (left.maxZ - left.minZ));
        const rightArea = Math.max(1, (right.maxX - right.minX) * (right.maxZ - right.minZ));
        const ratio = overlapWidth * overlapDepth / Math.min(leftArea, rightArea);
        const centerDistance = Math.hypot(left.centerX - right.centerX, left.centerZ - right.centerZ);
        const centerTolerance = Math.max(
          8,
          Math.min(
            left.maxX - left.minX,
            left.maxZ - left.minZ,
            right.maxX - right.minX,
            right.maxZ - right.minZ
          ) * 0.18
        );
        const contained =
          pointInsideRing(left.centerX, left.centerZ, right.pts) ||
          pointInsideRing(right.centerX, right.centerZ, left.pts);
        const heightDelta = Math.abs(Number(left.surfaceY || 0) - Number(right.surfaceY || 0));
        if (
          heightDelta <= 6 &&
          (
            (ratio >= 0.88 && centerDistance <= centerTolerance) ||
            (ratio >= 0.98 && contained)
          )
        ) {
          duplicateWaterPairs += 1;
          if (duplicateWaterPairPreview.length < 12) {
            duplicateWaterPairPreview.push({
              ratio,
              left: {
                id: left.sourceFeatureId,
                dataset: left.provenance?.dataset,
                layer: left.provenance?.layer,
                area: left.area,
                surfaceY: left.surfaceY,
                centerX: left.centerX,
                centerZ: left.centerZ
              },
              right: {
                id: right.sourceFeatureId,
                dataset: right.provenance?.dataset,
                layer: right.provenance?.layer,
                area: right.area,
                surfaceY: right.surfaceY,
                centerX: right.centerX,
                centerZ: right.centerZ
              }
            });
          }
        }
      }
    }

    return {
      traversalRadius: originalRadius,
      steeringCases,
      steeringCaptures,
      boundaries: {
        car: carBoundaryDistance,
        walk: walkBoundaryDistance,
        drone: droneBoundaryDistance,
        plane: planeBoundaryDistance
      },
      planeDoubleTap,
      waterAreas: waterAreas.length,
      duplicateWaterPairs,
      duplicateWaterPairPreview
    };
  });

  const steeringCaptures = report.steeringCaptures || {};
  delete report.steeringCaptures;
  for (const [name, base64] of Object.entries(steeringCaptures)) {
    if (!base64) throw new Error(`${name} gameplay canvas capture was empty`);
    await fs.writeFile(path.join(outputDir, `${name}.png`), Buffer.from(base64, 'base64'));
  }
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
    report,
    consoleErrors
  }, null, 2));
  const gameplayPng = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer?.render?.(ctx.scene, ctx.camera);
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const canvas = canvases.sort((left, right) => right.width * right.height - left.width * left.height)[0];
    return canvas?.toDataURL('image/png')?.split(',')[1] || '';
  });
  if (!gameplayPng) throw new Error('Gameplay canvas capture was empty');
  await fs.writeFile(path.join(outputDir, 'gameplay.png'), Buffer.from(gameplayPng, 'base64'));

  assert.ok(Number(report.traversalRadius) >= 900 && Number(report.traversalRadius) <= 3000);
  for (const steering of report.steeringCases) {
    assert.ok(
      steering.wrongWayDelta >= -1e-5,
      `${steering.id} initially turned the wrong way (${steering.wrongWayDelta})`
    );
    assert.ok(
      steering.totalDelta * steering.expectedSign > 0.001,
      `${steering.id} did not turn in the requested direction`
    );
  }
  assert.ok(report.boundaries.car <= 115.001, `car crossed boundary (${report.boundaries.car})`);
  assert.ok(report.boundaries.walk <= 117.001, `walker crossed boundary (${report.boundaries.walk})`);
  assert.ok(report.boundaries.drone <= 108.001, `drone crossed boundary (${report.boundaries.drone})`);
  assert.ok(report.boundaries.plane <= 90.001, `plane crossed boundary (${report.boundaries.plane})`);
  assert.equal(report.planeDoubleTap.started, true, 'plane double-tap did not start a barrel roll');
  assert.equal(report.planeDoubleTap.completed, true, 'plane double-tap barrel roll did not complete');
  assert.ok(report.planeDoubleTap.accumulatedRoll < -Math.PI * 1.9, `plane double-tap did not complete a right roll (${report.planeDoubleTap.accumulatedRoll})`);
  assert.ok(Math.abs(report.planeDoubleTap.finalRoll) < 0.05, `plane did not settle after double-tap roll (${report.planeDoubleTap.finalRoll})`);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
