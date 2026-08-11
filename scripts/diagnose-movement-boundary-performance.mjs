import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const locationId = String(process.env.WE3D_DIAG_LOCATION || 'baltimore').trim().toLowerCase();
const locationSpecs = Object.freeze({
  baltimore: Object.freeze({ lat: 39.2904, lon: -76.6122, name: 'Baltimore' }),
  monaco: Object.freeze({ lat: 43.7384, lon: 7.4246, name: 'Monaco' })
});
const locationSpec = locationSpecs[locationId];
if (!locationSpec) throw new Error(`Unsupported diagnostic location: ${locationId}`);
const outputLabel = String(process.env.WE3D_DIAG_OUTPUT || locationId).replace(/[^a-z0-9._-]/gi, '-');
const outputDir = path.join(rootDir, 'output', 'playwright', 'movement-boundary-diagnostic', outputLabel);
const browserChannel = String(process.env.WE3D_BROWSER_CHANNEL || 'chrome').trim();
const sweepFrames = Math.max(180, Number(process.env.WE3D_DIAG_FRAMES) || 420);
const disableMinimap = process.env.WE3D_DIAG_DISABLE_MINIMAP === '1';
const boundRoadLookup = process.env.WE3D_DIAG_BOUND_ROAD_LOOKUP === '1';

await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4250, 4251, 4252, 4253]
});
const browser = await chromium.launch({
  headless: true,
  ...(browserChannel ? { channel: browserChannel } : {})
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
const movementRequests = [];
let phase = 'bootstrap';

page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource|blocked by CORS/i.test(message.text())) {
    consoleErrors.push(message.text());
  }
});
page.on('request', (request) => {
  if (phase === 'movement') movementRequests.push(request.url());
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?movement-boundary-diagnostic=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (
        typeof ctx?.loadRoads === 'function' &&
        typeof ctx?.setTravelMode === 'function' &&
        typeof ctx?.setCustomLocation === 'function' &&
        typeof ctx?.startMode === 'function' &&
        Boolean(ctx?.ENV?.EARTH) &&
        Object.keys(ctx?.LOCS || {}).length > 0
      ) return;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Runtime bootstrap timed out');
  });

  await page.evaluate(async (requestedLocation) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const selected = ctx.setCustomLocation?.(requestedLocation, { transient: false });
    if (!selected) {
      throw new Error(`Unknown diagnostic location: ${JSON.stringify({
        requestedLocation,
        currentSelection: ctx.selLoc
      })}`);
    }
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
    ctx.startMode?.();
  }, locationSpec);
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.worldLoadRuntimeState?.status === 'ready' && ctx.worldLoading !== true;
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1000);

  phase = 'movement';
  const report = await page.evaluate(async ({ requestedLocation, frameCount, controls }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const detailedMeshes = (ctx.terrainGroup?.children || []).filter((mesh) => (
      mesh?.userData?.isTerrainMesh &&
      !mesh.userData?.isFixedLocationTerrainLod &&
      mesh.visible !== false
    ));
    const bounds = detailedMeshes.reduce((result, mesh) => {
      mesh.geometry?.computeBoundingBox?.();
      const box = mesh.geometry?.boundingBox;
      if (!box) return result;
      return {
        minX: Math.min(result.minX, Number(mesh.position?.x || 0) + box.min.x),
        maxX: Math.max(result.maxX, Number(mesh.position?.x || 0) + box.max.x),
        minZ: Math.min(result.minZ, Number(mesh.position?.z || 0) + box.min.z),
        maxZ: Math.max(result.maxZ, Number(mesh.position?.z || 0) + box.max.z)
      };
    }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    if (!Number.isFinite(bounds.minX)) throw new Error('Detailed terrain bounds unavailable');

    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
    const startX = bounds.minX + 500;
    const endX = bounds.minX - 1800;
    const bucketForX = (x) => {
      const outside = bounds.minX - x;
      if (outside < -250) return 'detailed-inner';
      if (outside <= 0) return 'detailed-edge';
      if (outside <= 350) return 'outer-near';
      if (outside <= 1050) return 'outer-middle';
      return 'outer-far';
    };
    const percentile = (values, ratio) => {
      if (!values.length) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio));
      return sorted[index];
    };
    const summarizeValues = (values) => ({
      count: values.length,
      meanMs: Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(4)),
      p95Ms: Number(percentile(values, 0.95).toFixed(4)),
      p99Ms: Number(percentile(values, 0.99).toFixed(4)),
      maxMs: Number(values.reduce((maximum, value) => Math.max(maximum, value), 0).toFixed(4))
    });

    const diagnostic = {
      mode: 'none',
      bucket: 'none',
      functions: {},
      frames: [],
      longTasks: []
    };
    window.__movementBoundaryDiagnostic = diagnostic;
    if (controls.disableMinimap) {
      ctx.drawMinimap = () => {};
    }
    if (controls.boundRoadLookup && typeof ctx.findNearestRoad === 'function') {
      const originalFindNearestRoad = ctx.findNearestRoad;
      ctx.findNearestRoad = function (x, z, options = {}) {
        const outsideDetailedGrid = x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ;
        if (outsideDetailedGrid && options.forceFullScan !== true) {
          return {
            road: null,
            dist: Infinity,
            pt: { x, z },
            y: NaN,
            verticalDelta: Infinity,
            distanceAlong: NaN,
            segIndex: -1,
            t: NaN,
            distanceToEndpoint: Infinity,
            distanceToTransitionZone: Infinity
          };
        }
        return originalFindNearestRoad.call(this, x, z, options);
      };
    }
    const functionNames = [
      'terrainMeshHeightAt',
      'elevationWorldYAtWorldXZ',
      'findNearestRoad',
      'getNearbyBuildings',
      'refreshBoatAvailability',
      'drawMinimap',
      'updateHUD',
      'updateCamera',
      'update'
    ];
    for (const name of functionNames) {
      const original = ctx[name];
      if (typeof original !== 'function') continue;
      const wrapped = function (...args) {
        const startedAt = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          const key = `${diagnostic.mode}:${diagnostic.bucket}:${name}`;
          (diagnostic.functions[key] ||= []).push(performance.now() - startedAt);
        }
      };
      ctx[name] = wrapped;
    }
    const originalRender = ctx.renderer?.render;
    if (typeof originalRender === 'function') {
      ctx.renderer.render = function (...args) {
        const startedAt = performance.now();
        try {
          return originalRender.apply(this, args);
        } finally {
          const key = `${diagnostic.mode}:${diagnostic.bucket}:renderer.render`;
          (diagnostic.functions[key] ||= []).push(performance.now() - startedAt);
        }
      };
    }

    let longTaskObserver = null;
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          diagnostic.longTasks.push({
            mode: diagnostic.mode,
            bucket: diagnostic.bucket,
            durationMs: Number(entry.duration.toFixed(2))
          });
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    }

    const microbenchPoints = [
      { id: 'center', x: centerX },
      { id: 'detailed-edge', x: bounds.minX + 80 },
      { id: 'outer-near', x: bounds.minX - 80 },
      { id: 'outer-middle', x: bounds.minX - 700 },
      { id: 'outer-far', x: bounds.minX - 1700 }
    ];
    const microbench = [];
    for (const point of microbenchPoints) {
      const row = { id: point.id, x: point.x, z: centerZ, samples: {} };
      for (const name of ['terrainMeshHeightAt', 'elevationWorldYAtWorldXZ', 'findNearestRoad', 'getNearbyBuildings']) {
        if (typeof ctx[name] !== 'function') continue;
        const values = [];
        for (let index = 0; index < 240; index += 1) {
          const offset = (index % 12) * 0.23;
          const startedAt = performance.now();
          if (name === 'findNearestRoad') {
            ctx[name](point.x + offset, centerZ, { forceFullScan: false });
          } else if (name === 'getNearbyBuildings') {
            ctx[name](point.x + offset, centerZ, 20);
          } else {
            ctx[name](point.x + offset, centerZ);
          }
          values.push(performance.now() - startedAt);
        }
        row.samples[name] = summarizeValues(values);
      }
      microbench.push(row);
    }

    function setActorPosition(mode, x, z) {
      diagnostic.mode = mode;
      diagnostic.bucket = bucketForX(x);
      const terrainY = ctx.terrainMeshHeightAt?.(x, z) ?? 0;
      if (mode === 'drive') {
        ctx.car.x = x;
        ctx.car.z = z;
        ctx.car.y = Number.isFinite(terrainY) ? terrainY + 1.2 : ctx.car.y;
        ctx.car.speed = 0;
      } else if (mode === 'walk') {
        const walker = ctx.Walk.state.walker;
        walker.x = x;
        walker.z = z;
        walker.y = Number.isFinite(terrainY) ? terrainY + ctx.Walk.CFG.eyeHeight : walker.y;
        walker.vy = 0;
      } else if (mode === 'drone') {
        ctx.drone.x = x;
        ctx.drone.z = z;
        ctx.drone.y = Number.isFinite(terrainY) ? terrainY + 120 : ctx.drone.y;
      } else if (mode === 'plane') {
        ctx.planeMode.x = x;
        ctx.planeMode.z = z;
        ctx.planeMode.y = Number.isFinite(terrainY) ? terrainY + 180 : ctx.planeMode.y;
        ctx.planeMode.speed = 0;
        ctx.planeMode.throttle = 0;
        ctx.planeMode.airborne = true;
      }
    }

    async function prepareMode(mode) {
      const terrainY = ctx.terrainMeshHeightAt?.(startX, centerZ) ?? 0;
      if (mode === 'plane') {
        ctx.setTravelMode('plane', {
          source: 'movement_boundary_diagnostic',
          force: true,
          x: startX,
          y: terrainY + 180,
          z: centerZ,
          yaw: -Math.PI / 2,
          speed: 0,
          throttle: 0,
          airborne: true
        });
      } else {
        ctx.setTravelMode(mode, {
          source: 'movement_boundary_diagnostic',
          force: true,
          emitTutorial: false
        });
      }
      setActorPosition(mode, startX, centerZ);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    async function sweepMode(mode) {
      await prepareMode(mode);
      const samples = [];
      let lastTimestamp = null;
      for (let frame = 0; frame < frameCount; frame += 1) {
        const t = frame / Math.max(1, frameCount - 1);
        const x = startX + (endX - startX) * t;
        setActorPosition(mode, x, centerZ);
        await new Promise((resolve) => requestAnimationFrame((timestamp) => {
          const frameMs = lastTimestamp == null ? 0 : timestamp - lastTimestamp;
          lastTimestamp = timestamp;
          const render = ctx.renderer?.info?.render || {};
          samples.push({
            x,
            bucket: bucketForX(x),
            frameMs,
            calls: Number(render.calls || 0),
            triangles: Number(render.triangles || 0)
          });
          resolve();
        }));
      }
      diagnostic.frames.push(...samples.map((sample) => ({ mode, ...sample })));
      const byBucket = {};
      for (const bucket of ['detailed-inner', 'detailed-edge', 'outer-near', 'outer-middle', 'outer-far']) {
        const rows = samples.filter((sample) => sample.bucket === bucket && sample.frameMs > 0);
        byBucket[bucket] = {
          frame: summarizeValues(rows.map((row) => row.frameMs)),
          callsMean: Number((rows.reduce((sum, row) => sum + row.calls, 0) / Math.max(1, rows.length)).toFixed(2)),
          trianglesMean: Math.round(rows.reduce((sum, row) => sum + row.triangles, 0) / Math.max(1, rows.length))
        };
      }
      return byBucket;
    }

    const modes = {};
    for (const mode of ['drive', 'walk', 'drone', 'plane']) {
      modes[mode] = await sweepMode(mode);
    }
    longTaskObserver?.disconnect();

    const functionSummary = {};
    for (const [key, values] of Object.entries(diagnostic.functions)) {
      functionSummary[key] = summarizeValues(values);
    }
    const renderer = ctx.renderer?.getContext?.();
    const debugRendererInfo = renderer?.getExtension?.('WEBGL_debug_renderer_info');
    const gpu = debugRendererInfo ? {
      vendor: renderer.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL),
      renderer: renderer.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
    } : {
      vendor: renderer?.getParameter?.(renderer.VENDOR) || '',
      renderer: renderer?.getParameter?.(renderer.RENDERER) || ''
    };
    return {
      generatedAt: new Date().toISOString(),
      location: requestedLocation,
      controls,
      browser: navigator.userAgent,
      gpu,
      world: {
        roads: ctx.roads?.length || 0,
        buildings: ctx.buildings?.length || 0,
        buildingMeshes: ctx.buildingMeshes?.length || 0,
        waterAreas: ctx.waterAreas?.length || 0,
        terrainChildren: ctx.terrainGroup?.children?.length || 0,
        detailedTerrainMeshes: detailedMeshes.length,
        traversalRadius: Number(ctx.worldTraversalRadiusWorld || 0),
        publication: ctx.verifyWorldPublicationStable?.() || null
      },
      bounds,
      sweep: { startX, endX, z: centerZ, frameCount },
      microbench,
      modes,
      functionSummary,
      longTasks: diagnostic.longTasks,
      perf: ctx.capturePerfSnapshot?.({ source: 'movement-boundary-diagnostic' }) || null
    };
  }, {
    requestedLocation: locationId,
    frameCount: sweepFrames,
    controls: { disableMinimap, boundRoadLookup }
  });

  report.movementRequests = movementRequests;
  report.consoleErrors = consoleErrors;
  await page.screenshot({ path: path.join(outputDir, 'final.png') });
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: consoleErrors.length === 0,
    output: path.join(outputDir, 'report.json'),
    location: report.location,
    world: report.world,
    bounds: report.bounds,
    microbench: report.microbench,
    modes: report.modes,
    longTasks: report.longTasks,
    movementRequestCount: movementRequests.length,
    consoleErrors
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
