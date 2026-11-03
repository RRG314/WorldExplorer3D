import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';
const output = 'output/verification/mining-career-20261103/instrument-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'mining', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Only native quarry/probe/cutter/scale/feet/disposal on controlled ground. Prop positions, probe selections and pan loading are controlled. No normal effort, carrier journey, source fieldwork, saved job or reward claim.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/mining-view.html');
  await page.waitForFunction(() => window.ready);
  report.initial = await page.evaluate(() => miningView.snapshot());
  assert.equal(report.initial.reading.contact, true);
  assert.equal(report.initial.reading.assay.cellId, 'b:1:2');
  assert.equal(report.initial.reading.assay.massGrams, 20000);
  if (process.env.WE3D_MINING_VIEW_ONLY !== '1')
    assert.ok(report.initial.feet.every((v) => Math.abs(v) < 1e-6));
  await page.screenshot({ path: output + '/quarry-probe.png' });
  if (process.env.WE3D_MINING_VIEW_ONLY === '1') {
    await page.waitForFunction(() => {
      let ready = true;
      miningView.presentation.root.traverse((o) => {
        const image = o.material?.map?.image;
        if (image?.tagName === 'IMG' && (!image.complete || !image.naturalWidth)) ready = false;
      });
      return ready;
    });
    await page.evaluate(() => miningView.core());
    await page.screenshot({ path: output + '/settled-outcrop.png' });
    assert.equal(await page.evaluate(() => miningView.presentation.readProbe().contact), true);
    await page.locator('#cut').click();
    await page.screenshot({ path: output + '/settled-cutter.png' });
    await page.locator('#scale').click();
    assert.equal(await page.evaluate(() => miningView.presentation.readScale().massGrams), 40000);
    await page.screenshot({ path: output + '/connected-carrier.png' });
    report.scope =
      'Only changed natural outcrop/loaded textures/drill hardware/connected carrier visual boundary; actual probe ray against changed opaque rock and actual cloned-fragment weight rechecked. Instrument6817080 supplies earlier mutation/blocker/contact/disposal proof; no source or effort claim.';
  } else {
    report.geometryMutation = await page.evaluate(() => {
      const p = miningView.presentation,
        c = p.cells.get('b:1:2');
      c.scale.x = 1.1;
      const scaled = p.readProbe();
      c.scale.x = 1;
      const tip = p.probeTip.position.x;
      p.probeTip.position.x += 2;
      const missed = p.readProbe();
      p.probeTip.position.x = tip;
      return { scaled, missed };
    });
    assert.equal(report.geometryMutation.scaled.assay.massGrams, 22000);
    assert.equal(report.geometryMutation.missed.contact, false);
    report.blocked = await page.evaluate(() => {
      const p = miningView.presentation,
        r = p.readProbe(),
        b = miningView.blocker;
      b.position.set(
        r.origin.x,
        r.origin.y,
        r.origin.z - 0.02 / miningView.qualified.metersPerUnit
      );
      b.visible = true;
      b.updateMatrixWorld(true);
      const v = p.readProbe();
      b.visible = false;
      return v;
    });
    assert.equal(report.blocked.contact, false);
    assert.equal(report.blocked.firstHit, 'Controlled probe blocker');
    await page.locator('#cut').click();
    report.cutter = await page.evaluate(() => miningView.presentation.readCutter());
    assert.equal(report.cutter.contact, true);
    assert.ok(report.cutter.motorAngle > 0);
    await page.screenshot({ path: output + '/working-cutter.png' });
    const lost = await page.evaluate(() => {
      const p = miningView.presentation;
      p.cutterTip.position.x += 2;
      const r = p.readCutter();
      p.cutterTip.position.x -= 2;
      return r;
    });
    assert.equal(lost.contact, false);
    await page.locator('#scale').click();
    report.scale = await page.evaluate(() => miningView.presentation.readScale());
    assert.equal(report.scale.onPan, true);
    assert.equal(report.scale.massGrams, 40000);
    await page.screenshot({ path: output + '/receiving-pan.png' });
    const off = await page.evaluate(() => {
      const p = miningView.presentation;
      p.cart.position.x += 3;
      const r = p.readScale();
      p.cart.position.x -= 3;
      return r;
    });
    assert.equal(off.onPan, false);
    assert.equal(off.massGrams, null);
  }
  await runPrescribedGameActions(page, output, [{ buttons: [], frames: 3 }], 'canvas');
  await fs.writeFile(
    output + '/prescribed-state.json',
    await page.evaluate(() => render_game_to_text())
  );
  await page.screenshot({ path: output + '/prescribed-quarry.png' });
  if (process.env.WE3D_MINING_VIEW_ONLY !== '1') {
    await page.evaluate(() => miningView.presentation.dispose());
    assert.equal(await page.evaluate(() => miningView.ctx.dynamicBuildingColliders.length), 0);
    assert.equal(await page.evaluate(() => miningView.presentation.root.parent), null);
  }
  report.checks.push(
    process.env.WE3D_MINING_VIEW_ONLY === '1'
      ? 'Only changed settled presentation/probe ray/fragment weight; earlier functional evidence reused'
      : 'Geometry-derived actual mass, moved probe/cutter lose contact, opaque probe blocker, actual pan occupancy/weight, ground feet and owned disposal'
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
