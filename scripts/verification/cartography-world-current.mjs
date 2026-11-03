import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(
  process.env.WE3D_CARTOGRAPHY_RECOVERY ||
    'output/verification/meteorology-career-20261103/world-1793692262543/qa-fieldwork-backup.json'
);
assert.match(
  source,
  /\/output\/verification\/(?:meteorology-career-20261103\/world-1793692262543|cartography-career-20261103\/world-\d+)\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const recovery = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/cartography-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'cartography',
    maximumDurationMs: 12 * 60 * 1000,
    walkLegMaximumDurationMs: 45000,
  }),
  { page, report } = qa;
const click = (name) => page.getByRole('button', { name, exact: true }).click();
const reusedLayouts = process.env.WE3D_CARTOGRAPHY_LAYOUTS
  ? JSON.parse(await fs.readFile(process.env.WE3D_CARTOGRAPHY_LAYOUTS))
  : {};
const acceptedLayouts = {};
async function answers(values) {
  for (const [name, value] of Object.entries(values))
    await page.locator(`.research-station[open] select[name="${name}"]`).selectOption(value);
}
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
  await page.locator('[data-experience-id="career:cartographer"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption(variant);
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer(variant);
  if (await page.locator('#quickTimeOfDay').isVisible())
    for (
      let i = 0;
      i < 6 && (await page.locator('#quickTimeOfDay').getAttribute('data-mode')) !== 'day';
      i++
    )
      await page.locator('#quickTimeOfDay').click();
  await focusWorld();
}
async function focusWorld() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function toPoint(geographic) {
  return page.evaluate(async (p) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1');
    return earthCoordinateFrame(ctx.LOC, ctx.SCALE).toWorld(p.lat, p.lon);
  }, geographic);
}
async function routeTo(target) {
  await closeStation();
  await focusWorld();
  const points = await page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    try {
      return planFieldworkWalk(ctx, target);
    } catch (error) {
      const { findTraversalRoute } = await import('/app/js/world/traversal.js?v=4'),
        w = ctx.Walk.state.walker,
        u = ctx.METERS_PER_WORLD_UNIT || 1.11,
        r = findTraversalRoute(w.x, w.z, target.x, target.z, {
          mode: 'walk',
          maxAnchorDistance: 16 / u,
        });
      if (!r || r.distance * u > 250) throw error;
      return r.points.slice(1);
    }
  }, target);
  for (const p of points) await qa.walkTo(p, 0.18);
}
async function openAtTarget() {
  const s = await qa.snapshot();
  if (s.fieldwork.target.id === 'entry') {
    await closeStation();
    await focusWorld();
    const points = await page.evaluate(async (target) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { findTraversalRoute } = await import('/app/js/world/traversal.js?v=4'),
        w = ctx.Walk.state.walker,
        u = ctx.METERS_PER_WORLD_UNIT || 1.11,
        r = findTraversalRoute(w.x, w.z, target.x, target.z, {
          mode: 'walk',
          maxAnchorDistance: 16 / u,
        });
      if (!r || r.distance * u > 250) throw Error('No bounded connected entrance route');
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
    }, s.fieldwork.target);
    report.entranceApproaches = [
      ...(report.entranceApproaches || []),
      {
        variant: s.fieldwork.variantId,
        points,
        scope:
          'Existing traversal owner route; stop two metres before the entrance marker for inspection.',
      },
    ];
    for (const p of points) await qa.walkTo(p, 0.18);
  } else await routeTo(s.fieldwork.target);
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
}
async function layouts(name) {
  if (reusedLayouts[name]) {
    report.reusedLayouts = {
      ...(report.reusedLayouts || {}),
      [name]: process.env.WE3D_CARTOGRAPHY_LAYOUTS,
    };
    return;
  }
  for (const [label, width, height] of [
    ['desktop', 1280, 800],
    ['portrait', 390, 844],
    ['landscape', 844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const button = page.locator('.research-station[open] .research-primary').last();
    await button.scrollIntoViewIfNeeded();
    const data = await page.locator('.research-station[open]').evaluate((el) => ({
      overflow: el.scrollWidth - el.clientWidth,
      focusInside: el.contains(document.activeElement),
      text: el.innerText,
    }));
    assert.ok(data.overflow <= 2, JSON.stringify({ name, label, ...data }));
    assert.doesNotMatch(data.text, /NaN|undefined|Infinity/);
    await page.screenshot({ path: `${output}/${name}-${label}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  acceptedLayouts[name] = {
    sizes: [1280, 390, 844],
    scope: 'Actual source modal geometry and primary access',
  };
  await fs.writeFile(output + '/layouts.json', JSON.stringify(acceptedLayouts, null, 2) + '\n');
}
async function walkLeg(a) {
  const index = a.phase === 'leg-one' ? 0 : 1,
    leg = a.site.plan.legs[index];
  await routeTo(await toPoint(a.site.points[leg.from]));
  await page.waitForFunction(
    () => window.__qaCartography()?.tools?.window?.samples?.length > 0,
    null,
    { timeout: 4000 }
  );
  for (const p of leg.points.slice(1)) await qa.walkTo(await toPoint(p), 0.18);
  await page.waitForFunction(() => window.__qaCartography()?.tools?.window?.ready === true, null, {
    timeout: 4000,
  });
  await page.screenshot({ path: `${output}/${a.variantId}-${a.phase}-actual-control.png` });
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
}
try {
  report.scope =
    'Actual Cartographer source world, normal keyboard movement and frame time; controlled facing/daylight/answers and read-only walking planner. No avatar teleport or time advance. Genuine saved source prefixes only.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, recovery);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaCartography = () => ctx.saveActiveGameplay?.();
    window.__qaCartographyRoot = () => !!ctx.scene?.getObjectByName('Field course · cartography');
  });
  for (const variant of ['campaign', 'reciprocal', 'dogleg']) {
    if (recovery.profile.researchCareers.cartography?.completed?.[variant]) continue;
    await begin(variant);
    await qa.record(variant + ' · admitted connected source route');
    let count = 0;
    while ((await qa.careerState()).active.phase !== 'complete') {
      assert.ok(++count <= 8, 'Finite six-command survey after admission');
      const a = (await qa.careerState()).active;
      if (a.phase === 'controls') {
        await openAtTarget();
        if (variant === 'campaign') await layouts('controls');
        await answers({ north: 'true-north' });
        await qa.submit('Sight and save controls');
      } else if (['leg-one', 'leg-two'].includes(a.phase)) {
        await walkLeg(a);
        await answers({ unit: 'm', bearingReference: 'true-north' });
        if (variant === 'campaign' && a.phase === 'leg-one') {
          await layouts('measured-leg');
          const before = (await qa.snapshot()).fieldwork.tools.window;
          await page.evaluate(async () => {
            const original = IDBDatabase.prototype.transaction;
            window.__qaCartographySaveFailure = 0;
            IDBDatabase.prototype.transaction = function (names, mode, ...options) {
              if (
                mode === 'readwrite' &&
                Array.isArray(names) &&
                names.length === 5 &&
                ['profiles', 'events', 'items', 'claims'].every((n) => names.includes(n))
              ) {
                IDBDatabase.prototype.transaction = original;
                window.__qaCartographySaveFailure++;
                throw Error('Controlled save failure; retry keeps this measured leg.');
              }
              return original.call(this, names, mode, ...options);
            };
          });
          await click('Save measured leg');
          await page.getByRole('status').filter({ hasText: 'Controlled save failure' }).waitFor();
          assert.deepEqual((await qa.snapshot()).fieldwork.tools.window, before);
          assert.equal(await page.evaluate(() => window.__qaCartographySaveFailure), 1);
          await qa.record(
            'Actual failed save retains the frozen measured leg and previous revision'
          );
        }
        await qa.submit('Save measured leg');
        if (variant === 'campaign' && a.phase === 'leg-one') {
          const raw = structuredClone((await qa.careerState()).active.legs[0]);
          await closeStation();
          await page.locator('[data-research-pause]').click();
          await page.waitForFunction(() => !window.__qaCartographyRoot());
          await begin(variant);
          assert.deepEqual((await qa.careerState()).active.legs[0], raw);
          assert.equal((await qa.careerState()).active.phase, 'leg-two');
          await qa.record('Public pause and Continue retain raw A and release the annotation root');
        }
      } else if (a.phase === 'access') {
        await openAtTarget();
        if (variant === 'campaign') await layouts('access');
        await answers({
          accessClaim: 'virtual-only',
          limit: 'no-step-free-or-public-access-proof',
        });
        await qa.submit('Save access inspection');
      } else if (a.phase === 'reconcile') {
        await openAtTarget();
        if (variant === 'campaign') await layouts('comparison');
        await answers({
          heightSource: 'loaded-surface-not-mapped-height',
          geometryLimit: 'same-source-not-independent-survey',
          routeMeaning: 'connected-route-not-chord',
        });
        await qa.submit('Save map comparison');
      } else if (a.phase === 'publish') {
        await openAtTarget();
        if (variant === 'campaign') await layouts('publish');
        await answers({ use: 'personal-virtual-route', followUp: 'recheck-loaded-access' });
        await qa.submit('Publish route sheet');
        await page.screenshot({ path: `${output}/${variant}-route-sheet.png` });
      } else throw Error('Unexpected survey phase ' + a.phase);
      await qa.record(variant + ' · ' + a.phase + ' accepted');
    }
  }
  await closeStation();
  await page.locator('[data-research-pause]').click();
  await page.waitForFunction(() => !window.__qaCartographyRoot());
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('[data-discovery-tab=journal]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .cartography-report').length === 3
  );
  for (let i = 0; i < 3; i++) {
    const r = page.locator('#discoveryJournalList .cartography-report').nth(i);
    await r.locator(':scope > summary').click();
    await r.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/journal-${i}.png` });
  }
  await page.locator('#discoveryProfileBtn').click();
  const badge = page.locator('[data-explorer-badge=route-survey]'),
    group = page.locator('[data-profile-group=badges]');
  await badge.waitFor({ state: 'attached' });
  if (!(await group.evaluate((e) => e.open))) await group.locator('summary').click();
  await badge.scrollIntoViewIfNeeded();
  assert.match(await badge.innerText(), /Route Survey/);
  await page.screenshot({ path: output + '/route-survey-badge.png' });
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
        (e) => e.metadata?.careerId === 'cartography' && e.metadata.action?.reading
      );
    event.metadata.action.reading.samples[1].heightMeters += 20;
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
      reports: after.events.filter((e) => e.metadata?.cartographyReport).length,
    };
  });
  assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 3 });
  await qa.record(
    'Three actual route sheets, named badge, retained backup and altered-sample rollback'
  );
  const original = (await qa.careerState()).records.campaign;
  await page.locator('#discoveryCloseBtn').click();
  await begin('campaign');
  assert.equal((await qa.careerState()).active.phase, 'complete');
  assert.deepEqual((await qa.careerState()).active.report, original.report);
  await openAtTarget();
  await page.locator('.cartography-report[open]').waitFor();
  await layouts('original-report');
  await qa.record(
    'Activities reopens and physically returns to the original completed route sheet without another capstone'
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
