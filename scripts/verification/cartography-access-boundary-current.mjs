import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source =
    'output/verification/cartography-career-20261103/world-1793695997858/qa-fieldwork-backup.json',
  data = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/cartography-career-20261103/access-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'cartography',
    maximumDurationMs: 6 * 60 * 1000,
    walkLegMaximumDurationMs: 45000,
  }),
  { page, report } = qa;
async function begin(id) {
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  else {
    await page.locator('#exploreBtn').click();
    await page.locator('#fActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:cartographer"]').click();
  await page.locator('[data-experience-variant]').selectOption(id);
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer(id);
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
try {
  report.scope =
    'Only corrected entrance sourceBuildingId→existing entry-owner reads at the three ORIGINAL completed source entrances, normal keyboard walking. No original survey/control/measurement/report replay, no rewritten historical unknown readings, no new capstone. Temporary current-reading card uses the real access renderer, not a durable report.';
  report.source = source;
  report.readings = [];
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, data);
  for (const id of ['campaign', 'reciprocal', 'dogleg']) {
    await begin(id);
    const points = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
        { findTraversalRoute } = await import('/app/js/world/traversal.js?v=4'),
        a = (await ctx.discoveryProfileStore.getProfile()).researchCareers.cartography.active,
        frame = earthCoordinateFrame(ctx.LOC, ctx.SCALE),
        target = frame.toWorld(a.site.points.entry.lat, a.site.points.entry.lon),
        w = ctx.Walk.state.walker,
        u = ctx.METERS_PER_WORLD_UNIT || 1.11,
        r = findTraversalRoute(w.x, w.z, target.x, target.z, {
          mode: 'walk',
          maxAnchorDistance: 16 / u,
        });
      if (!r || r.distance * u > 250) throw Error('No bounded entry route');
      const points = r.points.map((p) => ({ x: p.x, z: p.z }));
      let remaining = 2 / u;
      while (points.length > 1) {
        const b = points.pop(),
          a = points.at(-1),
          d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > remaining) {
          points.push({
            x: b.x + ((a.x - b.x) * remaining) / d,
            z: b.z + ((a.z - b.z) * remaining) / d,
          });
          break;
        }
        remaining -= d;
      }
      return points.slice(1);
    });
    for (const p of points) await qa.walkTo(p, 0.18);
    const row = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
        { inspectCartographyAccess } = await import('/app/js/campaign/cartography-access.js'),
        { cartographyAccessMarkup } = await import('/app/js/campaign/cartography-report.js'),
        a = (await ctx.discoveryProfileStore.getProfile()).researchCareers.cartography.active,
        frame = earthCoordinateFrame(ctx.LOC, ctx.SCALE),
        u = ctx.METERS_PER_WORLD_UNIT || 1.11,
        points = Object.fromEntries(
          Object.entries(a.site.points).map(([k, p]) => {
            const v = frame.toWorld(p.lat, p.lon),
              s = ctx.SurfaceQuery.walkAt(v.x, v.z, {
                currentY: ctx.Walk.state.walker.y,
                sampleRenderedMesh: true,
              });
            return [k, { ...v, y: s.position.y }];
          })
        ),
        reading = inspectCartographyAccess(ctx, { points, metersPerUnit: u }, a),
        w = ctx.Walk.state.walker,
        distance = Math.hypot(w.x - points.entry.x, w.z - points.entry.z) * u;
      document.getElementById('qaCurrentAccess')?.remove();
      const panel = document.createElement('aside');
      panel.id = 'qaCurrentAccess';
      panel.style.cssText =
        'position:fixed;right:16px;top:140px;max-width:430px;max-height:65vh;overflow:auto;background:#102e29;color:#fff4d8;border:1px solid #70a99b;border-radius:12px;padding:16px;z-index:1000;font:15px system-ui';
      panel.innerHTML =
        '<strong>Current entrance check · historical route sheet retained</strong>' +
        cartographyAccessMarkup(reading);
      document.body.append(panel);
      return {
        variantId: a.variantId,
        reading,
        distance,
        originalInspection: a.access,
        expectedBuilding: a.site.plan.entry.buildingSourceId,
      };
    });
    assert.ok(row.distance <= 3);
    assert.equal(row.reading.resolvedBuildingId, row.expectedBuilding);
    assert.notEqual(row.reading.entrySupport, 'unknown');
    assert.equal(row.reading.samples.length, 5);
    assert.deepEqual(
      (await qa.careerState()).active.legs,
      data.profile.researchCareers.cartography.records[id].legs
    );
    report.readings.push(row);
    await page.screenshot({ path: output + '/' + id + '-current-entry-owner.png' });
    await page.evaluate(() => document.getElementById('qaCurrentAccess')?.remove());
    await qa.record(
      id + ' · actual original entrance capability read; historical survey unchanged'
    );
  }
  const final = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      data = await ctx.discoveryProfileStore.exportData();
    return {
      reports: data.events.filter((e) => e.metadata?.cartographyReport).length,
      records: data.profile.researchCareers.cartography.records,
    };
  });
  assert.equal(final.reports, 3);
  assert.deepEqual(final.records, data.profile.researchCareers.cartography.records);
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
