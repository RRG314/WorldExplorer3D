import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BOTANY_STUDIES,
  BOTANY_PLANTS,
  botanyPlotComparison
} from '../../app/js/campaign/botany-career.js';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/botany-career-20261102/world-${Date.now()}`;
let recovery = null;
if (process.env.WE3D_BOTANY_RECOVERY) {
  const file = path.resolve(process.env.WE3D_BOTANY_RECOVERY);
  assert.ok(file.startsWith(path.resolve('output/verification/botany-career-20261102') + path.sep));
  recovery = JSON.parse(await fs.readFile(file));
}
const qa = await createFieldworkQaSession({
    output,
    careerId: 'botany',
    walkLegMaximumDurationMs: 45000,
    maximumDurationMs: 10 * 60 * 1000
  }),
  { page, report } = qa;
async function close() {
  if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
}
async function open() {
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
}
async function begin(variant) {
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  else {
    await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
    await page.locator('#sandboxNearbyActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:botanist"]').click();
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
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function approach() {
  const s = await qa.snapshot(),
    p = s.fieldwork.target,
    target = { x: p.x, z: p.z + (p.id === 'bench' ? 1.3 : 2.2) / s.unit };
  const route = await page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return planFieldworkWalk(ctx, target);
  }, target);
  for (const waypoint of route) await qa.walkTo(waypoint);
  return p;
}
async function face(id) {
  const switched = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (ctx.Walk.state.view === 'first') return false;
    for (let i = 0; i < 3 && ctx.Walk.state.view !== 'first'; i++) ctx.Walk.toggleView();
    return true;
  });
  if (switched) await page.waitForTimeout(250);
  await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      T = THREE,
      w = ctx.Walk.state.walker,
      object = ctx.scene.getObjectByName('Diagnostic training plant ' + id.toUpperCase()),
      target = new T.Box3().setFromObject(object).getCenter(new T.Vector3()),
      c = ctx.camera.getWorldPosition(new T.Vector3());
    w.yaw = Math.atan2(target.x - w.x, target.z - w.z);
    w.lookYawOffset = 0;
    w.pitch = -Math.atan2(c.y - target.y, Math.hypot(target.x - w.x, target.z - w.z));
    ctx.renderer.domElement.focus({ preventScroll: true });
  }, id);
  await page.waitForTimeout(200);
}
async function layout(label, selector) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390]
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(selector).scrollIntoViewIfNeeded();
    const b = await page.locator(selector).boundingBox();
    assert.ok(b.height >= 44 && b.y >= 0 && b.y + b.height <= height);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/${label}-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
try {
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/app/?diagnostics=1'
  );
  if (recovery) {
    await page.evaluate(async (data) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      await createIndexedDbDiscoveryProfileStore().importData(data);
    }, recovery);
    report.recoveredFrom = process.env.WE3D_BOTANY_RECOVERY;
  }
  const variants = Object.keys(BOTANY_STUDIES),
    start = Math.max(
      0,
      variants.indexOf(recovery?.profile.researchCareers.botany.active.variantId || 'campaign')
    );
  for (let vi = start; vi < variants.length; vi++) {
    const variant = variants[vi],
      study = BOTANY_STUDIES[variant];
    if (recovery?.profile.researchCareers.botany.completed[variant]) continue;
    await begin(variant);
    await qa.record(
      variant + ' · admitted actual park footprint, three model plant beds and fixed paired plot'
    );
    let iterations = 0;
    while ((await qa.careerState()).active.phase !== 'complete') {
      if (++iterations > 24) throw Error('Bounded botany workflow exceeded its number of steps');
      await close();
      const a = (await qa.careerState()).active,
        id = ['a', 'b', 'c'][a.plantIndex];
      await approach();
      if (['photographs', 'plants'].includes(a.phase) && !a.captures[`plant-${id}`]) {
        await face(id);
        await qa.submit('Photograph plant');
        await qa.record(variant + ' · ' + id + ' actual diagnostic photograph');
        const capture = await page.evaluate(async (slot) => {
          const { ctx } = await import('/app/js/shared-context.js?v=55'),
            a = (await ctx.discoveryProfileStore.getProfile()).researchCareers.botany.active;
          return ctx.discoveryProfileStore.getResearchPhoto(a.captures[slot].id);
        }, `plant-${id}`);
        await fs.writeFile(
          `${output}/${variant}-plant-${id}.jpg`,
          Buffer.from(capture.photo.dataUrl.split(',')[1], 'base64')
        );
        continue;
      }
      await open();
      if (a.phase === 'plants') {
        await page.locator('select[name=form]').selectOption(BOTANY_PLANTS[id].form);
        await qa.submit('Read sensors and save comparison');
      } else if (a.phase === 'mark-plot') {
        await page.locator('select[name=comparison]').selectOption('light-and-moisture-contrast');
        await qa.submit('Mark plot and lower point frames');
      } else if (['choose-season', 'choose-followup'].includes(a.phase)) {
        await page
          .locator('select[name=virtualSeason]')
          .selectOption(a.phase === 'choose-season' ? study.visitSeason : study.afterSeason);
        await qa.submit('Declare virtual season');
      } else if (['revisit', 'followup'].includes(a.phase))
        await qa.submit('Lower point frames and save visit');
      else if (a.phase === 'planting') {
        await page.getByRole('button', { name: 'Read plot instruments', exact: true }).click();
        await page.locator('select[name=variety]').selectOption(study.suitable);
        const cell = a.plotReadings.visit.treatment.points.find((p) => p.kind === 'soil').index;
        await page.locator('select[name=cell]').selectOption(String(cell));
        if (variant === 'campaign' && process.env.WE3D_BOTANY_LAYOUT === '1')
          await layout('planting', '.research-station-actions button[type=submit]');
        await qa.submit('Read conditions and place planting');
      } else if (a.phase === 'report') {
        if (variant === 'campaign' && process.env.WE3D_BOTANY_LAYOUT === '1')
          await layout('report', '.research-station-actions button');
        await page.locator('select[name=result]').selectOption(botanyPlotComparison(a).result);
        await page.locator('select[name=limitation]').selectOption(study.limitation);
        await page.locator('select[name=followUp]').selectOption('repeat-the-same-points');
        await qa.submit('Save plant plate and restoration report');
      } else throw Error('Unrecognized botany step ' + a.phase);
      await qa.record(variant + ' · saved ' + a.phase + (a.phase === 'plants' ? ' ' + id : ''));
      if (
        variant === 'campaign' &&
        a.phase === 'mark-plot' &&
        process.env.WE3D_BOTANY_RESUME_CHECK === '1'
      ) {
        const accepted = (await qa.careerState()).active.plotReadings.baseline,
          before = await qa.snapshot();
        await close();
        await page.locator('[data-research-pause]').click();
        await begin(variant);
        assert.deepEqual((await qa.careerState()).active.plotReadings.baseline, accepted);
        assert.equal((await qa.snapshot()).worldSequence, before.worldSequence);
        await qa.record(
          'Public pause/continue retains the actual fixed plot without repeated sampling'
        );
      }
    }
    await page.screenshot({ path: `${output}/${variant}-completed.png` });
    await qa.record(variant + ' · complete plant plate and actual restoration report');
    await close();
    if (process.env.WE3D_BOTANY_ONE === '1') break;
    await page.locator('[data-research-pause]').click();
  }
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
