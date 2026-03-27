import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { host, mkdirp, rootDir, startServer } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'boat-smoke');

const BOAT_TEST_CASES = [
  {
    id: 'baltimore-inner-harbor',
    label: 'Baltimore Inner Harbor',
    kind: 'preset',
    key: 'baltimore',
    access: { lat: 39.2848, lon: -76.6054 },
    expectKinds: ['harbor', 'coastal', 'channel', 'open_ocean']
  },
  {
    id: 'chicago-lakefront',
    label: 'Chicago Lakefront',
    kind: 'preset',
    key: 'chicago',
    access: { lat: 41.8819, lon: -87.6154 },
    expectKinds: ['lake', 'coastal', 'harbor']
  },
  {
    id: 'chicago-harbor',
    label: 'Chicago Harbor',
    kind: 'preset',
    key: 'chicago',
    access: { lat: 41.8858, lon: -87.6135 },
    expectKinds: ['harbor', 'coastal']
  },
  {
    id: 'monaco-coast',
    label: 'Monaco Coast',
    kind: 'preset',
    key: 'monaco',
    access: { lat: 43.7386, lon: 7.4294 },
    expectKinds: ['coastal', 'open_ocean'],
    measureOffshore: true
  },
  {
    id: 'miami-offshore',
    label: 'Miami Offshore',
    kind: 'preset',
    key: 'miami',
    access: { lat: 25.7720, lon: -80.1785 },
    expectKinds: ['open_ocean', 'coastal'],
    measureOffshore: true
  }
];

const REQUESTED_CASE_IDS = String(process.env.BOAT_SMOKE_CASES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const ACTIVE_BOAT_TEST_CASES = REQUESTED_CASE_IDS.length > 0 ?
  BOAT_TEST_CASES.filter((entry) => REQUESTED_CASE_IDS.includes(entry.id)) :
  BOAT_TEST_CASES;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectObservedWaterKinds(entry) {
  const kinds = new Set();
  [
    entry?.candidate?.waterKind,
    entry?.preSnapshot?.waterKind,
    entry?.autoEntrySnapshot?.waterKind,
    entry?.afterEnter?.waterKind,
    entry?.offshoreSnapshot?.waterKind,
    entry?.afterExit?.waterKind
  ].forEach((kind) => {
    if (typeof kind === 'string' && kind.trim()) kinds.add(kind.trim());
  });
  return Array.from(kinds);
}

async function bootstrapRuntime(page, baseUrl) {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return !!(ctx && typeof ctx.loadRoads === 'function' && typeof ctx.switchEnv === 'function' && ctx.ENV?.EARTH);
  }, { timeout: 120000 });

  await page.evaluate(async () => {
    const deadline = performance.now() + 60000;
    let ctx = null;
    while (performance.now() < deadline) {
      const mod = await import('/app/js/shared-context.js?v=55');
      ctx = mod?.ctx || {};
      if (ctx && typeof ctx.loadRoads === 'function' && typeof ctx.switchEnv === 'function' && ctx.ENV?.EARTH) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (!ctx?.ENV?.EARTH) {
      throw new Error('Earth runtime helpers unavailable during boat smoke bootstrap');
    }
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords', 'historicBtn'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
  });
}

async function loadLocation(page, spec) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await page.evaluate(async (locationSpec) => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      if (locationSpec.kind === 'custom') {
        ctx.customLoc = {
          lat: Number(locationSpec.custom.lat),
          lon: Number(locationSpec.custom.lon),
          name: String(locationSpec.custom.name || 'Custom Location')
        };
        ctx.customLocTransient = false;
        ctx.selLoc = 'custom';
      } else {
        ctx.selLoc = String(locationSpec.key);
      }
      try {
        await Promise.race([
          ctx.loadRoads(),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('loadRoads timeout')), 90000);
          })
        ]);
      } catch (err) {
        return {
          ok: false,
          error: String(err?.message || err || 'load_failed'),
          selLoc: ctx.selLoc,
          roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
          waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
          waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0
        };
      }
      if (typeof ctx.spawnOnRoad === 'function') ctx.spawnOnRoad();
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('walk', { source: 'boat_smoke', emitTutorial: false, force: true });
      } else if (ctx.Walk?.setModeWalk) {
        ctx.Walk.setModeWalk();
      }
      const roads = Array.isArray(ctx.roads) ? ctx.roads.length : 0;
      const waterAreas = Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0;
      const waterways = Array.isArray(ctx.waterways) ? ctx.waterways.length : 0;
      return {
        ok: roads > 0 && (waterAreas > 0 || waterways > 0),
        selLoc: ctx.selLoc,
        roads,
        waterAreas,
        waterways
      };
    }, spec);
    if (last?.ok) return last;
    await page.waitForTimeout(1200 * (attempt + 1));
  }
  return last;
}

function locationSignature(spec) {
  if (spec.kind === 'custom') {
    return `custom:${spec.custom.lat},${spec.custom.lon}`;
  }
  return `preset:${spec.key}`;
}

async function runBoatCase(page, spec) {
  return await page.evaluate(async (locationSpec) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (typeof ctx.geoToWorld !== 'function') {
      return { ok: false, reason: 'geoToWorld unavailable' };
    }
    const access = ctx.geoToWorld(Number(locationSpec.access.lat), Number(locationSpec.access.lon));
    const terrainY =
      typeof ctx.GroundHeight?.walkSurfaceY === 'function' ?
        ctx.GroundHeight.walkSurfaceY(access.x, access.z) :
        ctx.elevationWorldYAtWorldXZ(access.x, access.z) + 1.7;

    if (ctx.Walk?.setModeWalk) ctx.Walk.setModeWalk();
    if (ctx.Walk?.state?.walker) {
      ctx.Walk.state.walker.x = access.x;
      ctx.Walk.state.walker.z = access.z;
      ctx.Walk.state.walker.y = terrainY;
      ctx.Walk.state.walker.vy = 0;
      ctx.Walk.state.walker.angle = 0;
      ctx.Walk.state.walker.yaw = 0;
      if (ctx.Walk.state.characterMesh) {
        ctx.Walk.state.characterMesh.position.set(access.x, terrainY - 1.7, access.z);
        ctx.Walk.state.characterMesh.rotation.y = 0;
      }
    }
    ctx.car.x = access.x;
    ctx.car.z = access.z;
    ctx.car.angle = 0;

    const candidate = typeof ctx.inspectBoatCandidate === 'function' ? ctx.inspectBoatCandidate(access.x, access.z, 80) : null;
    await Promise.resolve(ctx.refreshBoatAvailability?.(true));
    const prePromptVisible = !!document.getElementById('boatPrompt')?.classList.contains('show');
    const preSnapshot = ctx.getBoatModeSnapshot?.() || null;
    let autoEntrySnapshot = null;
    let autoEntryOk = false;
    if (typeof ctx.teleportToLocation === 'function') {
      ctx.teleportToLocation(access.x, access.z, {
        source: 'boat_smoke_auto_target',
        preferBoatIfWater: true
      });
      autoEntrySnapshot = ctx.getBoatModeSnapshot?.() || null;
      autoEntryOk = !!autoEntrySnapshot?.active;
      if (autoEntryOk) {
        if (typeof ctx.setTravelMode === 'function') {
          ctx.setTravelMode('walk', { source: 'boat_smoke_reset', force: true, emitTutorial: false });
        } else {
          ctx.stopBoatMode?.({ targetMode: 'walk' });
        }
      }
    }

    let enterResult = null;
    if (typeof ctx.setTravelMode === 'function') {
      enterResult = ctx.setTravelMode('boat', { source: 'boat_smoke', force: true, emitTutorial: false });
    } else {
      enterResult = ctx.startBoatMode?.({ candidate, source: 'boat_smoke' });
    }

    const afterEnter = ctx.getBoatModeSnapshot?.() || null;
    const boatStart = { x: Number(ctx.boat?.x || 0), z: Number(ctx.boat?.z || 0) };

    ctx.keys.KeyW = true;
    for (let i = 0; i < 100; i++) ctx.update?.(1 / 60);
    ctx.keys.KeyW = false;
    const moved = Math.hypot((ctx.boat?.x || 0) - boatStart.x, (ctx.boat?.z || 0) - boatStart.z);

    const seaBefore = ctx.boatMode?.seaState || 'moderate';
    ctx.cycleBoatSeaState?.();
    const seaAfter = ctx.boatMode?.seaState || seaBefore;

    let offshoreSnapshot = null;
    if (locationSpec.measureOffshore && ctx.boatMode?.active && ctx.boatMode?.currentWater && Number.isFinite(ctx.boatMode.currentWater.centerX) && Number.isFinite(ctx.boatMode.currentWater.centerZ)) {
      ctx.boat.x = ctx.boatMode.currentWater.centerX;
      ctx.boat.z = ctx.boatMode.currentWater.centerZ;
      ctx.car.x = ctx.boat.x;
      ctx.car.z = ctx.boat.z;
      ctx.updateBoatMode?.(1 / 60);
      offshoreSnapshot = ctx.getBoatModeSnapshot?.() || null;
    }

    let exitResult = null;
    if (typeof ctx.setTravelMode === 'function') {
      exitResult = ctx.setTravelMode('walk', { source: 'boat_smoke', force: true, emitTutorial: false });
    } else {
      exitResult = ctx.stopBoatMode?.({ targetMode: 'walk' });
    }
    const afterExit = ctx.getBoatModeSnapshot?.() || null;

    return {
      ok: !!candidate && autoEntryOk && !!afterEnter?.active && moved > 6.5 && seaAfter !== seaBefore && !afterExit?.active,
      candidate: candidate ? {
        label: candidate.label,
        waterKind: candidate.waterKind,
        distanceToWater: Number(candidate.distanceToWater || 0),
        shorelineDistance: Number(candidate.shorelineDistance || 0),
        inside: !!candidate.inside
      } : null,
      prePromptVisible,
      preSnapshot,
      autoEntryOk,
      autoEntrySnapshot,
      enterResult,
      afterEnter,
      moved: Number(moved.toFixed(2)),
      boatPitch: Number(ctx.boat?.pitch || 0),
      boatRoll: Number(ctx.boat?.roll || 0),
      seaBefore,
      seaAfter,
      offshoreSnapshot,
      exitResult,
      afterExit
    };
  }, spec);
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const baseUrl = server.baseUrl || `http://${host}:${server.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('Road loading failed after all attempts')) return;
    if (text.includes('Failed to load resource: the server responded with a status of 400')) return;
    if (text.includes('ERR_NETWORK_CHANGED')) return;
    if (text.includes('status of 429') || text.includes('status of 504')) return;
    consoleErrors.push(text);
  });

  const report = {
    ok: false,
    url: baseUrl,
    consoleErrors: [],
    selectedCaseIds: ACTIVE_BOAT_TEST_CASES.map((entry) => entry.id),
    cases: []
  };

  try {
    await bootstrapRuntime(page, baseUrl);
    let lastLoadedSignature = null;

    for (const spec of ACTIVE_BOAT_TEST_CASES) {
      console.log(`[boat-smoke] ${spec.id}`);
      const signature = locationSignature(spec);
      if (signature !== lastLoadedSignature) {
        const loadResult = await loadLocation(page, spec);
        if (!loadResult?.ok) {
          report.cases.push({
            id: spec.id,
            label: spec.label,
            ok: false,
            loadResult,
            candidate: null,
            prePromptVisible: false,
            preSnapshot: null,
            autoEntryOk: false,
            autoEntrySnapshot: null,
            enterResult: null,
            afterEnter: null,
            moved: 0,
            boatPitch: 0,
            boatRoll: 0,
            seaBefore: null,
            seaAfter: null,
            offshoreSnapshot: null,
            exitResult: null,
            afterExit: null
          });
          continue;
        }
        lastLoadedSignature = signature;
      }
      const result = await runBoatCase(page, spec);
      report.cases.push({
        id: spec.id,
        label: spec.label,
        ...result
      });
      await page.screenshot({
        path: path.join(outputDir, `${spec.id}.png`),
        fullPage: true
      });
    }

    report.consoleErrors = consoleErrors.slice();
    report.ok =
      consoleErrors.length === 0 &&
      report.cases.every((entry) => {
        if (entry.ok !== true) return false;
        const expectedKinds = ACTIVE_BOAT_TEST_CASES.find((spec) => spec.id === entry.id)?.expectKinds;
        if (!Array.isArray(expectedKinds) || expectedKinds.length === 0) return false;
        const observedKinds = collectObservedWaterKinds(entry);
        return observedKinds.some((kind) => expectedKinds.includes(kind));
      });

    assert(report.ok, `Boat smoke failed: ${JSON.stringify(report, null, 2)}`);
  } finally {
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
