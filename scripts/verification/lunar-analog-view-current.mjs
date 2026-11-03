import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';
const output = 'output/verification/planetary-career-20261103/analog-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'planetary', maximumDurationMs: 60000 }),
  { page, report } = qa;
try {
  report.scope =
    'Only corrected actual native geology-rig presentation. Controlled flat room/camera/light; no field procedure, specimen, return, report or old accepted gameplay replay.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/lunar-analog-view.html');
  await page.waitForFunction(() => window.ready);
  report.geometry = await page.evaluate(() => lunarAnalogView.snapshot());
  assert.equal(report.geometry.sites.length, 2);
  for (const s of report.geometry.sites) {
    assert.ok(Math.abs(s.footClearance) < 1e-6);
    assert.ok(s.grains >= 12);
  }
  assert.notEqual(report.geometry.sites[0].matrixColor, report.geometry.sites[1].matrixColor);
  for (const id of ['A', 'B']) {
    await page.locator('#site' + id).click();
    for (const [width, height] of process.env.WE3D_ANALOG_LAYOUTS === 'fixed'
      ? [[1280, 800]]
      : [
          [1280, 800],
          [390, 844],
        ]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        () =>
          document.querySelector('canvas').width === innerWidth &&
          document.querySelector('canvas').height === innerHeight,
      );
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: output + '/site-' + id + '-' + width + '.png' });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await runPrescribedGameActions(page, output, [{ buttons: [], frames: 3 }], 'canvas');
  await page.screenshot({ path: output + '/prescribed-analog.png' });
  await fs.writeFile(
    output + '/prescribed-state.json',
    await page.evaluate(() => render_game_to_text()),
  );
  report.disposal = await page.evaluate(() => lunarAnalogView.dispose());
  assert.equal(report.disposal.removed, true);
  report.checks.push(
    'same native constructor renders distinct fine grains and embedded coarse fragments, supported feet, two sizes, existing disposal path, prescribed choreography',
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
