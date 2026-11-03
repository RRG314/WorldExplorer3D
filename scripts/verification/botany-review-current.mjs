import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_BOTANY_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/botany-career-20261102') + path.sep) &&
    path.basename(source) === 'qa-fieldwork-backup.json'
);
const bytes = await fs.readFile(source),
  data = JSON.parse(bytes);
assert.equal(Object.keys(data.profile.researchCareers.botany.completed).length, 3);
const output = `output/verification/botany-career-20261102/review-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'botany', maximumDurationMs: 240000 }),
  { page, report } = qa;
try {
  report.scope =
    'Affected Journal/Profile, source-evidence export/restore and saved-plot lifecycle boundaries only. All completed physical studies are reused; no field procedure replay or new course.';
  report.source = { path: source, sha256: createHash('sha256').update(bytes).digest('hex') };
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/app/?lat=39.3173&lon=-76.64044&name=Druid%20Hill%20Park&diagnostics=1'
  );
  report.storage = await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      ),
      store = createIndexedDbDiscoveryProfileStore();
    await store.importData(data);
    const first = await store.exportData();
    if (first.schemaVersion !== 6 || first.researchMedia.length !== 9)
      throw Error('Expected actual nine-photo v6 checkpoint');
    await store.importData(first);
    const second = await store.exportData();
    for (const photo of data.researchMedia) {
      const restored = await store.getResearchPhoto(photo.id);
      if (restored.photo.dataUrl !== photo.photo.dataUrl)
        throw Error('Actual photo pixels changed');
    }
    const missing = structuredClone(second);
    missing.researchMedia.pop();
    let rejected = false;
    try {
      await store.importData(missing);
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error('Missing historical image admitted');
    const after = await store.exportData();
    if (JSON.stringify(after.events) !== JSON.stringify(second.events))
      throw Error('Rejected import altered history');
    return {
      version: second.schemaVersion,
      photos: second.researchMedia.length,
      completed: Object.keys(second.profile.researchCareers.botany.completed),
      missingRejected: true
    };
  }, data);
  await page.locator('#globeSelectorStartBtn').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaResearchWorldReady = () =>
      ctx.gameStarted && !ctx.worldLoading && !!ctx.worldDiscoveryRuntime;
  });
  await page.waitForFunction(() => window.__qaResearchWorldReady(), {}, { timeout: 180000 });
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('[data-discovery-tab=journal]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .botany-report').length === 3,
    {},
    { timeout: 10000 }
  );
  const plates = page.locator('#discoveryJournalList .botany-report');
  report.photoViews = [];
  for (let i = 0; i < 3; i++) {
    const plate = plates.nth(i);
    await plate.locator('summary').click();
    for (let j = 0; j < 3; j++) {
      await plate.locator('[data-research-photo]').nth(j).click();
      const img = plate.locator('img').nth(j);
      await img.waitFor();
      assert.equal(await img.evaluate((img) => img.complete && img.naturalWidth >= 64), true);
    }
    await plate.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/plant-plate-${i}.png` });
    report.photoViews.push(await plate.locator('img').count());
  }
  await page.locator('#discoveryProfileBtn').click();
  const badge = page.locator('[data-explorer-badge=living-patch-survey]');
  await badge.waitFor({ state: 'attached' });
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/profile-badge.png` });
  const state = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      phase: (await ctx.discoveryProfileStore.getProfile()).researchCareers.botany.active.phase,
      courseRoots: ctx.scene.children.filter((row) => row.name === 'Field course · botany').length,
      proxies: ctx.dynamicBuildingColliders.filter((row) =>
        row.sourceBuildingId?.startsWith('research-botany:')
      ).length
    };
  });
  assert.deepEqual(state, { phase: 'complete', courseRoots: 0, proxies: 0 });
  await page.locator('#discoveryCloseBtn').click();
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('#sandboxNearbyActivities').click();
  await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  await page.locator('[data-experience-id="career:botanist"]').click();
  await page.locator('[data-experience-variant]').selectOption('campaign');
  await page.getByRole('button', { name: 'Visit marked plot', exact: true }).waitFor();
  const expected = data.profile.researchCareers.botany.records.campaign,
    completionsBefore = data.events.filter((e) => e.metadata?.botanyReport).length;
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('campaign');
  report.revisit = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      a = (await ctx.discoveryProfileStore.getProfile()).researchCareers.botany.active,
      object = ctx.scene.getObjectByName('Saved restoration planting');
    return {
      active: a,
      visible: object?.visible,
      proxies: ctx.dynamicBuildingColliders.filter((r) =>
        r.sourceBuildingId?.startsWith('research-botany:')
      ).length
    };
  });
  assert.deepEqual(report.revisit.active, expected);
  assert.equal(report.revisit.visible, true);
  assert.equal(report.revisit.proxies, 24);
  await qa.record('Activities reopens the original marked campaign plot and actual saved planting');
  const afterVisit = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.exportData();
  });
  assert.equal(afterVisit.events.filter((e) => e.metadata?.botanyReport).length, completionsBefore);
  const bed=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),{earthCoordinateFrame}=await import('/app/js/earth-core/coordinate-frame.js?v=1'),a=(await ctx.discoveryProfileStore.getProfile()).researchCareers.botany.active;return earthCoordinateFrame(ctx.LOC,ctx.SCALE).toWorld(a.site.points.a.lat,a.site.points.a.lon);}),u=(await qa.snapshot()).unit;
  const approach={x:bed.x,z:bed.z+3.2/u},route=await page.evaluate(async target=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),{planFieldworkWalk}=await import('/scripts/verification/fieldwork-walk-plan.mjs');return planFieldworkWalk(ctx,target);},approach);
  for(const waypoint of route)await qa.walkTo(waypoint);
  const before=await qa.snapshot();await qa.walkTo({x:bed.x,z:bed.z+2.2/u});const walking=await qa.snapshot();
  await page.evaluate(async bed=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),w=ctx.Walk.state.walker;w.yaw=Math.atan2(bed.x-w.x,bed.z-w.z);w.lookYawOffset=0;w.pitch=-.25;ctx.renderer.domElement.focus({preventScroll:true});},bed);
  await page.keyboard.down('w');try{await page.waitForTimeout(1800);}finally{await page.keyboard.up('w');}const stopped=await qa.snapshot();
  report.contact={calibrationMeters:Math.hypot(walking.walker.x-before.walker.x,walking.walker.z-before.walker.z)*u,approachMeters:Math.hypot(stopped.walker.x-walking.walker.x,stopped.walker.z-walking.walker.z)*u,clearanceMeters:Math.hypot(stopped.walker.x-bed.x,stopped.walker.z-bed.z)*u,paused:stopped.paused,onGround:stopped.walker.onGround};
  assert.ok(report.contact.calibrationMeters>.35);assert.ok(report.contact.approachMeters>.15);assert.ok(report.contact.clearanceMeters>.8&&report.contact.clearanceMeters<1.25);assert.equal(report.contact.paused,false);assert.equal(report.contact.onGround,true);await page.screenshot({path:output+'/actual-planter-contact.png'});
  await page.locator('[data-research-pause]').click();
  const disposed = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      roots: ctx.scene.children.filter((r) => r.name === 'Field course · botany').length,
      proxies: ctx.dynamicBuildingColliders.filter((r) =>
        r.sourceBuildingId?.startsWith('research-botany:')
      ).length
    };
  });
  assert.deepEqual(disposed, { roots: 0, proxies: 0 });
  report.disposal = disposed;
  report.checks.push(
    'All three actual saved reports render in Journal; the diagnostic plant JPEG restores with its original pixels',
    'Plant Survey badge is visibly present in existing Profile',
    'Backup v6 restores all actual evidence; missing historical image is rejected before replacing data',
    'Normal world entry does not instantiate a completed course or retain any course proxy'
  );
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
