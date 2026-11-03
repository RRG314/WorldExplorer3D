import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import {
  HYDROLOGY_STUDIES,
  hydrologyFlowConclusion,
} from '../../app/js/campaign/hydrology-career.js';
const source = path.resolve(
  process.env.WE3D_HYDRO_RECOVERY ||
    'output/verification/marine-biology-career-20261102/review-1793684645414/qa-fieldwork-backup.json'
);
assert.match(
  source,
  /\/output\/verification\/(?:marine-biology-career-20261102\/review-1793684645414|hydrology-career-20261103\/world-\d+)\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const recovery = JSON.parse(await fs.readFile(source));
const output = `output/verification/hydrology-career-20261103/world-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'hydrology',
    walkLegMaximumDurationMs: 45000,
    maximumDurationMs: 12 * 60 * 1000,
  }),
  { page, report } = qa,
  click = (name) => page.getByRole('button', { name, exact: true }).click();
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
  await page.locator('[data-experience-id="career:hydrologist"]').click();
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
  await routeTo({ x: p.x, z: p.z + 1.6 / s.unit });
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
  return p;
}
async function faceFloat() {
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      w = ctx.Walk.state.walker,
      object = ctx.scene.getObjectByName('Hydrology float lane 2'),
      p = object.getWorldPosition(new THREE.Vector3()),
      c = ctx.camera.getWorldPosition(new THREE.Vector3());
    w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
    w.lookYawOffset = 0;
    w.pitch = -Math.atan2(c.y - p.y, Math.hypot(p.x - w.x, p.z - w.z));
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function traceSight() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { createFieldOpacitySampler } = await import('/app/js/campaign/field-opacity-sampler.js'),
      opacity = createFieldOpacitySampler(),
      camera = ctx.camera,
      object = ctx.scene.getObjectByName('Hydrology float lane 2'),
      target = object.getWorldPosition(new THREE.Vector3()),
      eye = camera.getWorldPosition(new THREE.Vector3()),
      ray = new THREE.Raycaster();
    ray.camera = camera;
    ray.set(eye, target.clone().sub(eye).normalize());
    ray.far = eye.distanceTo(target) + 0.1;
    try {
      return {
        eye: { ...eye },
        target: { ...target },
        near: camera.near,
        projection: { ...target.clone().project(camera) },
        hits: ray
          .intersectObjects(ctx.scene.children, true)
          .filter((h) => {
            for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
            return opacity.accepts(h);
          })
          .slice(0, 5)
          .map((h) => {
            const chain = [];
            for (let o = h.object; o; o = o.parent) chain.push(o.name || o.type);
            return {
              distance: h.distance,
              chain,
              position: { ...h.point },
              material: {
                transparent: h.object.material?.transparent,
                opacity: h.object.material?.opacity,
              },
            };
          }),
      };
    } finally {
      opacity.dispose();
    }
  });
}
async function contact() {
  await page.evaluate(() => {
    const d = document.querySelector('.research-station[open]');
    if (d) d.querySelector('[data-research-close]').click();
  });
  const state = await qa.careerState(),
    s = await qa.snapshot(),
    points = await page.evaluate(async (site) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
        f = earthCoordinateFrame(ctx.LOC, ctx.SCALE);
      return Object.fromEntries(
        Object.entries(site.points).map(([id, p]) => [id, f.toWorld(p.lat, p.lon)])
      );
    }, state.active.site),
    center = { x: (points.a.x + points.b.x) / 2, z: (points.a.z + points.b.z) / 2 };
  await routeTo({ x: center.x, z: center.z + 1.6 / s.unit });
  const before = await qa.snapshot();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      w = ctx.Walk.state.walker;
    w.yaw = Math.PI / 2;
    w.lookYawOffset = 0;
    w.pitch = -0.2;
    ctx.renderer.domElement.focus();
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(450);
  await page.keyboard.up('w');
  const calibration = await qa.snapshot(),
    moved =
      Math.hypot(calibration.walker.x - before.walker.x, calibration.walker.z - before.walker.z) *
      s.unit;
  assert.ok(moved > 0.15);
  await page.evaluate(async (center) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      w = ctx.Walk.state.walker;
    w.yaw = Math.atan2(center.x - w.x, center.z - 1.6 / (ctx.METERS_PER_WORLD_UNIT || 1.11) - w.z);
    w.lookYawOffset = 0;
    w.pitch = -0.2;
    ctx.renderer.domElement.focus();
  }, center);
  try {
    await page.keyboard.down('w');
    await page.waitForTimeout(2200);
  } finally {
    await page.keyboard.up('w');
  }
  const after = await qa.snapshot();
  assert.equal(after.paused, false);
  assert.equal(after.walker.onGround, true);
  const bankDistance = (after.walker.z - (center.z - 1.6 / s.unit)) * s.unit;
  assert.ok(
    bankDistance > 0.85 && bankDistance < 1.8,
    JSON.stringify({ bankDistance, walker: after.walker })
  );
  report.contact = { calibrationMeters: moved, bankDistance, unpaused: true, onGround: true };
  await page.screenshot({ path: output + '/actual-supported-stream-contact.png' });
  await qa.record(
    'Actual unpaused calibration and sustained approach stopped at the solid supported stream'
  );
}
try {
  report.scope =
    'Actual source Hydrologist career, normal frames and keyboard walking with verification-only read-only route planning and controlled facing/daylight/answers. No avatar teleport or time advance. All accepted source history retained; no native-fixture measurements used.';
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
    window.__qaHydro = () => ({
      field: ctx.saveActiveGameplay?.(),
      paused: ctx.paused,
      loading: ctx.worldLoading,
      root: !!ctx.scene?.getObjectByName('Field course · hydrology'),
      proxies: (ctx.dynamicBuildingColliders || []).filter((r) =>
        r.sourceBuildingId?.startsWith('research-hydrology:')
      ).length,
    });
  });
  for (const variant of Object.keys(HYDROLOGY_STUDIES)) {
    if (recovery.profile.researchCareers.hydrology?.completed?.[variant]) continue;
    await begin(variant);
    await qa.record(variant + ' · public Activities source admission');
    let count = 0;
    while ((await qa.careerState()).active.phase !== 'complete') {
      assert.ok(++count <= 12, 'Finite nine-command water study');
      const a = (await qa.careerState()).active,
        p = a.phase;
      await approach();
      if (['trace', 'measure', 'revisit'].includes(p)) {
        const id = (await qa.snapshot()).fieldwork.target.id,
          index = a.readingIndex;
        await click('Release floats and observe');
        await faceFloat();
        if (p === 'trace') {
          await page.waitForTimeout(300);
          (report.traceViews ||= []).push({ variant, view: await traceSight() });
          await fs.writeFile(
            output + '/trace-sight-' + variant + '.json',
            JSON.stringify(report.traceViews.at(-1), null, 2)
          );
        }
        await page.waitForFunction(
          () => {
            const w = window.__qaHydro().field?.tools?.window;
            return w?.ready || w?.interrupted;
          },
          {},
          { timeout: 60000 }
        );
        const r = await page.evaluate(() => window.__qaHydro().field.tools.window);
        assert.equal(r.ready, true, r.reason);
        await page.screenshot({ path: `${output}/${variant}-${p}-${id}-ready.png` });
        await page.getByRole('button', { name: 'Open measured reading', exact: true }).click();
        if (p === 'trace') {
          await page
            .getByRole('combobox', { name: 'Observed float direction', exact: true })
            .selectOption('upstream-to-downstream');
          await page
            .getByRole('combobox', { name: 'Sampling positions', exact: true })
            .selectOption('dry-bank-a-and-b');
          await qa.submit('Save reach and bank plan');
        } else {
          await page
            .getByRole('combobox', { name: 'Volume flow unit', exact: true })
            .selectOption('m3/s');
          await page
            .getByRole('combobox', { name: 'What does the optical reading measure?', exact: true })
            .selectOption('virtual-obstruction-not-calibrated-ntu');
          await qa.submit('Save matched station reading');
        }
        await qa.record(variant + ' · actual ' + p + ' ' + id + ' accepted');
        if (variant === 'campaign' && p === 'measure' && index === 0) {
          const saved = (await qa.careerState()).active.readings.baseline.a;
          await closeStation();
          await page.locator('[data-research-pause]').click();
          await page.waitForFunction(() => !window.__qaHydro().root);
          assert.equal(await page.evaluate(() => window.__qaHydro().proxies), 0);
          await begin(variant);
          assert.deepEqual((await qa.careerState()).active.readings.baseline.a, saved);
          await qa.record(
            'Public pause/Continue retains exact first station; root and all proxies released'
          );
        }
      } else if (p === 'context') {
        await page
          .getByRole('combobox', { name: 'What does the catchment model establish?', exact: true })
          .selectOption('authored-margins-not-a-source-test');
        await page
          .getByRole('combobox', { name: 'How do the archived gauge records apply?', exact: true })
          .selectOption('different-river-and-dates');
        await qa.submit('Save catchment and dated context');
        await qa.record(variant + ' · actual dated context accepted');
      } else if (p === 'declare') {
        await page
          .getByRole('combobox', { name: 'Declared return condition', exact: true })
          .selectOption(HYDROLOGY_STUDIES[variant].condition);
        await qa.submit('Declare virtual return');
        await qa.record(variant + ' · changed training condition declared before revisit');
      } else if (p === 'report') {
        await page
          .getByRole('combobox', { name: 'Paired flow evidence', exact: true })
          .selectOption(hydrologyFlowConclusion(a));
        await page
          .getByRole('combobox', {
            name: 'What does this establish about the source?',
            exact: true,
          })
          .selectOption('change-observed-source-unestablished');
        await page
          .getByRole('combobox', { name: 'Next investigation', exact: true })
          .selectOption('repeat-matched-stations-and-source-measurements');
        await qa.submit('Save watershed plate');
        await qa.record(variant + ' · actual watershed report accepted');
      } else throw Error('Unexpected water-study phase ' + p);
    }
    await page.screenshot({ path: `${output}/${variant}-complete.png` });
    if (variant === 'campaign' && !recovery.profile.researchCareers.hydrology?.completed?.campaign)
      await contact();
    if (process.env.WE3D_HYDRO_BASE_ONLY === '1') break;
    if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
  }
  const complete = (await qa.careerState())?.completed || {};
  if (Object.keys(complete).length === 3) {
    if (!(await qa.snapshot()).started) await begin((await qa.careerState()).active.variantId);
    if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
    await page.locator('[data-research-pause]').click();
    await page.waitForFunction(() => !window.__qaHydro().root);
    await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
    await page.locator('[data-discovery-tab=journal]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#discoveryJournalList .hydrology-report').length === 3
    );
    for (let i = 0; i < 3; i++) {
      const plate = page.locator('#discoveryJournalList .hydrology-report').nth(i);
      await plate.locator(':scope > summary').click();
      assert.equal(await plate.locator('svg').count(), 2);
      await plate.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/journal-plate-${i}.png` });
    }
    await page.locator('#discoveryProfileBtn').click();
    const badge = page.locator('[data-explorer-badge=water-watch]');
    await badge.waitFor({ state: 'attached' });
    const group = page.locator('[data-profile-group=badges]');
    if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
    await badge.scrollIntoViewIfNeeded();
    assert.ok((await badge.innerText()).includes('Water Watch'));
    await page.screenshot({ path: output + '/water-watch-badge.png' });
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
          (e) => e.metadata?.careerId === 'hydrology' && e.metadata.action?.reading
        );
      event.metadata.action.reading.section.surface.y += 1;
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
        reports: after.events.filter((e) => e.metadata?.hydrologyReport).length,
      };
    });
    assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 3 });
    await qa.record(
      'Three actual reports/Profile badge, whole retained backup roundtrip and altered-geometry rollback accepted'
    );
    const original = (await qa.careerState()).records.campaign;
    await page.locator('#discoveryCloseBtn').click();
    await begin('campaign');
    assert.equal((await qa.careerState()).active.phase, 'complete');
    assert.deepEqual((await qa.careerState()).active.readings, original.readings);
    assert.deepEqual((await qa.careerState()).active.site, original.site);
    const count = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return (await ctx.discoveryProfileStore.exportData()).events.filter(
        (e) => e.metadata?.hydrologyReport
      ).length;
    });
    assert.equal(count, 3);
    await page.screenshot({ path: output + '/original-marked-stream-revisited.png' });
    await qa.record(
      'Completed Activities reopens exact original stations/readings without another capstone'
    );
  }
  await qa.succeed();
} catch (e) {
  try {
    report.failedTraceSight = await traceSight();
  } catch {}
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
