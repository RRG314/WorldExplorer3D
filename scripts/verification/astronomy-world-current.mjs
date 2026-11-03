import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { ASTRONOMY_STUDIES, astronomyAnalysis } from '../../app/js/campaign/astronomy-career.js';
const source = path.resolve(
  process.env.WE3D_ASTRO_RECOVERY ||
    'output/verification/planetary-career-20261103/world-1793702370055/qa-lunar-checkpoint.json'
);
assert.match(
  source,
  /\/output\/verification\/(?:planetary-career-20261103\/world-1793702370055\/qa-lunar-checkpoint|astronomy-career-20261103\/world-\d+\/qa-fieldwork-(?:failed-)?backup)\.json$/
);
const raw = JSON.parse(await fs.readFile(source)),
  recovery = raw.discovery || raw;
const output = 'output/verification/astronomy-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'astronomy',
    maximumDurationMs: 12 * 60 * 1000,
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
  await page.locator('[data-experience-id="career:astronomer"]').click();
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
    return planFieldworkWalk(ctx, target);
  }, target);
  for (const point of route) await qa.walkTo(point);
}
async function approach() {
  await closeStation();
  const s = await qa.snapshot(),
    p = s.fieldwork.target;
  await routeTo({ x: p.x, z: p.z + 2.75 / s.unit });
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
  return p;
}
try {
  report.scope =
    'Actual source Astronomy career, normal frames and keyboard walking. Verification-only read-only route planning, controlled facing/daylight and answers. Saved observing context is explicit catalog/synthetic replay, not real sky photons. Genuine previous source profile only, never native fixture results.';
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
    window.__qaAstronomy = () => ({
      field: ctx.saveActiveGameplay?.(),
      root: !!ctx.scene?.getObjectByName('Field course · astronomy'),
      proxies: (ctx.dynamicBuildingColliders || []).filter((p) =>
        p.sourceBuildingId?.startsWith('research-astronomy:')
      ).length,
    });
  });
  for (const variant of Object.keys(ASTRONOMY_STUDIES)) {
    if (recovery.profile.researchCareers.astronomy?.completed?.[variant]) continue;
    await begin(variant);
    await qa.record(variant + ' · actual supported observatory admission');
    let count = 0;
    while ((await qa.careerState()).active.phase !== 'complete') {
      assert.ok(++count <= 9, 'Finite eight-action observing log after admission');
      const a = (await qa.careerState()).active;
      await approach();
      if (a.phase === 'align') {
        for (let i = 0; i < 3; i++) await click('Azimuth minus 0.5 degrees');
        for (let i = 0; i < 2; i++) await click('Elevation minus 0.5 degrees');
        const optics = await page.evaluate(() => window.__qaAstronomy().field.tools);
        assert.ok(optics.errorDegrees < 0.001);
        assert.equal(optics.optics.clear, true);
        await qa.submit('Save physical alignment');
      } else if (a.phase === 'configure') {
        await page
          .locator('[name=seconds]')
          .selectOption(variant === 'exposure-bracket' ? '8' : '2');
        await qa.submit('Save exposure settings');
      } else if (['primary', 'controls'].includes(a.phase)) {
        const role =
          a.phase === 'primary' ? 'primary' : a.frames.comparison ? 'dark' : 'comparison';
        await click('Begin exposure');
        await page.evaluate(async () => {
          const { ctx } = await import('/app/js/shared-context.js?v=55'),
            w = ctx.Walk.state.walker;
          w.pitch = -0.22;
          ctx.renderer.domElement.focus({ preventScroll: true });
        });
        await page.waitForFunction(
          () => {
            const r = window.__qaAstronomy().field?.tools?.window;
            return r?.ready || r?.interrupted;
          },
          {},
          { timeout: 45000 }
        );
        const r = await page.evaluate(() => window.__qaAstronomy().field.tools.window);
        assert.equal(r.ready, true, r.reason);
        assert.equal((await qa.snapshot()).paused, false);
        await page.screenshot({ path: output + '/' + variant + '-' + role + '-ready.png' });
        await page.locator('[data-astronomy-open]').click();
        await qa.submit('Save exposure');
        await qa.record(variant + ' · real normal-clock ' + role + ' pixels accepted');
        if (variant === 'campaign' && role === 'primary') {
          const saved = (await qa.careerState()).active.frames.primary;
          await closeStation();
          await page.locator('[data-research-pause]').click();
          await page.waitForFunction(() => !window.__qaAstronomy().root);
          assert.equal(await page.evaluate(() => window.__qaAstronomy().proxies), 0);
          await begin(variant);
          assert.deepEqual((await qa.careerState()).active.frames.primary, saved);
          await qa.record(
            'Public pause/Continue retains exact first exposure and releases all scene/proxy ownership'
          );
        }
        continue;
      } else if (a.phase === 'analyze') {
        await page.locator('[name=catalogHip]').selectOption(String(a.target.hip));
        await page.locator('[name=outcome]').selectOption(astronomyAnalysis(a).outcome);
        await page.locator('[name=limit]').selectOption('synthetic-not-calibrated-sky-discovery');
        await qa.submit('Save comparison');
      } else if (a.phase === 'publish') {
        await qa.submit('Publish observing log');
      } else throw Error(a.phase);
      await qa.record(variant + ' · ' + a.phase + ' accepted');
    }
    await page.screenshot({ path: output + '/' + variant + '-complete.png' });
    await closeStation();
  }
  if (Object.keys((await qa.careerState()).completed).length === 3) {
    if (!(await qa.snapshot()).started) await begin((await qa.careerState()).active.variantId);
    await closeStation();
    await page.locator('[data-research-pause]').click();
    await page.waitForFunction(() => !window.__qaAstronomy().root);
    await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
    await page.locator('[data-discovery-tab=journal]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#discoveryJournalList .astronomy-report').length === 3
    );
    for (let i = 0; i < 3; i++) {
      const plate = page.locator('#discoveryJournalList .astronomy-report').nth(i);
      await plate.locator(':scope > summary').click();
      assert.equal(await plate.locator('svg').count(), 3);
      await plate.scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/journal-plate-' + i + '.png' });
    }
    await page.locator('#discoveryProfileBtn').click();
    const badge = page.locator('[data-explorer-badge=sky-observer]'),
      group = page.locator('[data-profile-group=badges]');
    await badge.waitFor({ state: 'attached' });
    if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
    await badge.scrollIntoViewIfNeeded();
    assert.ok((await badge.innerText()).includes('Sky Observer'));
    await page.screenshot({ path: output + '/sky-observer-badge.png' });
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
          (e) => e.metadata?.careerId === 'astronomy' && e.metadata.action?.exposure
        );
      event.metadata.action.exposure.image.seed += 1;
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
        reports: after.events.filter((e) => e.metadata?.astronomyReport).length,
      };
    });
    assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 3 });
    await qa.record(
      'Actual three cards/Profile badge, retained whole backup/reimport and altered-pixel-source rejection/rollback'
    );
    const original = (await qa.careerState()).records.campaign;
    await page.locator('#discoveryCloseBtn').click();
    await begin('campaign');
    assert.equal((await qa.careerState()).active.phase, 'complete');
    assert.deepEqual((await qa.careerState()).active.frames, original.frames);
    assert.deepEqual((await qa.careerState()).active.site, original.site);
    const s = await qa.snapshot(),
      target = s.fieldwork.target;
    await routeTo({ x: target.x, z: target.z + 2.75 / s.unit });
    await page.locator('[data-research-station]').click();
    await page.locator('.astronomy-report[open]').waitFor();
    await page.screenshot({ path: output + '/original-station-report-reopened.png' });
    const count = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return (await ctx.discoveryProfileStore.exportData()).events.filter(
        (e) => e.metadata?.astronomyReport
      ).length;
    });
    assert.equal(count, 3);
    await qa.record(
      'Completed Activities preserves original station/exposures and walks to its report without another capstone'
    );
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
