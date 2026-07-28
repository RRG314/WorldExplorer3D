import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

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
    ctx.customLoc = { lat: 23.4162, lon: 25.6628, name: 'Sahara transition probe' };
    ctx.customLocTransient = false;
    ctx.selLoc = 'custom';
    document.getElementById('titleScreen')?.classList.add('hidden');
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
    return { close, high, hysteresis, restored };
  });

  report.errors = errors;
  await page.screenshot({ path: path.join(outputDir, 'restored-close-detail.png') });
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

  assert.ok(report.close.meshes > 0, 'terrain mesh unavailable');
  assert.equal(report.close.mapped, report.close.meshes, 'close terrain detail maps missing');
  assert.equal(report.high.mapped, 0, 'aerial color maps were not suppressed');
  assert.equal(report.high.normalMapped, 0, 'aerial normal maps were not suppressed');
  assert.equal(report.high.suppressed, report.high.meshes, 'aerial suppression state incomplete');
  assert.equal(report.hysteresis.suppressed, report.hysteresis.meshes, 'aerial hysteresis released too early');
  assert.deepEqual(report.restored.mapIds, report.close.mapIds, 'descent did not restore the original close-detail maps');
  assert.equal(report.restored.suppressed, 0, 'descent left terrain suppressed');
  assert.deepEqual(errors, [], 'browser errors during aerial transition');
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
