import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import {
  METEOROLOGY_STUDIES,
  meteorologyReading,
  meteorologyCloudCue,
  meteorologyVerification,
} from '../../app/js/campaign/meteorology-career.js';
const source = path.resolve(
  process.env.WE3D_METEO_RECOVERY ||
    'output/verification/hydrology-career-20261103/world-1793689368666/qa-fieldwork-backup.json'
);
assert.match(
  source,
  /\/output\/verification\/(?:hydrology-career-20261103\/world-1793689368666|meteorology-career-20261103\/world-\d+)\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const recovery = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/meteorology-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'meteorology',
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
  await page.locator('[data-experience-id="career:meteorologist"]').click();
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
async function faceRig(id) {
  await page.waitForTimeout(250);
  await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      w = ctx.Walk.state.walker,
      object = ctx.scene.getObjectByName('Working anemometer ' + id),
      p = object.getWorldPosition(new THREE.Vector3()),
      u = ctx.METERS_PER_WORLD_UNIT || 1.11,
      c = ctx.camera.getWorldPosition(new THREE.Vector3());
    p.x += 0.4 / u;
    p.y -= 0.6 / u;
    w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
    w.lookYawOffset = 0;
    w.pitch = -Math.atan2(c.y - p.y, Math.hypot(p.x - w.x, p.z - w.z));
    ctx.renderer.domElement.focus({ preventScroll: true });
  }, id);
}
async function contact() {
  await closeStation();
  const a = (await qa.careerState()).active,
    s = await qa.snapshot(),
    p = await page.evaluate(async (site) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1');
      return earthCoordinateFrame(ctx.LOC, ctx.SCALE).toWorld(site.points.b.lat, site.points.b.lon);
    }, a.site),
    wall = { x: p.x - 1.2 / s.unit, z: p.z };
  await routeTo({ x: wall.x - 2 / s.unit, z: wall.z + 0.4 / s.unit });
  const before = await qa.snapshot();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.Walk.state.walker.yaw = Math.PI;
    ctx.Walk.state.walker.lookYawOffset = 0;
    ctx.Walk.state.walker.pitch = -0.15;
    ctx.renderer.domElement.focus();
  });
  try {
    await page.keyboard.down('w');
    await page.waitForTimeout(450);
  } finally {
    await page.keyboard.up('w');
  }
  const calibration = await qa.snapshot(),
    moved =
      Math.hypot(calibration.walker.x - before.walker.x, calibration.walker.z - before.walker.z) *
      s.unit;
  assert.ok(moved > 0.15);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.Walk.state.walker.yaw = Math.PI / 2;
    ctx.Walk.state.walker.lookYawOffset = 0;
    ctx.Walk.state.walker.pitch = -0.15;
    ctx.renderer.domElement.focus();
  });
  try {
    await page.keyboard.down('w');
    await page.waitForTimeout(2200);
  } finally {
    await page.keyboard.up('w');
  }
  const after = await qa.snapshot(),
    distance = (wall.x - after.walker.x) * s.unit;
  assert.equal(after.paused, false);
  assert.equal(after.walker.onGround, true);
  assert.ok(distance > 0.35 && distance < 0.9, JSON.stringify({ distance, walker: after.walker }));
  report.contact = {
    calibrationMeters: moved,
    wallDistance: distance,
    unpaused: true,
    onGround: true,
  };
  await page.screenshot({ path: output + '/actual-supported-screen-contact.png' });
  await qa.record('Actual unpaused calibrated walking stops at the supported solid shelter screen');
}
try {
  report.scope =
    'Actual source Meteorologist career on normal frames with keyboard walking; verification-only read-only route planning and controlled facing/daylight/answers. No position teleport or time advance. Genuine Hydro/source prefixes only, never native fixture data.';
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
    window.__qaWeather = () => ({
      field: ctx.saveActiveGameplay?.(),
      root: !!ctx.scene?.getObjectByName('Field course · meteorology'),
      proxies: (ctx.dynamicBuildingColliders || []).filter((p) =>
        p.sourceBuildingId?.startsWith('research-meteorology:')
      ).length,
    });
  });
  for (const variant of Object.keys(METEOROLOGY_STUDIES)) {
    if (recovery.profile.researchCareers.meteorology?.completed?.[variant]) continue;
    await begin(variant);
    await qa.record(variant + ' · public source admission');
    let count = 0;
    while ((await qa.careerState()).active.phase !== 'complete') {
      assert.ok(++count <= 10, 'Finite seven-procedure weather record after admission');
      const a = (await qa.careerState()).active,
        p = a.phase;
      await approach();
      if (p === 'source') {
        const source = await page.evaluate(() => window.__qaWeather().field.tools.source);
        assert.ok(source && source.owner === 'weather-state-service');
        await page
          .getByRole('combobox', { name: 'What is the existing weather source?', exact: true })
          .selectOption(source.classification);
        await page
          .getByRole('combobox', { name: 'Age since the provider issued the data', exact: true })
          .selectOption(source.ageBand);
        await page
          .getByRole('combobox', { name: 'Comparison method', exact: true })
          .selectOption('explicit-simulated-replay');
        await qa.submit('Save source plan');
        await qa.record(variant + ' · actual existing source/type/age recorded');
      } else if (['deploy', 'compare', 'verify'].includes(p)) {
        const id = (await qa.snapshot()).fieldwork.target.id;
        await click('Deploy sensor and observe');
        await faceRig(id);
        await page.waitForFunction(
          () => {
            const w = window.__qaWeather().field?.tools?.window;
            return w?.ready || w?.interrupted;
          },
          {},
          { timeout: 45000 }
        );
        const r = await page.evaluate(() => window.__qaWeather().field.tools.window);
        assert.equal(r.ready, true, r.reason);
        assert.equal((await qa.snapshot()).paused, false);
        await page.screenshot({ path: output + '/' + variant + '-' + p + '-' + id + '-ready.png' });
        await page.locator('[data-weather-open]').click();
        await page
          .getByRole('combobox', { name: 'What does the vane bearing mean?', exact: true })
          .selectOption('from-true-north');
        await page
          .getByRole('combobox', { name: 'Cup speed unit', exact: true })
          .selectOption('m/s');
        await page
          .getByRole('combobox', { name: 'Miniature replay sky cue', exact: true })
          .selectOption(meteorologyCloudCue(meteorologyReading(r)));
        await qa.submit('Save matched reading');
        await qa.record(variant + ' · actual ' + p + ' ' + id + ' reading accepted');
        if (variant === 'campaign' && p === 'deploy') {
          const saved = (await qa.careerState()).active.readings.baseline.a;
          await closeStation();
          await page.locator('[data-research-pause]').click();
          await page.waitForFunction(() => !window.__qaWeather().root);
          assert.equal(await page.evaluate(() => window.__qaWeather().proxies), 0);
          await begin(variant);
          assert.deepEqual((await qa.careerState()).active.readings.baseline.a, saved);
          await qa.record(
            'Public pause/Continue retains exact first sensor reading and releases all course/proxy ownership'
          );
        }
      } else if (p === 'forecast') {
        for (const [name, value] of Object.entries({
          speedLow: '3',
          speedHigh: '5',
          directionFrom: variant === 'turning-north' ? '0' : '270',
          directionHalfwidth: '45',
        }))
          await page.locator('[name="' + name + '"]').fill(value);
        await page
          .getByRole('combobox', { name: 'Predicted miniature sky change', exact: true })
          .selectOption(variant === 'turning-north' ? 'less' : 'similar');
        await qa.submit('Save forecast & start replay');
        await qa.record(
          variant + ' · immutable bounded forecast saved before next replay readings'
        );
      } else if (p === 'report') {
        const v = meteorologyVerification(a);
        await page
          .getByRole('combobox', { name: 'How did the recorded forecast verify?', exact: true })
          .selectOption(
            v.speedInRange && v.directionInRange && v.cloudTrendMatched
              ? 'within-all-bounds'
              : 'one-or-more-missed'
          );
        await page
          .getByRole('combobox', { name: 'What does this verification establish?', exact: true })
          .selectOption('replay-not-public-forecast-validation');
        await page
          .getByRole('combobox', { name: 'Next investigation', exact: true })
          .selectOption('repeat-matched-time-and-independent-observations');
        await qa.submit('Save forecast card');
        await qa.record(variant + ' · actual forecast verification card accepted');
      } else throw Error('Unexpected weather phase ' + p);
    }
    await page.screenshot({ path: output + '/' + variant + '-complete.png' });
    if (
      variant === 'campaign' &&
      !recovery.profile.researchCareers.meteorology?.completed?.campaign
    )
      await contact();
    await closeStation();
  }
  if (Object.keys((await qa.careerState()).completed).length === 3) {
    if (!(await qa.snapshot()).started) await begin((await qa.careerState()).active.variantId);
    await closeStation();
    await page.locator('[data-research-pause]').click();
    await page.waitForFunction(() => !window.__qaWeather().root);
    await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
    await page.locator('[data-discovery-tab=journal]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#discoveryJournalList .meteorology-report').length === 3
    );
    for (let i = 0; i < 3; i++) {
      const plate = page.locator('#discoveryJournalList .meteorology-report').nth(i);
      await plate.locator(':scope > summary').click();
      assert.equal(await plate.locator('svg').count(), 1);
      await plate.scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/journal-plate-' + i + '.png' });
    }
    await page.locator('#discoveryProfileBtn').click();
    const badge = page.locator('[data-explorer-badge=weather-observer]'),
      group = page.locator('[data-profile-group=badges]');
    await badge.waitFor({ state: 'attached' });
    if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
    await badge.scrollIntoViewIfNeeded();
    assert.ok((await badge.innerText()).includes('Weather Observer'));
    await page.screenshot({ path: output + '/weather-observer-badge.png' });
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
          (e) => e.metadata?.careerId === 'meteorology' && e.metadata.action?.reading
        );
      event.metadata.action.reading.sensorPosition.y += 1;
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
        reports: after.events.filter((e) => e.metadata?.meteorologyReport).length,
      };
    });
    assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 3 });
    await qa.record(
      'Actual three cards/Profile badge, retained whole backup/reimport and altered-sensor rejection/rollback'
    );
    const original = (await qa.careerState()).records.campaign;
    await page.locator('#discoveryCloseBtn').click();
    await begin('campaign');
    assert.equal((await qa.careerState()).active.phase, 'complete');
    assert.deepEqual((await qa.careerState()).active.readings, original.readings);
    assert.deepEqual((await qa.careerState()).active.site, original.site);
    const s = await qa.snapshot(),
      target = s.fieldwork.target;
    await routeTo({ x: target.x, z: target.z + 2.75 / s.unit });
    await page.locator('[data-research-station]').click();
    await page.locator('.meteorology-report[open]').waitFor();
    await page.screenshot({ path: output + '/original-station-report-reopened.png' });
    const count = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return (await ctx.discoveryProfileStore.exportData()).events.filter(
        (e) => e.metadata?.meteorologyReport
      ).length;
    });
    assert.equal(count, 3);
    await qa.record(
      'Completed Activities preserves original station/readings and walks to its report without another capstone'
    );
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
