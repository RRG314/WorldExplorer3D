import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/palaeontology-career-20261102/camera-layout-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 90000
  }),
  { page, report } = qa;
try {
  report.scope =
    'Affected new camera-toolbar layout only in the native station fixture. No world-camera or mobile-locomotion claim.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/palaeontology-station.html?phase=photographs'
  );
  await page.locator('[data-field-shutter=layer]').waitFor();
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390]
  ]) {
    await page.setViewportSize({ width, height });
    for (const slot of ['layer', 'orientation']) {
      const button = page.locator(`[data-field-shutter=${slot}]`);
      await button.scrollIntoViewIfNeeded();
      const r = await button.boundingBox();
      assert.ok(r.height >= 44 && r.y >= 0 && r.y + r.height <= height);
      assert.equal(
        await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
        true
      );
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/${width}-camera-controls.png` });
    report.checks.push(
      `${width}x${height}: both shutter buttons generated, 44px target, unobscured hit testing, no horizontal overflow`
    );
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
