import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = process.env.WE3D_EXPLORER_RECOVERY,
  possessions = process.env.WE3D_EXPLORER_POSSESSIONS;
if (!source || !possessions)
  throw Error('Choose the genuine Explorer and possessions checkpoints.');
const backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/explorer-career-20261103/finish-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 10 * 60 * 1000,
    walkLegMaximumDurationMs: 30000,
  }),
  { page, report } = qa;
async function panel() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('today');
  });
}
async function focus() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(false);
    ctx.renderer.domElement.focus({ preventScroll: true });
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
    'Actual Explorer conclusion at the mapped city home after genuine saved coastal checkpoints. Earlier accepted lunar fieldwork and controlled native homecoming remain unchanged. Normal-key room approach, physical original field-book display/review and original full-campaign receipt. Resumed integration chain, not an uninterrupted or uncoached H01–H12 playthrough. No accepted chapter matrix replay.';
  report.source = source;
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
  await focus();
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
  await page.waitForFunction(() => window.__explorerHome().furnitureReady);
  const use = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { workspaceGeometry } = await import('/app/js/campaign/personal-workspace.js');
    return workspaceGeometry(
      ctx.activeInterior,
      ctx.worldDiscoveryRuntime.personalHome.snapshot().workspace.pose
    ).use;
  });
  await focus();
  if (!(await page.evaluate(() => window.__explorerHome().interactionReady)))
    await qa.walkTo(use, 0.95);
  assert.equal(await page.evaluate(() => window.__explorerHome().interactionReady), true);
  await panel();
  await page.locator('[data-home-lunar-record]').selectOption('event:destination-mission:moon');
  await action('lunar-display');
  await page.waitForFunction(
    () =>
      window.__explorerHome().workspace.recordId === 'event:destination-mission:moon' &&
      window.__explorerHome().furnitureReady
  );
  await page.screenshot({ path: output + '/actual-field-book-at-home.png' });
  await action('lunar-review');
  const complete = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.discoveryProfileStore.exportData();
    }),
    prior = backup.events.find((e) => e.eventId === 'event:campaign:lunar-homecoming:v1');
  assert.deepEqual(
    complete.events.find((e) => e.eventId === prior.eventId),
    prior
  );
  assert.equal(
    complete.events.filter((e) => e.eventId === 'event:campaign:from-the-harbor:v1').length,
    1
  );
  await record(
    'Original lunar field book physically installed and reviewed at the mapped home; one full-campaign receipt, historical homecoming retained'
  );
  await action('explorer-back');
  await page.waitForFunction(
    () => document.querySelector('[data-explorer-target=careers]')?.disabled === false
  );
  assert.equal((await qa.snapshot()).fieldwork.phase, 'complete');
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('[data-explorer-target=careers]').scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .locator('#discoveryOpeningChapter')
        .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
      false
    );
    await page.screenshot({ path: output + '/complete-' + width + '.png' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Review campaign record', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.discoveryPane[data-discovery-pane=journal]')
      .classList.contains('active')
  );
  await page.screenshot({ path: output + '/campaign-journal.png' });
  await page.locator('#discoveryProfileBtn').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.worldDiscoveryRuntime.ui.refreshData();
  });
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((e) => e.open))) await group.locator('summary').click();
  const badge = page.locator('[data-explorer-badge=from-the-harbor]');
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/campaign-badge.png' });
  report.storage = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { canonicalFieldRecord: c } = await import('/app/js/campaign/field-study-contract.js'),
      s = ctx.discoveryProfileStore,
      clean = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } }),
      before = await s.exportData();
    await s.importData(before);
    const imported = await s.exportData(),
      bad = structuredClone(imported);
    bad.profile.openingChapter.eventId = 'missing-original-field-record';
    let rejected = false;
    try {
      await s.importData(bad);
    } catch {
      rejected = true;
    }
    return {
      same: c(clean(before)) === c(clean(imported)),
      rejected,
      rollback: c(clean(imported)) === c(clean(await s.exportData())),
    };
  });
  assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true });
  await record(
    'Full source campaign record, named badge and complete IndexedDB import/corrupt-reference rollback'
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
