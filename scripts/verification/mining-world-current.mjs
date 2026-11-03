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
  output = 'output/verification/mining-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'mining',
    maximumDurationMs: 15 * 60 * 1000,
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
      stepHeightMeters: 0.25,
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
    'Actual source Mining career: existing Earth/Walk/collision/field/profile owners, normal frames and keyboard walking. QA-only read-only route planning and controlled facing/daylight/answers. Authored above-ground exhibit; normal location travel uses the saved yard coordinate. No direct test position setting, actual terrain excavation or real mining rights. Genuine preceding Astronomy source profile only; never native fixture data.';
  report.source = source;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/app/?diagnostics=1'
  );
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, recovery);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaMining = () => ({
      field: ctx.saveActiveGameplay?.(),
      root: !!ctx.scene?.getObjectByName('Field course · mining'),
      proxies: (ctx.dynamicBuildingColliders || []).filter((p) =>
        p.sourceBuildingId?.startsWith('research-mining:')
      ).length,
    });
  });
  for (const variant of Object.keys(MINING_JOBS)) {
    if (recovery.profile.researchCareers.mining?.completed?.[variant]) continue;
    await begin(variant);
    await qa.record(variant + ' · actual curated supported quarry admission');
    let count = 0;
    while ((await qa.careerState()).active.phase !== 'complete') {
      assert.ok(++count <= 16, 'Finite fourteen procedure records after admission');
      const a = (await qa.careerState()).active,
        p = a.phase;
      if (p === 'deliver') {
        await closeStation();
        const c = await page.evaluate(() => window.__qaMining().field.tools.carrier.position),
          s = await qa.snapshot();
        if (Math.hypot(s.walker.x - c.x, s.walker.z - c.z) * s.unit > 1.5)
          await routeTo({ x: c.x, z: c.z + 1.0 / s.unit });
        await page.locator('[data-mining-start]').click();
        assert.equal(
          await page.evaluate(() => window.__qaMining().field.tools.carrier.attached),
          true
        );
        const nodes = await page.evaluate(async (site) => {
          const { ctx } = await import('/app/js/shared-context.js?v=55'),
            { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
            f = earthCoordinateFrame(ctx.LOC, ctx.SCALE),
            d = f.toWorld(site.points.dispatch.lat, site.points.dispatch.lon),
            b = f.toWorld(site.points.bench.lat, site.points.bench.lon);
          return [d, { x: b.x + 1.5 / (ctx.METERS_PER_WORLD_UNIT || 1.11), z: b.z }];
        }, a.site);
        for (const node of nodes) {
          await routeTo(node);
          const r = await page.evaluate(() => window.__qaMining().field.tools.window);
          if (r?.ready) break;
          assert.equal(r.interrupted, false, r.reason);
        }
        await page.waitForFunction(
          () => window.__qaMining().field.tools.window?.ready,
          {},
          { timeout: 12000 }
        );
        const r = await page.evaluate(() => window.__qaMining().field.tools.window);
        assert.equal(r.data.massGrams, a.plan.massGrams);
        assert.ok(r.data.wheelClearancesMeters.every((d) => Math.abs(d) < 0.01));
        await page.screenshot({ path: output + '/' + variant + '-actual-weighed-carrier.png' });
        await page.locator('[data-mining-open]').click();
        await qa.submit('Save weighed delivery');
        await qa.record(
          variant + ' · actual walked carrier/return control/four-wheel pan weight accepted'
        );
        continue;
      }
      await approach();
      if (p === 'inspect') {
        await qa.submit('Record visible face');
      } else if (p === 'assay' || p === 'cut') {
        const id = (await qa.snapshot()).fieldwork.target.id;
        await click(p === 'assay' ? 'Place line and measure' : 'Run cutter');
        await faceRig(id);
        await page.waitForFunction(
          () => {
            const w = window.__qaMining().field?.tools?.window;
            return w?.ready || w?.interrupted;
          },
          {},
          { timeout: 25000 }
        );
        const w = await page.evaluate(() => window.__qaMining().field.tools.window);
        assert.equal(w.ready, true, w.reason);
        await page.screenshot({ path: output + '/' + variant + '-' + p + '-' + id + '-ready.png' });
        await page.locator('[data-mining-open]').click();
        await qa.submit(p === 'assay' ? 'Save measured line' : 'Save cut record');
        await qa.record(variant + ' · actual ' + p + ' ' + id + ' record accepted');
        if (variant === 'campaign' && p === 'assay' && id === 'a') {
          const saved = (await qa.careerState()).active.assays.a;
          await closeStation();
          await page.locator('[data-research-pause]').click();
          await page.waitForFunction(() => !window.__qaMining().root);
          assert.equal(await page.evaluate(() => window.__qaMining().proxies), 0);
          await begin(variant);
          assert.deepEqual((await qa.careerState()).active.assays.a, saved);
          await qa.record(
            'Public Pause/Continue retains original measured A line and releases every quarry proxy/scene lease'
          );
        }
        continue;
      } else if (p === 'plan') {
        await page.locator('[name=faceId]').selectOption('b');
        for (const i of variant === 'narrow-vein'
          ? [2]
          : variant === 'mixed-batch'
            ? [1, 2, 3]
            : [1, 2])
          await page.locator('[name=take' + i + ']').check();
        await qa.submit('Mark bounded cut');
      } else if (p === 'sort') {
        for (const [i, id] of a.plan.cellIds.entries()) {
          const [face, , column] = id.split(':'),
            s = a.assays[face].samples[Number(column)];
          if ((s.copperGrams / s.massGrams) * 1000 >= MINING_LIMITS.oreCutoffPermille)
            await page.locator('[name=ore' + i + ']').check();
        }
        await qa.submit('Separate and load carrier');
      } else if (p === 'process') await qa.submit('Process weighed batch');
      else if (p === 'fabricate') await qa.submit('Cast and install marker base');
      else if (p === 'restore') await qa.submit('Backfill and stabilize worked cell');
      else if (p === 'publish') {
        await page.locator('[name=limit]').selectOption('authored-formation-not-real-ore-reserve');
        await qa.submit('Publish quarry ledger');
      } else throw Error(p);
      await qa.record(variant + ' · ' + p + ' accepted');
    }
    await page.screenshot({ path: output + '/' + variant + '-complete.png' });
    await closeStation();
  }
  if (Object.keys((await qa.careerState()).completed).length === 3) {
    if (!(await qa.snapshot()).started) await begin((await qa.careerState()).active.variantId);
    await closeStation();
    await page.locator('[data-research-pause]').click();
    await page.waitForFunction(() => !window.__qaMining().root);
    await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
    await page.locator('[data-discovery-tab=journal]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#discoveryJournalList .mining-report').length === 3
    );
    for (let i = 0; i < 3; i++) {
      const plate = page.locator('#discoveryJournalList .mining-report').nth(i);
      await plate.locator(':scope > summary').click();
      assert.equal(await plate.locator('svg').count(), 1);
      await plate.scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/journal-plate-' + i + '.png' });
    }
    await page.locator('#discoveryProfileBtn').click();
    const badge = page.locator('[data-explorer-badge=mining-survey]'),
      group = page.locator('[data-profile-group=badges]');
    await badge.waitFor({ state: 'attached' });
    if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
    await badge.scrollIntoViewIfNeeded();
    assert.ok((await badge.innerText()).includes('Mining Survey'));
    await page.screenshot({ path: output + '/mining-survey-badge.png' });
    report.storage = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { canonicalFieldRecord: c } = await import('/app/js/campaign/field-study-contract.js'),
        store = ctx.discoveryProfileStore,
        first = await store.exportData();
      await store.importData(first);
      const second = await store.exportData(),
        normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } }),
        bad = structuredClone(second),
        event = bad.events.find(
          (e) => e.metadata?.careerId === 'mining' && e.metadata.action?.assay
        );
      event.metadata.action.assay.samples[0].copperGrams += 1;
      let rejected = false;
      try {
        await store.importData(bad);
      } catch {
        rejected = true;
      }
      const after = await store.exportData();
      return {
        same: c(normal(first)) === c(normal(second)),
        rejected,
        rollback: c({ ...second, exportedAt: 0 }) === c({ ...after, exportedAt: 0 }),
        reports: after.events.filter((e) => e.metadata?.miningReport).length,
      };
    });
    assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 3 });
    await qa.record(
      'Actual three cards/Profile badge, retained whole backup/reimport and altered-assay rejection/rollback'
    );
    const original = (await qa.careerState()).records.campaign;
    await page.locator('#discoveryCloseBtn').click();
    await begin('campaign');
    assert.equal((await qa.careerState()).active.phase, 'complete');
    assert.deepEqual((await qa.careerState()).active.report, original.report);
    assert.deepEqual((await qa.careerState()).active.site, original.site);
    const s = await qa.snapshot(),
      target = s.fieldwork.target;
    await routeTo({ x: target.x, z: target.z + 2.75 / s.unit });
    await page.locator('[data-research-station]').click();
    await page.locator('.mining-report[open]').waitFor();
    await page.screenshot({ path: output + '/original-station-report-reopened.png' });
    const count = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return (await ctx.discoveryProfileStore.exportData()).events.filter(
        (e) => e.metadata?.miningReport
      ).length;
    });
    assert.equal(count, 3);
    await qa.record(
      'Completed Activities preserves original yard/report and walks to its report without another capstone'
    );
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
