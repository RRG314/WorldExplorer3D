import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'showcase');
const requestedIds = new Set(
  String(process.env.SHOWCASE_IDS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const locations = [
  {
    id: 'new-york',
    key: 'newyork',
    label: 'New York City',
    shots: [
      {
        id: 'new-york-expanded-aerial',
        camera: [40.733, -74.035],
        target: [40.758, -73.9855],
        height: 690,
        lookHeight: 60,
        fov: 46
      },
      {
        id: 'new-york-harbor-skyline',
        camera: [40.702, -74.017],
        target: [40.713, -74.006],
        height: 170,
        lookHeight: 45,
        fov: 49
      }
    ]
  },
  {
    id: 'baltimore',
    key: 'baltimore',
    label: 'Baltimore',
    shots: [
      {
        id: 'baltimore-inner-harbor-aerial',
        camera: [39.274, -76.622],
        target: [39.2904, -76.6122],
        height: 520,
        lookHeight: 40,
        fov: 48
      },
      {
        id: 'baltimore-waterfront-skyline',
        camera: [39.2755, -76.606],
        target: [39.2895, -76.613],
        height: 190,
        lookHeight: 35,
        fov: 50
      }
    ]
  },
  {
    id: 'monaco',
    key: 'monaco',
    label: 'Monaco',
    shots: [
      {
        id: 'monaco-coast-aerial',
        camera: [43.7305, 7.4105],
        target: [43.7384, 7.4246],
        height: 520,
        lookHeight: 45,
        fov: 49
      },
      {
        id: 'monaco-waterfront-skyline',
        camera: [43.7285, 7.422],
        target: [43.7384, 7.4246],
        height: 210,
        lookHeight: 50,
        fov: 50
      }
    ]
  },
  {
    id: 'san-francisco',
    key: 'sanfrancisco',
    label: 'San Francisco',
    shots: [
      {
        id: 'san-francisco-bay-skyline',
        camera: [37.786, -122.389],
        target: [37.793, -122.405],
        height: 320,
        lookHeight: 48,
        fov: 48
      }
    ]
  },
  {
    id: 'golden-gate',
    custom: { lat: 37.8202408, lon: -122.47857 },
    label: 'Golden Gate Bridge',
    shots: [
      {
        id: 'golden-gate-aerial',
        camera: [37.806, -122.500],
        target: [37.8199, -122.4783],
        height: 560,
        lookHeight: 45,
        fov: 48
      }
    ],
    carShot: true
  },
  {
    id: 'los-angeles',
    key: 'hollywood',
    label: 'Los Angeles — Hollywood',
    shots: [
      {
        id: 'los-angeles-city-aerial',
        camera: [34.082, -118.345],
        target: [34.0928, -118.3287],
        height: 260,
        lookHeight: 55,
        fov: 47
      }
    ]
  },
  {
    id: 'london',
    key: 'london',
    label: 'London',
    shots: [
      {
        id: 'london-thames-aerial',
        camera: [51.500, -0.088],
        target: [51.5055, -0.0754],
        height: 145,
        lookHeight: 42,
        fov: 48
      }
    ]
  },
  {
    id: 'tokyo',
    custom: { lat: 35.6896, lon: 139.6917 },
    label: 'Tokyo — Shinjuku',
    shots: [
      {
        id: 'tokyo-expanded-aerial',
        camera: [35.681, 139.705],
        target: [35.6896, 139.6917],
        height: 280,
        lookHeight: 55,
        fov: 47
      }
    ]
  },
  {
    id: 'dubai',
    key: 'dubai',
    label: 'Dubai',
    shots: [
      {
        id: 'dubai-coast-skyline',
        camera: [25.191, 55.257],
        target: [25.2048, 55.2708],
        height: 320,
        lookHeight: 65,
        fov: 47
      }
    ]
  }
];

const selectedLocations = requestedIds.size > 0
  ? locations.filter((location) => requestedIds.has(location.id))
  : locations;

if (selectedLocations.length === 0) {
  throw new Error(`No showcase locations matched SHOWCASE_IDS=${process.env.SHOWCASE_IDS || ''}`);
}

await fs.mkdir(outputDir, { recursive: true });

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4330, 4331, 4332, 4333]
});
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const report = {
  ok: false,
  browser: 'Google Chrome',
  baseUrl,
  selectedIds: selectedLocations.map(({ id }) => id),
  locations: [],
  providerWarnings: [],
  fatalErrors: []
};

function isRecoverableProviderMessage(message = '') {
  return /Failed to load resource|net::ERR_|blocked by CORS|Could not reach Cloud Firestore|\b(?:400|429|500|502|503|504)\b|Overpass|WorldCover|Shortbread|Terrarium|tile/i.test(message);
}

async function instrumentPage(page, locationId) {
  await page.route('**/*', (route) => (
    route.request().resourceType() === 'font' ? route.abort() : route.continue()
  ));
  page.on('pageerror', (error) => {
    report.fatalErrors.push({ locationId, message: String(error?.stack || error) });
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const entry = { locationId, message: message.text() };
    if (isRecoverableProviderMessage(message.text())) report.providerWarnings.push(entry);
    else report.fatalErrors.push(entry);
  });
}

async function captureShowcaseViewport(page, filePath) {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send('Page.captureScreenshot', {
      captureBeyondViewport: false,
      format: 'png',
      fromSurface: true
    });
    await fs.writeFile(filePath, Buffer.from(result.data, 'base64'));
  } finally {
    await session.detach();
  }
  return page.evaluate(() => import('/app/js/shared-context.js?v=55').then(({ ctx }) => ({
    camera: ctx.camera ? {
      x: Number(ctx.camera.position.x.toFixed(2)),
      y: Number(ctx.camera.position.y.toFixed(2)),
      z: Number(ctx.camera.position.z.toFixed(2))
    } : null,
    roads: Number(ctx.roads?.length || 0),
    buildings: Number(ctx.buildings?.length || 0),
    buildingMeshes: Number(ctx.buildingMeshes?.length || 0),
    contextLost: !!ctx.renderer?.getContext?.().isContextLost?.()
  })));
}

async function bootstrap(page) {
  await page.goto(`${baseUrl}/app/?showcase-capture=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx?.loadRoads === 'function' && typeof ctx?.selectPresetLocation === 'function') {
        await ctx.ensureEarthRuntimeReady?.();
        if (ctx.getEarthRuntimeSnapshot?.().ready === true) return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Showcase Earth runtime bootstrap timed out');
  });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV?.EARTH || 'EARTH');
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    document.getElementById('globeHubOverlay')?.setAttribute('hidden', '');
  });
}

async function loadLocation(page, location) {
  const load = await page.evaluate(async ({ key, custom, label }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (custom) {
      ctx.customLoc = { lat: custom.lat, lon: custom.lon, name: label };
      ctx.customLocTransient = false;
      ctx.selLoc = 'custom';
    } else {
      ctx.selLoc = key;
    }
    const startedAt = performance.now();
    const sequenceBefore = Number(ctx._worldLoadSequence || 0);
    await ctx.loadRoads();
    const detailStartedAt = performance.now();
    while (
      ctx.worldDetailState?.buildings?.status === 'loading' &&
      performance.now() - detailStartedAt < 35000
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    const meshPublicationStartedAt = performance.now();
    while (
      Number(ctx.buildings?.length || 0) > 0 &&
      Number(ctx.buildingMeshes?.length || 0) === 0 &&
      performance.now() - meshPublicationStartedAt < 30000
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    if (label === 'Golden Gate Bridge') {
      const landmarkStartedAt = performance.now();
      while (
        !(ctx.historicMarkers || []).some((mesh) =>
          String(mesh?.userData?.landmarkKind || '').startsWith('suspension_bridge')
        ) &&
        performance.now() - landmarkStartedAt < 20000
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
    }
    ctx.setRenderQualityLevel?.('high', { persist: false });
    ctx.setWeatherMode?.('clear');
    ctx.setTimeOfDay?.('day');
    ctx.applyWeatherPresentation?.();
    ctx.setTravelMode?.('drone', {
      source: 'showcase-capture',
      emitTutorial: false,
      force: true
    });
    document.querySelector('[aria-label="Dismiss tutorial hint"]')?.click?.();
    document.getElementById('loading')?.classList.remove('show');
    return {
      loadMs: Number((performance.now() - startedAt).toFixed(1)),
      sequenceBefore,
      sequenceAfter: Number(ctx._worldLoadSequence || 0),
      runtimeStatus: ctx.worldLoadRuntimeState?.status || null,
      roads: Number(ctx.roads?.length || 0),
      buildings: Number(ctx.buildings?.length || 0),
      buildingMeshes: Number(ctx.buildingMeshes?.length || 0),
      landmarkMeshes: Number((ctx.historicMarkers || []).length),
      contextLost: !!ctx.renderer?.getContext?.().isContextLost?.()
    };
  }, location);
  if (load.runtimeStatus !== 'ready' || load.roads <= 0 || load.contextLost) {
    throw new Error(`${location.id} did not publish a renderable world: ${JSON.stringify(load)}`);
  }
  await page.waitForTimeout(700);
  return load;
}

async function setShowcaseCamera(page, shot) {
  return page.evaluate(({ camera, target, height, lookHeight, fov }) => import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
    const cameraWorld = ctx.geoToWorld(camera[0], camera[1]);
    const targetWorld = ctx.geoToWorld(target[0], target[1]);
    const cameraGround = Number(ctx.SurfaceQuery?.terrainAt?.(cameraWorld.x, cameraWorld.z)?.position?.y);
    const targetGround = Number(ctx.SurfaceQuery?.terrainAt?.(targetWorld.x, targetWorld.z)?.position?.y);
    const baseY = Math.max(
      Number.isFinite(cameraGround) ? cameraGround : 0,
      Number.isFinite(targetGround) ? targetGround : 0
    );
    const cameraY = baseY + height;
    const targetY = (Number.isFinite(targetGround) ? targetGround : 0) + lookHeight;
    const dx = targetWorld.x - cameraWorld.x;
    const dy = targetY - cameraY;
    const dz = targetWorld.z - cameraWorld.z;
    const horizontalDistance = Math.hypot(dx, dz) || 1;
    ctx.setPauseReason?.('showcase-capture', true);
    if (ctx.drone) {
      ctx.drone.x = cameraWorld.x;
      ctx.drone.y = cameraY;
      ctx.drone.z = cameraWorld.z;
      ctx.drone.yaw = Math.atan2(-dx, -dz);
      ctx.drone.pitch = Math.atan2(dy, horizontalDistance);
      ctx.drone.roll = 0;
      ctx.drone.cameraYawOffset = 0;
      ctx.drone.speed = 0;
    }
    ctx.presentationPose = null;
    ctx.camera.fov = fov;
    ctx.camera.position.set(cameraWorld.x, cameraY, cameraWorld.z);
    ctx.camera.lookAt(
      targetWorld.x,
      targetY,
      targetWorld.z
    );
    ctx.camera.updateProjectionMatrix?.();
    ctx.camera.updateMatrixWorld?.(true);
    ctx.renderer?.render?.(ctx.scene, ctx.camera);
    const tutorialCard = document.getElementById('tutorialHintCard');
    if (tutorialCard) tutorialCard.style.display = 'none';
    return {
      cameraWorld: { x: cameraWorld.x, y: cameraY, z: cameraWorld.z },
      targetWorld: { x: targetWorld.x, y: targetY, z: targetWorld.z },
      cameraGround,
      targetGround,
      fov
    };
  }), shot);
}

async function captureGoldenGateCar(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const targetWorld = ctx.geoToWorld(37.8202408, -122.47857);
    const bridgeRoads = (ctx.roads || []).filter((road) => road?.structureSemantics?.isBridge === true);
    let best = null;
    for (const road of bridgeRoads) {
      for (let index = 0; index < (road.pts?.length || 0) - 1; index += 1) {
        const start = road.pts[index];
        const end = road.pts[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lengthSq = dx * dx + dz * dz;
        const t = lengthSq > 0
          ? Math.max(0, Math.min(1, ((targetWorld.x - start.x) * dx + (targetWorld.z - start.z) * dz) / lengthSq))
          : 0;
        const point = { x: start.x + dx * t, z: start.z + dz * t };
        const distance = Math.hypot(point.x - targetWorld.x, point.z - targetWorld.z);
        if (!best || distance < best.distance) best = { road, index, start, end, point, t, distance };
      }
    }
    if (!best) throw new Error('No mapped Golden Gate bridge road was available for the car shot');
    const angle = Math.atan2(best.end.x - best.start.x, best.end.z - best.start.z);
    const sampledStructureY = Number(ctx.sampleFeatureSurfaceY?.(
      best.road,
      best.point.x,
      best.point.z,
      { segIndex: best.index, t: best.t }
    ));
    const surfaceY = Number.isFinite(sampledStructureY)
      ? sampledStructureY
      : Number(ctx.SurfaceQuery?.roadAt?.(best.point.x, best.point.z)?.position?.y ?? 0);
    ctx.setPauseReason?.('showcase-capture', false);
    ctx.setTravelMode?.('drive', { source: 'showcase-capture', emitTutorial: false, force: true });
    ctx.applyResolvedWorldSpawn?.({
      valid: true,
      mode: 'drive',
      x: best.point.x,
      z: best.point.z,
      angle,
      carY: surfaceY + 1.2,
      walkY: surfaceY + 1.7,
      onRoad: true,
      road: best.road,
      source: 'showcase-golden-gate-car'
    }, { mode: 'drive' });
    Object.assign(ctx.car, { speed: 0, vFwd: 0, vLat: 0, vx: 0, vz: 0, yawRate: 0 });
    const behind = 16;
    const side = 5;
    const cameraX = best.point.x - Math.sin(angle) * behind + Math.cos(angle) * side;
    const cameraZ = best.point.z - Math.cos(angle) * behind - Math.sin(angle) * side;
    ctx.setPauseReason?.('showcase-capture', true);
    ctx.camMode = 0;
    ctx.camera.fov = 52;
    ctx.camera.position.set(cameraX, surfaceY + 7.5, cameraZ);
    ctx.camera.lookAt(
      best.point.x + Math.sin(angle) * 15,
      surfaceY + 2.2,
      best.point.z + Math.cos(angle) * 15
    );
    ctx.camera.userData.carLook = { yaw: 0, pitch: -0.08, lastInputAt: performance.now() };
    ctx.camera.userData.lookTarget = { x: best.point.x, y: surfaceY + 0.5, z: best.point.z };
    ctx.camera.updateProjectionMatrix?.();
    ctx.camera.updateMatrixWorld?.(true);
    ctx.renderer?.render?.(ctx.scene, ctx.camera);
    return {
      bridgeRoadCount: bridgeRoads.length,
      targetDistance: Number(best.distance.toFixed(1)),
      roadName: best.road?.tags?.name || best.road?.name || null,
      car: { x: best.point.x, y: surfaceY + 1.2, z: best.point.z, angle }
    };
  });
}

async function captureLocation(location) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    screen: { width: 1600, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await instrumentPage(page, location.id);
  const result = { id: location.id, label: location.label, ok: false, shots: [] };
  try {
    await bootstrap(page);
    result.load = await loadLocation(page, location);
    for (const shot of location.shots) {
      const camera = await setShowcaseCamera(page, shot);
      const filename = `${shot.id}.png`;
      const diagnostics = await captureShowcaseViewport(page, path.join(outputDir, filename));
      result.shots.push({ id: shot.id, filename, camera, diagnostics });
    }
    if (location.carShot) {
      const car = await captureGoldenGateCar(page);
      const filename = 'golden-gate-car.png';
      const diagnostics = await captureShowcaseViewport(page, path.join(outputDir, filename));
      result.shots.push({ id: 'golden-gate-car', filename, car, diagnostics });
    }
    result.ok = true;
  } catch (error) {
    result.error = String(error?.stack || error);
  } finally {
    await context.close();
  }
  report.locations.push(result);
  console.log(JSON.stringify({
    id: result.id,
    ok: result.ok,
    loadMs: result.load?.loadMs,
    shots: result.shots.map(({ filename }) => filename),
    error: result.error
  }));
}

try {
  for (const location of selectedLocations) {
    await captureLocation(location);
  }
  report.ok = report.locations.every((location) => location.ok) && report.fatalErrors.length === 0;
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    throw new Error(`Showcase capture failed: ${JSON.stringify({
      failed: report.locations.filter((location) => !location.ok).map(({ id, error }) => ({ id, error })),
      fatalErrors: report.fatalErrors
    })}`);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(JSON.stringify({
  ok: true,
  outputDir,
  screenshots: report.locations.flatMap((location) => location.shots.map(({ filename }) => filename)),
  providerWarningCount: report.providerWarnings.length
}, null, 2));
