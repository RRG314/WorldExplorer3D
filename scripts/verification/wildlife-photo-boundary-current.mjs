import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const base = 'output/verification/wildlife-career-20261102',
  sources = {
    a: `${base}/world-1793668609152/qa-fieldwork-backup.json`,
    b: `${base}/world-1793668739464/qa-fieldwork-backup.json`
  },
  output = `${base}/photo-boundary-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'wildlife',
    walkLegMaximumDurationMs: 45000,
    maximumDurationMs: 300000
  }),
  { page, report } = qa;
const start = async () => {
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  else {
    await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
    await page.locator('#sandboxNearbyActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:wildlife-ecologist"]').click();
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('tracks-and-photos');
};
async function face(id) {
  const switched = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (ctx.Walk.state.view === 'first') return false;
    for (let i = 0; i < 3 && ctx.Walk.state.view !== 'first'; i++) ctx.Walk.toggleView();
    return true;
  });
  if (switched) await page.waitForTimeout(200);
  await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      T = THREE,
      object = ctx.scene.getObjectByName(id === 'a' ? 'Hoof impressions' : 'Canid paw impressions'),
      p = new T.Box3().setFromObject(object).getCenter(new T.Vector3()),
      w = ctx.Walk.state.walker,
      c = ctx.camera.getWorldPosition(new T.Vector3());
    w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
    w.lookYawOffset = 0;
    w.pitch = -Math.atan2(c.y - p.y, Math.hypot(p.x - w.x, p.z - w.z));
    ctx.renderer.domElement.focus({ preventScroll: true });
  }, id);
  await page.waitForTimeout(200);
}
try {
  report.scope =
    'Affected actual source diagnostic-photo boundary only. Genuine saved pre-photo checkpoints are restored separately for A/B. Accepted transects, comparisons and capstones are not replayed. Older obscured pixels remain in their original evidence files.';
  report.sources = sources;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/app/?diagnostics=1'
  );
  for (const id of ['a', 'b']) {
    const data = JSON.parse(await fs.readFile(sources[id]));
    await page.evaluate(async (data) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      await createIndexedDbDiscoveryProfileStore().importData(data);
    }, data);
    await start();
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
    const target = (await qa.snapshot()).fieldwork.target,
      u = (await qa.snapshot()).unit,
      destination = { x: target.x, z: target.z + 1.4 / u },
      route = await page.evaluate(async (destination) => {
        const { ctx } = await import('/app/js/shared-context.js?v=55'),
          { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
        return planFieldworkWalk(ctx, destination);
      }, destination);
    for (const p of route) await qa.walkTo(p);
    await face(id);
    if (id === 'a') {
      await qa.submit('Record visible lead');
      await page.locator('[data-research-station]').click();
      await page.locator('select[name=method]').selectOption('track-photo');
      await qa.submit('Use this protocol in both habitats');
      await page.keyboard.press('Escape');
      await face(id);
    }
    await qa.submit('Photograph sign');
    const updated = await qa.careerState();
    assert.ok(updated.active.captures[`habitat-${id}`]);
    assert.equal(updated.active.habitatIndex, id === 'a' ? 0 : 1);
    assert.deepEqual(updated.active.surveys, data.profile.researchCareers.wildlife.active.surveys);
    await qa.record(`Corrected ${id} diagnostic JPEG, with accepted measured effort unchanged`);
    const saved = await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        a = (await ctx.discoveryProfileStore.getProfile()).researchCareers.wildlife.active;
      return (await ctx.discoveryProfileStore.getResearchPhoto(a.captures[`habitat-${id}`].id))
        .photo;
    }, id);
    await fs.writeFile(
      `${output}/diagnostic-${id}.jpg`,
      Buffer.from(saved.dataUrl.split(',')[1], 'base64')
    );
    const checkpoint = await fs.readFile(`${output}/qa-fieldwork-backup.json`);
    await fs.writeFile(`${output}/${id}-actual-photo-checkpoint.json`, checkpoint, { mode: 0o600 });
    await page.screenshot({ path: `${output}/framing-${id}.png` });
    await page.locator('[data-research-pause]').click();
  }
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
