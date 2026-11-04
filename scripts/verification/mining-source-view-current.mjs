import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_MINING_RECOVERY || '');
assert.match(source, /mining-career-20261103\/world-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.mining.completed).length, 3);
const output = 'output/verification/mining-career-20261103/source-view-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'mining',
    maximumDurationMs: 180000,
    walkLegMaximumDurationMs: 45000,
  }),
  { page, report } = qa;
async function walkTo(point) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
  const route = await page.evaluate(async (point) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return planFieldworkWalk(ctx, point, { paddingMeters: 12, spacingMeters: 0.8 });
  }, point);
  for (const p of route) await qa.walkTo(p);
}
async function lookAt(point) {
  await page.evaluate(async (point) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      w = ctx.Walk.state.walker,
      c = ctx.camera.getWorldPosition(new THREE.Vector3());
    w.yaw = Math.atan2(point.x - w.x, point.z - w.z);
    w.lookYawOffset = 0;
    w.pitch = -Math.atan2(c.y - point.y, Math.hypot(point.x - w.x, point.z - w.z));
    ctx.renderer.domElement.focus({ preventScroll: true });
  }, point);
  await page.waitForTimeout(300);
}
try {
  report.scope =
    'Only completed actual-source quarry presentation and cold saved-carrier collision bounds. Normal location arrival and keyboard walking between retained props, controlled facing/daylight. No accepted quarry method, batch, clock, failed-save or capstone replay.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, data);
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:mining-engineer"]').click();
  await page.locator('[data-experience-variant]').selectOption('campaign');
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('campaign');
  for (
    let i = 0;
    i < 6 && (await page.locator('#quickTimeOfDay').getAttribute('data-mode')) !== 'day';
    i++
  )
    await page.locator('#quickTimeOfDay').click();
  assert.equal((await qa.careerState()).active.phase, 'complete');
  report.geometry = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      root = ctx.scene.getObjectByName('Field course · mining'),
      cart = root.getObjectByName('Quarry weighed carrier'),
      proxy = ctx.dynamicBuildingColliders.find(
        (c) => c.sourceBuildingId === 'research-mining:carrier'
      ),
      box = new THREE.Box3().setFromObject(cart),
      point = (name) => {
        const v = root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
        return { x: v.x, y: v.y, z: v.z };
      };
    let meshes = 0,
      vertices = 0;
    root.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        vertices += o.geometry?.attributes?.position?.count || 0;
      }
    });
    return {
      proxyError: Math.max(
        ...['x', 'y', 'z'].flatMap((a) => [
          Math.abs(proxy['min' + a.toUpperCase()] - box.min[a]),
          Math.abs(proxy['max' + a.toUpperCase()] - box.max[a]),
        ])
      ),
      cart: point('Quarry weighed carrier'),
      bench: point('Conserved processing and fabrication lots'),
      face: point('Authored quarry face b'),
      marker: point('Fabricated survey marker base'),
      meshes,
      vertices,
      restoredCells: [...root.children]
        .flatMap((o) => o.children)
        .filter((o) => o.userData?.restoredFill).length,
      proxies: ctx.dynamicBuildingColliders.filter((c) =>
        c.sourceBuildingId?.startsWith('research-mining:')
      ).length,
    };
  });
  assert.ok(report.geometry.proxyError < 1e-9);
  assert.equal(report.geometry.restoredCells, 2);
  const u = (await qa.snapshot()).unit;
  for (const [id, p, distance] of [
    ['receiver', report.geometry.cart, 2.75],
    ['backfilled-face', report.geometry.face, 2.75],
    ['installed-marker', report.geometry.marker, 2.0],
  ]) {
    await walkTo({ x: p.x, z: p.z + distance / u });
    await lookAt({ ...p, y: p.y + 0.65 / u });
    await page.screenshot({ path: output + '/' + id + '.png' });
  }
  assert.deepEqual(
    (await qa.careerState()).active.report,
    data.profile.researchCareers.mining.records.campaign.report
  );
  await qa.record(
    'Completed source props/cold restored carrier bounds, actual walked views; original report unchanged'
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
