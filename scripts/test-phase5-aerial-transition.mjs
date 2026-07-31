import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';
import {
  AERIAL_SURFACE_HIDE_FALLBACK_ALTITUDE,
  aerialSurfaceTilePlan
} from '../app/js/world/aerial-surface-context.js';

const baltimoreSurfacePlan = aerialSurfaceTilePlan(39.2904, -76.6122);
assert.equal(baltimoreSurfacePlan.tiles.length, 25, 'aerial OSM surface tile plan changed');
assert.ok(baltimoreSurfacePlan.bounds.latN > 39.2904, 'aerial surface does not cover north of Baltimore');
assert.ok(baltimoreSurfacePlan.bounds.latS < 39.2904, 'aerial surface does not cover south of Baltimore');
assert.equal(AERIAL_SURFACE_HIDE_FALLBACK_ALTITUDE, 0, 'aerial grass fallback can still cover mapped water');

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'phase5-aerial-transition');

await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4173, 4174, 4175, 4176, 4177]
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  const report = await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    let ctx = null;
    while (performance.now() < deadline) {
      ({ ctx } = await import('/app/js/shared-context.js?v=55'));
      if (ctx?.loadRoads && ctx?.ENV?.EARTH && ctx?.updateTerrainAerialDetail) break;
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    if (!ctx?.ENV?.EARTH) throw new Error('Earth runtime unavailable');
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);
    ctx.customLoc = null;
    ctx.customLocTransient = false;
    ctx.selLoc = 'baltimore';
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();

    const terrainMeshes = () => (ctx.terrainGroup?.children || []).filter((mesh) =>
      mesh?.userData?.isTerrainMesh && mesh.material && !Array.isArray(mesh.material)
    );
    const snapshot = (label) => ({
      label,
      meshes: terrainMeshes().length,
      mapped: terrainMeshes().filter((mesh) => Boolean(mesh.material.map)).length,
      normalMapped: terrainMeshes().filter((mesh) => Boolean(mesh.material.normalMap)).length,
      suppressed: terrainMeshes().filter((mesh) => mesh.userData.terrainAerialDetailSuppressed === true).length,
      mapIds: terrainMeshes().map((mesh) => mesh.material.map?.uuid || null)
    });

    const close = snapshot('close');
    ctx.updateTerrainAerialDetail(true, 160);
    const high = snapshot('high');
    ctx.updateTerrainAerialDetail(true, 120);
    const hysteresis = snapshot('hysteresis');
    ctx.updateTerrainAerialDetail(true, 90);
    const restored = snapshot('restored');
    const aerialSurface = await import('/app/js/world/aerial-surface-context.js?v=2');
    const harborPoint = ctx.geoToWorld(39.27974, -76.6038);
    ctx.setTravelMode('plane', {
      source: 'phase5_aerial_surface_test',
      force: true,
      x: harborPoint.x,
      y: 68,
      z: harborPoint.z,
      speed: 0,
      throttle: 0,
      pitch: -0.24,
      roll: 0,
      yaw: 0,
      airborne: true
    });
    ctx.droneMode = false;
    await aerialSurface.ensureAerialSurfaceContext();
    const regionalDeadline = performance.now() + 30000;
    let regional = ctx.aerialSurfaceContext;
    while (regional?.status !== 'ready' && performance.now() < regionalDeadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      regional = ctx.aerialSurfaceContext;
    }
    const lowHarborState = aerialSurface.syncAerialSurfaceContext(true, 68);
    ctx.updateWorldLod(true);
    ctx.camera.position.set(harborPoint.x, 92, harborPoint.z + 78);
    ctx.camera.lookAt(harborPoint.x, 0, harborPoint.z - 260);
    ctx.renderer.render(ctx.scene, ctx.camera);
    const groundPlanes = [];
    (ctx.earthSceneRoot || ctx.scene)?.traverse?.((object) => {
      if (object?.userData?.isGroundPlane) groundPlanes.push(object);
    });
    const waterRegistry = await import('/app/js/world/water-surface-registry.js?v=2');
    const containingWater = (ctx.waterAreas || []).filter((area) =>
      waterRegistry.pointInWaterBody(area, harborPoint.x, harborPoint.z)
    );
    const nearbyWater = (ctx.waterAreas || []).filter((area) => {
      const bounds = area?.bounds;
      return bounds &&
        bounds.maxX >= harborPoint.x - 1800 && bounds.minX <= harborPoint.x + 1800 &&
        bounds.maxZ >= harborPoint.z - 1800 && bounds.minZ <= harborPoint.z + 1800;
    }).map((area) => ({
      id: area.registryId,
      contains: waterRegistry.pointInWaterBody(area, harborPoint.x, harborPoint.z),
      area: area.area,
      bounds: area.bounds,
      source: area.provenance
    }));
    return {
      close,
      high,
      hysteresis,
      restored,
      harbor: {
        point: harborPoint,
        terrainY: Number(ctx.terrainMeshHeightAt?.(harborPoint.x, harborPoint.z)),
        containingWater: containingWater.map((area) => ({
          id: area.registryId,
          kind: area.waterKind,
          surfaceY: area.surfaceY,
          source: area.provenance
        })),
        waterAreaCount: Number(ctx.waterAreas?.length || 0),
        nearbyWater,
        terrainMaskStats: ctx.waterTerrainMaskStats || null,
        fog: ctx.scene?.fog ? ctx.scene.fog.type : null
      },
      regional: {
        ...lowHarborState,
        meshVisible: !!regional?.mesh?.visible,
        loadedTiles: Number(regional?.loadedTiles || 0),
        requestedTiles: Number(regional?.requestedTiles || 0),
        groundFallbackHidden: groundPlanes.length > 0 && groundPlanes.every((mesh) => !mesh.visible),
        cameraFar: Number(ctx.camera?.far || 0)
      }
    };
  });

  report.errors = errors;
  await page.screenshot({ path: path.join(outputDir, 'baltimore-harbor-68m.png'), timeout: 60000 });
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

  assert.ok(report.close.meshes > 0, 'terrain mesh unavailable');
  assert.equal(report.close.mapped, report.close.meshes, 'close terrain detail maps missing');
  assert.equal(report.high.mapped, 0, 'aerial color maps were not suppressed');
  assert.equal(report.high.normalMapped, 0, 'aerial normal maps were not suppressed');
  assert.equal(report.high.suppressed, report.high.meshes, 'aerial suppression state incomplete');
  assert.equal(report.hysteresis.suppressed, report.hysteresis.meshes, 'aerial hysteresis released too early');
  assert.deepEqual(report.restored.mapIds, report.close.mapIds, 'descent did not restore the original close-detail maps');
  assert.equal(report.restored.suppressed, 0, 'descent left terrain suppressed');
  assert.equal(report.regional.requestedTiles, 25, 'regional surface requested the wrong OSM tile count');
  assert.ok(report.regional.loadedTiles > 0, 'regional OSM surface failed to load');
  assert.equal(report.regional.visible, true, 'regional surface is hidden in aerial mode');
  assert.equal(report.regional.meshVisible, true, 'regional surface mesh is hidden in aerial mode');
  assert.equal(report.regional.groundFallbackHidden, true, 'finite grass fallback still covers Baltimore water at 68 m');
  assert.ok(report.harbor.containingWater.length > 0, 'OSM hydrology did not register the Baltimore harbor test point');
  assert.ok(report.harbor.terrainMaskStats?.maskedVertices > 0, 'OSM hydrology did not cut accepted terrain beneath water');
  assert.ok(
    report.harbor.terrainY <= report.harbor.containingWater[0].surfaceY - 0.35,
    'accepted terrain still renders above the Baltimore water datum'
  );
  assert.equal(report.harbor.fog, null, 'ground fog remains enabled in aerial mode');
  assert.ok(report.regional.width > report.regional.cameraFar * 2, 'regional surface ends inside the camera range');
  assert.ok(report.regional.depth > report.regional.cameraFar * 2, 'regional surface ends inside the camera range');
  assert.deepEqual(errors, [], 'browser errors during aerial transition');
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
