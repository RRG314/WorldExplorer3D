import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source =
    process.env.WE3D_EXPLORER_RECOVERY ||
    'output/verification/documentary-career-20261103/review-1793746059326/qa-fieldwork-backup.json',
  backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/explorer-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 12 * 60 * 1000,
    walkLegMaximumDurationMs: 35000,
  }),
  { page, report } = qa;
async function profile() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.getProfile();
  });
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
    'New connected Explorer entry and first missing chapter on a genuine existing profile. Normal keyboard walking/ordinary field timer, actual result and exact Journal review; no pose/time writes. Existing chapter matrices are reused. Missing campaign chapters remain incomplete.';
  report.source = source;
  await page.addInitScript(
    (raw) => localStorage.setItem('world-explorer:character-backpack:v3', raw),
    await fs.readFile(
      'output/verification/documentary-career-20261103/world-1793745622639/possessions.json',
      'utf8'
    )
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
  if (!process.env.WE3D_EXPLORER_RECOVERY)
    await record(
      'Explorer Activities opens twelve retained chapters without replacing prior results'
    );
  else report.reusedEntry = 'world-1793746822509/failed.json';
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.worldDiscoveryRuntime.ui.refreshData();
  });
  if (backup.profile.openingChapter.phase === 'available')
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page
        .locator(
          '[data-chapter-action=start]:visible, [data-chapter-action=leads]:visible, [data-chapter-action=review]:visible, [data-explorer-target]:visible'
        )
        .first()
        .scrollIntoViewIfNeeded();
      assert.equal(
        await page
          .locator('#discoveryOpeningChapter')
          .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
        false
      );
      await page.screenshot({ path: output + '/entry-' + width + '.png' });
    }
  await page.setViewportSize({ width: 1280, height: 800 });
  let p = await profile();
  if (p.openingChapter.phase === 'available') {
    await page.locator('[data-chapter-action=start]').click();
    await page.waitForFunction(
      () => !document.querySelector('#discoveryPanel').classList.contains('show')
    );
    await record(
      'Optional opening accepted through the original owner with its exact loaded origin'
    );
    p = await profile();
  }
  if (p.openingChapter.phase === 'active') {
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (ctx.getCurrentTravelMode() !== 'walk') ctx.setTravelMode('walk');
    });
    let current = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.worldDiscoveryRuntime.fieldSession.snapshot();
    });
    if (!current.targetId) {
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        ctx.openWorldDiscoverySection('today');
      });
      await page.locator('[data-chapter-action=leads]').click();
      current = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.worldDiscoveryRuntime.fieldSession.snapshot();
      });
    }
    const route = await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs'),
        slot = ctx.worldDiscoveryRuntime.chapterLeads().find((s) => s.id === id),
        w = ctx.Walk.state.walker;
      if (!slot) throw Error('Selected field lead is unavailable.');
      const target = slot.position,
        d = Math.hypot(target.x - w.x, target.z - w.z);
      if (d < 20) return [];
      const a = Math.atan2(w.x - target.x, w.z - target.z);
      for (const offset of [0, 0.4, -0.4, 0.8, -0.8, 1.4, -1.4, Math.PI]) {
        const destination = {
          x: target.x + Math.sin(a + offset) * 18,
          z: target.z + Math.cos(a + offset) * 18,
        };
        try {
          return planFieldworkWalk(ctx, destination, {
            spacingMeters: 1,
            maximumCells: 16000,
            paddingMeters: 10,
            stepHeightMeters: 0.25,
            includeUrbanActors: true,
          });
        } catch {}
      }
      throw Error('No supported walking approach to the selected field stop was admitted.');
    }, current.targetId);
    report.walkingWaypoints = route.length;
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.toggleWorldDiscoveryJournal(false);
      ctx.renderer.domElement.focus({ preventScroll: true });
    });
    for (const point of route) await qa.walkTo(point, 0.3);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      window.__explorerField = () => ctx.worldDiscoveryRuntime.fieldSession.snapshot();
    });
    await page.waitForFunction(() => window.__explorerField().phase === 'revealed', null, {
      timeout: 15000,
    });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.openWorldDiscoverySection('today');
    });
    await page.locator('#discoveryPrimaryBtn').click();
    await page.waitForFunction(() => window.__explorerField().phase === 'recorded');
    await record('Actual ordinary-frame field procedure saves one new guided observation');
    p = await profile();
  }
  if (p.openingChapter.phase === 'review') {
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.openWorldDiscoverySection('today');
      await ctx.worldDiscoveryRuntime.ui.refreshData();
    });
    await page.locator('[data-chapter-action=review]').click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      window.__explorerOpening = () => ctx.worldDiscoveryRuntime.ui.explorerSnapshot();
    });
    await page.waitForFunction(() => !window.__explorerOpening().openingBusy);
    const finish = page.locator('[data-chapter-action=finish]');
    await finish.waitFor();
    assert.equal(
      await finish.evaluate((e) => e.closest('[data-journal-record]').dataset.journalRecord),
      p.openingChapter.eventId
    );
    await page.screenshot({ path: output + '/exact-review.png' });
    await finish.click();
    await page.waitForFunction(
      () => window.__explorerOpening().openingChapter.phase === 'complete'
    );
    await record(
      'Exact original field record reviewed; First Bearings receipt and badge saved once'
    );
  }
  const after = await profile();
  assert.equal(after.openingChapter.phase, 'complete');
  assert.deepEqual(after.threeViews, backup.profile.threeViews);
  assert.deepEqual(after.harborRun, backup.profile.harborRun);
  assert.deepEqual(after.researchCareers, backup.profile.researchCareers);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('today');
    await ctx.worldDiscoveryRuntime.ui.refreshData();
  });
  assert.equal((await qa.snapshot()).fieldwork.nextId, 'home');
  await page.screenshot({ path: output + '/next-home.png' });
  await record(
    'Journey advances to the real missing home chapter while preserving all accepted branches'
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
