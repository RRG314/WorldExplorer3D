#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const baseUrl = String(process.env.HARDWARE_PERF_BASE_URL || 'http://127.0.0.1:4260').replace(/\/$/, '');
const scenarioMs = Math.max(8000, Number(process.env.HARDWARE_PERF_SAMPLE_MS || 10000));
const outputDir = path.join(rootDir, 'output', 'playwright', 'hardware-performance');
const reportPath = path.join(outputDir, 'production-gameplay-report.json');
const requestedModes = new Set(String(process.env.HARDWARE_PERF_MODES || 'walk,drive,drone,plane').split(',').map((mode) => mode.trim()).filter(Boolean));
const planetaryJourneyEnabled = process.env.HARDWARE_PERF_PLANETARY !== '0';
const cpuProfileEnabled = process.env.HARDWARE_PERF_CPU_PROFILE === '1';
const heapProfileEnabled = process.env.HARDWARE_PERF_HEAP_PROFILE === '1';
const heapProfileIncludesLoad = process.env.HARDWARE_PERF_HEAP_PROFILE === 'load';
const budgets = Object.freeze({
  loadMs: 60000,
  medianFps: 45,
  onePercentLowFps: 20,
  p99FrameMs: 55,
  peakFrameMs: 300,
  transitionPeakFrameMs: 250,
  maxFramesOver50Ms: 4,
  maxFramesOver100Ms: 0,
  heapBytes: 1024 * 1024 * 1024,
  heapGrowthBytes: 256 * 1024 * 1024,
  cameraBelowSurface: 0.2,
  earthReturnGeometryGrowth: 32,
  earthReturnTextureGrowth: 4
});

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
}

function summarizeFrames(samples) {
  const sorted = samples.filter((value) => Number.isFinite(value) && value > 0 && value < 2000).sort((a, b) => a - b);
  const slowest = sorted.slice(-Math.max(1, Math.ceil(sorted.length * 0.01)));
  const onePercentMs = slowest.reduce((sum, value) => sum + value, 0) / slowest.length;
  const medianMs = percentile(sorted, 0.5);
  return {
    samples: sorted.length,
    medianFps: medianMs ? 1000 / medianMs : 0,
    onePercentLowFps: onePercentMs ? 1000 / onePercentMs : 0,
    medianFrameMs: medianMs,
    p95FrameMs: percentile(sorted, 0.95),
    p99FrameMs: percentile(sorted, 0.99),
    peakFrameMs: sorted.at(-1) || 0,
    over33Ms: sorted.filter((value) => value > 33.3).length,
    over50Ms: sorted.filter((value) => value > 50).length,
    over100Ms: sorted.filter((value) => value > 100).length
  };
}

function roundNumbers(value) {
  if (Array.isArray(value)) return value.map(roundNumbers);
  if (!value || typeof value !== 'object') return Number.isFinite(value) ? Number(value.toFixed(2)) : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, roundNumbers(entry)]));
}

function metricValue(metrics, name) {
  return Number(metrics.find((metric) => metric.name === name)?.value || 0);
}

function summarizeHeapAllocations(profile, limit = 20) {
  const totals = new Map();
  const visit = (node) => {
    if (!node) return;
    const frame = node.callFrame || {};
    const key = `${frame.functionName || '(anonymous)'} @ ${frame.url || '(runtime)'}:${Number(frame.lineNumber || 0) + 1}`;
    const bytes = Number(node.selfSize || 0);
    if (bytes > 0) totals.set(key, (totals.get(key) || 0) + bytes);
    (node.children || []).forEach(visit);
  };
  visit(profile?.head);
  return [...totals.entries()]
    .map(([frame, bytes]) => ({ frame, bytes }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, limit);
}

function summarizeCpuProfile(profile, limit = 30) {
  const nodes = new Map((profile?.nodes || []).map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile?.nodes || []) {
    for (const childId of node.children || []) parents.set(childId, node);
  }
  const totals = new Map();
  (profile?.samples || []).forEach((nodeId, index) => {
    const node = nodes.get(nodeId);
    if (!node) return;
    const frame = node.callFrame || {};
    const callerFrame = parents.get(nodeId)?.callFrame || {};
    const key = [
      frame.functionName || '(anonymous)',
      frame.url || '(runtime)',
      Number(frame.lineNumber || 0) + 1,
      callerFrame.functionName || '(root)',
      callerFrame.url || '(runtime)',
      Number(callerFrame.lineNumber || 0) + 1
    ].join('|');
    const record = totals.get(key) || {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url || '(runtime)',
      line: Number(frame.lineNumber || 0) + 1,
      caller: callerFrame.functionName || '(root)',
      callerUrl: callerFrame.url || '(runtime)',
      callerLine: Number(callerFrame.lineNumber || 0) + 1,
      selfMicros: 0,
      samples: 0
    };
    record.selfMicros += Number(profile.timeDeltas?.[index] || 0);
    record.samples++;
    totals.set(key, record);
  });
  return [...totals.values()]
    .map(({ selfMicros, ...entry }) => ({ ...entry, selfMs: selfMicros / 1000 }))
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, limit);
}

function isTransientConsoleError(message = '') {
  return /net::ERR_(ABORTED|HTTP2_PROTOCOL_ERROR)|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(message);
}

async function startFrameRecorder(page) {
  await page.evaluate(() => {
    const state = { active: true, samples: [], previous: performance.now() };
    window.__hardwarePerfFrames = state;
    const sample = (now) => {
      if (!state.active) return;
      const delta = now - state.previous;
      state.previous = now;
      if (delta > 0 && delta < 2000) state.samples.push(delta);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopFrameRecorder(page) {
  return page.evaluate(() => {
    const state = window.__hardwarePerfFrames;
    if (!state) return [];
    state.active = false;
    return state.samples;
  });
}

async function runtimeSnapshot(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const actor = ctx.activeTransportActor?.() || null;
    const mode = actor?.mode || ctx.currentTransportMode?.() || 'unknown';
    const position = actor?.position || { x: 0, y: 0, z: 0 };
    const surfaceMode = mode === 'walk' ? 'walk' : mode === 'drive' ? 'drive' : 'terrain';
    const surface = ctx.SurfaceQuery?.at?.(position.x, position.z, {
      mode: surfaceMode,
      currentY: position.y,
      preferRoad: true
    }) || null;
    const actorOffset = mode === 'walk' ? 1.7 : mode === 'drive' ? 1.2 : mode === 'plane' ? 0.72 : mode === 'drone' ? 0.25 : 0;
    const actorBaseY = position.y - actorOffset;
    const collision = actor ? ctx.checkBuildingCollision?.(
      position.x,
      position.z,
      Number(actor?.bounds?.radius || 0.35),
      { actorBaseY, actorHeight: Number(actor?.bounds?.height || 1.7) }
    ) : null;
    const containingBuilding = actor ? ctx.buildingContainingPoint?.(
      position.x,
      position.z,
      Number(actor?.bounds?.radius || 0.35),
      { y: actorBaseY, actorHeight: Number(actor?.bounds?.height || 1.7) }
    ) : null;
    const cameraSurfaceY = ctx.SurfaceQuery?.terrainAt?.(ctx.camera?.position?.x, ctx.camera?.position?.z)?.position?.y;
    const cameraBuilding = ctx.camera ? ctx.buildingContainingPoint?.(
      ctx.camera.position.x,
      ctx.camera.position.z,
      0.3,
      { y: ctx.camera.position.y - 0.2, actorHeight: 0.4 }
    ) : null;
    const cameraBuildingContact = ctx.camera ? ctx.checkBuildingCollision?.(
      ctx.camera.position.x,
      ctx.camera.position.z,
      0.8,
      { actorBaseY: ctx.camera.position.y - 0.2, actorHeight: 0.4 }
    ) : null;
    let cameraOccluder = null;
    if (actor && ctx.camera && ctx.scene && globalThis.THREE) {
      const origin = ctx.camera.position.clone();
      const direction = new THREE.Vector3(position.x, position.y, position.z).sub(origin);
      const actorDistance = direction.length();
      if (actorDistance > 0.1) {
        direction.multiplyScalar(1 / actorDistance);
        const raycaster = new THREE.Raycaster(origin, direction, 0.2, Math.max(0.2, actorDistance - 0.8));
        const hit = raycaster.intersectObjects(ctx.scene.children, true).find(({ object }) => {
          let cursor = object;
          while (cursor) {
            if (mode === 'plane' && cursor.name === 'Explorer STOL Aircraft') return false;
            cursor = cursor.parent;
          }
          return object?.visible !== false && object?.material?.transparent !== true;
        });
        if (hit) {
          cameraOccluder = {
            distance: hit.distance,
            name: String(hit.object?.name || ''),
            parentName: String(hit.object?.parent?.name || ''),
            userData: Object.fromEntries(Object.entries(hit.object?.userData || {})
              .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 12))
          };
        }
      }
    }
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const environment = ctx.getEnv?.() || '';
    const activeRenderer = environment === ctx.ENV?.SPACE_FLIGHT
      ? ctx.spaceFlight?.renderer
      : ctx.renderer;
    const activeScene = environment === ctx.ENV?.SPACE_FLIGHT
      ? ctx.spaceFlight?.scene
      : ctx.scene;
    const sceneResources = {
      objects: 0,
      geometries: 0,
      materials: 0,
      textures: 0
    };
    if (activeScene?.traverse) {
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      activeScene.traverse((object) => {
        sceneResources.objects++;
        if (object.geometry?.uuid) geometries.add(object.geometry.uuid);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.filter(Boolean).forEach((material) => {
          if (material.uuid) materials.add(material.uuid);
          Object.values(material).forEach((value) => {
            if (value?.isTexture && value.uuid) textures.add(value.uuid);
          });
        });
      });
      sceneResources.geometries = geometries.size;
      sceneResources.materials = materials.size;
      sceneResources.textures = textures.size;
    }
    return {
      environment,
      actor,
      surface: surface ? { kind: surface.kind, y: surface.position?.y, distance: surface.distance } : null,
      actorSurfaceDelta: Number.isFinite(surface?.position?.y) ? actorBaseY - surface.position.y : null,
      camera: ctx.camera ? { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z } : null,
      cameraSurfaceDelta: Number.isFinite(cameraSurfaceY) ? ctx.camera.position.y - cameraSurfaceY : null,
      cameraBuildingPenetration: !!cameraBuilding,
      cameraBuildingContact: !!cameraBuildingContact?.collision,
      cameraOccluder,
      collision: !!collision?.collision,
      buildingPenetration: !!containingBuilding,
      activeInterior: !!ctx.activeInterior,
      renderer: {
        calls: Number(activeRenderer?.info?.render?.calls || 0),
        triangles: Number(activeRenderer?.info?.render?.triangles || 0),
        geometries: Number(activeRenderer?.info?.memory?.geometries || 0),
        textures: Number(activeRenderer?.info?.memory?.textures || 0),
        pixelRatio: Number(activeRenderer?.getPixelRatio?.() || 0)
      },
      sceneResources,
      canvases: {
        total: document.querySelectorAll('canvas').length,
        space: document.querySelectorAll('#spaceFlightCanvas').length,
        ocean: document.querySelectorAll('#oceanModeCanvas').length,
        inventory: [...document.querySelectorAll('canvas')].map((entry) => ({
          id: entry.id || '',
          className: typeof entry.className === 'string' ? entry.className : '',
          parentId: entry.parentElement?.id || ''
        }))
      },
      webglContextLost: !gl || gl.isContextLost(),
      diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.() || null
    };
  });
}

async function waitForPageState(page, evaluator, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(evaluator)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function sampleEnvironment(page, label, durationMs = scenarioMs) {
  await startFrameRecorder(page);
  await page.waitForTimeout(durationMs);
  const frames = summarizeFrames(await stopFrameRecorder(page));
  const snapshot = await runtimeSnapshot(page);
  const screenshot = path.join(outputDir, `${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  return roundNumbers({
    label,
    frames,
    snapshot,
    screenshot: path.relative(rootDir, screenshot)
  });
}

async function runPlanetaryJourney(page) {
  const earthBefore = await sampleEnvironment(page, 'journey-earth-before');
  const started = await page.evaluate(() => globalThis.__we3dCtx?.startSpaceFlightToMoon?.() === true);
  if (!started) throw new Error('Production journey could not start Earth-to-Moon flight.');
  await waitForPageState(page, () => {
    const ctx = globalThis.__we3dCtx;
    return ctx?.getEnv?.() === ctx?.ENV?.SPACE_FLIGHT &&
      ctx?.spaceFlight?.active &&
      ctx?.spaceFlight?.animationId != null;
  }, 30000, 'Space flight');
  const space = await sampleEnvironment(page, 'journey-space');

  await startFrameRecorder(page);
  const landingStarted = await page.evaluate(() => globalThis.__we3dCtx?.forceSpaceFlightLanding?.('Moon') === true);
  if (!landingStarted) throw new Error('Production journey could not start Moon landing.');
  await waitForPageState(page, () => {
    const ctx = globalThis.__we3dCtx;
    return ctx?.getEnv?.() === ctx?.ENV?.MOON &&
      ctx?.onMoon &&
      !ctx?.spaceFlight?.active &&
      ctx?.moonSurface?.userData?.ready === true &&
      ctx?.paused !== true;
  }, 45000, 'Moon landing');
  const moonTransitionFrames = summarizeFrames(await stopFrameRecorder(page));
  const moon = await sampleEnvironment(page, 'journey-moon');

  await page.click('#returnToEarthBtn');
  await waitForPageState(page, () => {
    const ctx = globalThis.__we3dCtx;
    return ctx?.getEnv?.() === ctx?.ENV?.EARTH &&
      !ctx?.onMoon &&
      !ctx?.worldLoading &&
      ctx?.earthResumePending !== true &&
      ctx?.earthSceneVisible === true &&
      (ctx?.roads?.length || 0) > 0;
  }, 180000, 'Earth restoration');
  const earthAfter = await sampleEnvironment(page, 'journey-earth-after');

  const plateauFlightStarted = await page.evaluate(() => globalThis.__we3dCtx?.startSpaceFlightToMoon?.() === true);
  if (!plateauFlightStarted) throw new Error('Production journey could not start its plateau flight.');
  await waitForPageState(page, () => {
    const ctx = globalThis.__we3dCtx;
    return ctx?.getEnv?.() === ctx?.ENV?.SPACE_FLIGHT && ctx?.spaceFlight?.active;
  }, 30000, 'plateau Space flight');
  const plateauLandingStarted = await page.evaluate(() => globalThis.__we3dCtx?.forceSpaceFlightLanding?.('Moon') === true);
  if (!plateauLandingStarted) throw new Error('Production journey could not start its plateau Moon landing.');
  await waitForPageState(page, () => {
    const ctx = globalThis.__we3dCtx;
    return ctx?.getEnv?.() === ctx?.ENV?.MOON &&
      ctx?.onMoon &&
      !ctx?.spaceFlight?.active &&
      ctx?.moonSurface?.userData?.ready === true &&
      ctx?.paused !== true;
  }, 45000, 'plateau Moon landing');
  await page.click('#returnToEarthBtn');
  await waitForPageState(page, () => {
    const ctx = globalThis.__we3dCtx;
    return ctx?.getEnv?.() === ctx?.ENV?.EARTH &&
      !ctx?.onMoon &&
      !ctx?.worldLoading &&
      ctx?.earthResumePending !== true &&
      ctx?.earthSceneVisible === true &&
      (ctx?.roads?.length || 0) > 0;
  }, 180000, 'plateau Earth restoration');
  const earthPlateau = await sampleEnvironment(page, 'journey-earth-plateau');
  return { earthBefore, space, moonTransitionFrames, moon, earthAfter, earthPlateau };
}

async function setMode(page, mode) {
  return page.evaluate((nextMode) => {
    const ctx = globalThis.__we3dCtx;
    const reference = ctx.activeTransportActor?.()?.position || { x: ctx.car?.x || 0, z: ctx.car?.z || 0 };
    const terrainY = ctx.SurfaceQuery?.terrainAt?.(reference.x, reference.z)?.position?.y || 0;
    const options = nextMode === 'plane' ? {
      source: 'hardware_performance', force: true, x: reference.x, z: reference.z,
      y: terrainY + 140, speed: 28, throttle: 0.72, airborne: true
    } : { source: 'hardware_performance', force: true, emitTutorial: false };
    return ctx.setTravelMode?.(nextMode, options);
  }, mode);
}

async function runScenario(page, definition) {
  await startFrameRecorder(page);
  const transitionStarted = Date.now();
  await setMode(page, definition.mode);
  await page.waitForTimeout(1500);
  const transitionFrames = summarizeFrames(await stopFrameRecorder(page));
  const before = await runtimeSnapshot(page);

  await startFrameRecorder(page);
  const phases = definition.phases?.length ? definition.phases : [{ share: 1, keys: definition.keys || [] }];
  let elapsed = 0;
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    const duration = index === phases.length - 1
      ? scenarioMs - elapsed
      : Math.max(250, Math.round(scenarioMs * Number(phase.share || 0)));
    for (const key of phase.keys) await page.keyboard.down(key);
    await page.waitForTimeout(duration);
    for (const key of [...phase.keys].reverse()) await page.keyboard.up(key);
    elapsed += duration;
  }
  const frames = summarizeFrames(await stopFrameRecorder(page));
  await page.waitForTimeout(250);
  const after = await runtimeSnapshot(page);
  const beforePosition = before.actor?.position || {};
  const afterPosition = after.actor?.position || {};
  const movement = Math.hypot(
    Number(afterPosition.x || 0) - Number(beforePosition.x || 0),
    Number(afterPosition.y || 0) - Number(beforePosition.y || 0),
    Number(afterPosition.z || 0) - Number(beforePosition.z || 0)
  );
  const screenshot = path.join(outputDir, `${definition.mode}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  return roundNumbers({
    mode: definition.mode,
    transitionMs: Date.now() - transitionStarted - scenarioMs - 250,
    transitionFrames,
    frames,
    movement,
    before,
    after,
    screenshot: path.relative(rootDir, screenshot)
  });
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist']
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  let webglLosses = 0;
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !isTransientConsoleError(text)) consoleErrors.push(text);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.exposeFunction('__recordWebglLoss', () => { webglLosses += 1; });
  await page.addInitScript(() => {
    document.addEventListener('webglcontextlost', () => window.__recordWebglLoss(), true);
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  if (heapProfileIncludesLoad) {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
  }
  const navigationStarted = performance.now();
  await page.goto(`${baseUrl}/app/?hardware-performance=production`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return typeof ctx?.loadRoads === 'function' && typeof ctx?.setTravelMode === 'function';
  }, { timeout: 120000 });

  const setup = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { ENV } = await import('/app/js/env.js?v=57');
    const deadline = performance.now() + 120000;
    while (
      (typeof ctx.loadRoads !== 'function' || typeof ctx.setTravelMode !== 'function' || typeof ctx.switchEnv !== 'function') &&
      performance.now() < deadline
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (typeof ctx.loadRoads !== 'function' || typeof ctx.setTravelMode !== 'function' || typeof ctx.switchEnv !== 'function') {
      throw new Error('World runtime did not become ready before the hardware performance timeout.');
    }
    globalThis.__we3dCtx = ctx;
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.selLoc = 'baltimore';
    ctx.switchEnv(ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
    const startedAt = performance.now();
    await ctx.loadRoads();
    ctx.setTravelMode('walk', { source: 'hardware_performance', force: true, emitTutorial: false });
    ctx.spawnOnRoad?.();
    return {
      worldLoadMs: performance.now() - startedAt,
      worldLoadTransaction: ctx.getWorldLoadTransactionSnapshot?.() || null
    };
  });
  setup.navigationAndLoadMs = performance.now() - navigationStarted;
  await page.waitForTimeout(2000);

  const glInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR),
      userAgent: navigator.userAgent
    };
  });
  const metricsBefore = (await cdp.send('Performance.getMetrics')).metrics;
  if (heapProfileEnabled) {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
  }
  if (cpuProfileEnabled) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
  }
  const scenarios = [];
  for (const definition of [
    { mode: 'walk', phases: [
      { share: 0.3, keys: ['ArrowUp'] },
      { share: 0.16, keys: ['ArrowUp', 'ArrowLeft'] },
      { share: 0.38, keys: ['ArrowUp'] },
      { share: 0.16, keys: ['ArrowUp', 'ArrowRight'] }
    ] },
    { mode: 'drive', phases: [
      { share: 0.5, keys: ['ArrowUp'] },
      { share: 0.25, keys: ['ArrowUp', 'ArrowRight'] },
      { share: 0.25, keys: ['ArrowUp', 'ArrowLeft'] }
    ] },
    { mode: 'drone', phases: [
      { share: 0.6, keys: ['ArrowUp'] },
      { share: 0.2, keys: ['ArrowUp', 'ArrowLeft'] },
      { share: 0.2, keys: ['ArrowUp', 'ArrowRight'] }
    ] },
    { mode: 'plane', phases: [
      { share: 0.5, keys: ['KeyX'] },
      { share: 0.25, keys: ['KeyX', 'ArrowLeft'] },
      { share: 0.25, keys: ['KeyX', 'ArrowRight'] }
    ] }
  ].filter(({ mode }) => requestedModes.has(mode))) scenarios.push(await runScenario(page, definition));
  const planetaryJourney = planetaryJourneyEnabled ? await runPlanetaryJourney(page) : null;
  const cpuProfile = cpuProfileEnabled
    ? summarizeCpuProfile((await cdp.send('Profiler.stop')).profile)
    : [];
  const heapAllocations = heapProfileEnabled || heapProfileIncludesLoad
    ? summarizeHeapAllocations((await cdp.send('HeapProfiler.stopSampling')).profile)
    : [];
  const metricsAfter = (await cdp.send('Performance.getMetrics')).metrics;

  const heapBefore = metricValue(metricsBefore, 'JSHeapUsedSize');
  const heapAfter = metricValue(metricsAfter, 'JSHeapUsedSize');
  const violations = [];
  for (const scenario of scenarios) {
    if (scenario.frames.medianFps < budgets.medianFps) violations.push(`${scenario.mode}: median FPS ${scenario.frames.medianFps}`);
    if (scenario.frames.onePercentLowFps < budgets.onePercentLowFps) violations.push(`${scenario.mode}: 1% low FPS ${scenario.frames.onePercentLowFps}`);
    if (scenario.frames.p99FrameMs > budgets.p99FrameMs) violations.push(`${scenario.mode}: p99 frame ${scenario.frames.p99FrameMs}ms`);
    if (scenario.frames.peakFrameMs > budgets.peakFrameMs) violations.push(`${scenario.mode}: peak frame ${scenario.frames.peakFrameMs}ms`);
    if (scenario.frames.over50Ms > budgets.maxFramesOver50Ms) violations.push(`${scenario.mode}: ${scenario.frames.over50Ms} frames exceeded 50ms`);
    if (scenario.frames.over100Ms > budgets.maxFramesOver100Ms) violations.push(`${scenario.mode}: ${scenario.frames.over100Ms} frames exceeded 100ms`);
    if (scenario.transitionFrames.peakFrameMs > budgets.transitionPeakFrameMs) violations.push(`${scenario.mode}: transition peak ${scenario.transitionFrames.peakFrameMs}ms`);
    if (scenario.movement < 1) violations.push(`${scenario.mode}: gameplay input produced only ${scenario.movement}m movement`);
    if (scenario.after.webglContextLost) violations.push(`${scenario.mode}: WebGL context lost`);
    if (scenario.after.buildingPenetration && !scenario.after.activeInterior) violations.push(`${scenario.mode}: actor center penetrated a building footprint`);
    if (scenario.after.cameraSurfaceDelta !== null && scenario.after.cameraSurfaceDelta < -budgets.cameraBelowSurface) {
      violations.push(`${scenario.mode}: camera below terrain by ${Math.abs(scenario.after.cameraSurfaceDelta)}m`);
    }
    if (scenario.after.cameraBuildingPenetration) violations.push(`${scenario.mode}: camera penetrated a building footprint`);
    if (scenario.after.cameraBuildingContact && scenario.mode !== 'drone') {
      violations.push(`${scenario.mode}: camera ended without building clearance`);
    }
    if (scenario.after.cameraOccluder && scenario.mode !== 'walk') {
      violations.push(`${scenario.mode}: rendered object obscured the active vehicle (${scenario.after.cameraOccluder.name || scenario.after.cameraOccluder.parentName || 'unnamed'})`);
    }
    if ((scenario.mode === 'walk' || scenario.mode === 'drive') && scenario.after.actorSurfaceDelta < -0.2) {
      violations.push(`${scenario.mode}: actor below resolved surface by ${Math.abs(scenario.after.actorSurfaceDelta)}m`);
    }
  }
  if (planetaryJourney) {
    for (const stage of [planetaryJourney.earthBefore, planetaryJourney.space, planetaryJourney.moon, planetaryJourney.earthAfter, planetaryJourney.earthPlateau]) {
      if (stage.frames.medianFps < budgets.medianFps) violations.push(`${stage.label}: median FPS ${stage.frames.medianFps}`);
      if (stage.frames.onePercentLowFps < budgets.onePercentLowFps) violations.push(`${stage.label}: 1% low FPS ${stage.frames.onePercentLowFps}`);
      if (stage.frames.p99FrameMs > budgets.p99FrameMs) violations.push(`${stage.label}: p99 frame ${stage.frames.p99FrameMs}ms`);
      if (stage.frames.over100Ms > budgets.maxFramesOver100Ms) violations.push(`${stage.label}: ${stage.frames.over100Ms} frames exceeded 100ms`);
      if (stage.snapshot.webglContextLost) violations.push(`${stage.label}: WebGL context lost`);
    }
    if (planetaryJourney.moonTransitionFrames.peakFrameMs > budgets.transitionPeakFrameMs) {
      violations.push(`Moon landing transition peak ${planetaryJourney.moonTransitionFrames.peakFrameMs}ms`);
    }
    const beforeResources = planetaryJourney.earthAfter.snapshot.renderer;
    const afterResources = planetaryJourney.earthPlateau.snapshot.renderer;
    const geometryGrowth = afterResources.geometries - beforeResources.geometries;
    const textureGrowth = afterResources.textures - beforeResources.textures;
    if (geometryGrowth > budgets.earthReturnGeometryGrowth) {
      violations.push(`Earth return retained ${geometryGrowth} renderer geometries`);
    }
    if (textureGrowth > budgets.earthReturnTextureGrowth) {
      violations.push(`Earth return retained ${textureGrowth} renderer textures`);
    }
    if (planetaryJourney.earthPlateau.snapshot.canvases.total !== planetaryJourney.earthAfter.snapshot.canvases.total) {
      violations.push('Repeated Earth return grew the DOM canvas count');
    }
  }
  if (/swiftshader|software/i.test(String(glInfo.renderer || ''))) violations.push(`software renderer: ${glInfo.renderer}`);
  if (setup.worldLoadTransaction?.active !== null) violations.push('world load transaction remained active after entry');
  if (setup.worldLoadTransaction?.lastFinished?.status !== 'committed') {
    violations.push(`world load transaction ended as ${setup.worldLoadTransaction?.lastFinished?.status || 'unreported'}`);
  }
  if (!(setup.worldLoadTransaction?.lastFinished?.details?.roads > 0)) {
    violations.push('committed world load transaction reported no roads');
  }
  if (setup.navigationAndLoadMs > budgets.loadMs) violations.push(`load time ${setup.navigationAndLoadMs}ms`);
  if (heapAfter > budgets.heapBytes) violations.push(`heap ${heapAfter} bytes`);
  if (heapAfter - heapBefore > budgets.heapGrowthBytes) violations.push(`heap growth ${heapAfter - heapBefore} bytes`);
  if (webglLosses > 0) violations.push(`${webglLosses} WebGL context loss events`);
  if (consoleErrors.length) violations.push(`${consoleErrors.length} console errors`);
  if (pageErrors.length) violations.push(`${pageErrors.length} page errors`);

  const report = roundNumbers({
    pass: violations.length === 0,
    generatedAt: new Date().toISOString(),
    baseUrl,
    scenarioMs,
    budgets,
    glInfo,
    setup,
    memory: { heapBefore, heapAfter, heapGrowth: heapAfter - heapBefore },
    webglLosses,
    scenarios,
    planetaryJourney,
    cpuProfile,
    heapAllocations,
    violations,
    consoleErrors,
    pageErrors
  });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    pass: report.pass,
    renderer: glInfo.renderer,
    setup: report.setup,
    memory: report.memory,
    scenarios: report.scenarios.map(({ mode, movement, frames, transitionFrames }) => ({ mode, movement, frames, transitionFrames })),
    planetaryJourney: report.planetaryJourney && Object.fromEntries(
      Object.entries(report.planetaryJourney)
        .filter(([, stage]) => stage?.snapshot)
        .map(([key, stage]) => [key, {
        frames: stage.frames,
        environment: stage.snapshot.environment,
        renderer: stage.snapshot.renderer,
        sceneResources: stage.snapshot.sceneResources
      }])
    ),
    moonTransitionFrames: report.planetaryJourney?.moonTransitionFrames || null,
    cpuProfile: report.cpuProfile,
    heapAllocations: report.heapAllocations,
    violations
  }, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser.close();
}
