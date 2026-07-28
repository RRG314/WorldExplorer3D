import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'phase5-sustained-earth');
const reportPath = path.join(outputDir, 'report.json');
let lastReport = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const server = await startStaticRootServer({
    rootDir,
    host: '127.0.0.1',
    candidatePorts: [4173, 4174, 4175, 4176, 4177]
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

  let report = null;
  try {
    await page.goto(`http://127.0.0.1:${server.port}/app/`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    await page.waitForFunction(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return (
        typeof ctx?.loadRoads === 'function' &&
        typeof ctx?.update === 'function' &&
        typeof ctx?.switchEnv === 'function' &&
        Boolean(ctx?.ENV?.EARTH) &&
        typeof ctx?.resolveSafeWorldSpawn === 'function' &&
        typeof ctx?.applyResolvedWorldSpawn === 'function' &&
        typeof ctx?.setTravelMode === 'function'
      );
    }, { timeout: 120000 });

    report = await page.evaluate(async () => {
      const deadline = performance.now() + 60000;
      let ctx = null;
      while (performance.now() < deadline) {
        const runtime = await import('/app/js/shared-context.js?v=55');
        ctx = runtime?.ctx || {};
        if (
          typeof ctx.loadRoads === 'function' &&
          typeof ctx.update === 'function' &&
          typeof ctx.switchEnv === 'function' &&
          ctx.ENV?.EARTH
        ) break;
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
      if (!ctx?.ENV?.EARTH) throw new Error('Earth runtime unavailable during sustained test bootstrap');
      ctx.selLoc = 'baltimore';
      ctx.gameMode = 'free';
      ctx.gameStarted = true;
      ctx.paused = false;
      ctx.switchEnv(ctx.ENV.EARTH);
      document.getElementById('titleScreen')?.classList.add('hidden');
      await ctx.loadRoads();

      const roadLength = (road) => {
        let distance = 0;
        for (let index = 1; index < (road?.pts?.length || 0); index += 1) {
          distance += Math.hypot(
            road.pts[index].x - road.pts[index - 1].x,
            road.pts[index].z - road.pts[index - 1].z
          );
        }
        return distance;
      };
      const traversalRadius = Math.max(500, Number(ctx.worldTraversalRadiusWorld || 2700));
      const routeRadius = traversalRadius - 60;
      const sanitizeRoutePoints = (points = []) => {
        const sanitized = [];
        for (const point of points) {
          const previous = sanitized[sanitized.length - 1];
          if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) >= 0.5) {
            sanitized.push(point);
          }
        }
        return sanitized;
      };
      const boundedRoadRuns = (road) => {
        const runs = [];
        let current = [];
        for (const point of road?.pts || []) {
          if (Math.hypot(point.x, point.z) <= routeRadius) {
            current.push(point);
          } else {
            const sanitized = sanitizeRoutePoints(current);
            if (sanitized.length >= 2) runs.push(sanitized);
            current = [];
          }
        }
        const sanitized = sanitizeRoutePoints(current);
        if (sanitized.length >= 2) runs.push(sanitized);
        return runs;
      };
      const roadCandidates = (ctx.roads || [])
        .filter((road) => Array.isArray(road?.pts) && road.pts.length >= 2)
        .flatMap((road) => boundedRoadRuns(road).map((points) => ({
          road,
          points,
          length: roadLength({ pts: points })
        })))
        .sort((a, b) => b.length - a.length);

      function chooseRoute(minimumDistance) {
        const direct = roadCandidates.find((candidate) => candidate.length >= minimumDistance);
        if (direct) return { points: direct.points, distance: direct.length, source: 'bounded-single-road' };
        const start = roadCandidates[0]?.points?.[0];
        if (!start) return null;
        const endpointCandidates = roadCandidates
          .flatMap((candidate) => [candidate.points[0], candidate.points[candidate.points.length - 1]])
          .sort((a, b) =>
            Math.hypot(b.x - start.x, b.z - start.z) -
            Math.hypot(a.x - start.x, a.z - start.z)
          )
          .slice(0, 24);
        let best = null;
        for (const endpoint of endpointCandidates) {
          const route = ctx.findTraversalRoute?.(start.x, start.z, endpoint.x, endpoint.z, {
            mode: 'drive',
            maxAnchorDistance: 80
          });
          const staysInsideBoundary = route?.points?.every((point) =>
            Math.hypot(point.x, point.z) <= routeRadius
          );
          if (
            route?.points?.length >= 2 &&
            staysInsideBoundary &&
            Number(route.distance) > Number(best?.distance || 0)
          ) {
            best = {
              points: sanitizeRoutePoints(route.points),
              distance: Number(route.distance),
              source: 'drive-graph'
            };
          }
        }
        return best;
      }

      function movementAccumulator(initial) {
        return {
          x: initial.x,
          z: initial.z,
          path: 0,
          maximumStep: 0,
          add(next) {
            const step = Math.hypot(next.x - this.x, next.z - this.z);
            if (Number.isFinite(step) && step < 30) this.path += step;
            this.maximumStep = Math.max(this.maximumStep, Number.isFinite(step) ? step : Infinity);
            this.x = next.x;
            this.z = next.z;
          }
        };
      }

      function runRoadJourney(mode, route, frames) {
        const first = route.points[0];
        const last = route.points[route.points.length - 1];
        const initialAngle = Math.atan2(last.x - first.x, last.z - first.z);
        const spawn = ctx.resolveSafeWorldSpawn(first.x, first.z, {
          mode,
          angle: initialAngle,
          source: `phase5_sustained_${mode}`
        });
        ctx.applyResolvedWorldSpawn(spawn, { mode, syncCar: true, syncWalker: true });
        ctx.setTravelMode(mode, { source: 'phase5_sustained', emitTutorial: false, force: true });
        const actor = mode === 'walk' ? ctx.Walk.state.walker : ctx.car;
        const accumulator = movementAccumulator(actor);
        const journeyStart = { x: actor.x, z: actor.z };
        let waypointIndex = 1;
        let waypointDirection = 1;
        let waypointsReached = 0;
        let maximumDisplacement = 0;
        let maximumSurfaceGap = 0;
        let maximumSurfacePenetration = 0;
        let groundedFrames = 0;
        let cameraChanged = false;
        ctx.keys.ArrowUp = true;
        ctx.keys.ShiftLeft = mode === 'walk';

        for (let frame = 0; frame < frames; frame += 1) {
          let target = route.points[Math.min(waypointIndex, route.points.length - 1)];
          let waypointAdvances = 0;
          while (
            Math.hypot(target.x - actor.x, target.z - actor.z) < (mode === 'walk' ? 2.2 : 8) &&
            waypointAdvances < route.points.length
          ) {
            waypointAdvances += 1;
            waypointsReached += 1;
            if (waypointDirection > 0 && waypointIndex >= route.points.length - 1) {
              waypointDirection = -1;
            } else if (waypointDirection < 0 && waypointIndex <= 0) {
              waypointDirection = 1;
            }
            waypointIndex = Math.max(
              0,
              Math.min(route.points.length - 1, waypointIndex + waypointDirection)
            );
            target = route.points[waypointIndex];
          }
          const desiredAngle = Math.atan2(target.x - actor.x, target.z - actor.z);
          if (mode === 'walk') {
            actor.yaw = desiredAngle;
            actor.angle = desiredAngle;
          } else {
            actor.angle = desiredAngle;
            actor.yawRate = 0;
            actor.steerSm = 0;
          }
          if (frame === Math.floor(frames / 2)) {
            if (mode === 'walk') ctx.Walk.toggleView?.();
            else ctx.cycleCameraMode?.();
            cameraChanged = true;
          }
          ctx.update(1 / 60);
          accumulator.add(actor);
          maximumDisplacement = Math.max(
            maximumDisplacement,
            Math.hypot(actor.x - journeyStart.x, actor.z - journeyStart.z)
          );
          const surface = mode === 'walk'
            ? ctx.SurfaceQuery.walkAt(actor.x, actor.z)
            : ctx.SurfaceQuery.driveAt(actor.x, actor.z, {
              // Measure the surface the controller actually selected. Forcing
              // a nearby road while the car is intentionally off-road reports
              // the road deck as a false penetration even though physics is
              // correctly following terrain.
              preferRoad: Boolean(actor.onRoad),
              currentY: Number.isFinite(actor.y) ? actor.y - 1.2 : NaN
            });
          const feetY = mode === 'walk' ? actor.y - ctx.Walk.CFG.eyeHeight : actor.y - 1.2;
          if (Number.isFinite(surface?.position?.y) && Number.isFinite(feetY)) {
            const surfaceDelta = feetY - surface.position.y;
            maximumSurfaceGap = Math.max(maximumSurfaceGap, surfaceDelta);
            maximumSurfacePenetration = Math.max(maximumSurfacePenetration, -surfaceDelta);
          }
          if (mode === 'walk' ? actor.onGround : !actor.isAirborne) groundedFrames += 1;
        }
        ctx.keys.ArrowUp = false;
        ctx.keys.ShiftLeft = false;
        return {
          mode,
          simulatedSeconds: frames / 60,
          routeSource: route.source,
          routeDistance: Number(route.distance.toFixed(2)),
          pathDistance: Number(accumulator.path.toFixed(2)),
          displacement: Number(Math.hypot(actor.x - journeyStart.x, actor.z - journeyStart.z).toFixed(2)),
          maximumDisplacement: Number(maximumDisplacement.toFixed(2)),
          maximumStep: Number(accumulator.maximumStep.toFixed(3)),
          maximumSurfaceGap: Number(maximumSurfaceGap.toFixed(3)),
          maximumSurfacePenetration: Number(maximumSurfacePenetration.toFixed(3)),
          groundedRatio: Number((groundedFrames / frames).toFixed(4)),
          waypointsReached,
          waypointCount: route.points.length,
          cameraChanged
        };
      }

      function runDroneJourney(frames) {
        ctx.setTravelMode('drone', { source: 'phase5_sustained', emitTutorial: false, force: true });
        const droneTerrainY = ctx.SurfaceQuery.terrainAt(0, 0)?.position?.y ?? 0;
        ctx.drone.x = 0;
        ctx.drone.z = 0;
        ctx.drone.y = droneTerrainY + 30;
        const start = { x: ctx.drone.x, y: ctx.drone.y, z: ctx.drone.z };
        const accumulator = movementAccumulator(ctx.drone);
        let minimumClearance = Infinity;
        ctx.keys.ArrowUp = true;
        for (let frame = 0; frame < frames; frame += 1) {
          if (frame === 2400) ctx.drone.yaw += Math.PI * 0.42;
          if (frame === 4800) ctx.drone.yaw -= Math.PI * 0.24;
          ctx.keys.Space = frame < 600;
          ctx.keys.ShiftLeft = frame >= 6000 && frame < 6600;
          ctx.update(1 / 60);
          accumulator.add(ctx.drone);
          const ground = ctx.SurfaceQuery.terrainAt(ctx.drone.x, ctx.drone.z)?.position?.y;
          if (Number.isFinite(ground)) minimumClearance = Math.min(minimumClearance, ctx.drone.y - ground);
        }
        ctx.keys.ArrowUp = false;
        ctx.keys.Space = false;
        ctx.keys.ShiftLeft = false;
        return {
          mode: 'drone',
          simulatedSeconds: frames / 60,
          pathDistance: Number(accumulator.path.toFixed(2)),
          displacement: Number(Math.hypot(ctx.drone.x - start.x, ctx.drone.z - start.z).toFixed(2)),
          altitudeChange: Number((ctx.drone.y - start.y).toFixed(2)),
          minimumClearance: Number(minimumClearance.toFixed(2)),
          maximumStep: Number(accumulator.maximumStep.toFixed(3)),
          yawChange: Number((ctx.drone.yaw || 0).toFixed(3))
        };
      }

      function runPlaneJourney(frames) {
        const terrainY = ctx.SurfaceQuery.terrainAt(0, 0)?.position?.y ?? 0;
        ctx.setTravelMode('plane', {
          source: 'phase5_sustained',
          emitTutorial: false,
          force: true,
          x: 0,
          y: terrainY + 120,
          z: 0,
          yaw: 0.25,
          pitch: 0.04,
          speed: 34,
          throttle: 0.72,
          airborne: true
        });
        const plane = ctx.planeMode;
        const start = { x: plane.x, y: plane.y, z: plane.z };
        const accumulator = movementAccumulator(plane);
        let minimumClearance = Infinity;
        let airborneFrames = 0;
        let maximumAbsoluteRoll = 0;
        let cameraChanged = false;
        for (let frame = 0; frame < frames; frame += 1) {
          ctx.keys.ArrowLeft = frame >= 600 && frame < 1200;
          ctx.keys.ArrowRight = frame >= 2100 && frame < 2500;
          ctx.keys.ArrowUp = frame >= frames - 360;
          if (frame === Math.floor(frames / 2)) {
            ctx.cycleCameraMode?.();
            cameraChanged = true;
          }
          ctx.update(1 / 60);
          accumulator.add(plane);
          const ground = ctx.SurfaceQuery.terrainAt(plane.x, plane.z)?.position?.y;
          if (Number.isFinite(ground)) minimumClearance = Math.min(minimumClearance, plane.y - ground);
          if (plane.airborne) airborneFrames += 1;
          maximumAbsoluteRoll = Math.max(maximumAbsoluteRoll, Math.abs(plane.roll || 0));
        }
        ctx.keys.ArrowLeft = false;
        ctx.keys.ArrowRight = false;
        ctx.keys.ArrowUp = false;
        const beforeExit = ctx.getPlaneSnapshot?.() || { ...plane };
        ctx.setTravelMode('drive', { source: 'phase5_sustained_exit', emitTutorial: false, force: true });
        return {
          mode: 'plane',
          simulatedSeconds: frames / 60,
          pathDistance: Number(accumulator.path.toFixed(2)),
          displacement: Number(Math.hypot(beforeExit.x - start.x, beforeExit.z - start.z).toFixed(2)),
          altitudeChange: Number((beforeExit.y - start.y).toFixed(2)),
          minimumClearance: Number(minimumClearance.toFixed(2)),
          maximumStep: Number(accumulator.maximumStep.toFixed(3)),
          airborneRatio: Number((airborneFrames / frames).toFixed(4)),
          maximumAbsoluteRoll: Number(maximumAbsoluteRoll.toFixed(3)),
          cameraChanged,
          exitedCleanly: plane.active === false &&
            Number.isFinite(ctx.car?.x) &&
            Number.isFinite(ctx.car?.y) &&
            Number.isFinite(ctx.car?.z)
        };
      }

      const walkRoute = chooseRoute(650);
      const driveRoute = chooseRoute(2400);
      if (!walkRoute || !driveRoute) throw new Error('Unable to resolve sustained Baltimore routes');
      const walk = runRoadJourney('walk', walkRoute, 7200);
      const drive = runRoadJourney('drive', driveRoute, 7200);
      const drone = runDroneJourney(7200);
      const plane = runPlaneJourney(3600);
      return {
        generatedAt: new Date().toISOString(),
        location: 'Baltimore',
        world: {
          roads: ctx.roads?.length || 0,
          buildings: ctx.buildings?.length || 0,
          traversalRadius,
          publication: ctx.verifyWorldPublicationStable?.() || null
        },
        walk,
        drive,
        drone,
        plane,
        runtime: ctx.getRuntimeKernelSnapshot?.() || null,
        interpolation: ctx.getRenderInterpolationSnapshot?.() || null
      };
    });
    lastReport = report;

    report.consoleErrors = consoleErrors;
    await page.screenshot({ path: path.join(outputDir, 'final.png') });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    assert(report.walk.simulatedSeconds >= 120, 'walking duration below 120 seconds');
    assert(report.walk.pathDistance >= 500, `walking path too short: ${report.walk.pathDistance} m`);
    assert(report.walk.maximumDisplacement >= 150, `walking journey span was too short: ${report.walk.maximumDisplacement} m`);
    assert(report.walk.maximumStep < 10, `walking teleported ${report.walk.maximumStep} m`);
    assert(report.walk.maximumSurfaceGap <= 0.35, `walking surface gap ${report.walk.maximumSurfaceGap} m`);
    assert(report.walk.maximumSurfacePenetration <= 0.05, `walking surface penetration ${report.walk.maximumSurfacePenetration} m`);
    assert(report.walk.groundedRatio >= 0.98, `walking grounded ratio ${report.walk.groundedRatio}`);
    assert(report.walk.cameraChanged, 'walking camera did not change');

    assert(report.drive.simulatedSeconds >= 120, 'driving duration below 120 seconds');
    assert(report.drive.pathDistance >= 2000, `driving path too short: ${report.drive.pathDistance} m`);
    assert(report.drive.maximumDisplacement >= 600, `driving journey span was too short: ${report.drive.maximumDisplacement} m`);
    assert(report.drive.maximumStep < 15, `driving teleported ${report.drive.maximumStep} m`);
    assert(report.drive.maximumSurfaceGap <= 1.0, `driving suspension gap ${report.drive.maximumSurfaceGap} m`);
    assert(report.drive.maximumSurfacePenetration <= 0.05, `driving surface penetration ${report.drive.maximumSurfacePenetration} m`);
    assert(report.drive.groundedRatio >= 0.96, `driving grounded ratio ${report.drive.groundedRatio}`);
    assert(report.drive.cameraChanged, 'driving camera did not change');

    assert(report.drone.simulatedSeconds >= 120, 'drone duration below 120 seconds');
    assert(
      report.drone.pathDistance >= Math.max(1200, Number(report.world.traversalRadius || 0) * 1.25),
      `drone path too short for the playable district: ${report.drone.pathDistance} m`
    );
    assert(report.drone.displacement >= 700, `drone journey became circular/stationary: ${report.drone.displacement} m`);
    assert(report.drone.maximumStep < 6, `drone teleported ${report.drone.maximumStep} m`);
    assert(report.drone.minimumClearance >= 4.8, `drone clipped ground: ${report.drone.minimumClearance} m`);

    assert(report.plane.simulatedSeconds >= 60, 'plane duration below 60 seconds');
    assert(report.plane.pathDistance >= 1200, `plane path too short: ${report.plane.pathDistance} m`);
    assert(report.plane.displacement >= 500, `plane journey became circular/stationary: ${report.plane.displacement} m`);
    assert(report.plane.maximumStep < 3, `plane teleported ${report.plane.maximumStep} m`);
    assert(report.plane.minimumClearance >= 5, `plane clipped ground: ${report.plane.minimumClearance} m`);
    assert(report.plane.airborneRatio >= 0.95, `plane airborne ratio ${report.plane.airborneRatio}`);
    assert(report.plane.maximumAbsoluteRoll >= 0.08, 'plane did not bank');
    assert(report.plane.cameraChanged, 'plane camera did not change');
    assert(report.plane.exitedCleanly, 'plane did not exit cleanly to the ground traveler');
    assert(report.world.publication?.stable === true, 'world publication changed during sustained travel');
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join('; ')}`);

    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(async (error) => {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({
    ok: false,
    report: lastReport,
    error: String(error?.message || error)
  }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
