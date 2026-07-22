#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:5173/app/',
    out: 'output/playwright/perf-overlay.json',
    waitMs: 12000,
    location: 'baltimore',
    mode: 'walk',
    moveKey: '',
    hardware: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      args.url = next;
      i++;
    } else if (arg === '--out' && next) {
      args.out = next;
      i++;
    } else if (arg === '--wait-ms' && next) {
      const value = Number(next);
      if (Number.isFinite(value) && value > 0) args.waitMs = value;
      i++;
    } else if (arg === '--location' && next) {
      args.location = String(next).trim() || 'baltimore';
      i++;
    } else if (arg === '--mode' && next) {
      args.mode = String(next).trim() || 'walk';
      i++;
    } else if (arg === '--move-key' && next) {
      args.moveKey = String(next).trim();
      i++;
    } else if (arg === '--hardware') {
      args.hardware = true;
    }
  }
  return args;
}

function parseHumanNumber(raw) {
  if (!raw) return 0;
  const text = String(raw).trim().toUpperCase();
  const match = text.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) {
    const direct = Number(text.replace(/[^\d.-]/g, ''));
    return Number.isFinite(direct) ? direct : 0;
  }
  const value = Number(match[1]);
  const suffix = match[2] || '';
  const scale = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
  return Math.round(value * scale);
}

function parsePanelText(panelText) {
  const lines = String(panelText || '').split('\n');
  const findLine = (prefix) => lines.find((line) => line.startsWith(prefix)) || '';
  const fpsLine = findLine('FPS:');
  const drawLine = findLine('DRAW:');
  const geoLine = findLine('GEO:');
  const qualityLine = findLine('QUALITY:');

  const fpsMatch = fpsLine.match(/FPS:\s*([\d.]+)\s*CUR\s*\|\s*([\d.]+)\s*AVG\s*\|\s*FRAME:\s*([\d.]+)\s*ms/i);
  const drawMatch = drawLine.match(/DRAW:\s*([0-9.KMB-]+)\s*\|\s*TRI:\s*([0-9.KMB-]+)/i);
  const texMatch = geoLine.match(/TEX:\s*([0-9.KMB-]+)/i);

  return {
    fpsCurrent: fpsMatch ? Number(fpsMatch[1]) : 0,
    fpsAverage: fpsMatch ? Number(fpsMatch[2]) : 0,
    frameMs: fpsMatch ? Number(fpsMatch[3]) : 0,
    drawCalls: drawMatch ? parseHumanNumber(drawMatch[1]) : 0,
    triangles: drawMatch ? parseHumanNumber(drawMatch[2]) : 0,
    textures: texMatch ? parseHumanNumber(texMatch[1]) : 0,
    quality: qualityLine.replace(/^QUALITY:\s*/i, '').trim()
  };
}

function summarizeCpuProfile(profile, limit = 18) {
  const nodes = new Map((profile?.nodes || []).map((node) => [node.id, node]));
  const totals = new Map();
  (profile?.samples || []).forEach((nodeId, index) => {
    const node = nodes.get(nodeId);
    const frame = node?.callFrame || {};
    const key = `${frame.functionName || '(anonymous)'} @ ${frame.url || '(runtime)'}:${Number(frame.lineNumber || 0) + 1}`;
    totals.set(key, (totals.get(key) || 0) + Number(profile.timeDeltas?.[index] || 0) / 1000);
  });
  return [...totals.entries()]
    .map(([frame, selfMs]) => ({ frame, selfMs: Number(selfMs.toFixed(2)) }))
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv);
  const baselineLogs = [];

  const browser = await chromium.launch(args.hardware ? {
    channel: 'chrome',
    headless: false,
    args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist']
  } : {
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('BASELINE:')) baselineLogs.push(text);
  });

  await page.goto(args.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await page.evaluate(async ({ location, mode }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { ENV } = await import('/app/js/env.js?v=57');
    const deadline = performance.now() + 120000;
    while (
      (typeof ctx.loadRoads !== 'function' || typeof ctx.switchEnv !== 'function') &&
      performance.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (typeof ctx.loadRoads !== 'function' || typeof ctx.switchEnv !== 'function') {
      throw new Error('World runtime did not become ready before the profiler timeout.');
    }
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.selLoc = location;
    ctx.switchEnv(ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
    await ctx.loadRoads();
    ctx.setTravelMode?.(mode, { source: 'performance_profiler', force: true, emitTutorial: false });
    ctx.spawnOnRoad?.();
  }, { location: args.location, mode: args.mode });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  if (args.moveKey) await page.keyboard.down(args.moveKey);
  await page.waitForTimeout(args.waitMs);
  if (args.moveKey) await page.keyboard.up(args.moveKey);
  const cpuProfile = await cdp.send('Profiler.stop');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.setPerfOverlayEnabled?.(true, { persist: false });
    ctx.updatePerfPanel?.(true);
  });
  await page.waitForTimeout(900);

  const panelText = await page.evaluate(() => {
    const panel = document.getElementById('perfPanel');
    return panel ? panel.textContent || '' : '';
  });
  const parsed = parsePanelText(panelText);
  const runtime = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const actor = ctx.activeTransportActor?.() || null;
    const actorX = Number(actor?.position?.x || 0);
    const actorY = Number(actor?.position?.y || 0);
    const actorZ = Number(actor?.position?.z || 0);
    const nearbyBuildings = ctx.getNearbyBuildings?.(actorX, actorZ, 120) || [];
    const containingBuildings = nearbyBuildings.filter((building) => (
      actorX >= Number(building?.minX) && actorX <= Number(building?.maxX) &&
      actorZ >= Number(building?.minZ) && actorZ <= Number(building?.maxZ) &&
      ctx.pointInPolygon?.(actorX, actorZ, building?.pts) === true
    )).slice(0, 12).map((building) => ({
      id: building.sourceBuildingId || building.id || '',
      type: building.buildingType || '',
      minY: Number(building.minY),
      maxY: Number(building.maxY),
      collisionKind: building.collisionKind || '',
      collisionDisabled: !!building.collisionDisabled,
      allowsPassageBelow: !!building.allowsPassageBelow,
      footprintPoints: building.pts?.length || 0
    }));
    const intersectingMeshes = (ctx.buildingMeshes || []).filter((mesh) => {
      const box = mesh?.geometry?.boundingBox;
      if (!box) return false;
      const px = Number(mesh.position?.x || 0);
      const py = Number(mesh.position?.y || 0);
      const pz = Number(mesh.position?.z || 0);
      return actorX >= box.min.x + px && actorX <= box.max.x + px &&
        actorZ >= box.min.z + pz && actorZ <= box.max.z + pz &&
        actorY >= box.min.y + py - 2 && actorY <= box.max.y + py + 2;
    }).slice(0, 12).map((mesh) => ({
      name: mesh.name || '',
      sourceBuildingId: mesh.userData?.sourceBuildingId || '',
      isBatch: !!mesh.userData?.isBuildingBatch,
      batchCount: Number(mesh.userData?.batchCount || 0),
      lodTier: mesh.userData?.lodTier || '',
      boundingBox: mesh.geometry?.boundingBox ? {
        min: mesh.geometry.boundingBox.min.toArray(),
        max: mesh.geometry.boundingBox.max.toArray()
      } : null
    }));
    const nearestRoad = ctx.findNearestRoad?.(actorX, actorZ, { y: actorY, maxVerticalDelta: 120 }) || null;
    const walkSurface = ctx.SurfaceQuery?.walkAt?.(actorX, actorZ, { currentY: actorY }) || null;
    return {
      perf: ctx.capturePerfSnapshot?.() || ctx.perfStats || null,
      runtime: ctx.getRuntimeKernelSnapshot?.() || null,
      diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.() || null,
      renderer: {
        calls: Number(ctx.renderer?.info?.render?.calls || 0),
        triangles: Number(ctx.renderer?.info?.render?.triangles || 0),
        geometries: Number(ctx.renderer?.info?.memory?.geometries || 0),
        textures: Number(ctx.renderer?.info?.memory?.textures || 0),
        pixelRatio: Number(ctx.renderer?.getPixelRatio?.() || 0)
      },
      surfaceTrace: {
        actor: actor ? {
          mode: actor.mode,
          source: actor.source,
          position: actor.position,
          bounds: actor.bounds,
          contact: actor.contact
        } : null,
        walkSurface: walkSurface ? {
          kind: walkSurface.kind,
          position: walkSurface.position,
          distance: Number(walkSurface.distance),
          featureId: walkSurface.feature?.id || walkSurface.feature?.osmId || '',
          featureName: walkSurface.feature?.name || '',
          provenance: walkSurface.provenance || null
        } : null,
        nearestRoad: nearestRoad ? {
          distance: Number(nearestRoad.dist),
          y: Number(nearestRoad.y),
          point: nearestRoad.pt || null,
          road: {
            id: nearestRoad.road?.id || nearestRoad.road?.osmId || '',
            name: nearestRoad.road?.name || '',
            type: nearestRoad.road?.type || nearestRoad.road?.highway || '',
            width: Number(nearestRoad.road?.width || 0),
            structureSemantics: nearestRoad.road?.structureSemantics || null
          }
        } : null,
        collision: (() => {
          const result = ctx.checkBuildingCollision?.(actorX, actorZ, Number(actor?.bounds?.radius || 0.35), {
            actorBaseY: actorY - Number(actor?.bounds?.height || 1.7),
            actorHeight: Number(actor?.bounds?.height || 1.7)
          }) || null;
          return result ? {
            collision: !!result.collision,
            building: result.building ? {
              id: result.building.sourceBuildingId || result.building.id || '',
              type: result.building.buildingType || '',
              minY: Number(result.building.minY),
              maxY: Number(result.building.maxY),
              collisionKind: result.building.collisionKind || ''
            } : null
          } : null;
        })(),
        containingBuildings,
        intersectingMeshes
      }
    };
  });
  const payload = {
    ok: true,
    url: args.url,
    capturedAt: new Date().toISOString(),
    ...parsed,
    location: args.location,
    runtime,
    cpuTop: summarizeCpuProfile(cpuProfile.profile),
    panelText,
    baselineLogs
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(payload, null, 2));
  await page.screenshot({ path: args.out.replace(/\.json$/i, '.png'), fullPage: false });
  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
