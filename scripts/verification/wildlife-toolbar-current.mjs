import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/wildlife-career-20261102/toolbar-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'wildlife', maximumDurationMs: 60000 }),
  { page, report } = qa;
try {
  report.scope =
    'Affected field-toolbar contrast/layout boundary only; accepted station flow is reused.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/wildlife-station.html'
  );
  await page.waitForFunction(() => window.wildlifeCheck);
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390]
  ]) {
    await page.setViewportSize({ width, height });
    const button = page.locator('[data-wildlife-tool=record]');
    await button.scrollIntoViewIfNeeded();
    const css = await button.evaluate((el) => {
      const c = getComputedStyle(el);
      return { background: c.backgroundColor, color: c.color, disabled: el.disabled };
    });
    assert.deepEqual(css, {
      background: 'rgb(239, 208, 121)',
      color: 'rgb(21, 37, 27)',
      disabled: false
    });
    await page.screenshot({ path: `${output}/toolbar-${width}.png` });
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
