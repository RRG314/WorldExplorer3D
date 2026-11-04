import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source =
    'output/verification/astronomy-career-20261103/world-1793705746302/qa-fieldwork-backup.json',
  data = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/astronomy-career-20261103/toolbar-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'astronomy', maximumDurationMs: 60000 }),
  { page, report } = qa;
try {
  report.scope =
    'Only shared missing-accent fallback on actual native Astronomy toolbar at3sizes. Actual published source pixels reused for a controlled volatile ready VIEW; no effort, new exposure, save or field procedure replay. Original source screenshots are invalid for toolbar contrast only.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/tests/fixtures/astronomy-station.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate((d) => astronomyUi.review(d), data);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const a = astronomyUi.state.active;
    const original = astronomyUi.tools.snapshot.bind(astronomyUi.tools),
      r = structuredClone(a.frames.primary);
    a.phase = 'primary';
    astronomyUi.arrive();
    astronomyUi.tools.snapshot = () => ({
      ...original(),
      window: { ...r.effort, ready: true, role: 'primary', image: r.image },
    });
  });
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const b = page.locator('[data-astronomy-open]');
    await b.waitFor({ state: 'visible' });
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    assert.ok(
      box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    const colors = await b.evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
    }));
    assert.deepEqual(colors, { background: 'rgb(239, 208, 121)', color: 'rgb(21, 37, 27)' });
    report.checks.push({ width, height, colors });
    await page.screenshot({ path: output + '/toolbar-' + width + '.png' });
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
