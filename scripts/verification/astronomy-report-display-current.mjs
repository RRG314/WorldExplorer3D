import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_ASTRO_RECOVERY || '');
assert.match(
  source,
  /astronomy-career-20261103\/world-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.astronomy.completed).length, 3);
const output = 'output/verification/astronomy-career-20261103/display-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'astronomy',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only final actual-source report projections and catalog/time/pixels/counts-table readability at3sizes in the existing native UI and journey Journal fixtures. Actual3source reports, real readers; only affected view/source-link contrast, no instrument, clock, field journey or native failure/reload sequence replay.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/tests/fixtures/astronomy-station.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate((data) => astronomyUi.review(data), data);
  assert.equal(await page.locator('.astronomy-report').evaluate((el) => el.open), true);
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
  const plates = page.locator('.astronomy-report');
  assert.equal(await plates.count(), 3);
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const p = plates.nth(i);
    await p.locator(':scope > summary').click();
    await p.getByText('Reproducibility record', { exact: true }).click();
    const text = await p.innerText();
    assert.equal(/undefined|NaN|Infinity/.test(text), false);
    assert.equal(await p.locator('svg').count(), 3);
    assert.ok(text.includes('Catalog J2000 coordinates'));
    assert.ok(text.includes('not calibrated photometry'));
    assert.ok(text.includes('Catalog checksum'));
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
      await p.locator('svg').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/plate-' + i + '-chart-' + width + '.png' });
      const table = p.locator('table');
      await table.scrollIntoViewIfNeeded();
      assert.ok(
        await table.evaluate(
          (el) =>
            el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width + 1
        )
      );
      await page.screenshot({ path: output + '/plate-' + i + '-table-' + width + '.png' });
    }
  }
  assert.equal(report.plates.filter((s) => s.includes('Sky centroid shift')).length, 1);
  assert.ok(report.plates.some((s) => s.includes('CLIPPED')));
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
