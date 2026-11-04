import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { MINING_JOBS, MINING_LIMITS } from '../../app/js/campaign/mining-formation.js';
const source = path.resolve(
  process.env.WE3D_MINING_RECOVERY ||
    'output/verification/astronomy-career-20261103/world-1793705746302/qa-fieldwork-backup.json'
);
assert.match(
  source,
  /\/output\/verification\/(?:astronomy-career-20261103\/world-1793705746302|mining-career-20261103\/world-\d+)\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const recovery = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/mining-career-20261103/approach-diagnosis-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'mining',
    maximumDurationMs: 210000,
    walkLegMaximumDurationMs: 45000,
  }),
  { page, report } = qa;
const click = (name) => page.getByRole('button', { name, exact: true }).click();
async function closeStation() {
  if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
}
async function begin(variant) {
  await closeStation();
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await click('⌖ Activities');
  else {
    await page.locator('#exploreBtn').click();
    await page.locator('#fActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:mining-engineer"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption(variant);
  else assert.equal(variant, (await qa.careerState()).active?.variantId || 'campaign');
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer(variant);
  if (await page.locator('#quickTimeOfDay').isVisible())
    for (
      let i = 0;
      i < 6 && (await page.locator('#quickTimeOfDay').getAttribute('data-mode')) !== 'day';
      i++
    )
      await page.locator('#quickTimeOfDay').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function routeTo(target) {
  const route = await page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return planFieldworkWalk(ctx, target, {
      paddingMeters: 40,
      spacingMeters: 1,
      maximumCells: 18000,
    });
  }, target);
  for (const point of route) await qa.walkTo(point);
}
async function faceRig(id) {
  await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      w = ctx.Walk.state.walker,
      g = ctx.scene.getObjectByName('Authored quarry face ' + id),
      p = g.getWorldPosition(new THREE.Vector3()),
      u = ctx.METERS_PER_WORLD_UNIT || 1.11,
      c = ctx.camera.getWorldPosition(new THREE.Vector3());
    p.y += 1.1 / u;
    w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
    w.lookYawOffset = 0;
    w.pitch = -Math.atan2(c.y - p.y, Math.hypot(p.x - w.x, p.z - w.z));
    ctx.renderer.domElement.focus({ preventScroll: true });
  }, id);
  await page.waitForTimeout(220);
}
async function approach() {
  await closeStation();
  const s = await qa.snapshot(),
    p = s.fieldwork.target;
  await routeTo({ x: p.x, z: p.z + 2.75 / s.unit });
  if (['a', 'b', 'c'].includes(p.id)) await faceRig(p.id);
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
  return p;
}
try {
  report.scope =
    'Read-only diagnosis of the failed initial quarry approach; genuine admission checkpoint, no field methods or position movement.';
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, recovery);
  await begin('campaign');
  report.diagnosis = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { createBuildingCollisionQuery } = await import('/app/js/physics/building-collision.js?v=5'),
      query = createBuildingCollisionQuery(ctx),
      w = ctx.Walk.state.walker,
      u = ctx.METERS_PER_WORLD_UNIT || 1.11,
      target = ctx.saveActiveGameplay().target,
      d = { x: target.x, z: target.z + 2.75 / u };
    function sample(p) {
      const g = ctx.SurfaceQuery.walkAt(p.x, p.z),
        water = ctx.SurfaceQuery.waterAt?.(p.x, p.z),
        c = Number.isFinite(g?.position?.y)
          ? query(p.x, p.z, 0.45 / u, { actorBaseY: g.position.y, actorHeight: 2 / u })
          : null,
        b = c?.building;
      return {
        x: p.x,
        z: p.z,
        ground: g ? { y: g.position?.y, kind: g.kind, source: g.provenance?.source } : null,
        water: !!water?.feature,
        collision: !!c?.collision,
        blocker: b
          ? {
              id: b.sourceBuildingId || b.id,
              type: b.buildingType || b.type,
              minX: b.minX,
              maxX: b.maxX,
              minZ: b.minZ,
              maxZ: b.maxZ,
              minY: b.minY,
              maxY: b.maxY,
            }
          : null,
      };
    }
    const line = [];
    for (let i = 0; i <= Math.ceil((Math.hypot(d.x - w.x, d.z - w.z) * u) / 0.25); i++) {
      const n = Math.ceil((Math.hypot(d.x - w.x, d.z - w.z) * u) / 0.25),
        t = i / n;
      line.push(sample({ x: w.x + (d.x - w.x) * t, z: w.z + (d.z - w.z) * t }));
    }
    const jumps = [];
    for (let i = 1; i < line.length; i++)
      if (line[i].ground && line[i - 1].ground) {
        const dy = Math.abs(line[i].ground.y - line[i - 1].ground.y) * u;
        if (dy > 0.0625) jumps.push({ index: i, dy, before: line[i - 1], after: line[i] });
      }
    const neighbors = [];
    for (const dx of [-3, -1, 0, 1, 3])
      for (const dz of [-3, -1, 0, 1, 3])
        neighbors.push(sample({ x: w.x + dx / u, z: w.z + dz / u }));
    const buildings = (ctx.buildings || [])
      .filter(
        (b) =>
          b.maxX > w.x - 50 / u &&
          b.minX < d.x + 50 / u &&
          b.maxZ > Math.min(w.z, d.z) - 60 / u &&
          b.minZ < Math.max(w.z, d.z) + 60 / u
      )
      .map((b) => ({
        id: b.sourceBuildingId || b.id,
        type: b.buildingType || b.type,
        minX: b.minX,
        maxX: b.maxX,
        minZ: b.minZ,
        maxZ: b.maxZ,
      }));
    return {
      walker: { x: w.x, y: w.y, z: w.z },
      destination: d,
      start: sample(w),
      end: sample(d),
      jumps,
      neighbors,
      buildings,
      blockedLine: line.filter((s) => s.collision || s.water || !s.ground),
    };
  });
  await fs.writeFile(
    output + '/approach-diagnosis.json',
    JSON.stringify(report.diagnosis, null, 2) + '\n'
  );
  await page.screenshot({ path: output + '/approach-diagnosis.png' });
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
