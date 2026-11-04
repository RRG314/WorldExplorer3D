import { completeEngineeringProjects } from './engineering-project-walkthrough.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source =
    process.env.WE3D_ENGINEERING_RECOVERY ||
    'output/verification/accelerator-career-20261103/review-1793732658263/qa-fieldwork-backup.json',
  recovery = JSON.parse(await fs.readFile(source));
const output = 'output/verification/engineering-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'engineering',
    maximumDurationMs: 12 * 60 * 1000,
    walkLegMaximumDurationMs: 30000,
  }),
  { page, report } = qa;
const ctx = async (fn) => page.evaluate(fn);
async function home() {
  return ctx(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.worldDiscoveryRuntime.personalHome.snapshot();
  });
}
async function save(name) {
  await qa.record(name);
  const possessions = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('world-explorer:character-backpack:v3'))
  );
  await fs.writeFile(output + '/possessions.json', JSON.stringify(possessions) + '\n', {
    mode: 0o600,
  });
}
async function action(id) {
  await page.locator(`[data-home-action="${id}"]`).first().click();
  await page.waitForFunction(() => !window.__engineeringHome().busy);
}
async function panel() {
  await ctx(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('today');
  });
}
async function focus() {
  await ctx(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(false);
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function walkLeg(target, tolerance = 2.2) {
  const current = (await qa.snapshot()).walker,
    d = Math.hypot(target.x - current.x, target.z - current.z),
    n = Math.max(1, Math.ceil(d / 32));
  for (let i = 1; i <= n; i++)
    await qa.walkTo(
      {
        x: current.x + ((target.x - current.x) * i) / n,
        z: current.z + ((target.z - current.z) * i) / n,
      },
      i === n ? tolerance : 0.6
    );
}
async function followRoute(target) {
  const planned = await page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return {
      navigation: ctx.navigationRoutePoints.map((p) => ({ x: p.x, z: p.z })),
      walking: planFieldworkWalk(ctx, target, { maximumCells: 30000, stepHeightMeters: 0.25 }),
    };
  }, target);
  report.route = { ...planned, target };
  for (const point of planned.walking) await walkLeg(point, 0.45);
}
async function begin(variant) {
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  else {
    await page.locator('#exploreBtn').click();
    await page.locator('#fActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:field-engineer"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption(variant);
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer(variant);
}
try {
  report.scope =
    'Actual source Engineering entry, mapped personal workspace and three finite design jobs using normal world, housing, room, furniture and frame owners. Controlled facing/answers only; no actor teleport or time advance. Earlier H04 placement/collision matrix remains accepted and is not replayed.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (backup) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(backup);
  }, recovery);
  if (process.env.WE3D_ENGINEERING_POSSESSIONS) {
    const possessions = await fs.readFile(process.env.WE3D_ENGINEERING_POSSESSIONS, 'utf8');
    await page.evaluate(
      (raw) => localStorage.setItem('world-explorer:character-backpack:v3', raw),
      possessions
    );
    await page.reload();
  }
  await begin('campaign');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__engineeringHome = () => ctx.worldDiscoveryRuntime.personalHome.snapshot();
  });
  await panel();
  await save('Activities selected the retained workspace owner');
  if (!(await home()).homeId) {
    await action('find');
    const offers = await home();
    assert.ok(offers.offers.length, 'Mapped eligible residential workspaces are offered');
    const target = await ctx(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { getPersonalHomeCandidates } = await import('/app/js/game/property-ui.js?v=9'),
        { resolveBuildingEntrySupport } = await import('/app/js/building-entry.js?v=9');
      const id = ctx.worldDiscoveryRuntime.personalHome.snapshot().offers[0].id,
        c = getPersonalHomeCandidates().find((c) => c.id === id),
        b = ctx.buildings.find(
          (b) => String(b.sourceBuildingId || b.sourceFeatureId || b.id) === c.sourceBuildingId
        ),
        s = resolveBuildingEntrySupport(b);
      const { exteriorApproach } = await import('/app/js/interiors/exterior-approach.js');
      return exteriorApproach(s, ctx.Walk.state.walker, ctx.METERS_PER_WORLD_UNIT);
    });
    await action('route:0');
    await focus();
    await followRoute(target);
    await panel();
    await action('claim:0');
    assert.ok((await home()).homeId);
    await save('Actual mapped entrance admitted the personal workspace once');
  }
  if (
    !(await ctx(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return !!ctx.activeInterior;
    }))
  ) {
    const target = await ctx(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { getPersonalHousing } = await import('/app/js/game/property-ui.js?v=9'),
        { resolveBuildingEntrySupport } = await import('/app/js/building-entry.js?v=9');
      const v = getPersonalHousing().snapshot(),
        h = v.homes.find((h) => h.id === v.starterHomeId),
        b = ctx.buildings.find(
          (b) => String(b.sourceBuildingId || b.sourceFeatureId || b.id) === h.sourceBuildingId
        ),
        s = resolveBuildingEntrySupport(b);
      const { exteriorApproach } = await import('/app/js/interiors/exterior-approach.js');
      return exteriorApproach(s, ctx.Walk.state.walker, ctx.METERS_PER_WORLD_UNIT);
    });
    await focus();
    await walkLeg(target, 2.2);
    await panel();
    await action('enter');
  }
  await panel();
  await page.screenshot({ path: output + '/workspace-entry.png' });
  await save('Normal owned ground-floor room and focused Engineer UI');
  await completeEngineeringProjects({
    qa,
    output,
    save,
    home,
    action,
    panel,
    focus,
    beginVariant: async (variant) => {
      await action('engineering-next');
      await page.locator('[data-experience-variant]').selectOption(variant);
      await page.locator('[data-experience-begin]').click();
      await qa.waitForCareer(variant);
    },
  });
  report.final = await home();
  assert.equal(Object.keys(report.final.workspace.projects.reports).length, 3);
  await qa.succeed();
} catch (error) {
  try {
    await fs.writeFile(
      output + '/possessions.json',
      (await page.evaluate(
        () => localStorage.getItem('world-explorer:character-backpack:v3') || 'null'
      )) + '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
