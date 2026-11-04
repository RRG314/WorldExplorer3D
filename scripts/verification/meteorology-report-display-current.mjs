import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_METEO_RECOVERY || '');
assert.match(
  source,
  /meteorology-career-20261103\/world-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.meteorology.completed).length, 3);
const output = 'output/verification/meteorology-career-20261103/display-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'meteorology',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only final actual-source report projections and human date/forecast/chart/paired-table readability at3sizes in the existing native UI and journey Journal fixtures. Actual3source reports, real readers; no instrument, clock, field journey or native failure/reload sequence replay.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/tests/fixtures/meteorology-station.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate((data) => weatherUi.review(data), data);
  assert.equal(await page.locator('.meteorology-report').evaluate((el) => el.open), true);
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.research-station h2').scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: output + '/completion-' + width + '.png' });
  }
  await page.goto('http://127.0.0.1:4192/tests/fixtures/journey-journal.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (data) => {
    await journalTest.ctx.discoveryProfileStore.importData(data);
    await journalTest.open('journal');
  }, data);
  const plates = page.locator('.meteorology-report');
  assert.equal(await plates.count(), 3);
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const p = plates.nth(i);
    await p.locator(':scope > summary').click();
    const text = await p.innerText();
    assert.equal(/undefined|NaN|Infinity/.test(text), false);
    assert.equal(await p.locator('svg').count(), 1);
    assert.ok(text.includes('Fictional replay reference'));
    assert.equal(
      /\d{4}-\d{2}-\d{2}T\d{2}/.test(text),
      false,
      'Presentation uses readable UTC times; saved source timestamps remain exact'
    );
    report.plates.push(text);
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      await p.locator('svg').scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/plate-' + i + '-chart-' + width + '.png' });
      for (let n = 0; n < 2; n++) {
        const table = p.locator('table').nth(n);
        await table.scrollIntoViewIfNeeded();
        assert.ok(
          await table.evaluate(
            (el) =>
              el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width + 1
          )
        );
        await page.screenshot({
          path: output + '/plate-' + i + '-table-' + n + '-' + width + '.png',
        });
      }
    }
  }
  assert.equal(
    report.plates.filter((s) => s.includes('At least one saved prediction missed')).length,
    1
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
