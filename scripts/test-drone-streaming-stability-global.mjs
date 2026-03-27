import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';
import { WORLD_TEST_LOCATIONS } from './world-test-locations.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'drone-streaming-stability-global');
const sampleIds = ['baltimore', 'newyork', 'sanfrancisco', 'monaco', 'lasvegas'];
const samples = sampleIds
  .map((id) => WORLD_TEST_LOCATIONS.find((entry) => entry.id === id))
  .filter(Boolean);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|500 \(Internal Server Error\)|502 \(Bad Gateway\)|503 \(Service Unavailable\)|504 \(Gateway Timeout\)|favicon\.ico|Could not reach Cloud Firestore backend)/i.test(String(text));
}

async function collectLocationSample(page, locationSpec) {
  return page.evaluate(async (spec) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };

    const regionCenterToGeo = (cell, snapshot) => {
      const degrees = Number(snapshot?.regionConfig?.degrees || 0);
      const latIndex = Number(cell?.latIndex);
      const lonIndex = Number(cell?.lonIndex);
      if (!(degrees > 0) || !Number.isFinite(latIndex) || !Number.isFinite(lonIndex)) return null;
      return {
        lat: (latIndex + 0.5) * degrees,
        lon: (lonIndex + 0.5) * degrees,
        key: String(cell?.key || `${latIndex}:${lonIndex}`)
      };
    };

    const visibleStructureSummary = () => {
      const actorX = Number(ctx.drone?.x || 0);
      const actorZ = Number(ctx.drone?.z || 0);
      let visible = 0;
      let suspiciousTall = 0;
      let maxScaleY = 0;
      const tallTypes = {};
      for (const mesh of Array.isArray(ctx.structureVisualMeshes) ? ctx.structureVisualMeshes : []) {
        if (!mesh?.visible) continue;
        const lodCenter = mesh.userData?.lodCenter;
        const centerX = Number(lodCenter?.x);
        const centerZ = Number(lodCenter?.z);
        if (Number.isFinite(centerX) && Number.isFinite(centerZ)) {
          const dist = Math.hypot(centerX - actorX, centerZ - actorZ);
          if (dist > 2600) continue;
        }
        visible += 1;
        const scaleY = Number(mesh.userData?.maxScaleY || 0);
        maxScaleY = Math.max(maxScaleY, scaleY);
        if (scaleY > 120) {
          suspiciousTall += 1;
          const type = String(mesh.userData?.structureVisualType || 'unknown');
          tallTypes[type] = (tallTypes[type] || 0) + 1;
        }
      }
      return {
        visible,
        suspiciousTall,
        maxScaleY: Number(maxScaleY.toFixed(2)),
        tallTypes
      };
    };

    const runtimeBefore = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drone', { source: 'drone_streaming_global_test', force: true, emitTutorial: false });
    } else {
      ctx.droneMode = true;
    }
    if (typeof ctx.configureContinuousWorldInteractiveStreaming === 'function') {
      ctx.configureContinuousWorldInteractiveStreaming({ autoKickEnabled: true });
    }
    if (typeof ctx.resetContinuousWorldInteractiveStreamState === 'function') {
      ctx.resetContinuousWorldInteractiveStreamState('drone_streaming_global_test');
    }
    if (typeof ctx.seedContinuousWorldInteractiveStreamState === 'function') {
      ctx.seedContinuousWorldInteractiveStreamState();
    }

    const runtime = typeof ctx.getContinuousWorldRuntimeSnapshot === 'function' ? ctx.getContinuousWorldRuntimeSnapshot() : null;
    const coveredKeys = new Set(
      Array.isArray(ctx.getContinuousWorldInteractiveStreamSnapshot?.()?.coverage) ?
        ctx.getContinuousWorldInteractiveStreamSnapshot().coverage.map((entry) => String(entry?.regionKey || '')).filter(Boolean) :
        []
    );
    const farCells = Array.isArray(runtime?.activeRegionRings?.far) ? runtime.activeRegionRings.far : [];
    let targetRegion = null;
    for (const cell of farCells) {
      if (!coveredKeys.has(String(cell?.key || ''))) {
        targetRegion = regionCenterToGeo(cell, runtime);
        if (targetRegion) break;
      }
    }
    if (!targetRegion && farCells.length > 0) targetRegion = regionCenterToGeo(farCells[0], runtime);
    if (!targetRegion) {
      const baseLat = Number(ctx.LOC?.lat || runtimeBefore?.coordinates?.lat || 0);
      const baseLon = Number(ctx.LOC?.lon || runtimeBefore?.coordinates?.lon || 0);
      targetRegion = {
        lat: baseLat + 0.05,
        lon: baseLon + 0.04,
        key: 'fallback'
      };
    }

    const targetWorld = typeof ctx.geoToWorld === 'function' ? ctx.geoToWorld(targetRegion.lat, targetRegion.lon) : null;
    if (!targetWorld || !Number.isFinite(targetWorld.x) || !Number.isFinite(targetWorld.z)) {
      return { ok: false, reason: 'target world conversion failed' };
    }

    if (typeof ctx.teleportToLocation === 'function') {
      ctx.teleportToLocation(targetWorld.x, targetWorld.z, { source: 'drone_streaming_global_test' });
    }
    if (ctx.drone) {
      ctx.drone.x = targetWorld.x;
      ctx.drone.z = targetWorld.z;
      ctx.drone.y = Math.max(Number(ctx.drone.y || 0), 160);
      ctx.drone.speed = 34;
      ctx.drone.yaw = Math.PI * 0.4;
    }

    if (typeof ctx.loadContinuousWorldInteractiveChunk === 'function') {
      await ctx.loadContinuousWorldInteractiveChunk(targetRegion.lat, targetRegion.lon, 'drone_streaming_global_test');
    }

    for (let i = 0; i < 12; i++) {
      if (typeof ctx.updateContinuousWorldRuntime === 'function') ctx.updateContinuousWorldRuntime();
      if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(ctx.drone.x, ctx.drone.z);
      if (typeof ctx.kickContinuousWorldInteractiveStreaming === 'function') {
        ctx.kickContinuousWorldInteractiveStreaming('drone_streaming_global_test');
      }
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
      if (typeof ctx.update === 'function') ctx.update(1 / 60);
      await new Promise((resolve) => window.setTimeout(resolve, 220));
    }

    if (ctx.drone) ctx.drone.speed = 0;
    for (let i = 0; i < 10; i++) {
      if (typeof ctx.updateContinuousWorldRuntime === 'function') ctx.updateContinuousWorldRuntime();
      if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(ctx.drone.x, ctx.drone.z);
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
      if (typeof ctx.update === 'function') ctx.update(1 / 60);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }

    const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
    return {
      ok: true,
      label: spec.label,
      category: spec.category,
      targetRegion,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
      terrain: validation?.terrain || null,
      interactiveStream: validation?.interactiveStream || null,
      structureVisuals: visibleStructureSummary()
    };
  }, locationSpec);
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const report = {
    ok: true,
    baseUrl: `${server.baseUrl}/app/`,
    samples: [],
    consoleErrors,
    failures: [],
    warnings: []
  };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = error?.message || String(error);
    if (!isIgnorableConsoleError(text)) consoleErrors.push(text);
  });

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const initialBootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    assert(initialBootstrap?.ok, `initial bootstrap failed: ${initialBootstrap?.reason || 'unknown'}`);

    for (const locationSpec of samples) {
      const loaded = await loadEarthLocation(page, locationSpec);
      assert(loaded?.ok, `failed loading ${locationSpec.label}: ${loaded?.reason || 'unknown'}`);
      await page.waitForTimeout(1500);
      const sample = await collectLocationSample(page, locationSpec);
      assert(sample?.ok, sample?.reason || `collection failed for ${locationSpec.label}`);
      report.samples.push(sample);
      await page.screenshot({
        path: path.join(outputDir, `${locationSpec.id}.png`),
        fullPage: true
      });
    }

    for (const sample of report.samples) {
      const terrain = sample.terrain || {};
      const stream = sample.interactiveStream || {};
      const structureVisuals = sample.structureVisuals || {};
      if (!terrain.activeCenterLoaded) {
        report.failures.push(`${sample.label}: active terrain center not loaded after drone stream settle`);
      }
      if (Number(structureVisuals.suspiciousTall || 0) > 0) {
        report.failures.push(`${sample.label}: suspicious tall structure visuals remained visible (${structureVisuals.suspiciousTall})`);
      }
      if (Number(stream.forcedSurfaceSyncLoads || 0) > 0) {
        report.failures.push(`${sample.label}: drone streaming still forced road surface sync (${stream.forcedSurfaceSyncLoads})`);
      }
      if (terrain.structureVisualsDirty) {
        report.warnings.push(`${sample.label}: structure visuals remained deferred in drone mode`);
      }
      if (Number(stream.coveredRegionCount || 0) < 2) {
        report.failures.push(`${sample.label}: insufficient streamed region coverage (${stream.coveredRegionCount || 0})`);
      }
    }

    report.ok = report.failures.length === 0 && consoleErrors.length === 0;
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(async (error) => {
  const report = {
    ok: false,
    error: error?.message || String(error),
    stack: error?.stack || null
  };
  await mkdirp(outputDir);
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exitCode = 1;
});
