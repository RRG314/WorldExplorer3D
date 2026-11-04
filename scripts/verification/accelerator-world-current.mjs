import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { ACCELERATOR_STUDIES } from '../../app/js/campaign/accelerator-studies.js';
import { CMS_STUDY_REFERENCE } from '../../app/js/campaign/cms-study-reference.js';
import { boostPair } from '../../app/vendor/collision-lab/models.mjs';
const source = path.resolve(
  process.env.WE3D_ACCELERATOR_RECOVERY ||
    'output/verification/mining-career-20261103/world-1793712140345/qa-fieldwork-backup.json'
);
assert.match(
  source,
  /\/output\/verification\/(?:mining-career-20261103\/world-1793712140345|accelerator-career-20261103\/world-\d+)\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const recovery = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/accelerator-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'accelerator',
    maximumDurationMs: 18 * 60 * 1000,
    walkLegMaximumDurationMs: 35000,
  }),
  { page, report } = qa;
let dataRequests = 0;
const workerStats = { created: 0, closed: 0, active: 0, peak: 0 };
page.on('worker', (worker) => {
  if (!worker.url().includes('/campaign/accelerator-experiment-worker.js')) return;
  workerStats.created++;
  workerStats.active++;
  workerStats.peak = Math.max(workerStats.peak, workerStats.active);
  worker.on('close', () => {
    workerStats.closed++;
    workerStats.active--;
  });
});
page.context().on('request', (r) => {
  if (r.url().includes('/app/assets/data/cms/dimuon-2010b.json')) dataRequests++;
});
async function focus() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function close() {
  if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
  await focus();
}
async function begin(variant, { browserOpen = false } = {}) {
  await close();
  if (!browserOpen) {
    if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
      await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
    else {
      await page.locator('#exploreBtn').click();
      await page.locator('#fActivities').click();
      await page.getByRole('tab', { name: 'Careers', exact: true }).click();
    }
  }
  await page.locator('[data-experience-id="career:accelerator-scientist"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption(variant);
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer(variant);
  await focus();
}
async function local(x, z) {
  await focus();
  const p = await page.evaluate(
    async (p) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.activeInterior.cern.visit.plan.world(p);
    },
    { x, z }
  );
  await qa.walkTo(p, 0.3);
}
async function face(x, y, z) {
  await page.evaluate(
    async (p) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        w = ctx.Walk.state.walker,
        v = ctx.activeInterior.cern.visit,
        q = v.plan.world(p),
        targetY = v.base + p.y / v.plan.metersPerUnit;
      w.yaw = Math.atan2(q.x - w.x, q.z - w.z);
      w.angle = w.yaw;
      w.lookYawOffset = 0;
      w.pitch = Math.atan2(targetY - w.y, Math.hypot(q.x - w.x, q.z - w.z));
      ctx.renderer.domElement.focus({ preventScroll: true });
    },
    { x, y, z }
  );
  await page.waitForTimeout(250);
}
async function enter() {
  const s = await qa.snapshot();
  if (
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return !!ctx.activeInterior?.cern;
    })
  )
    return;
  const p = await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { CERN_SITE_REFERENCE } = await import('/app/js/interiors/cern-site-reference.js'),
      source = CERN_SITE_REFERENCE.find((s) => s.id === id),
      b = ctx.buildings.find((b) =>
        [source.sourceBuildingId, ...source.sourceAliases].includes(b.sourceBuildingId)
      ),
      support = ctx.resolveBuildingEntrySupport(b, { allowSynthetic: false });
    if (!support?.enterable) throw Error('Mapped CERN entry unavailable');
    return { x: support.exteriorEntrance.approachX, z: support.exteriorEntrance.approachZ };
  }, s.fieldwork.siteId);
  await qa.walkTo(p, 0.4);
  assert.equal(
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handleInteriorAction();
    }),
    true
  );
  assert.equal(
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.activeInterior?.definition.cernContent?.siteId;
    }),
    s.fieldwork.siteId
  );
  await page.waitForTimeout(200);
  await focus();
  if (s.fieldwork.siteId === 'cms-point-five') {
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      window.cmsReady = () =>
        !!ctx.activeInterior?.cern?.detector || !!ctx.activeInterior?.cern?.error;
    });
    await page.waitForFunction(() => cmsReady(), undefined, { timeout: 45000 });
    await local(0, -21);
    assert.equal(
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.handleInteriorAction();
      }),
      true
    );
    await page.locator('[data-elevator-level="0"]').click();
    await focus();
  }
  await qa.record(s.fieldwork.siteId + ' · normal mapped entry and existing supported interior');
}
async function approach() {
  await close();
  await enter();
  const s = await qa.snapshot(),
    id = s.fieldwork.target.id;
  const localState = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      v = ctx.activeInterior.cern.visit;
    return {
      position: v.plan.local(ctx.Walk.state.walker),
      station: v.plan.stations[ctx.saveActiveGameplay().target.id],
    };
  });
  const p = localState.station;
  if (s.fieldwork.siteId === 'cern-science-gateway') {
    await local(6, localState.position.z);
    await local(6, p.z + 1.8);
    await local(p.x, p.z + 1.8);
  } else if (id === 'signals') {
    await local(0, -19);
    await local(-7, -19);
    if (
      (await qa.careerState()).active.variantId === 'campaign' &&
      !(await qa.careerState()).active.measurements.signals?.length
    ) {
      await face(0, -92.6, 0);
      await page.screenshot({ path: output + '/cms-occupied-detector-route.png' });
    }
    await local(-7, -17.8);
  } else {
    if (localState.position.z < 17) {
      await local(-11, localState.position.z);
      await local(-11, 14);
      await local(-10, 14);
      await local(-10, 20.8);
    }
    await local(p.x, 20.8);
  }
  await face(p.x, (s.fieldwork.siteId === 'cms-point-five' ? -100 : 0) + 1.7, p.z);
  await page.locator('[data-research-station]').click();
  await page.locator('.research-station[open]').waitFor();
  return id;
}
async function fill(inputs) {
  for (const [k, v] of Object.entries(inputs)) {
    if (k === 'revealed') {
      for (const i of v) await page.locator('[name="read' + i + '"]').check();
    } else if (k === 'selected') {
      for (const id of v) await page.locator('[name="hit' + id + '"]').check();
    } else if (k === 'alternating' || k === 'charge' || k === 'choice')
      await page.locator('[name="' + k + '"]').selectOption(String(v));
    else await page.locator('[name="' + k + '"]').fill(String(v));
  }
}
async function observe(inputs, { failSave = false } = {}) {
  await fill(inputs);
  await page.locator('[form="accelerator-form"]').click();
  await page.locator('.research-station[open]').waitFor({ state: 'hidden' });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.instrumentReady = () => ctx.saveActiveGameplay?.()?.tools?.window?.ready === true;
  });
  await page.waitForFunction(() => instrumentReady(), undefined, { timeout: 20000 });
  const measured = (await qa.snapshot()).fieldwork.tools.window.measurement;
  assert.equal(measured.effort.targetSeconds, 3);
  assert.ok(measured.effort.activeSeconds >= 3);
  if ((await qa.careerState()).active.variantId === 'campaign')
    await page.screenshot({
      path: output + '/campaign-' + measured.experiment.method + '-working.png',
    });
  await page.locator('[data-research-station]').click();
  if (failSave) {
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      let fail = true;
      IDBDatabase.prototype.transaction = function (names, mode, ...rest) {
        if (fail && mode === 'readwrite' && Array.from(names).includes('events')) {
          fail = false;
          throw new DOMException(
            'Controlled saved-record failure; original instrument retained.',
            'UnknownError'
          );
        }
        return original.call(this, names, mode, ...rest);
      };
    });
    const before = await qa.careerState();
    await page.getByRole('button', { name: 'Save measured experiment', exact: true }).click();
    await page
      .locator('.research-station-status')
      .filter({ hasText: 'Controlled saved-record failure' })
      .waitFor();
    assert.deepEqual(await qa.careerState(), before);
    assert.deepEqual((await qa.snapshot()).fieldwork.tools.window.measurement, measured);
    report.checks.push({
      name: 'Actual IndexedDB failure leaves the exact measured experiment frozen for retry',
      phase: before.active.phase,
    });
  }
  await qa.submit('Save measured experiment');
  const a = (await qa.careerState()).active;
  assert.deepEqual(a.measurements[measured.experiment.method].at(-1).effort, measured.effort);
  return a;
}
async function panelProof(label) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const result = await page.locator('.research-station[open]').evaluate((d) => {
      const r = d.getBoundingClientRect(),
        actions = d.querySelector('footer').getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        overflow: d.scrollWidth > d.clientWidth + 1,
        actions: { top: actions.top, bottom: actions.bottom },
        focus: d.contains(document.activeElement),
      };
    });
    assert.equal(result.overflow, false);
    assert.ok(
      result.left >= -1 &&
        result.right <= width + 1 &&
        result.bottom <= height + 1 &&
        result.actions.top >= 0
    );
    await page.screenshot({ path: output + '/' + label + '-' + width + '.png' });
    report.checks.push({ name: label + ' controls ' + width + '×' + height, result });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
try {
  report.scope =
    'Actual source Accelerator scientist campaign and two meaningful variants; genuine completed Mining profile, existing Activities/Travel/Walk/interior/lift/research/profile owners, real dedicated worker and pinned data, normal frames and keyboard walking. Controlled facing/answers only; no actor teleport, advanceTime or native fixture seed. Reuse accepted source facility traversal and original scientific qualification; these are new actual methods/persistence checks.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (backup) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(backup);
  }, recovery);
  for (const [variant, study] of Object.entries(ACCELERATOR_STUDIES)) {
    if (recovery.profile.researchCareers.accelerator?.completed?.[variant]) continue;
    await begin(variant);
    let steps = 0,
      firstSaveFailed = !!recovery.profile.researchCareers.accelerator?.active?.measurements?.bend;
    while ((await qa.careerState()).active.phase !== 'complete') {
      assert.ok(++steps <= 15, 'Finite twelve procedure records after study admission');
      let a = (await qa.careerState()).active,
        p = a.phase;
      if (
        p === 'signals' &&
        (await qa.snapshot()).fieldwork.siteId === 'cms-point-five' &&
        !(await page.evaluate(async () => {
          const { ctx } = await import('/app/js/shared-context.js?v=55');
          return !!ctx.buildings.find(
            (b) => b.sourceBuildingId === 'overture:a50c684e-b954-470b-a365-71db93925c35'
          );
        }))
      ) {
        await close();
        await page.getByRole('button', { name: 'Travel to CMS Point 5', exact: true }).click();
        await begin(variant, { browserOpen: true });
      }
      await approach();
      if (variant === 'campaign' && ['rf', 'track'].includes(p)) await panelProof('campaign-' + p);
      if (p === 'orientation') await qa.submit('Begin beam study');
      else if (p === 'publish') await qa.submit('Publish Collision Lab notebook');
      else {
        const count = a.measurements[p]?.length || 0,
          lab = boostPair(CMS_STUDY_REFERENCE.witnesses[variant].muons, 0),
          inputs =
            p === 'bend'
              ? {
                  fieldTesla: Number(
                    (
                      ((study.caseIndex ? -1 : 1) * study.momentumGeV) /
                      (0.299792458 * study.radiusMeters)
                    ).toFixed(2)
                  ),
                }
              : p === 'rf'
                ? {
                    phaseDegrees: Number(
                      ((Math.acos((study.rfTargetMeV - 20) / 16) * 180) / Math.PI).toFixed(1)
                    ),
                  }
                : p === 'focus'
                  ? { k1: 1.4, k2: study.caseIndex ? 1.2 : 1.1, alternating: true }
                  : p === 'signals'
                    ? {
                        revealed: count ? [0, 1, 2, 3] : [1],
                        choice: count ? study.signalIndex : -1,
                      }
                    : p === 'track'
                      ? { selected: [...(study.caseIndex ? 'GACJEF' : 'BHFADJ')] }
                      : p === 'mass'
                        ? { beta: count ? Number((lab.momentum / lab.energy).toFixed(6)) : 0 }
                        : { charge: count ? 'same' : 'opposite' };
        a = await observe(inputs, {
          failSave: variant === 'campaign' && p === 'bend' && !firstSaveFailed,
        });
        if (p === 'bend') firstSaveFailed = true;
      }
      await qa.record(variant + ' · ' + p + ' · original instrument record');
      if (variant === 'campaign' && p === 'focus') {
        const before = await qa.careerState();
        assert.equal(workerStats.active, 1);
        await page.locator('[data-research-pause]').click();
        await page.waitForTimeout(200);
        assert.equal(workerStats.active, 0);
        assert.deepEqual(await qa.careerState(), before);
        assert.equal(await page.locator('.research-objective').count(), 0);
        assert.equal(
          await page.evaluate(async () => {
            const { ctx } = await import('/app/js/shared-context.js?v=55');
            return (
              !!ctx.activeInterior?.cern &&
              !ctx.scene.getObjectByName('Working Collision Lab instrument')
            );
          }),
          true
        );
        report.checks.push({
          name: 'Public Pause retains original beam records and terminates the selected worker and working display',
        });
        await begin(variant);
      }
      if (p === 'focus' && variant === 'campaign')
        assert.equal(
          dataRequests,
          0,
          'No recorded-data fetch before the first actual CMS mass station'
        );
      if (process.env.WE3D_ACCELERATOR_STOP_AFTER === p) {
        report.scope += ' Stopped at requested accepted prefix; not full career completion.';
        await qa.succeed();
        await qa.close();
        process.exit(0);
      }
    }
    await page.screenshot({ path: output + '/' + variant + '-notebook.png' });
    if (variant === 'campaign') await panelProof('campaign-notebook');
    await qa.record(variant + ' · completed original Collision Lab notebook');
    await close();
    if (variant === 'campaign') {
      const before = (await qa.careerState()).records.campaign;
      await page.reload();
      const after = await page.evaluate(async () => {
        const { createIndexedDbDiscoveryProfileStore } = await import(
          '/app/js/discovery/profile-store.js?v=5'
        );
        return (await createIndexedDbDiscoveryProfileStore().getProfile()).researchCareers
          .accelerator.records.campaign;
      });
      assert.deepEqual(after, before);
      report.checks.push({
        name: 'Actual page reload retains the entire original campaign notebook',
      });
    }
  }
  report.dataRequests = dataRequests;
  report.workerStats = workerStats;
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await page.keyboard.up('w').catch(() => {});
  await qa.close();
}
