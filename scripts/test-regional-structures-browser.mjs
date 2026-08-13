import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'regional-structures');
await fs.mkdir(outputDir, { recursive: true });

const allScenarios = [
  {
    id: 'london',
    target: { lat: 51.5055, lon: -0.0754 },
    expectedBridge: /tower bridge/i,
    minimumBridges: 100,
    minimumTunnels: 500
  },
  {
    id: 'sanfrancisco',
    target: { lat: 37.8199, lon: -122.4783 },
    expectedBridge: /golden gate bridge/i,
    minimumBridges: 100,
    minimumTunnels: 20
  }
];
const requestedScenario = String(process.env.WE_STRUCTURE_SCENARIO || '').trim();
const scenarios = requestedScenario
  ? allScenarios.filter((scenario) => scenario.id === requestedScenario)
  : allScenarios;
assert.ok(scenarios.length > 0, `Unknown regional structure scenario: ${requestedScenario}`);

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4294, 4295, 4296, 4297]
});
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/Failed to load resource|blocked by CORS|Could not reach Cloud Firestore/i.test(text)) return;
  consoleErrors.push(text);
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?regional-structures=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx?.loadRoads === 'function' && typeof ctx?.selectPresetLocation === 'function') {
        await ctx.ensureEarthRuntimeReady?.();
        if (ctx.getEarthRuntimeSnapshot?.().ready === true) {
          window.__regionalStructureCtx = ctx;
          return;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Earth runtime bootstrap timed out');
  });

  const reports = [];
  for (const scenario of scenarios) {
    const startedAt = Date.now();
    await page.evaluate(async ({ id }) => {
      const ctx = window.__regionalStructureCtx;
      if (!ctx.selectPresetLocation(id)) throw new Error(`${id} preset selection failed`);
      ctx.gameMode = 'free';
      ctx.gameStarted = true;
      ctx.paused = false;
      ctx.switchEnv?.(ctx.ENV.EARTH);
      document.getElementById('titleScreen')?.classList.add('hidden');
      document.getElementById('globeSelectorScreen')?.classList.remove('show');
      await ctx.loadRoads();
    }, scenario);
    await page.waitForFunction((id) => {
      const ctx = window.__regionalStructureCtx;
      return ctx.worldLoading !== true &&
        ctx.worldLoadRuntimeState?.status === 'ready' &&
        ctx.worldPublication?.requestId?.endsWith?.(`:${id}`) &&
        Number(ctx.roads?.length || 0) > 0;
    }, scenario.id, { timeout: 10000 });
    await page.waitForFunction(() => (
      window.__regionalStructureCtx?.farTerrainClipmapState?.status === 'ready'
    ), null, { timeout: 45000 });

    const report = await page.evaluate(({ id, target }) => {
      const ctx = window.__regionalStructureCtx;
      const present = (value) => {
        const normalized = String(value ?? '').trim().toLowerCase();
        return normalized !== '' && normalized !== 'no' && normalized !== 'false' && normalized !== '0';
      };
      const regionalRoads = (ctx.roads || []).filter((road) => (
        road?.fixedRegionalContext === true || road?.transportRecord?.providerNamespace === 'shortbread'
      ));
      const bridges = regionalRoads.filter((road) => (
        road?.structureSemantics?.isBridge === true || present(road?.transportRecord?.rawTags?.bridge)
      ));
      const tunnels = regionalRoads.filter((road) => (
        road?.structureSemantics?.isTunnel === true || present(road?.transportRecord?.rawTags?.tunnel)
      ));
      const targetWorld = ctx.geoToWorld(target.lat, target.lon);
      const targetRoad = bridges.reduce((best, road) => {
        for (const point of road.pts || []) {
          const distance = Math.hypot(point.x - targetWorld.x, point.z - targetWorld.z);
          if (!best || distance < best.distance) best = { road, point, distance };
        }
        return best;
      }, null);
      const focus = targetRoad?.point || targetWorld;
      const bridgeSurface = targetRoad
        ? ctx.SurfaceQuery?.driveAt?.(focus.x, focus.z, { preferRoad: true })
        : null;
      ctx.setTravelMode?.('drone', { source: 'regional-structures', force: true });
      ctx.drone.x = focus.x + 380;
      ctx.drone.y = Number(ctx.SurfaceQuery?.terrainAt?.(focus.x, focus.z)?.position?.y || 0) + 260;
      ctx.drone.z = focus.z + 460;
      ctx.drone.yaw = Math.atan2(380, 460);
      ctx.drone.pitch = -0.48;
      ctx.drone.roll = 0;
      ctx.drone.cameraYawOffset = 0;
      return {
        id,
        roads: ctx.roads?.length || 0,
        detailedBuildings: ctx.buildings?.length || 0,
        farBuildings: Number(ctx.farTerrainClipmapState?.farBuildings || 0),
        farTerrainStatus: ctx.farTerrainClipmapState?.status || null,
        traversalRadius: Number(ctx.worldTraversalRadiusWorld || 0),
        regionalBridges: bridges.length,
        regionalTunnels: tunnels.length,
        nearestBridgeMeters: Number(targetRoad?.distance?.toFixed?.(1)),
        namedBridges: [...new Set(bridges.map((road) => road.name).filter(Boolean))].slice(0, 80),
        targetBridgeSurfaceY: Number(bridgeSurface?.position?.y),
        targetBridgeSurfaceKind: bridgeSurface?.kind || null,
        regionalSelection: ctx.perfStats?.lastLoad?.regionalTransportSelection || null
      };
    }, scenario);
    report.loadMs = Date.now() - startedAt;
    reports.push(report);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outputDir, `${scenario.id}.png`) });
    await page.evaluate(() => {
      const ctx = window.__regionalStructureCtx;
      const farWater = (ctx.terrainGroup?.children || []).find(
        (mesh) => mesh?.userData?.isFarMappedWaterContext
      );
      if (farWater) farWater.visible = false;
    });
    await page.screenshot({ path: path.join(outputDir, `${scenario.id}-no-far-water.png`) });
    await page.evaluate(() => {
      const ctx = window.__regionalStructureCtx;
      const farWater = (ctx.terrainGroup?.children || []).find(
        (mesh) => mesh?.userData?.isFarMappedWaterContext
      );
      if (farWater) farWater.visible = true;
    });

    assert.ok(
      report.regionalBridges >= scenario.minimumBridges,
      `${scenario.id} bridge coverage is incomplete: ${JSON.stringify(report)}`
    );
    assert.ok(
      report.regionalTunnels >= scenario.minimumTunnels,
      `${scenario.id} tunnel coverage is incomplete: ${JSON.stringify(report)}`
    );
    assert.ok(
      report.namedBridges.some((name) => scenario.expectedBridge.test(name)),
      `${scenario.id} is missing ${scenario.expectedBridge}: ${JSON.stringify(report.namedBridges.slice(0, 30))}`
    );
    assert.ok(
      report.farBuildings >= 10000,
      `${scenario.id} outer building coverage is too sparse: ${JSON.stringify(report)}`
    );
    assert.ok(
      Number.isFinite(report.targetBridgeSurfaceY) && report.targetBridgeSurfaceKind === 'road',
      `${scenario.id} landmark bridge has no driveable road surface: ${JSON.stringify(report)}`
    );
    assert.ok(report.traversalRadius >= 7800, `${scenario.id} fixed region is unexpectedly clipped.`);
  }

  assert.equal(consoleErrors.length, 0, `Regional structure journey emitted errors: ${consoleErrors.join(' | ')}`);
  await fs.writeFile(
    path.join(outputDir, 'report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), reports, consoleErrors }, null, 2)
  );
  console.log(JSON.stringify({ ok: true, reports }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
