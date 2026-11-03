import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = 'output/verification/engineering-career-20261103/entrance-1793735353782',
  backup = JSON.parse(await fs.readFile(source + '/qa-fieldwork-backup.json')),
  possessions = JSON.parse(await fs.readFile(source + '/possessions.json')),
  original = possessions.housing.homes.find(
    (h) => h.id === possessions.housing.starterHomeId
  ).workspace,
  output = 'output/verification/engineering-career-20261103/review-' + Date.now(),
  sizes = [
    [1280, 800],
    [390, 844],
    [844, 390],
  ],
  qa = await createFieldworkQaSession({
    output,
    careerId: 'engineering',
    maximumDurationMs: 8 * 60 * 1000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Current canonical source: completed Activities revisit, preserved design/revision, exterior navigation endpoint, actual shared Journal/Profile/IndexedDB import/rollback and three-size reports. No accepted design job or furniture/collision matrix replay. Historical active controls at the end are a separate DOM projection of the retained actual source checkpoint.';
  report.source = source;
  await page.addInitScript(
    (possessions) =>
      localStorage.setItem('world-explorer:character-backpack:v3', JSON.stringify(possessions)),
    possessions
  );
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:field-engineer"]').click();
  await page.locator('[data-experience-variant]').selectOption('campaign');
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('campaign');
  const revisit = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      s = ctx.worldDiscoveryRuntime.personalHome.snapshot();
    window.__engineeringHome = () => ctx.worldDiscoveryRuntime.personalHome.snapshot();
    return {
      workspace: s.workspace,
      homeId: s.homeId,
      events: (await ctx.discoveryProfileStore.exportData()).events.filter(
        (e) => e.metadata?.workspaceDesignReport
      ).length,
    };
  });
  assert.deepEqual(revisit.workspace, original);
  assert.equal(revisit.events, 3);
  await qa.record(
    'Completed Activities reopens the exact saved design without a new project, revision or report'
  );
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.openWorldDiscoverySection('today');
    });
    await page.locator('#discoveryPersonalHome svg').waitFor();
    assert.equal(
      await page
        .locator('#discoveryPersonalHome')
        .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
      false
    );
    await page.locator('#discoveryPersonalHome svg').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/completed-career-' + width + '.png' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  report.navigation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { getPersonalHousing, routeToPersonalHome } = await import('/app/js/game/property-ui.js?v=9'),
      { getNavigationTargetForDestination } = await import('/app/js/game/navigation-ui.js?v=2'),
      { createBuildingCollisionQuery } = await import('/app/js/physics/building-collision.js?v=5');
    const h = getPersonalHousing()
        .snapshot()
        .homes.find((h) => h.id === __engineeringHome().homeId),
      target = getNavigationTargetForDestination(h),
      ground = ctx.SurfaceQuery.walkAt(target.x, target.z),
      collision = createBuildingCollisionQuery(ctx)(target.x, target.z, 0.4, {
        actorBaseY: ground.position.y,
        actorHeight: 1.8,
      });
    const routed = routeToPersonalHome(h),
      end = ctx.navigationRoutePoints.at(-1);
    return {
      routed,
      target: { x: target.x, z: target.z },
      end: { x: end.x, z: end.z },
      solid: collision.collision,
      kind: ground.kind,
    };
  });
  assert.equal(report.navigation.routed, true);
  assert.equal(report.navigation.solid, false);
  assert.deepEqual(report.navigation.end, report.navigation.target);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(false);
  });
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('[data-discovery-tab=journal]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .workspace-design-report').length === 3
  );
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const plate = page.locator('#discoveryJournalList .workspace-design-report').nth(i);
    await plate.locator('summary').click();
    const text = await plate.innerText();
    assert.doesNotMatch(text, /undefined|NaN|Infinity/);
    assert.match(text, /record reviewed/);
    report.plates.push(text);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await plate.locator('svg').scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false
      );
      assert.equal(await plate.evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
      await page.screenshot({ path: output + '/report-' + i + '-' + width + '.png' });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#discoveryProfileBtn').click();
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((e) => e.open))) await group.locator('summary').click();
  await page.locator('[data-explorer-badge="useful-place"]').scrollIntoViewIfNeeded();
  assert.match(await page.locator('[data-explorer-badge="useful-place"]').innerText(), /Maker/);
  await page.screenshot({ path: output + '/maker-badge.png' });
  report.storage = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { canonicalFieldRecord: c } = await import('/app/js/campaign/field-study-contract.js'),
      s = ctx.discoveryProfileStore,
      first = await s.exportData(),
      normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } });
    await s.importData(first);
    const before = await s.exportData(),
      same = c(normal(first)) === c(normal(before)),
      bad = structuredClone(before);
    bad.events.find(
      (e) => e.metadata?.workspaceDesignReport
    ).metadata.workspaceDesignReport.use.position.x += 40;
    let rejected = false;
    try {
      await s.importData(bad);
    } catch {
      rejected = true;
    }
    const after = await s.exportData();
    return {
      same,
      rejected,
      rollback: c(normal(before)) === c(normal(after)),
      reports: after.events.filter((e) => e.metadata?.workspaceDesignReport).length,
    };
  });
  assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 3 });
  await qa.record(
    'Canonical shared Journal/Profile and whole IndexedDB reimport/corrupt-design rollback'
  );
  await fs.writeFile(
    output + '/possessions.json',
    (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
      '\n',
    { mode: 0o600 }
  );
  // Project only a genuine historical active-room checkpoint; never reset the
  // completed home or claim another physical method from this component view.
  const prefix = JSON.parse(
      await fs.readFile(source + '/failed-before-desk-radius-correction.json')
    ).last.fieldwork,
    record = backup.events.find((e) => e.eventId === prefix.workspace.recordId),
    room = prefix.workspace.projects.active.inspection.room;
  await page.route('**/engineering-active-layout', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/styles/discovery.css"><style>body{background:#152d32;color:#e2efea;font:14px system-ui}#discoveryPanel{position:fixed;display:block;top:12px;right:12px;bottom:12px;max-height:calc(100dvh - 24px);width:min(520px,calc(100vw - 24px));box-sizing:border-box;overflow:auto;padding:16px}</style><aside id="discoveryPanel" class="discoveryPanel show"><section id="discoveryPersonalHome" class="discoveryOpeningChapter"></section></aside>',
    })
  );
  await page.goto('http://127.0.0.1:4192/engineering-active-layout');
  await page.evaluate(
    async ({ prefix, record, room }) => {
      const { engineeringMarkup } = await import('/app/js/campaign/engineering-workspace.js');
      document.querySelector('#discoveryPersonalHome').innerHTML =
        '<span class="discoveryChapterEyebrow">FIELD ENGINEER</span><strong>Your working designs</strong>' +
        engineeringMarkup({
          workspace: prefix.workspace,
          room,
          home: { id: prefix.homeId },
          variantId: prefix.variantId,
          record,
          reviewing: true,
          ready: true,
          button: (action, label, disabled = false) =>
            `<button type="button" data-home-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`,
        });
    },
    { prefix, record, room }
  );
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    assert.equal(
      await page
        .locator('#discoveryPersonalHome')
        .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
      false
    );
    await page.locator('[data-home-action="left"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/historical-active-controls-' + width + '.png' });
  }
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
