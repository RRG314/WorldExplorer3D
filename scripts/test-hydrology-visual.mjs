import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'hydrology-v442');
const locations = [
  { id: 'baltimore-inner-harbor', lat: 39.28532, lon: -76.61155, label: 'Baltimore Inner Harbor' },
  { id: 'monaco-harbor', lat: 43.7355, lon: 7.4252, label: 'Monaco Harbor' },
  { id: 'lake-tahoe', lat: 39.0968, lon: -120.0324, label: 'Lake Tahoe' }
];
const requested = String(process.env.HYDROLOGY_LOCATION || '').trim();
const selected = requested ? locations.filter((location) => location.id === requested) : locations;
const skipScreenshots = process.env.HYDROLOGY_SKIP_SCREENSHOTS === '1';
const portBase = Number(process.env.HYDROLOGY_PORT_BASE || 4210);
if (!selected.length) throw new Error(`Unknown HYDROLOGY_LOCATION: ${requested}`);

await mkdirp(outputDir);
const server = await startServer({ rootDir, host: '127.0.0.1', candidatePorts: [portBase, portBase + 1, portBase + 2] });
const browser = await chromium.launch({ headless: true });
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
      return { invoked: true };
    }, location);
    if (!boot.invoked) throw new Error(`${location.id}: world load was not invoked`);
    await page.waitForFunction(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.worldLoading === false &&
        (ctx.waterSurfaceRegistry?.snapshot?.()?.surfaceCount || 0) > 0;
    }, null, { timeout: 240000 });

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
      };
    });
    console.log(`[hydrology-visual] ${location.id}: ${JSON.stringify(result)}`);
    if (location.id === 'baltimore-inner-harbor') {
      if (!result.vessels.length) throw new Error('Baltimore Inner Harbor: no mapped vessel rendered.');
      if (result.vessels.some((vessel) => Number(vessel.waterlineClearance) < 1.18)) {
        throw new Error('Baltimore Inner Harbor: mapped vessel remains submerged by the water sheet.');
      }
    }
    if (!skipScreenshots) {
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: path.join(outputDir, `${location.id}-overview.png`),
        timeout: 0,
        animations: 'disabled'
      });
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const target = ctx.waterAreas?.find((area) => Number.isFinite(Number(area?.surfaceY)));
        if (!target) return;
        const x = Number(target.centerX || 0);
        const z = Number(target.centerZ || 0);
        const y = Number(target.surfaceY || 0);
        ctx.camera.position.set(x + 52, y + 12, z + 58);
        ctx.camera.lookAt(x, y + 0.5, z);
        ctx.camera.userData.lookTarget = { x, y: y + 0.5, z };
      });
      await page.waitForTimeout(750);
      await page.screenshot({
        path: path.join(outputDir, `${location.id}-waterline.png`),
        timeout: 0,
        animations: 'disabled'
      });
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
