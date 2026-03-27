import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONTINUOUS_WORLD_LOCATIONS } from './continuous-world-scenarios.mjs';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-activity-multiplayer-compatibility');

function isIgnorableConsoleError(text = '') {
  return /(400 \(\)|429 \(Too Many Requests\)|504 \(Gateway Timeout\)|Could not reach Cloud Firestore backend|net::ERR_CONNECTION_CLOSED|net::ERR_SOCKET_NOT_CONNECTED)/i.test(String(text));
}

async function captureCase(page, locationSpec, mode) {
  return page.evaluate(async ({ spec, nextMode }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const catalogMod = await import('/app/js/activity-discovery/catalog.js?v=4');
    const mapCoords = await import('/app/js/map-coordinates.js?v=2');
    if (!ctx || typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { ok: false, reason: 'continuous-world diagnostics unavailable' };
    }
    if (typeof ctx.ensureMultiplayerPlatformReady !== 'function') {
      return { ok: false, reason: 'multiplayer platform bootstrap unavailable' };
    }

    const roadLength = (road) => {
      if (road?.surfaceDistances instanceof Float32Array && road.surfaceDistances.length > 0) {
        return Number(road.surfaceDistances[road.surfaceDistances.length - 1]) || 0;
      }
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      return total;
    };

    const pointOnRoadAtDistance = (road, distance) => {
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      if (pts.length < 2) return null;
      const total = roadLength(road);
      const target = Math.max(0, Math.min(total, Number(distance) || 0));
      let traversed = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const seg = Math.hypot(dx, dz);
        if (traversed + seg >= target || i === pts.length - 2) {
          const local = seg > 1e-6 ? (target - traversed) / seg : 0;
          return { x: p1.x + dx * local, z: p1.z + dz * local };
        }
        traversed += seg;
      }
      return null;
    };

    const polygonArea = (pts = []) => {
      if (!Array.isArray(pts) || pts.length < 3) return 0;
      let area = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j].x + pts[i].x) * (pts[j].z - pts[i].z);
      }
      return Math.abs(area * 0.5);
    };

    const pointInPolygonXZ = (x, z, polygon) => {
      if (!Array.isArray(polygon) || polygon.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const zi = polygon[i].z;
        const xj = polygon[j].x;
        const zj = polygon[j].z;
        const intersects = (zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
        if (intersects) inside = !inside;
      }
      return inside;
    };

    const featureCenter = (feature) => {
      if (Array.isArray(feature?.pts) && feature.pts.length > 0) {
        let sx = 0;
        let sz = 0;
        for (const pt of feature.pts) {
          sx += Number(pt?.x || 0);
          sz += Number(pt?.z || 0);
        }
        return { x: sx / feature.pts.length, z: sz / feature.pts.length };
      }
      if (Number.isFinite(feature?.minX) && Number.isFinite(feature?.maxX) && Number.isFinite(feature?.minZ) && Number.isFinite(feature?.maxZ)) {
        return { x: (feature.minX + feature.maxX) * 0.5, z: (feature.minZ + feature.maxZ) * 0.5 };
      }
      return null;
    };

    const buildingDensityAt = (x, z, radius = 220) => {
      const buildings = Array.isArray(ctx.buildings) ? ctx.buildings : [];
      let count = 0;
      for (const building of buildings) {
        const center = featureCenter(building);
        if (!center) continue;
        if (Math.hypot(center.x - x, center.z - z) <= radius) count += 1;
      }
      return count;
    };

    const isVehicleRoad = (road) => {
      const type = String(road?.type || '').toLowerCase();
      return !!type && !/^(footway|path|steps|pedestrian|corridor|cycleway|service_driveway)$/.test(type);
    };

    const gradeSeparatedLike = (road) => {
      const semantics = road?.structureSemantics || null;
      if (semantics?.gradeSeparated) return true;
      const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      return anchors.some((anchor) => Math.abs(Number(anchor?.targetOffset) || 0) >= 2.6);
    };

    const pickDenseRoad = () => {
      const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
      const candidates = [];
      for (const road of roads) {
        if (!isVehicleRoad(road) || gradeSeparatedLike(road)) continue;
        const length = roadLength(road);
        if (length < 220) continue;
        const mid = pointOnRoadAtDistance(road, length * 0.5);
        if (!mid) continue;
        const density = buildingDensityAt(mid.x, mid.z, 220);
        if (density < 12) continue;
        candidates.push({ road, score: density * 10 + length });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0]?.road || null;
    };

    const pickBoatEntryPoint = () => {
      const waterways = (Array.isArray(ctx.waterways) ? ctx.waterways : [])
        .filter((entry) => Array.isArray(entry?.pts) && entry.pts.length >= 3)
        .sort((a, b) => roadLength(b) - roadLength(a));
      const selected = waterways[0] || null;
      if (selected) {
        return selected.pts[Math.floor(selected.pts.length * 0.5)] || null;
      }

      const waterAreas = (Array.isArray(ctx.waterAreas) ? ctx.waterAreas : [])
        .filter((entry) => Array.isArray(entry?.pts) && entry.pts.length >= 4)
        .map((entry) => {
          const centerX = entry.pts.reduce((sum, point) => sum + Number(point?.x || 0), 0) / entry.pts.length;
          const centerZ = entry.pts.reduce((sum, point) => sum + Number(point?.z || 0), 0) / entry.pts.length;
          return {
            source: entry,
            area: polygonArea(entry.pts),
            centerX,
            centerZ
          };
        })
        .filter((entry) => entry.area > 12000)
        .sort((a, b) => b.area - a.area);
      const area = waterAreas[0] || null;
      if (!area) return null;

      const polygon = area.source?.pts || [];
      if (pointInPolygonXZ(area.centerX, area.centerZ, polygon)) {
        return { x: area.centerX, z: area.centerZ };
      }

      const bounds = polygon.reduce((acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minZ: Math.min(acc.minZ, point.z),
        maxZ: Math.max(acc.maxZ, point.z)
      }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const radius = Math.max(18, Math.min((bounds.maxX - bounds.minX) * 0.18, (bounds.maxZ - bounds.minZ) * 0.18, 90));
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const x = area.centerX + Math.cos(angle) * radius;
        const z = area.centerZ + Math.sin(angle) * radius;
        if (pointInPolygonXZ(x, z, polygon)) return { x, z };
      }
      return { x: area.centerX, z: area.centerZ };
    };

    const enterMode = async () => {
      if (nextMode === 'boat') {
        const point = pickBoatEntryPoint();
        if (!point) return { ok: false, reason: `no boat entry point found for ${spec.id}` };
        if (typeof ctx.enterBoatAtWorldPoint === 'function') {
          ctx.enterBoatAtWorldPoint(point.x, point.z, {
            source: 'cw_activity_mp_boat',
            emitTutorial: false,
            maxDistance: 180
          });
        }
        if (typeof ctx.setTravelMode === 'function') {
          ctx.setTravelMode('boat', { source: 'cw_activity_mp_boat', force: true, emitTutorial: false });
        }
        return { ok: true };
      }

      const road = pickDenseRoad();
      if (!road) return { ok: false, reason: `no dense road found for ${spec.id}` };
      const point = pointOnRoadAtDistance(road, roadLength(road) * 0.5);
      if (!point) return { ok: false, reason: 'dense road midpoint unavailable' };
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode(nextMode === 'walk' ? 'walk' : 'drive', {
          source: `cw_activity_mp_${nextMode}`,
          force: true,
          emitTutorial: false
        });
      }
      ctx.teleportToLocation(point.x, point.z, {
        source: `cw_activity_mp_${nextMode}`,
        preferredRoad: road
      });
      if (ctx.car) {
        ctx.car.speed = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.vy = 0;
        ctx.car.onRoad = true;
        ctx.car.road = road;
        ctx.car._lastStableRoad = road;
      }
      return { ok: true };
    };

    const settleRuntime = async () => {
      for (let i = 0; i < 8; i++) {
        if (typeof ctx.updateTerrainAround === 'function' && !ctx.worldLoading) {
          const actor = ctx.getContinuousWorldValidationSnapshot()?.actor || { x: 0, z: 0 };
          ctx.updateTerrainAround(Number(actor.x || 0), Number(actor.z || 0));
        }
        if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
          ctx.requestWorldSurfaceSync({ force: i === 0, source: 'cw_activity_mp' });
        }
        if (typeof ctx.updateBoatMode === 'function' && nextMode === 'boat') ctx.updateBoatMode(1 / 60);
        if (typeof ctx.update === 'function') ctx.update(1 / 60);
        if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      }
    };

    const entry = await enterMode();
    if (!entry?.ok) return entry;
    if (typeof ctx.updateContinuousWorldRuntime === 'function') ctx.updateContinuousWorldRuntime();
    await settleRuntime();

    const multiplayer = await ctx.ensureMultiplayerPlatformReady();
    const snapshot = ctx.getContinuousWorldValidationSnapshot();
    const actor = snapshot?.actor || { x: 0, z: 0 };
    const coordinates = snapshot?.coordinates || null;
    const currentGeo = typeof ctx.currentMapReferenceGeoPosition === 'function'
      ? ctx.currentMapReferenceGeoPosition()
      : null;
    const worldContext = typeof multiplayer?.getWorldContextSnapshot === 'function'
      ? multiplayer.getWorldContextSnapshot()
      : null;
    const weeklyFallback = typeof multiplayer?.getWeeklyFeaturedWorldSnapshot === 'function'
      ? multiplayer.getWeeklyFeaturedWorldSnapshot({ cityKey: '__missing_city__', city: '__missing_city__' })
      : null;

    ctx.multiplayerMapRooms = {
      signedIn: false,
      currentRoomCode: '',
      userRooms: [],
      publicRooms: [{
        code: 'CWTEST',
        lat: Number(currentGeo?.lat || coordinates?.lat || 0),
        lon: Number(currentGeo?.lon || coordinates?.lon || 0),
        name: 'Continuous Test Room',
        locationLabel: spec.label,
        type: 'public',
        visibility: 'public'
      }],
      updatedAt: Date.now()
    };
    ctx.getCurrentMultiplayerRoom = () => ({
      code: 'CWTEST',
      name: 'Continuous Test Room',
      locationTag: { label: spec.label, city: spec.label, kind: 'earth' },
      world: {
        kind: 'earth',
        lat: Number(currentGeo?.lat || coordinates?.lat || 0),
        lon: Number(currentGeo?.lon || coordinates?.lon || 0),
        seed: `latlon:${Number(currentGeo?.lat || coordinates?.lat || 0).toFixed(5)},${Number(currentGeo?.lon || coordinates?.lon || 0).toFixed(5)}`
      }
    });
    ctx.multiplayerRoomActivities = [];
    ctx.multiplayerActiveRoomActivity = null;

    const catalog = typeof catalogMod.buildActivityCatalog === 'function' ? catalogMod.buildActivityCatalog() : [];
    const generated = catalog.find((entry) => entry?.sourceType !== 'room' && entry?.sourceType !== 'room_activity' && Number.isFinite(entry?.startPoint?.x) && Number.isFinite(entry?.startPoint?.z)) || null;
    const generatedExpectedGeo = generated ? mapCoords.worldPointToGeo(generated.startPoint.x, generated.startPoint.z) : null;
    const roomRecord = catalog.find((entry) => entry?.sourceType === 'room') || null;

    return {
      ok: true,
      mode: nextMode,
      snapshot,
      actor,
      currentGeo,
      worldContext,
      weeklyFallback,
      generated,
      generatedExpectedGeo,
      roomRecord
    };
  }, { spec: locationSpec, nextMode: mode });
}

function validateCase(result) {
  const failures = [];
  const coordinates = result?.snapshot?.coordinates || null;
  const currentGeo = result?.currentGeo || null;
  const worldContext = result?.worldContext || null;
  const weeklyFallback = result?.weeklyFallback || null;
  const generated = result?.generated || null;
  const generatedExpectedGeo = result?.generatedExpectedGeo || null;
  const roomRecord = result?.roomRecord || null;

  if (!coordinates) failures.push('coordinate snapshot missing');
  if (!worldContext) failures.push('multiplayer world context missing');
  if (!Number.isFinite(worldContext?.lat) || !Number.isFinite(worldContext?.lon)) failures.push('multiplayer world lat/lon missing');
  if (!currentGeo) failures.push('current map reference geo missing');
  if (Number.isFinite(worldContext?.lat) && Number.isFinite(currentGeo?.lat) && Math.abs(worldContext.lat - currentGeo.lat) > 0.000001) {
    failures.push(`multiplayer world latitude drift too high: ${Math.abs(worldContext.lat - currentGeo.lat).toFixed(7)}`);
  }
  if (Number.isFinite(worldContext?.lon) && Number.isFinite(currentGeo?.lon) && Math.abs(worldContext.lon - currentGeo.lon) > 0.000001) {
    failures.push(`multiplayer world longitude drift too high: ${Math.abs(worldContext.lon - currentGeo.lon).toFixed(7)}`);
  }
  if (!String(worldContext?.seed || '').includes('latlon:')) failures.push('multiplayer world seed missing latlon signature');
  if (Number.isFinite(weeklyFallback?.lat) && Number.isFinite(currentGeo?.lat) && Math.abs(weeklyFallback.lat - currentGeo.lat) > 0.000001) {
    failures.push(`weekly fallback latitude drift too high: ${Math.abs(weeklyFallback.lat - currentGeo.lat).toFixed(7)}`);
  }
  if (Number.isFinite(weeklyFallback?.lon) && Number.isFinite(currentGeo?.lon) && Math.abs(weeklyFallback.lon - currentGeo.lon) > 0.000001) {
    failures.push(`weekly fallback longitude drift too high: ${Math.abs(weeklyFallback.lon - currentGeo.lon).toFixed(7)}`);
  }
  if (!generated) failures.push('generated activity missing');
  if (generated && !Number.isFinite(generated?.lat)) failures.push('generated activity latitude missing');
  if (generated && !Number.isFinite(generated?.lon)) failures.push('generated activity longitude missing');
  if (generated && Number.isFinite(generated?.lat) && Number.isFinite(generatedExpectedGeo?.lat) && Math.abs(generated.lat - generatedExpectedGeo.lat) > 0.000001) {
    failures.push(`generated activity latitude drift too high: ${Math.abs(generated.lat - generatedExpectedGeo.lat).toFixed(7)}`);
  }
  if (generated && Number.isFinite(generated?.lon) && Number.isFinite(generatedExpectedGeo?.lon) && Math.abs(generated.lon - generatedExpectedGeo.lon) > 0.000001) {
    failures.push(`generated activity longitude drift too high: ${Math.abs(generated.lon - generatedExpectedGeo.lon).toFixed(7)}`);
  }
  if (!roomRecord) failures.push('room discovery record missing');
  if (roomRecord && Number.isFinite(roomRecord?.lat) && Number.isFinite(currentGeo?.lat) && Math.abs(roomRecord.lat - currentGeo.lat) > 0.000001) {
    failures.push(`room record latitude drift too high: ${Math.abs(roomRecord.lat - currentGeo.lat).toFixed(7)}`);
  }
  if (roomRecord && Number.isFinite(roomRecord?.lon) && Number.isFinite(currentGeo?.lon) && Math.abs(roomRecord.lon - currentGeo.lon) > 0.000001) {
    failures.push(`room record longitude drift too high: ${Math.abs(roomRecord.lon - currentGeo.lon).toFixed(7)}`);
  }

  return failures;
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const rawConsoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') rawConsoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    rawConsoleErrors.push(`pageerror:${err.message}`);
  });

  const results = [];

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded' });
    const bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    if (!bootstrap?.ok) throw new Error(`bootstrap failed: ${bootstrap?.reason || 'unknown error'}`);

    const cases = [
      { spec: CONTINUOUS_WORLD_LOCATIONS.baltimore, mode: 'drive' },
      { spec: CONTINUOUS_WORLD_LOCATIONS.newyork, mode: 'walk' },
      { spec: CONTINUOUS_WORLD_LOCATIONS.monaco, mode: 'boat' }
    ];

    for (const entry of cases) {
      const loaded = await loadEarthLocation(page, entry.spec);
      if (!loaded?.ok) {
        results.push({
          id: `${entry.spec.id}-${entry.mode}`,
          ok: false,
          failures: [`load failed: ${loaded?.reason || 'unknown error'}`]
        });
        continue;
      }
      const result = await captureCase(page, entry.spec, entry.mode);
      const failures = result?.ok ? validateCase(result) : [result?.reason || 'unknown failure'];
      const screenshotPath = path.join(outputDir, `${entry.spec.id}-${entry.mode}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      results.push({
        id: `${entry.spec.id}-${entry.mode}`,
        ok: failures.length === 0,
        failures,
        result
      });
    }
  } finally {
    const consoleErrors = rawConsoleErrors.filter((text) => !isIgnorableConsoleError(text));
    const report = {
      ok: results.every((entry) => entry.ok) && consoleErrors.length === 0,
      generatedAt: new Date().toISOString(),
      consoleErrors,
      results
    };
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
    await browser.close();
    await server.close();
  }

  const report = JSON.parse(await fs.readFile(path.join(outputDir, 'report.json'), 'utf8'));
  if (!report.ok) {
    throw new Error(`continuous-world activity/multiplayer compatibility failed: ${JSON.stringify(report.results.filter((entry) => !entry.ok).map((entry) => entry.id))}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[test-continuous-world-activity-multiplayer-compatibility] failed');
    console.error(error);
    process.exit(1);
  });
