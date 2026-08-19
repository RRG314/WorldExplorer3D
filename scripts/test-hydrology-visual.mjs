import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'water-sky-realism');
const locations = [
  {
    id: 'baltimore-inner-harbor', lat: 39.28532, lon: -76.61155, label: 'Baltimore Inner Harbor',
    waterView: { camera: [39.2755, -76.606], target: [39.2895, -76.613] }
  },
  {
    id: 'monaco-harbor', lat: 43.7355, lon: 7.4252, label: 'Monaco Harbor',
    waterView: { camera: [43.7285, 7.422], target: [43.7384, 7.4246] }
  },
  {
    id: 'lake-tahoe', lat: 39.0968, lon: -120.0324, label: 'Lake Tahoe',
    waterView: { camera: [39.0968, -120.0324], target: [39.101, -120.037] }
  }
];
const requested = String(process.env.HYDROLOGY_LOCATION || '').trim();
const selected = requested ? locations.filter((location) => location.id === requested) : locations;
const skipScreenshots = process.env.HYDROLOGY_SKIP_SCREENSHOTS === '1';
const portBase = Number(process.env.HYDROLOGY_PORT_BASE || 4210);
if (!selected.length) throw new Error(`Unknown HYDROLOGY_LOCATION: ${requested}`);

await mkdirp(outputDir);
const server = await startServer({ rootDir, host: '127.0.0.1', candidatePorts: [portBase, portBase + 1, portBase + 2] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

const evidence = [];
try {
  for (const location of selected) {
    await page.goto(`http://127.0.0.1:${server.port}/app/?build=hydrology-v442`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    const boot = await page.evaluate(async (nextLocation) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const deadline = performance.now() + 60000;
      while (performance.now() < deadline && (typeof ctx.loadRoads !== 'function' || !ctx.ENV?.EARTH)) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      ctx.customLoc = { lat: nextLocation.lat, lon: nextLocation.lon, name: nextLocation.label };
      ctx.customLocTransient = false;
      ctx.selLoc = 'custom';
      ctx.gameMode = 'free';
      ctx.gameStarted = true;
      ctx.paused = false;
      ctx.switchEnv(ctx.ENV.EARTH);
      document.getElementById('titleScreen')?.classList.add('hidden');
      document.getElementById('globeSelectorScreen')?.classList.remove('show');
      await ctx.loadRoads();
      ctx.setWeatherMode?.('clear');
      ctx.setTimeOfDay?.('day');
      ctx.applyWeatherPresentation?.();
      document.getElementById('tutorialHintCard')?.style?.setProperty('display', 'none');
      return { invoked: true };
    }, location);
    if (!boot.invoked) throw new Error(`${location.id}: world load was not invoked`);
    await page.waitForFunction(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.worldLoading === false &&
        (ctx.waterSurfaceRegistry?.snapshot?.()?.surfaceCount || 0) > 0;
    }, null, { timeout: 240000 });
    await page.waitForFunction(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.waterEnvironmentStatus?.state !== 'loading';
    }, null, { timeout: 12000 }).catch(() => {});

    const result = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const { pointInWaterBody } = await import('/app/js/world/water-surface-registry.js?v=3');
      const areas = (ctx.waterAreas || []).filter((area) => Number.isFinite(Number(area?.surfaceY)));
      const containingOrigin = areas.find((area) => pointInWaterBody(area, 0, 0));
      const target = containingOrigin || areas.slice().sort((a, b) =>
        Math.hypot(Number(a.centerX || 0), Number(a.centerZ || 0)) -
        Math.hypot(Number(b.centerX || 0), Number(b.centerZ || 0))
      )[0];
      const vessels = (ctx.buildingMeshes || []).filter((mesh) => mesh?.userData?.isMappedVessel);
      const waterMeshes = (ctx.landuseMeshes || []).filter((mesh) => mesh?.userData?.landuseType === 'water');
      const probes = [];
      if (target?.bounds) {
        for (let xi = 1; xi < 8; xi += 1) {
          for (let zi = 1; zi < 8; zi += 1) {
            const x = target.bounds.minX + (target.bounds.maxX - target.bounds.minX) * (xi / 8);
            const z = target.bounds.minZ + (target.bounds.maxZ - target.bounds.minZ) * (zi / 8);
            if (!pointInWaterBody(target, x, z)) continue;
            const terrainY = Number(ctx.terrainMeshHeightAt?.(x, z));
            if (!Number.isFinite(terrainY)) continue;
            probes.push({ x, z, terrainY, separation: Number(target.surfaceY) - terrainY });
          }
        }
      }
      const primaryVessel = vessels[0] || null;
      const targetX = Number(primaryVessel?.userData?.lodCenter?.x ?? target?.centerX ?? 0);
      const targetZ = Number(primaryVessel?.userData?.lodCenter?.z ?? target?.centerZ ?? 0);
      const targetY = Number(primaryVessel?.userData?.waterSurfaceY ?? target?.surfaceY ?? 0);
      ctx.setDroneModeActive?.(true);
      ctx.camera.position.set(targetX + 48, targetY + 22, targetZ + 55);
      ctx.camera.lookAt(targetX, targetY + 2, targetZ);
      ctx.camera.userData.lookTarget = { x: targetX, y: targetY + 2, z: targetZ };
      ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords', 'modeDropdown']
        .forEach((id) => document.getElementById(id)?.classList.remove('show'));
      return {
        areas: areas.length,
        target: target ? {
          registryId: target.registryId,
          kind: target.waterKind,
          surfaceY: target.surfaceY,
          datum: target.datum,
          centerX: targetX,
          centerZ: targetZ
        } : null,
        waterMeshes: waterMeshes.length,
        vessels: vessels.map((mesh) => ({
          name: mesh.userData.vesselName,
          type: mesh.userData.vesselType,
          surfaceY: mesh.userData.waterSurfaceY,
          hullBottomY: mesh.userData.hullBottomY,
          hullTopY: mesh.userData.hullTopY,
          waterlineClearance: mesh.userData.waterlineClearance
        })),
        buildingState: ctx.worldDetailState?.buildings || null,
        terrainMask: ctx.waterTerrainMaskStats || null,
        probeCount: probes.length,
        minimumBedSeparation: probes.length ? Math.min(...probes.map((probe) => probe.separation)) : null,
        maximumBedSeparation: probes.length ? Math.max(...probes.map((probe) => probe.separation)) : null
        ,atmosphere: ctx.getEarthAtmosphereSnapshot?.() || null
        ,environmentLighting: ctx.getEnvironmentLightingSnapshot?.() || null
        ,waterOptics: ctx.getWaterOpticsSnapshot?.() || null
        ,waterEnvironment: ctx.waterEnvironmentStatus || null
      };
    });
    console.log(`[hydrology-visual] ${location.id}: ${JSON.stringify(result)}`);
    if (location.id === 'baltimore-inner-harbor') {
      if (result.vessels.some((vessel) => Number(vessel.waterlineClearance) < 1.18)) {
        throw new Error('Baltimore Inner Harbor: mapped vessel remains submerged by the water sheet.');
      }
    }
    if (result.atmosphere?.meshCount !== 1) throw new Error(`${location.id}: expected exactly one Earth atmosphere mesh.`);
    if (result.environmentLighting?.targetCount !== 1) throw new Error(`${location.id}: expected exactly one PMREM environment target.`);
    if (result.waterOptics?.renderTargetCount !== 0 || result.waterOptics?.animationLoopCount !== 0) {
      throw new Error(`${location.id}: water optics created a competing render target or loop.`);
    }
    if (result.waterOptics?.numericUnknownDepthCount !== 0) {
      throw new Error(`${location.id}: an unknown water depth was promoted to a number.`);
    }
    if (!skipScreenshots) {
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: path.join(outputDir, `${location.id}-overview.png`),
        timeout: 0,
        animations: 'disabled'
      });
      const landView = await page.evaluate(async (nextLocation) => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const { pointInWaterBody } = await import('/app/js/world/water-surface-registry.js?v=3');
        const cameraWorld = ctx.geoToWorld(nextLocation.waterView.camera[0], nextLocation.waterView.camera[1]);
        const candidate = ctx.inspectBoatCandidate?.(cameraWorld.x, cameraWorld.z, 5000, { requireContainment: false });
        const target = candidate?.source || null;
        if (!target || !candidate || !Array.isArray(target.pts) || target.pts.length < 3) {
          return { ready: false, reason: 'no-polygon-water-target' };
        }
        const insideX = Number(candidate.spawnX);
        const insideZ = Number(candidate.spawnZ);
        let nearest = null;
        for (const ring of [target.pts, ...(target.holes || [])]) {
          for (let index = 0; index < ring.length; index += 1) {
            const a = ring[index];
            const b = ring[(index + 1) % ring.length];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const lengthSquared = dx * dx + dz * dz;
            const t = lengthSquared > 1e-9
              ? Math.max(0, Math.min(1, ((insideX - a.x) * dx + (insideZ - a.z) * dz) / lengthSquared))
              : 0;
            const edgeX = a.x + dx * t;
            const edgeZ = a.z + dz * t;
            const distance = Math.hypot(insideX - edgeX, insideZ - edgeZ);
            if (!nearest || distance < nearest.distance) nearest = { edgeX, edgeZ, dx, dz, distance };
          }
        }
        if (!nearest) return { ready: false, reason: 'shoreline-not-found' };
        const edgeLength = Math.hypot(nearest.dx, nearest.dz) || 1;
        const normals = [
          { x: -nearest.dz / edgeLength, z: nearest.dx / edgeLength },
          { x: nearest.dz / edgeLength, z: -nearest.dx / edgeLength }
        ];
        let outward = null;
        let outsideDistance = null;
        for (const distance of [4, 8, 16, 32, 64, 128]) {
          outward = normals.find((normal) => !pointInWaterBody(
            target,
            nearest.edgeX + normal.x * distance,
            nearest.edgeZ + normal.z * distance
          ));
          if (outward) {
            outsideDistance = distance;
            break;
          }
        }
        if (!outward) return { ready: false, reason: 'outside-normal-not-found' };
        const x = nearest.edgeX + outward.x * (outsideDistance + 1);
        const z = nearest.edgeZ + outward.z * (outsideDistance + 1);
        const lookX = nearest.edgeX - outward.x * 28;
        const lookZ = nearest.edgeZ - outward.z * 28;
        const waterY = Number(candidate?.surfaceY ?? target.surfaceY ?? 0);
        const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y ?? ctx.terrainMeshHeightAt?.(x, z));
        const cameraY = Math.max(waterY + 2.2, Number.isFinite(terrainY) ? terrainY + 1.8 : waterY + 2.2);
        // This is a disposable browser page. Stop its owner kernel so the
        // travel camera cannot reclaim the deliberately composed test view.
        ctx.stopRuntimeKernel?.('hydrology-visual-static-capture');
        ctx.setDroneModeActive?.(false);
        ctx.paused = true;
        ctx.setPauseReason?.('hydrology-capture', true);
        ctx.camera.fov = 58;
        ctx.camera.updateProjectionMatrix?.();
        ctx.camera.position.set(x, cameraY, z);
        ctx.camera.lookAt(lookX, waterY + 0.28, lookZ);
        ctx.camera.userData.lookTarget = { x: lookX, y: waterY + 0.28, z: lookZ };
        ctx.camera.updateMatrixWorld?.(true);
        ctx.renderer?.render?.(ctx.scene, ctx.camera);
        document.getElementById('tutorialHintCard')?.style?.setProperty('display', 'none');
        return {
          ready: true,
          waterKind: target.waterKind,
          shorelineDistanceFromSpawn: nearest.distance,
          shorelineOutsideProbeDistance: outsideDistance,
          cameraHeightAboveWater: cameraY - waterY,
          cameraInsideWater: pointInWaterBody(target, x, z),
          lookInsideWater: pointInWaterBody(target, lookX, lookZ)
        };
      }, location);
      if (!landView?.ready || landView.cameraInsideWater || !landView.lookInsideWater || landView.cameraHeightAboveWater > 12) {
        throw new Error(`${location.id}: land waterline camera gate failed: ${JSON.stringify(landView)}`);
      }
      result.landView = landView;
      await page.waitForTimeout(750);
      await page.screenshot({
        path: path.join(outputDir, `${location.id}-waterline.png`),
        timeout: 0,
        animations: 'disabled'
      });

      const boatResult = await page.evaluate(async (nextLocation) => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const cameraWorld = ctx.geoToWorld(nextLocation.waterView.camera[0], nextLocation.waterView.camera[1]);
        const candidate = ctx.inspectBoatCandidate?.(cameraWorld.x, cameraWorld.z, 5000, { requireContainment: false });
        const target = candidate?.source || null;
        if (!target) return { started: false, reason: 'no-water-target' };
        if (!candidate) return { started: false, reason: 'no-boat-candidate' };
        ctx.setDroneModeActive?.(false);
        if (ctx.Walk?.state?.mode === 'walk') ctx.Walk.setModeDrive?.();
        ctx.car.x = Number(candidate.spawnX);
        ctx.car.z = Number(candidate.spawnZ);
        ctx.car.y = Number(candidate.surfaceY || 0) + 1.1;
        ctx.car.angle = 0;
        const started = ctx.startBoatMode?.({
          candidate,
          spawnX: candidate.spawnX,
          spawnZ: candidate.spawnZ,
          emitTutorial: false,
          source: 'water-sky-visual-gate'
        }) === true;
        if (!started) return { started: false, reason: 'boat-start-rejected' };
        ctx.setBoatWaveIntensity?.(0.5, { skipUi: true });
        ctx.boat.forwardSpeed = 16;
        ctx.boat.speed = 16;
        for (let index = 0; index < 36; index += 1) ctx.updateBoatMode?.(1 / 60);
        ctx.updateWaterWaveVisuals?.();
        const angle = Number(ctx.boat.angle || 0);
        const backX = -Math.sin(angle);
        const backZ = -Math.cos(angle);
        ctx.camera.position.set(ctx.boat.x + backX * 12, ctx.boat.y + 3.8, ctx.boat.z + backZ * 12);
        ctx.camera.lookAt(ctx.boat.x, ctx.boat.y + 0.8, ctx.boat.z);
        ctx.camera.userData.lookTarget = { x: ctx.boat.x, y: ctx.boat.y + 0.8, z: ctx.boat.z };
        ctx.camera.updateMatrixWorld?.(true);
        ctx.renderer?.render?.(ctx.scene, ctx.camera);
        return {
          started,
          mode: ctx.getBoatModeSnapshot?.() || null,
          patchVisible: ctx.boatMode?.waterPatch?.visible === true,
          patchShaderReady: !!ctx.boatMode?.waterPatch?.material?.userData?.weWaterWaveShader,
          waterOptics: ctx.getWaterOpticsSnapshot?.() || null
        };
      }, location);
      await page.waitForTimeout(750);
      const boatReady = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        ctx.renderer?.compile?.(ctx.scene, ctx.camera);
        ctx.updateWaterWaveVisuals?.();
        ctx.renderer?.render?.(ctx.scene, ctx.camera);
        document.getElementById('tutorialHintCard')?.style?.setProperty('display', 'none');
        return {
          patchVisible: ctx.boatMode?.waterPatch?.visible === true,
          patchShaderReady: !!ctx.boatMode?.waterPatch?.material?.userData?.weWaterWaveShader
        };
      });
      Object.assign(boatResult, boatReady);
      if (!boatResult.started || !boatResult.patchVisible || !boatResult.patchShaderReady) {
        throw new Error(`${location.id}: boat close-up water gate failed: ${JSON.stringify(boatResult)}`);
      }
      await page.screenshot({
        path: path.join(outputDir, `${location.id}-boat-closeup.png`),
        timeout: 0,
        animations: 'disabled'
      });
      result.boatCloseup = boatResult;
    }
    evidence.push({ location, ...result });
  }
  if (consoleErrors.length) throw new Error(`Console errors: ${JSON.stringify(consoleErrors)}`);
  await fs.writeFile(
    path.join(outputDir, requested ? `report-${requested}.json` : 'report.json'),
    `${JSON.stringify({ ok: true, evidence, consoleErrors }, null, 2)}\n`
  );
} finally {
  await browser.close();
  if (server.owned) await server.close();
}
