import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const servedRoot = path.resolve(process.cwd(), String(process.env.WE3D_VERIFY_ROOT || '.'));
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4491, 4492, 4493] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const evidenceDir = path.resolve('output/verification/streetscape');
await mkdir(evidenceDir, { recursive: true });

const locations = [
  { id: 'baltimore', name: 'Baltimore Maryland', lat: 39.2904, lon: -76.6122 },
  { id: 'san-francisco', name: 'San Francisco California', lat: 37.7749, lon: -122.4194 }
];
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const reports = [];

async function verifyLocation(location, viewport, screenshotName) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const browserErrors = [];
  const failedLocalResources = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack || String(error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failedLocalResources.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    const params = new URLSearchParams({
      loc: 'custom', lat: String(location.lat), lon: String(location.lon), lname: location.name,
      launch: 'earth', gm: 'free', mode: 'walk', diagnostics: '1', streetscapeCheck: String(Date.now())
    });
    await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
    await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.gameStarted === true && state.worldLoading === false &&
        Number(state.streetscape?.sidewalkSections || 0) > 0;
    }, null, { timeout: 360_000 });

    const result = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const publication = ctx.streetscapePublication;
      const model = publication?.model;
      const surfaces = (model?.surfaces || []).filter((surface) => surface.kind === 'sidewalk');
      const closest = [...surfaces].sort((left, right) => {
        const leftDistance = Math.hypot((left.centerStart.x + left.centerEnd.x) * 0.5, (left.centerStart.z + left.centerEnd.z) * 0.5);
        const rightDistance = Math.hypot((right.centerStart.x + right.centerEnd.x) * 0.5, (right.centerStart.z + right.centerEnd.z) * 0.5);
        return leftDistance - rightDistance;
      })[0];
      if (!closest) return { diagnostics: publication?.diagnostics || null, sample: null };
      const x = (closest.centerStart.x + closest.centerEnd.x) * 0.5;
      const y = (closest.centerStart.y + closest.centerEnd.y) * 0.5;
      const z = (closest.centerStart.z + closest.centerEnd.z) * 0.5;
      const walkY = Number(ctx.GroundHeight?.walkSurfaceY?.(x, z));
      const road = ctx.roads.find((candidate) => String(candidate.sourceFeatureId || candidate.id || '') === closest.roadId);
      const ordinaryAtGrade = road?.structureSemantics?.terrainMode === 'at_grade' &&
        road?.structureSemantics?.topologySeparated !== true &&
        road?.structureSemantics?.rampCandidate !== true;
      const urbanMeshes = (ctx.urbanSurfaceMeshes || []).filter((mesh) => mesh?.userData?.isStreetscapeBatch);
      const inner = closest.corners[0];
      const outer = closest.corners[1];
      const acrossX = inner.x - outer.x;
      const acrossZ = inner.z - outer.z;
      const acrossLength = Math.hypot(acrossX, acrossZ) || 1;
      ctx.setTimeOfDay?.('day');
      if (ctx.ambientLight) ctx.ambientLight.intensity = Math.max(0.85, Number(ctx.ambientLight.intensity) || 0);
      if (ctx.hemiLight) ctx.hemiLight.intensity = Math.max(0.75, Number(ctx.hemiLight.intensity) || 0);
      if (ctx.fillLight) ctx.fillLight.intensity = Math.max(0.65, Number(ctx.fillLight.intensity) || 0);
      ctx.camera.position.set(x + acrossX / acrossLength * 8, y + 3.4, z + acrossZ / acrossLength * 8);
      ctx.camera.lookAt(x, y + 0.12, z);
      ctx.camera.updateMatrixWorld(true);
      ctx.renderer.render(ctx.scene, ctx.camera);
      return {
        diagnostics: publication.diagnostics,
        sample: { x, y, z, walkY, ordinaryAtGrade, curbTop: !!closest.curbTop, curbFace: !!closest.curbFace },
        meshCount: urbanMeshes.length,
        attachedMeshCount: urbanMeshes.filter((mesh) => !!mesh.parent).length,
        colliderMeshCount: urbanMeshes.filter((mesh) => mesh.userData?.isCollider === true).length,
        roadIntegrity: ctx.transportSurfacePublication?.roadSurfaceIntegrity || null,
        roadConformance: ctx.transportSurfacePublication?.roadTerrainConformance || null,
        transportPhaseDurationsMs: ctx.transportSurfacePublication?.phaseDurationsMs || null,
        textDiagnostics: JSON.parse(globalThis.render_game_to_text?.() || '{}').streetscape || null,
        visualDataUrl: ctx.renderer.domElement.toDataURL('image/png')
      };
    });

    assert.ok(result.diagnostics);
    assert.ok(result.diagnostics.sidewalkSections > 0);
    assert.ok(result.diagnostics.curbSections > 0);
    assert.ok(result.diagnostics.batchCount >= 1 && result.diagnostics.batchCount <= 2);
    assert.ok(result.diagnostics.maxSidewalkWidth <= 2.8);
    assert.ok(result.diagnostics.maxCurbHeight <= 0.14);
    assert.equal(result.diagnostics.roadGeometryMutations, 0);
    assert.equal(result.diagnostics.terrainGeometryMutations, 0);
    assert.equal(result.diagnostics.vehicleCollisionMeshes, 0);
    assert.equal(result.diagnostics.navigationGraphsCreated, 0);
    assert.equal(result.meshCount, result.diagnostics.batchCount);
    assert.equal(result.attachedMeshCount, result.meshCount);
    assert.equal(result.colliderMeshCount, 0);
    assert.equal(result.sample.ordinaryAtGrade, true);
    assert.equal(result.sample.curbTop, true);
    assert.equal(result.sample.curbFace, true);
    assert.ok(Math.abs(result.sample.walkY - result.sample.y) <= 0.08, JSON.stringify(result.sample));
    assert.equal(result.roadIntegrity?.foldedTriangles, 0);
    assert.equal(result.roadIntegrity?.degenerateTriangles, 0);
    assert.deepEqual(result.textDiagnostics, result.diagnostics);
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(failedLocalResources, []);
    const visualData = String(result.visualDataUrl || '').replace(/^data:image\/png;base64,/, '');
    assert.ok(visualData.length > 1000);
    await writeFile(path.join(evidenceDir, screenshotName), Buffer.from(visualData, 'base64'));
    delete result.visualDataUrl;
    return { location: location.id, viewport, ...result, browserErrors, failedLocalResources };
  } finally {
    await context.close();
  }
}

try {
  reports.push(await verifyLocation(locations[0], { width: 1440, height: 900 }, '01-baltimore-desktop.png'));
  if (String(process.env.WE3D_STREETSCAPE_SCOPE || '').toLowerCase() !== 'single') {
    reports.push(await verifyLocation(locations[1], { width: 390, height: 844 }, '02-san-francisco-mobile.png'));
  }
  const report = { ok: true, locations: reports, evidenceDir };
  await writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
