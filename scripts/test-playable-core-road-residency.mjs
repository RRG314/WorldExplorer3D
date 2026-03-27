import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'playable-core-road-residency');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|504 \(Gateway Timeout\)|502 \(Bad Gateway\)|503 \(Service Unavailable\)|Could not reach Cloud Firestore backend|Failed to load resource.*favicon\.ico|net::ERR_CONNECTION_CLOSED)/i.test(String(text));
}

async function collectPlayableCoreReport(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };

    const intersects = (a, b, padding = 0) => {
      if (!a || !b) return false;
      return !(
        Number(a.maxX) < Number(b.minX) - padding ||
        Number(a.minX) > Number(b.maxX) + padding ||
        Number(a.maxZ) < Number(b.minZ) - padding ||
        Number(a.minZ) > Number(b.maxZ) + padding
      );
    };

    const meshBounds = (mesh) => {
      const localBounds = mesh?.userData?.localBounds;
      if (
        Number.isFinite(localBounds?.minX) &&
        Number.isFinite(localBounds?.maxX) &&
        Number.isFinite(localBounds?.minZ) &&
        Number.isFinite(localBounds?.maxZ)
      ) {
        return localBounds;
      }
      const center = mesh?.userData?.lodCenter;
      const radius = Math.max(0, Number(mesh?.userData?.lodRadius || 0));
      if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
        return {
          minX: center.x - Math.max(16, radius),
          maxX: center.x + Math.max(16, radius),
          minZ: center.z - Math.max(16, radius),
          maxZ: center.z + Math.max(16, radius)
        };
      }
      return null;
    };

    const visibleCountInBounds = (list, bounds, padding = 0) => {
      let count = 0;
      for (const mesh of Array.isArray(list) ? list : []) {
        if (!mesh?.visible) continue;
        if (intersects(meshBounds(mesh), bounds, padding)) count += 1;
      }
      return count;
    };

    const sample = (label) => {
      const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
      const playableCore = validation?.playableCore || null;
      return {
        label,
        roadMeshesVisibleInCore: visibleCountInBounds(ctx.roadMeshes, playableCore?.bounds, 32),
        urbanSurfacesVisibleInCore: visibleCountInBounds(ctx.urbanSurfaceMeshes, playableCore?.bounds, 32),
        buildingMeshesVisibleInCore: visibleCountInBounds(ctx.buildingMeshes, playableCore?.bounds, 32),
        structuresVisibleInCore: visibleCountInBounds(ctx.structureVisualMeshes, playableCore?.structureBounds || playableCore?.bounds, 48),
        playableCore,
        worldLoading: !!validation?.worldLoading,
        onRoad: !!validation?.road?.onRoad,
        currentRoadName: validation?.road?.currentRoadName || null
      };
    };

    const waitForPlayableCore = async () => {
      const deadline = performance.now() + 30000;
      while (performance.now() < deadline) {
        const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
        if (
          validation?.playableCore?.ready &&
          Number(validation.playableCore.roadMeshCount || 0) > 0 &&
          validation?.terrain?.activeCenterLoaded
        ) {
          return true;
        }
        if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(ctx.car?.x || 0, ctx.car?.z || 0);
        if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      }
      return false;
    };

    const ready = await waitForPlayableCore();
    if (!ready) return { ok: false, reason: 'playable core never became ready' };

    const samples = [sample('startup')];

    const yawSteps = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    for (let i = 0; i < yawSteps.length; i++) {
      if (ctx.car) ctx.car.angle = yawSteps[i];
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      samples.push(sample(`turn_${i}`));
    }

    const currentRoad = ctx.car?.road || ctx.car?._lastStableRoad || null;
    const targetPoint =
      Array.isArray(currentRoad?.pts) && currentRoad.pts.length > 6 ?
        currentRoad.pts[Math.min(currentRoad.pts.length - 2, Math.max(1, Math.floor(currentRoad.pts.length * 0.18)))] :
        { x: Number(ctx.car?.x || 0) + 120, z: Number(ctx.car?.z || 0) };
    if (ctx.car && targetPoint) {
      ctx.car.x = Number(targetPoint.x || ctx.car.x || 0);
      ctx.car.z = Number(targetPoint.z || ctx.car.z || 0);
      if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(ctx.car.x, ctx.car.z);
      if (typeof ctx.requestWorldSurfaceSync === 'function') {
        ctx.requestWorldSurfaceSync({ force: true, source: 'playable_core_residency_probe' });
      }
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      samples.push(sample('move_short'));
    }

    return {
      ok: true,
      samples,
      final: sample('final')
    };
  });
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!isIgnorableConsoleError(text)) consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    const text = String(err?.message || err);
    if (!isIgnorableConsoleError(text)) consoleErrors.push(text);
  });

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded' });
    const loader = await bootstrapEarthRuntime(page, 'baltimore');
    assert(loader?.ok, `bootstrap failed: ${loader?.reason || 'unknown'}`);

    const report = await collectPlayableCoreReport(page);
    assert(report?.ok, report?.reason || 'playable core report failed');
    assert(Array.isArray(report.samples) && report.samples.length >= 5, 'insufficient residency samples');

    const badRoadSample = report.samples.find((sample) =>
      Number(sample?.roadMeshesVisibleInCore || 0) <= 0
    );
    assert(!badRoadSample, `playable core roads disappeared during ${badRoadSample?.label || 'unknown sample'}`);

    const startupRoadSample = report.samples.find((sample) => sample?.label === 'startup');
    assert(
      Number(startupRoadSample?.roadMeshesVisibleInCore || 0) >= 16,
      `startup road shell too thin: ${Number(startupRoadSample?.roadMeshesVisibleInCore || 0)}`
    );
    assert(
      Number(startupRoadSample?.buildingMeshesVisibleInCore || 0) >= 24,
      `startup building shell too thin: ${Number(startupRoadSample?.buildingMeshesVisibleInCore || 0)}`
    );

    const badUrbanSample = report.samples.find((sample) =>
      Number(sample?.playableCore?.urbanSurfaceCount || 0) > 0 &&
      Number(sample?.urbanSurfacesVisibleInCore || 0) <= 0
    );
    assert(!badUrbanSample, `playable core urban surfaces disappeared during ${badUrbanSample?.label || 'unknown sample'}`);

    const badStructureSample = report.samples.find((sample) =>
      sample?.playableCore?.structureMeshCount > 0 &&
      Number(sample?.structuresVisibleInCore || 0) <= 0
    );
    assert(!badStructureSample, `playable core structures disappeared during ${badStructureSample?.label || 'unknown sample'}`);

    assert(consoleErrors.length === 0, `Unexpected console errors: ${consoleErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });
    const finalReport = {
      ok: true,
      baseUrl: `${server.baseUrl}/app/`,
      loader,
      report,
      consoleErrors
    };
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(finalReport, null, 2));
    console.log(JSON.stringify(finalReport, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch(async (error) => {
  await mkdirp(outputDir).catch(() => {});
  const failure = {
    ok: false,
    error: String(error?.message || error)
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(failure, null, 2)).catch(() => {});
  console.error('[test-playable-core-road-residency] Failed:', error);
  process.exitCode = 1;
});
