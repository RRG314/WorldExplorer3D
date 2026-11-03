import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/accelerator-career-20261103/visit-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'accelerator',
    maximumDurationMs: 510000,
  }),
  { page, report } = qa;
const source = JSON.parse(
  await fs.readFile(
    'output/verification/accelerator-career-20261103/admission-1793729904227/receipt.json',
    'utf8'
  )
);
const snapshot = () =>
  page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      a = ctx.activeInterior,
      v = a?.cern?.visit,
      w = ctx.Walk.state.walker;
    return {
      siteId: a?.definition.cernContent?.siteId,
      level: a?.activeLevel,
      position: { x: w.x, y: w.y, z: w.z, onGround: w.onGround },
      local: v?.plan.local(w),
      paused: ctx.paused,
      scene: !!a?.group.parent,
      colliders: ctx.dynamicBuildingColliders.length,
      detector: a?.cern?.detector?.snapshot(),
      error: a?.cern?.error,
    };
  });
async function focus() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function local(x, z) {
  const p = await page.evaluate(
    async ({ x, z }) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.activeInterior.cern.visit.plan.world({ x, z });
    },
    { x, z }
  );
  await focus();
  await qa.walkTo(p, 0.32);
}
async function lift(level) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.updateInteriorInteraction(0);
  });
  assert.equal(
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handleInteriorAction();
    }),
    true
  );
  await page.locator('[data-elevator-level="' + level + '"]').click();
  await focus();
  await page.waitForTimeout(250);
  assert.equal((await snapshot()).level, level);
}
try {
  report.scope =
    'New CERN facilities only: actual loaded geographic worlds, existing entry/collision/floors/lift/return, keyboard walking on normal unpaused frames with controlled facing. No direct actor positioning, experiment/career completion or moving-cabin claim.';
  for (const s of source.sites.filter(
    (s) => !process.env.WE3D_CERN_SITE || s.id === process.env.WE3D_CERN_SITE
  )) {
    const f = earthCoordinateFrame(s.location, s.scale),
      e = s.support.exteriorEntrance,
      arrival = f.toGeographic(
        e.approachX + (e.normalX * 2) / s.unit,
        e.approachZ + (e.normalZ * 2) / s.unit
      );
    await page.goto(
      'http://127.0.0.1:4192/app/?lat=' +
        arrival.lat +
        '&lon=' +
        arrival.lon +
        '&name=' +
        encodeURIComponent(s.id) +
        '&diagnostics=1'
    );
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      window.cernReady = () =>
        ctx.gameStarted &&
        !ctx.worldLoading &&
        !!ctx.worldPublication?.requestId &&
        !document.querySelector('#loading')?.classList.contains('show');
    });
    const end = Date.now() + 180000;
    while (!(await page.evaluate(() => cernReady()))) {
      if (Date.now() > end) throw Error('CERN world load deadline');
      await page.waitForTimeout(1000);
    }
    const approach = await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { CERN_SITE_REFERENCE } = await import('/app/js/interiors/cern-site-reference.js'),
        s = CERN_SITE_REFERENCE.find((s) => s.id === id),
        b = ctx.buildings.find((b) =>
          [s.sourceBuildingId, ...s.sourceAliases].includes(b.sourceBuildingId)
        );
      ctx.setTravelMode('walk', { source: 'cern-visit-qa' });
      window.cernSupport = ctx.resolveBuildingEntrySupport(b, { allowSynthetic: false });
      const e = cernSupport.exteriorEntrance;
      return { x: e.approachX, z: e.approachZ };
    }, s.id);
    await focus();
    await qa.walkTo(approach, 0.4);
    const entered = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        w = ctx.Walk.state.walker,
        e = cernSupport.exteriorEntrance;
      if (Math.hypot(w.x - e.x, w.z - e.z) * ctx.METERS_PER_WORLD_UNIT > 3)
        throw Error('Normal exterior door approach required');
      return ctx.enterInteriorForSupport(cernSupport);
    });
    assert.equal(entered, true, 'Existing interior owner must admit the new scene');
    await page.waitForTimeout(300);
    report.checks.push({
      name: s.id + ' normal exterior approach and admitted entry',
      state: await snapshot(),
    });
    console.log('Entered ' + s.id);
    if (s.id === 'cern-science-gateway') {
      await local(6, 10.8);
      await local(0, 10.8);
      await page.screenshot({ path: output + '/meyrin-reception.png' });
      await local(6, 10.8);
      for (const z of [1.8, -8.2, -19.2]) {
        await local(6, z);
        await local(-7, z);
        report.checks.push({
          name: 'Distinct supported Meyrin station ' + z,
          state: await snapshot(),
        });
        await page.screenshot({ path: output + '/meyrin-' + z + '.png' });
        await local(6, z);
      }
      await local(6, 8);
      const entry = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.activeInterior.lobbyEntryPoint;
      });
      await qa.walkTo(entry, 0.4);
    } else {
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        window.cernDetectorReady = () =>
          !!ctx.activeInterior?.cern?.detector || !!ctx.activeInterior?.cern?.error;
      });
      await page.waitForFunction(() => cernDetectorReady(), undefined, { timeout: 45000 });
      assert.equal((await snapshot()).error, null);
      assert.equal((await snapshot()).detector.components, 18);
      await local(0, -21);
      await lift(0);
      report.checks.push({
        name: 'Existing lift reaches supported −100 m landing',
        state: await snapshot(),
      });
      await local(-11, -21);
      await local(-11, 0);
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55'),
          w = ctx.Walk.state.walker,
          p = ctx.activeInterior.cern.visit.plan.world({ x: 0, z: 0 });
        w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
        w.pitch = 0.16;
        w.lookYawOffset = 0;
      });
      await page.waitForTimeout(150);
      await page.screenshot({ path: output + '/cms-detector.png' });
      const before = await snapshot();
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55'),
          w = ctx.Walk.state.walker,
          p = ctx.activeInterior.cern.visit.plan.world({ x: 0, z: 0 });
        w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
        w.pitch = 0;
        w.lookYawOffset = 0;
      });
      await page.keyboard.down('w');
      await page.waitForTimeout(1800);
      await page.keyboard.up('w');
      const stopped = await snapshot();
      assert.ok(stopped.local.x < -9, 'Solid viewing barrier stops normal walking');
      assert.ok(stopped.local.x > before.local.x + 0.3, 'Positive movement before contact');
      report.checks.push({
        name: 'Unpaused calibrated physical detector barrier',
        before,
        stopped,
      });
      await local(-11, 0);
      await local(-11, 14);
      await local(-10, 14);
      await local(-10, 19.5);
      for (const x of [-7, 0, 7]) {
        await local(x, 20.8);
        report.checks.push({ name: 'Supported analysis bench ' + x, state: await snapshot() });
      }
      await page.screenshot({ path: output + '/cms-analysis.png' });
      await local(-10, 20.8);
      await local(-10, 14);
      await local(-11, 14);
      await local(-11, -21);
      await local(0, -21);
      await lift(1);
      const entry = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.activeInterior.lobbyEntryPoint;
      });
      await qa.walkTo(entry, 0.4);
    }
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.updateInteriorInteraction(0);
    });
    assert.equal(
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.handleInteriorAction();
      }),
      true
    );
    await focus();
    await page.waitForTimeout(300);
    const outside = await snapshot();
    assert.equal(outside.siteId, undefined);
    report.checks.push({
      name: s.id + ' supported normal exterior return and resource release',
      state: outside,
    });
    console.log('Returned ' + s.id);
  }
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await page.keyboard.up('w').catch(() => {});
  await qa.close();
}
