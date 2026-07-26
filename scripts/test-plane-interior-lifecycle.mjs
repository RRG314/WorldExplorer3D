import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'plane-interior-lifecycle');
const MODE_SWITCH_BUDGET_MS = 200;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function launchBaltimore(page, baseUrl) {
  await page.goto(`${baseUrl}/app/?plane-interior=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && document.getElementById('globeSelectorScreen')?.classList.contains('show');
  }, null, { timeout: 90000 });
  await page.locator('#globeCustomLat').fill('39.2904');
  await page.locator('#globeCustomLon').fill('-76.6122');
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(
    () => document.getElementById('titleScreen')?.classList.contains('hidden'),
    null,
    { timeout: 90000 }
  );
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const status = String(ctx.worldDetailState?.buildings?.status || '');
    return status !== '' && status !== 'loading';
  }, null, { timeout: 60000 });
}

async function exerciseLifecycle(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const polygonArea = (points = []) => {
      const ring = Array.isArray(points) ? points : [];
      let area = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        area += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
      }
      return Math.abs(area * 0.5);
    };
    const candidates = (ctx.buildings || [])
      .filter((building) => {
        const support = ctx.resolveBuildingEntrySupport?.(building, { allowSynthetic: true });
        return support?.enterable && Number.isFinite(building.maxY) && polygonArea(building.pts) > 220;
      })
      .sort((a, b) => polygonArea(b.pts) - polygonArea(a.pts));
    const building = candidates.find((item) => Math.min(item.maxX - item.minX, item.maxZ - item.minZ) > 12) || candidates[0];
    if (!building) throw new Error('No large enterable building was available');

    const center = { x: building.centerX, z: building.centerZ };
    const roofY = building.maxY;
    ctx.setTravelMode('plane', {
      source: 'plane_control_acceptance',
      force: true,
      x: center.x,
      z: center.z,
      y: roofY + 70,
      pitch: 0,
      speed: 28,
      throttle: 0.6,
      airborne: true
    });
    ctx.planeMode.pitch = 0;
    ctx.planeMode.climbRate = 0;
    ctx.keys.ArrowDown = true;
    for (let i = 0; i < 45; i++) ctx.updatePlane(1 / 60);
    ctx.keys.ArrowDown = false;
    const pullUpPitch = ctx.planeMode.pitch;
    ctx.planeMode.pitch = 0;
    ctx.planeMode.climbRate = 0;
    ctx.keys.ArrowUp = true;
    for (let i = 0; i < 45; i++) ctx.updatePlane(1 / 60);
    ctx.keys.ArrowUp = false;
    const noseDownPitch = ctx.planeMode.pitch;
    ctx.planeMode.throttle = 0.6;
    ctx.keys.ControlLeft = true;
    ctx.keys.ArrowDown = true;
    for (let i = 0; i < 20; i++) ctx.updatePlane(1 / 60);
    ctx.keys.ControlLeft = false;
    ctx.keys.ArrowDown = false;
    const controlChordThrottle = ctx.planeMode.throttle;
    ctx.keys.KeyZ = true;
    for (let i = 0; i < 20; i++) ctx.updatePlane(1 / 60);
    ctx.keys.KeyZ = false;
    const zThrottle = ctx.planeMode.throttle;
    ctx.planeMode.throttle = 0.4;
    ctx.keys.KeyX = true;
    for (let i = 0; i < 20; i++) ctx.updatePlane(1 / 60);
    ctx.keys.KeyX = false;
    const xThrottle = ctx.planeMode.throttle;
    const gameplayArrow = new KeyboardEvent('keydown', {
      code: 'ArrowLeft',
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(gameplayArrow);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true }));
    const formControl = document.createElement('input');
    document.body.appendChild(formControl);
    const formArrow = new KeyboardEvent('keydown', {
      code: 'ArrowLeft',
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true
    });
    formControl.dispatchEvent(formArrow);
    formControl.remove();
    const inputOwnership = {
      gameplayArrowClaimed: gameplayArrow.defaultPrevented,
      formArrowClaimed: formArrow.defaultPrevented,
      scrollY: window.scrollY
    };

    const originalGetGamepads = navigator.getGamepads?.bind(navigator);
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[7] = { pressed: true, value: 1 };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [{ connected: true, id: 'Phase 6 Test Pad', axes: [0.5, 0.75, -0.4, 0.3], buttons }]
    });
    ctx.updateControlInput();
    const gamepadActions = ctx.getControlInputSnapshot('plane');
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: originalGetGamepads || (() => [])
    });
    ctx.updateControlInput();

    ctx.setTravelMode('plane', {
      source: 'plane_interior_acceptance',
      force: true,
      x: center.x,
      z: center.z,
      y: roofY + 7,
      pitch: -0.3,
      speed: 20,
      throttle: 0,
      airborne: true
    });
    ctx.planeMode.pitch = -0.32;
    ctx.planeMode.speed = 19;
    ctx.planeMode.throttle = 0;
    ctx.planeMode.climbRate = -4;
    for (let i = 0; i < 420; i++) ctx.updatePlane(1 / 60);
    const roofLanding = ctx.getPlaneSnapshot();

    const walkStartedAt = performance.now();
    ctx.setTravelMode('walk', { source: 'plane_interior_acceptance', force: true, emitTutorial: false });
    const walkSwitchMs = performance.now() - walkStartedAt;
    const walkMode = ctx.getCurrentTravelMode();
    const walkFeetY = ctx.Walk.state.walker.y - 1.7;

    ctx.setTravelMode('plane', {
      source: 'plane_interior_acceptance',
      force: true,
      x: center.x,
      z: center.z,
      y: roofY + 70,
      speed: 24,
      throttle: 0.6,
      airborne: true
    });
    const beforeDrone = ctx.getPlaneSnapshot();
    const droneStartedAt = performance.now();
    ctx.setTravelMode('drone', { source: 'plane_interior_acceptance', force: true, emitTutorial: false });
    const droneSwitchMs = performance.now() - droneStartedAt;
    const drone = { x: ctx.drone.x, y: ctx.drone.y, z: ctx.drone.z };

    const first = building.pts?.[0];
    const second = building.pts?.[1];
    const edge = first && second ?
      { x: (first.x + second.x) * 0.5, z: (first.z + second.z) * 0.5 } :
      { x: building.minX, z: center.z };
    let outwardX = edge.x - center.x;
    let outwardZ = edge.z - center.z;
    const outwardLength = Math.hypot(outwardX, outwardZ) || 1;
    outwardX /= outwardLength;
    outwardZ /= outwardLength;
    const impactStart = { x: edge.x + outwardX * 4, z: edge.z + outwardZ * 4 };
    const impactYaw = Math.atan2(center.x - impactStart.x, center.z - impactStart.z);
    ctx.setTravelMode('plane', {
      source: 'plane_interior_acceptance',
      force: true,
      x: impactStart.x,
      z: impactStart.z,
      y: building.minY + (roofY - building.minY) * 0.55,
      yaw: impactYaw,
      speed: 30,
      throttle: 1,
      airborne: true
    });
    ctx.planeMode.speed = 30;
    ctx.planeMode.throttle = 1;
    for (let i = 0; i < 90; i++) ctx.updatePlane(1 / 60);
    const impact = ctx.getPlaneSnapshot();

    const driveStartedAt = performance.now();
    ctx.setTravelMode('drive', { source: 'plane_interior_acceptance', force: true, emitTutorial: false });
    const driveSwitchMs = performance.now() - driveStartedAt;
    const driveHit = ctx.checkBuildingCollision?.(ctx.car.x, ctx.car.z, 2, {
      actorBaseY: ctx.car.y - 1.2,
      actorHeight: 1.8
    });
    const driveExit = {
      mode: ctx.getCurrentTravelMode(),
      x: ctx.car.x,
      y: ctx.car.y,
      z: ctx.car.z,
      switchMs: driveSwitchMs,
      blocked: !!driveHit?.collision
    };
    ctx.setTravelMode('walk', { source: 'plane_interior_acceptance', force: true, emitTutorial: false });

    const support = ctx.resolveBuildingEntrySupport(building, { allowSynthetic: true });
    const bboxSupport = ctx.resolveBuildingEntrySupport({
      sourceBuildingId: 'acceptance-bbox-footprint',
      buildingType: 'commercial',
      baseY: building.baseY,
      minY: building.minY,
      maxY: building.maxY,
      minX: building.minX,
      maxX: building.maxX,
      minZ: building.minZ,
      maxZ: building.maxZ,
      centerX: building.centerX,
      centerZ: building.centerZ
    });
    ctx.Walk.state.walker.x = support.entryAnchor.x;
    ctx.Walk.state.walker.z = support.entryAnchor.z;
    ctx.Walk.state.walker.y = building.baseY + 1.7;
    ctx.car.x = support.entryAnchor.x;
    ctx.car.z = support.entryAnchor.z;
    const entered = await ctx.enterInteriorForSupport(support);
    const active = ctx.activeInterior;
    let interiorMovement = null;
    if (active?.entryPoint && active?.center) {
      const walker = ctx.Walk.state.walker;
      walker.x = active.entryPoint.x;
      walker.z = active.entryPoint.z;
      walker.y = active.entryPoint.y;
      walker.angle = Math.atan2(active.center.x - walker.x, active.center.z - walker.z);
      walker.yaw = walker.angle;
      walker.lookYawOffset = 0;

      const start = { x: walker.x, z: walker.z, lookYawOffset: walker.lookYawOffset };
      const entryCollision = ctx.checkBuildingCollision?.(walker.x, walker.z, 0.28, {
        actorBaseY: walker.y - 1.7,
        actorHeight: 1.62
      });
      ctx.keys.ArrowUp = true;
      for (let i = 0; i < 30; i++) {
        ctx.Walk.update(1 / 60);
        ctx.keepActiveInteriorContained?.();
      }
      ctx.keys.ArrowUp = false;
      const moved = Math.hypot(walker.x - start.x, walker.z - start.z);
      const beforeTurn = { x: walker.x, z: walker.z, yaw: walker.yaw, lookYawOffset: walker.lookYawOffset };
      ctx.keys.KeyA = true;
      for (let i = 0; i < 20; i++) ctx.Walk.update(1 / 60);
      ctx.keys.KeyA = false;
      const afterTurn = { x: walker.x, z: walker.z, yaw: walker.yaw, lookYawOffset: walker.lookYawOffset };
      ctx.keys.VirtualLookLeft = true;
      for (let i = 0; i < 20; i++) ctx.Walk.update(1 / 60);
      ctx.keys.VirtualLookLeft = false;
      interiorMovement = {
        moved,
        turnPositionDelta: Math.hypot(afterTurn.x - beforeTurn.x, afterTurn.z - beforeTurn.z),
        bodyYawDelta: Math.abs(afterTurn.yaw - beforeTurn.yaw),
        turnLookOffsetDelta: Math.abs(afterTurn.lookYawOffset - beforeTurn.lookYawOffset),
        lookPositionDelta: Math.hypot(walker.x - afterTurn.x, walker.z - afterTurn.z),
        cameraLookDelta: Math.abs(walker.lookYawOffset - afterTurn.lookYawOffset),
        remainedInside: !!ctx.activeInterior,
        entryCollision: entryCollision?.collision ? {
          id: entryCollision.building?.sourceBuildingId || '',
          type: entryCollision.building?.buildingType || '',
          interior: !!entryCollision.building?.isInteriorCollider,
          disabled: !!entryCollision.building?.collisionDisabled
        } : null
      };
    }

    const interiorReport = {
      entered: !!entered && !!active,
      bboxFootprintEnterable: bboxSupport?.enterable === true,
      mode: active?.mode,
      usableArea: active?.usableArea,
      exteriorArea: active?.exteriorArea,
      usableRatio: (active?.usableArea || 0) / (active?.exteriorArea || 1),
      partitionCount: active?.partitionCount,
      layoutKind: active?.layoutKind,
      colliderCount: ctx.dynamicBuildingColliders?.length || 0,
      footprintPoints: active?.usableFootprint?.length || 0,
      view: ctx.Walk.state.view,
      movement: interiorMovement
    };
    ctx.clearActiveInterior?.({ restorePlayer: true, preserveCache: true });
    const modeCycles = [];
    let previousReachableResources = null;
    const settleFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const waitForTerrainMeshPlateau = async () => {
      const expectedTerrainMeshes = (Math.max(1, Number(ctx.TERRAIN_RING) || 1) * 2 + 1) ** 2;
      const deadline = performance.now() + 10000;
      let stableSamples = 0;
      let previousCount = -1;
      const observedCounts = [];
      while (performance.now() < deadline) {
        const count = (ctx.terrainGroup?.children || [])
          .filter((mesh) => mesh?.userData?.isTerrainMesh)
          .length;
        if (observedCounts.at(-1) !== count) observedCounts.push(count);
        if (count === expectedTerrainMeshes && count === previousCount) stableSamples += 1;
        else stableSamples = 0;
        if (stableSamples >= 3) return count;
        previousCount = count;
        await new Promise((resolve) => globalThis.setTimeout(resolve, 120));
      }
      throw new Error(
        `Terrain streaming did not settle at ${expectedTerrainMeshes} meshes ` +
        `(observed ${observedCounts.join(' -> ') || 'none'})`
      );
    };
    const collectReachableResources = () => {
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      const geometryOwners = new Map();
      const materialOwners = new Map();
      const collectTexture = (value) => {
        if (value?.isTexture) textures.add(value);
      };
      ctx.scene?.traverse?.((object) => {
        const owner = String(object?.name || object?.parent?.name || object?.type || 'unnamed');
        if (object?.geometry) {
          geometries.add(object.geometry);
          if (!geometryOwners.has(object.geometry)) {
            geometryOwners.set(object.geometry, `${owner}:${object.geometry.type || 'Geometry'}`);
          }
        }
        const objectMaterials = Array.isArray(object?.material) ? object.material : [object?.material];
        for (const material of objectMaterials) {
          if (!material) continue;
          materials.add(material);
          if (!materialOwners.has(material)) {
            materialOwners.set(material, `${owner}:${material.type || 'Material'}`);
          }
          for (const value of Object.values(material)) collectTexture(value);
          for (const uniform of Object.values(material.uniforms || {})) collectTexture(uniform?.value);
        }
      });
      return {
        geometries: geometries.size,
        materials: materials.size,
        textures: textures.size,
        geometryOwners,
        materialOwners
      };
    };
    for (let cycle = 1; cycle <= 5; cycle += 1) {
      const origin = {
        x: Number(ctx.car?.x) || center.x,
        y: Math.max(Number(ctx.car?.y) || roofY, roofY) + 35,
        z: Number(ctx.car?.z) || center.z
      };
      const startedAt = performance.now();
      ctx.setTravelMode('plane', {
        source: 'mode_resource_plateau', force: true, ...origin, speed: 22, throttle: 0.5, airborne: true
      });
      ctx.setTravelMode('drone', { source: 'mode_resource_plateau', force: true, emitTutorial: false });
      ctx.setTravelMode('drive', { source: 'mode_resource_plateau', force: true, emitTutorial: false });
      ctx.setTravelMode('walk', { source: 'mode_resource_plateau', force: true, emitTutorial: false });
      await settleFrames();
      const terrainMeshCount = await waitForTerrainMeshPlateau();
      globalThis.gc?.();
      await settleFrames();
      const reachable = collectReachableResources();
      const resourceGrowth = previousReachableResources ? {
        geometries: [...reachable.geometryOwners]
          .filter(([geometry]) => !previousReachableResources.geometryOwners.has(geometry))
          .map(([, owner]) => owner),
        materials: [...reachable.materialOwners]
          .filter(([material]) => !previousReachableResources.materialOwners.has(material))
          .map(([, owner]) => owner)
      } : { geometries: [], materials: [] };
      previousReachableResources = reachable;
      modeCycles.push({
        cycle,
        durationMs: performance.now() - startedAt,
        currentMode: ctx.getCurrentTravelMode(),
        sceneChildren: ctx.scene?.children?.length || 0,
        planeMeshes: ctx.scene?.children?.filter((child) => child?.name === 'Explorer STOL Aircraft').length || 0,
        geometries: Number(ctx.renderer?.info?.memory?.geometries || 0),
        textures: Number(ctx.renderer?.info?.memory?.textures || 0),
        reachableGeometries: reachable.geometries,
        reachableMaterials: reachable.materials,
        reachableTextures: reachable.textures,
        terrainMeshCount,
        resourceGrowth,
        heapBytes: Number(performance.memory?.usedJSHeapSize || 0)
      });
    }
    const warmedHeapSamples = modeCycles
      .slice(1, -1)
      .map((cycle) => cycle.heapBytes)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    const heapMidpoint = Math.floor(warmedHeapSamples.length / 2);
    const warmedHeapMedian = warmedHeapSamples.length === 0
      ? 0
      : warmedHeapSamples.length % 2 === 0
        ? (warmedHeapSamples[heapMidpoint - 1] + warmedHeapSamples[heapMidpoint]) / 2
        : warmedHeapSamples[heapMidpoint];
    const finalHeapBytes = Number(modeCycles.at(-1)?.heapBytes || 0);
    const modeResourcePlateau = {
      buildingDetailStatus: String(ctx.worldDetailState?.buildings?.status || ''),
      warmedHeapSamples,
      warmedHeapMedian,
      finalHeapBytes,
      finalToMedianRatio: warmedHeapMedian > 0 ? finalHeapBytes / warmedHeapMedian : null
    };

    return {
      building: {
        id: building.sourceBuildingId,
        type: building.buildingType,
        area: polygonArea(building.pts),
        width: building.maxX - building.minX,
        depth: building.maxZ - building.minZ,
        roofY
      },
      roofLanding: {
        ...roofLanding,
        walkMode,
        walkSwitchMs,
        walkFeetY,
        roofDelta: walkFeetY - roofY
      },
      droneTransfer: {
        before: beforeDrone,
        after: drone,
        switchMs: droneSwitchMs,
        horizontalDelta: Math.hypot(drone.x - beforeDrone.x, drone.z - beforeDrone.z),
        altitudeDelta: drone.y - beforeDrone.y
      },
      impact,
      planeControls: { pullUpPitch, noseDownPitch, controlChordThrottle, zThrottle, xThrottle, inputOwnership, gamepadActions },
      driveExit,
      modeCycles,
      modeResourcePlateau,
      interior: interiorReport
    };
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const hostedBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
  const server = hostedBaseUrl ? null : await startStaticRootServer({
    rootDir,
    host: '127.0.0.1',
    candidatePorts: [4234, 4235, 4236]
  });
  const baseUrl = hostedBaseUrl || `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info']
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await launchBaltimore(page, baseUrl);
    const report = await exerciseLifecycle(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outputDir, 'interior.png') });
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

    assert(report.roofLanding.contactKind === 'building', `Plane missed the roof surface: ${JSON.stringify(report.roofLanding)}`);
    assert(!report.roofLanding.airborne, 'Plane did not settle on the building roof');
    assert(report.roofLanding.walkMode === 'walk', `Plane-to-walk resolved as ${report.roofLanding.walkMode}`);
    assert(Math.abs(report.roofLanding.roofDelta) <= 0.5, `Walk exit left the roof by ${report.roofLanding.roofDelta}m`);
    assert(report.roofLanding.walkSwitchMs <= MODE_SWITCH_BUDGET_MS, `Plane-to-walk stalled for ${report.roofLanding.walkSwitchMs}ms`);
    assert(report.droneTransfer.horizontalDelta <= 0.2, 'Plane-to-drone changed horizontal position');
    assert(report.droneTransfer.altitudeDelta >= -0.2, 'Plane-to-drone lost altitude');
    assert(report.droneTransfer.switchMs <= MODE_SWITCH_BUDGET_MS, `Plane-to-drone stalled for ${report.droneTransfer.switchMs}ms`);
    assert(report.impact.lastImpactAt > 0 && report.impact.speed <= 5, `Building impact did not settle: ${JSON.stringify(report.impact)}`);
    assert(report.planeControls.pullUpPitch > 0.1, `Arrow Down did not pull the plane nose up: ${JSON.stringify(report.planeControls)}`);
    assert(report.planeControls.noseDownPitch < -0.1, `Arrow Up did not push the plane nose down: ${JSON.stringify(report.planeControls)}`);
    assert(Math.abs(report.planeControls.controlChordThrottle - 0.6) < 0.02, `Control changed plane throttle: ${JSON.stringify(report.planeControls)}`);
    assert(report.planeControls.zThrottle < 0.5, `Z did not reduce plane throttle: ${JSON.stringify(report.planeControls)}`);
    assert(report.planeControls.xThrottle > 0.5, `X did not increase plane throttle: ${JSON.stringify(report.planeControls)}`);
    assert(report.planeControls.inputOwnership.gameplayArrowClaimed, 'Gameplay arrow key was not claimed from the browser');
    assert(!report.planeControls.inputOwnership.formArrowClaimed, 'Form control arrow key was incorrectly claimed');
    assert(report.planeControls.inputOwnership.scrollY === 0, 'Gameplay arrow key scrolled the page');
    assert(report.planeControls.gamepadActions?.device === 'gamepad', 'Gamepad was not recognized');
    assert(report.planeControls.gamepadActions.actions.pitch > 0.5, 'Gamepad pitch was not inverted');
    assert(report.planeControls.gamepadActions.actions.throttleAdjust > 0.5, 'Gamepad throttle was not mapped');
    assert(report.driveExit.mode === 'drive', `Plane-to-drive resolved as ${report.driveExit.mode}`);
    assert(report.driveExit.switchMs <= MODE_SWITCH_BUDGET_MS, `Plane-to-drive stalled for ${report.driveExit.switchMs}ms`);
    assert(!report.driveExit.blocked, `Plane-to-drive spawned inside a building: ${JSON.stringify(report.driveExit)}`);
    const warmModeCycle = report.modeCycles.at(-2);
    const finalModeCycle = report.modeCycles.at(-1);
    assert(report.modeCycles.every((cycle) => cycle.currentMode === 'walk'), 'Repeated mode cycle did not return to walk');
    assert(report.modeCycles.every((cycle) => cycle.planeMeshes === 1), 'Repeated mode cycle duplicated the plane mesh');
    assert(
      finalModeCycle.reachableGeometries <= warmModeCycle.reachableGeometries,
      'Reachable scene geometry count grew after mode warm-up'
    );
    assert(
      finalModeCycle.reachableMaterials <= warmModeCycle.reachableMaterials,
      'Reachable scene material count grew after mode warm-up'
    );
    assert(
      finalModeCycle.reachableTextures <= warmModeCycle.reachableTextures,
      'Reachable scene texture count grew after mode warm-up'
    );
    assert(
      report.modeResourcePlateau.buildingDetailStatus !== 'loading',
      'Mode resource plateau started before deferred world detail settled'
    );
    if (report.modeResourcePlateau.warmedHeapMedian > 0 && finalModeCycle.heapBytes > 0) {
      assert(
        finalModeCycle.heapBytes <= report.modeResourcePlateau.warmedHeapMedian * 1.15,
        `Browser heap retained growth after mode warm-up: ${JSON.stringify(report.modeResourcePlateau)}`
      );
    }
    assert(report.interior.entered, 'Large building interior did not open');
    assert(report.interior.bboxFootprintEnterable, 'A valid bounding-box building was not enterable');
    assert(report.interior.usableRatio >= 0.75, `Interior uses only ${(report.interior.usableRatio * 100).toFixed(1)}% of its footprint`);
    assert(report.interior.colliderCount >= report.interior.footprintPoints, 'Interior shell is missing collision walls');
    assert(report.interior.partitionCount > 0, 'Large generated interior has no room circulation plan');
    assert(report.interior.view === 'first', `Interior did not use the first-person camera: ${JSON.stringify(report.interior)}`);
    assert(report.interior.movement?.moved > 0.35, `Arrow movement was blocked inside the building: ${JSON.stringify(report.interior.movement)}`);
    assert(report.interior.movement?.turnPositionDelta < 0.05, `A/D camera look moved the character sideways: ${JSON.stringify(report.interior.movement)}`);
    assert(report.interior.movement?.bodyYawDelta < 0.05, `A/D camera look incorrectly turned the character: ${JSON.stringify(report.interior.movement)}`);
    assert(report.interior.movement?.turnLookOffsetDelta > 0.2, `A/D did not rotate the independent camera look: ${JSON.stringify(report.interior.movement)}`);
    assert(report.interior.movement?.lookPositionDelta < 0.05, `Camera-look input moved the character: ${JSON.stringify(report.interior.movement)}`);
    assert(report.interior.movement?.cameraLookDelta > 0.2, `Camera-look input did not rotate the interior view: ${JSON.stringify(report.interior.movement)}`);
    assert(report.interior.movement?.remainedInside, 'Walking input unexpectedly exited the building interior');
    assert(errors.length === 0, `Page errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } finally {
    await browser.close();
    await server?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
