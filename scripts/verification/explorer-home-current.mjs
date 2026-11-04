import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = process.env.WE3D_EXPLORER_RECOVERY,
  possessions = process.env.WE3D_EXPLORER_POSSESSIONS;
if (!source || !possessions)
  throw Error('Choose the genuine Explorer and possessions checkpoints.');
const backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/explorer-career-20261103/home-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 10 * 60 * 1000,
    walkLegMaximumDurationMs: 30000,
  }),
  { page, report } = qa;
assert.equal(backup.profile.openingChapter.phase, 'complete');
async function panel() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('today');
  });
}
async function action(id) {
  await page.locator(`[data-home-action="${id}"]`).click();
  await page.waitForFunction(() => !window.__explorerHome().busy);
}
async function record(name) {
  await qa.record(name);
  await fs.writeFile(
    output + '/possessions.json',
    (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
      '\n',
    { mode: 0o600 }
  );
}
try {
  report.scope =
    'Actual Explorer home next-action through existing housing/room/visit owners. Genuine earlier workspace display and outing remain; only missing return is performed. Normal walking and public doorway action, no verification pose/time writes; no accepted Maker project or home-storage matrix replay.';
  report.source = source;
  report.possessions = possessions;
  await page.addInitScript(
    (raw) => localStorage.setItem('world-explorer:character-backpack:v3', raw),
    await fs.readFile(possessions, 'utf8')
  );
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:explorer"]').click();
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('campaign');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.worldDiscoveryRuntime.ui.refreshData();
    window.__explorerHome = () => ctx.worldDiscoveryRuntime.personalHome.snapshot();
  });
  await page.locator('[data-explorer-target=home]:visible').click();
  await page.locator('[data-home-action=explorer-back]').waitFor();
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('[data-home-action=primary]').scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .locator('#discoveryPersonalHome')
        .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
      false
    );
    await page.screenshot({ path: output + '/home-actions-' + width + '.png' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  if (!(await page.locator('[data-home-action=primary]').isDisabled())) await action('primary');
  const target = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { getPersonalHousing } = await import('/app/js/game/property-ui.js?v=9'),
      { resolveBuildingEntrySupport } = await import('/app/js/building-entry.js?v=9'),
      { exteriorApproach } = await import('/app/js/interiors/exterior-approach.js'),
      v = getPersonalHousing().snapshot(),
      home = v.homes.find((h) => h.id === v.starterHomeId),
      b = ctx.buildings.find((b) => String(b.sourceBuildingId || b.id) === home.sourceBuildingId);
    return exteriorApproach(
      resolveBuildingEntrySupport(b),
      ctx.Walk.state.walker,
      ctx.METERS_PER_WORLD_UNIT
    );
  });
  assert.ok(target);
  await action('route');
  const route = await page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return planFieldworkWalk(ctx, target, {
      spacingMeters: 1,
      maximumCells: 30000,
      paddingMeters: 12,
      stepHeightMeters: 0.25,
      includeUrbanActors: true,
    });
  }, target);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(false);
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
  for (const p of route) {
    const w = (await qa.snapshot()).walker,
      n = Math.max(1, Math.ceil(Math.hypot(p.x - w.x, p.z - w.z) / 20));
    for (let i = 1; i <= n; i++)
      await qa.walkTo(
        { x: w.x + ((p.x - w.x) * i) / n, z: w.z + ((p.z - w.z) * i) / n },
        i === n ? 0.45 : 0.6
      );
  }
  await panel();
  await action('enter');
  await page.waitForFunction(() => window.__explorerHome().journey.returned > 0);
  let profile,
    deadline = Date.now() + 15000;
  do {
    profile = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.discoveryProfileStore.getProfile();
    });
    if (profile.homeAchievements?.home) break;
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  assert.ok(profile.homeAchievements?.home);
  assert.deepEqual(profile.openingChapter, backup.profile.openingChapter);
  assert.deepEqual(profile.threeViews, backup.profile.threeViews);
  assert.deepEqual(profile.harborRun, backup.profile.harborRun);
  await record(
    'Original personal room physically reentered after its genuine earlier outing; A Place to Return saved once'
  );
  await panel();
  await action('explorer-back');
  await page.waitForFunction(
    () => document.querySelector('[data-explorer-target=coast]')?.disabled === false
  );
  assert.equal((await qa.snapshot()).fieldwork.nextId, 'coastal');
  await page.screenshot({ path: output + '/next-coast.png' });
  await record('Home Back returns to the retained campaign and its real next coastal chapter');
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
