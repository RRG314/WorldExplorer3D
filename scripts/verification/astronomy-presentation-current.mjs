import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';
const output = 'output/verification/astronomy-career-20261103/instrument-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'astronomy', maximumDurationMs: 90000 }),
  { page, report } = qa;
const read = () => page.evaluate(() => astronomyView.snapshot());
try {
  report.scope =
    'Actual native telescope, existing leased tables, optical mesh rays and disposal in controlled sloping geometry. No source observing procedure, saved exposure clock or profile completion claim.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/astronomy-view.html');
  await page.waitForFunction(() => window.ready);
  report.initial = await read();
  assert.equal(report.initial.proxies, 3);
  assert.equal(report.initial.budget.modelLeases, 2);
  assert.ok(report.initial.feet.every((v) => Math.abs(v) < 1e-6));
  await page.locator('#align').click();
  report.aligned = await read();
  assert.equal(report.aligned.reading.clear, true);
  const angle = await page.evaluate(async () => {
    const { astronomySeparation } = await import('/app/js/campaign/astronomy-instrument.js');
    return astronomySeparation(
      astronomyView.presentation.readOptics(true).axis,
      astronomyView.h.state.active.catalogDirection
    );
  });
  assert.ok(angle < 0.0001);
  await page.screenshot({ path: output + '/aligned.png' });
  if (process.env.WE3D_ASTRONOMY_VIEW_ONLY === '1') {
    await page.evaluate(() => astronomyView.lookAtDetector());
    await page.screenshot({ path: output + '/detector-monitor.png' });
    const pixels = await page.evaluate(() => {
      const o = astronomyView.presentation.root.getObjectByName('Synthetic detector monitor b'),
        c = o.material.map.image;
      return {
        width: c.width,
        height: c.height,
        center: c.getContext('2d').getImageData(31, 31, 1, 1).data[0],
      };
    });
    assert.equal(pixels.width, 64);
    assert.ok(pixels.center > 60);
    report.monitor = pixels;
    report.scope =
      'Only changed native cover supports/tag and actual 64x64 detector monitor presentation in controlled geometry. Earlier instrument-1793704654134 supplies the accepted mutation/blocker/shutter/dither/disposal evidence; those are not replayed here.';
  } else {
    report.mutation = await page.evaluate(() => {
      const yaw = astronomyView.presentation.root.getObjectByName('Telescope azimuth mount');
      yaw.rotation.y += 0.2;
      const r = astronomyView.presentation.readOptics(true);
      astronomyView.presentation.prepare('primary');
      return r;
    });
    assert.ok(Math.abs(report.mutation.azimuth - report.aligned.reading.azimuth) > 5);
    await page.locator('#block').click();
    report.blocked = await read();
    assert.equal(report.blocked.reading.blocked, true);
    assert.equal(report.blocked.reading.clear, false);
    await page.screenshot({ path: output + '/blocked.png' });
    await page.locator('#block').click();
    await page.locator('#cover').click();
    report.covered = await read();
    assert.equal(report.covered.reading.covered, true);
    assert.equal(report.covered.reading.firstHit, 'Working detector shutter cap');
    await page.screenshot({ path: output + '/covered.png' });
    await page.locator('#dither').click();
    report.dither = await read();
    assert.equal(report.dither.reading.clear, true);
    assert.ok(Math.abs(report.dither.reading.azimuth - report.aligned.reading.azimuth) > 0.2);
    await page.screenshot({ path: output + '/dither.png' });
    await runPrescribedGameActions(page, output, [{ buttons: [], frames: 3 }], 'canvas');
    await fs.writeFile(
      output + '/prescribed-state.json',
      await page.evaluate(() => render_game_to_text())
    );
    await page.screenshot({ path: output + '/prescribed-instrument.png' });
    await page.evaluate(() => astronomyView.presentation.dispose());
    assert.equal(await page.evaluate(() => astronomyView.ctx.dynamicBuildingColliders.length), 0);
    assert.equal(await page.evaluate(() => astronomyView.presentation.root.parent === null), true);
  }
  report.checks.push(
    process.env.WE3D_ASTRONOMY_VIEW_ONLY === '1'
      ? 'Only supported cover/tag and actual encoded monitor pixels; prior functional evidence reused'
      : 'actual unit1.11 sloped footings, source-derived alignment, mutation changes reading, opaque blocker, real covered shutter, dither, existing scene/model disposal and prescribed client'
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
