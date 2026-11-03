import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  WILDLIFE_STUDIES,
  wildlifeEffortComparison
} from '../../app/js/campaign/wildlife-career.js';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/wildlife-career-20261102/world-${Date.now()}`;
let recovery = null;
if (process.env.WE3D_WILDLIFE_RECOVERY) {
  const source = path.resolve(process.env.WE3D_WILDLIFE_RECOVERY);
  assert.ok(
    source.startsWith(path.resolve('output/verification/wildlife-career-20261102') + path.sep) &&
      ['qa-fieldwork-backup.json', 'qa-fieldwork-failed-backup.json'].includes(
        path.basename(source)
      )
  );
  recovery = JSON.parse(await fs.readFile(source));
}
const qa = await createFieldworkQaSession({
    output,
    careerId: 'wildlife',
    walkLegMaximumDurationMs: 45000
  }),
  { page, report } = qa;
const field = async () => (await qa.snapshot()).fieldwork;
const close = async () => {
  if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
};
const open = async () => {
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
};
async function points() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
      a = (await ctx.discoveryProfileStore.getProfile()).researchCareers.wildlife.active,
      f = earthCoordinateFrame(ctx.LOC, ctx.SCALE);
    return Object.fromEntries(
      Object.entries(a.site.points).map(([id, p]) => [id, f.toWorld(p.lat, p.lon)])
    );
  });
}
async function approach({ stationId = null, open = true } = {}) {
  const s = await qa.snapshot(),
    p = stationId ? (await points())[stationId] : s.fieldwork.target,
    id = stationId || s.fieldwork.target.id,
    target = { x: p.x, z: p.z + (id === 'bench' ? 1.3 : 1.8) / s.unit };
  const route = await page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return planFieldworkWalk(ctx, target);
  }, target);
  for (const waypoint of route) await qa.walkTo(waypoint);
  if (open) {
    await page.locator('[data-research-station]').click();
    await page.locator('.research-station[open]').waitFor();
  }
  return p;
}
async function face(id, kind, walkingToward = null) {
  const switched = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (ctx.Walk.state.view === 'first') return false;
    for (let i = 0; i < 3 && ctx.Walk.state.view !== 'first'; i++) ctx.Walk.toggleView();
    return true;
  });
  if (switched) await page.waitForTimeout(200);
  await page.evaluate(
    async ({ id, kind, walkingToward }) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        T = globalThis.THREE,
        w = ctx.Walk.state.walker;
      for (let i = 0; i < 3 && ctx.Walk.state.view !== 'first'; i++) ctx.Walk.toggleView();
      let object;
      if (kind === 'animal')
        object = ctx.scene.getObjectByName(
          id === 'a'
            ? 'World Discovery White-tailed deer training model'
            : 'World Discovery Woodland fox training model'
        );
      else
        object = ctx.scene.getObjectByName(
          id === 'a'
            ? 'Diagnostic split hoof training signs'
            : 'Diagnostic canid paw training signs'
        );
      if (!object) throw Error('Rendered subject unavailable');
      const p = new T.Box3().setFromObject(object).getCenter(new T.Vector3()),
        heading = Math.atan2(p.x - w.x, p.z - w.z),
        c = ctx.camera.getWorldPosition(new T.Vector3());
      w.yaw = walkingToward ? Math.atan2(walkingToward.x - w.x, walkingToward.z - w.z) : heading;
      w.lookYawOffset = walkingToward
        ? Math.atan2(Math.sin(heading - w.yaw), Math.cos(heading - w.yaw))
        : 0;
      w.pitch = -Math.atan2(c.y - p.y, Math.hypot(p.x - w.x, p.z - w.z));
      ctx.renderer.domElement.focus({ preventScroll: true });
    },
    { id, kind, walkingToward }
  );
  await page.waitForTimeout(120);
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
  await page.locator('[data-experience-id="career:wildlife-ecologist"]').click();
  if (variant !== 'campaign') await page.locator('[data-experience-variant]').selectOption(variant);
  if (process.env.WE3D_WILDLIFE_RELOCATE === '1' && recovery) {
    await page.locator('[data-experience-recovery=relocate-course]').click();
    recovery = null;
  } else await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer(variant);
}
async function walkTransect(id, route) {
  await qa.walkTo(route.finish, 0.22);
  await face(id, 'sign');
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
    report.recoveredFrom = process.env.WE3D_WILDLIFE_RECOVERY;
  }
  const variants = Object.keys(WILDLIFE_STUDIES),
    start = Math.max(
      0,
      variants.indexOf(recovery?.profile.researchCareers.wildlife.active.variantId || 'campaign')
    );
  for (let vi = start; vi < variants.length; vi++) {
    const variant = variants[vi],
      study = WILDLIFE_STUDIES[variant];
    await begin(variant);
    const initial = await field();
    assert.equal(initial.presentation.habitats, 2);
    assert.equal(initial.presentation.actors.models.length, 2);
    assert.ok(
      initial.presentation.actors.models.every(
        (row) => row.curatedAssetId && row.visibleFallbackMeshCount === 0
      )
    );
    await qa.record(variant + ' · supported mapped habitats and two licensed model leases');
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
    let a = (await qa.careerState()).active;
    if (a.phase === 'brief') {
      await approach({
        open: false,
        stationId: 'a',
        offsets: { a: 0.25, b: 0.25, bench: 1.3 },
        perimeterSide: 'west',
        dryApproach: true
      });
      await face('a', study.lead === 'animal' ? 'animal' : 'sign');
      await qa.submit('Record visible lead');
      await qa.record(variant + ' · actual visible ' + study.lead + ' lead');
      a = (await qa.careerState()).active;
    }
    if (variant === 'campaign' && a.phase === 'survey' && a.habitatIndex === 1) {
      const filed = a.surveys.a,
        before = await qa.snapshot();
      await page.locator('[data-research-pause]').click();
      await begin(variant);
      assert.deepEqual((await qa.careerState()).active.surveys.a, filed);
      assert.equal((await field()).tools.effort, null);
      assert.equal((await qa.snapshot()).worldSequence, before.worldSequence);
      await qa.record(
        'Public pause/continue retains accepted A without passive effort or a world reload'
      );
    }
    if (a.phase === 'method') {
      await open();
      await page.locator('select[name=method]').selectOption(study.methods[0]);
      await qa.submit('Use this protocol in both habitats');
      await close();
    }
    for (
      let hi = (await qa.careerState()).active.habitatIndex;
      hi < 2 && (await qa.careerState()).active.phase === 'survey';
      hi++
    ) {
      const id = hi === 0 ? 'a' : 'b',
        method = (await qa.careerState()).active.method,
        p = (await points())[id],
        u = (await qa.snapshot()).unit;
      await close();
      await approach({
        open: false,
        stationId: id,
        offsets: { a: 0.25, b: 0.25, bench: 1.3 },
        perimeterSide: 'west',
        dryApproach: true
      });
      if (method === 'track-photo') {
        await face(id, 'sign');
        if (!(await qa.careerState()).active.captures[`habitat-${id}`])
          await qa.submit('Photograph sign');
        await qa.walkTo({ x: p.x, z: p.z + 3.1 / u });
        await face(id, 'sign');
      } else {
        await qa.walkTo(p);
        await face(id, 'animal');
      }
      if (method === 'trail-camera')
        await page.getByRole('button', { name: 'Align mounted sensor', exact: true }).click();
      await page.getByRole('button', { name: 'Begin observation', exact: true }).click();
      if (method === 'track-photo')
        await walkTransect(id, { finish: { x: p.x, z: p.z - 3.1 / u } });
      const deadline = Date.now() + 75000;
      while (Date.now() < deadline) {
        const s = (await field()).tools.effort;
        if (s?.interrupted) throw Error(s.reason);
        if (s?.complete) break;
        if (method !== 'trail-camera') await face(id, method === 'track-photo' ? 'sign' : 'animal');
        await page.waitForTimeout(180);
      }
      const effort = (await field()).tools.effort;
      assert.equal(effort.complete, true);
      assert.ok(effort.observations.length > 0, 'real visible/sensor evidence');
      assert.ok(effort.activeSeconds >= 10);
      if (method === 'trail-camera')
        assert.ok(effort.observations[0].detections > 1, 'multiple motion events per individual');
      if (method === 'track-photo') await qa.walkTo({ x: p.x, z: p.z - 2.7 / u });
      await qa.submit('File measured checklist');
      await qa.record(variant + ' · plot ' + id + ' actual ' + method + ' effort and evidence');
      await page.screenshot({ path: `${output}/${variant}-${id}.png` });
      if (variant === 'campaign' && id === 'a') {
        const filed = (await qa.careerState()).active.surveys.a;
        await page.locator('[data-research-pause]').click();
        await begin(variant);
        assert.deepEqual((await qa.careerState()).active.surveys.a, filed);
        assert.equal((await field()).tools.effort, null);
        await qa.record(
          'Public pause/continue retains the filed checklist and starts no passive effort'
        );
      }
    }
    a = (await qa.careerState()).active;
    if (['review', 'interpretation'].includes(a.phase))
      await approach({
        open: true,
        offsets: { a: 0.25, b: 0.25, bench: 1.3 },
        perimeterSide: 'west',
        dryApproach: true
      });
    if (a.phase === 'review') {
      await page
        .locator('select[name=effortComparison]')
        .selectOption(wildlifeEffortComparison(a).status);
      for (const id of ['a', 'b']) {
        await page
          .locator(`select[name=taxon-${id}]`)
          .selectOption(a.surveys[id].observations[0]?.taxon || 'unresolved');
        await page
          .locator(`select[name=confidence-${id}]`)
          .selectOption(
            !a.surveys[id].observations.length
              ? 'not-observed'
              : a.method === 'track-photo'
                ? 'tentative'
                : 'confident'
          );
      }
      await qa.submit('Save evidence review');
      a = (await qa.careerState()).active;
    }
    if (a.phase === 'interpretation') {
      for (const [name, value] of Object.entries({
        coverContrast: 'wooded-versus-open',
        interpretation:
          a.comparison.status === 'matched' ? 'paired-observations-only' : 'inconclusive',
        limitation: study.limitation,
        followUp: a.comparison.status === 'matched' ? study.followUp : 'repeat-matching-effort'
      }))
        await page.locator(`select[name=${name}]`).selectOption(value);
      await qa.submit('Save paired habitat report');
      await qa.record(variant + ' · complete paired report, confidence and limits');
      await page.screenshot({ path: `${output}/${variant}-report.png` });
    }
    await close();
    if (vi < variants.length - 1) await page.locator('[data-research-pause]').click();
  }
  const final = await qa.careerState();
  assert.equal(Object.keys(final.completed).length, 3);
  const backup = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.exportData();
  });
  assert.equal(backup.items.filter((row) => row.metadata?.careerId === 'wildlife').length, 0);
  assert.equal(backup.researchMedia.filter((row) => row.careerId === 'wildlife').length, 2);
  assert.equal(backup.events.filter((row) => row.metadata?.wildlifeReport).length, 3);
  report.final = {
    completed: final.completed,
    photos: 2,
    hash: createHash('sha256').update(JSON.stringify(backup)).digest('hex')
  };
  await qa.record('All three distinct studies retain actual evidence without collected animals');
  await qa.succeed();
} catch (error) {
  try {
    report.admission = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { qualifyResearchSite } = await import('/app/js/campaign/research-site.js'),
        { wildlifeSiteEligibility } = await import('/app/js/campaign/wildlife-presentation.js'),
        { WILDLIFE_OFFSETS } = await import('/app/js/campaign/wildlife-career.js'),
        reasons = {};
      let result;
      try {
        const q = qualifyResearchSite(ctx, {
          id: 'diagnosis-only',
          offsets: WILDLIFE_OFFSETS,
          eligibility: (runtime, input) => {
            const r = wildlifeSiteEligibility(runtime, input);
            reasons[String(r)] = (reasons[String(r)] || 0) + 1;
            return r;
          }
        });
        result = { points: q.points };
      } catch (e) {
        result = { message: e.message };
      }
      return {
        result,
        reasons,
        publication: ctx.worldDiscoveryPublicationStore
          ?.get()
          ?.environment?.cells.map((row) => ({ cellId: row.cellId, contexts: row.contexts }))
      };
    });
  } catch {}
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
