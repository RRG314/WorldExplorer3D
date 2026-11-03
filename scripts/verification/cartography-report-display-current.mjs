import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = process.env.WE3D_CARTOGRAPHY_RECOVERY || '';
assert.match(
  source,
  /cartography-career-20261103\/world-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.cartography.completed).length, 3);
const output = 'output/verification/cartography-career-20261103/display-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'cartography',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Actual three saved source reports in native completion/reload and existing journey Journal readers at three sizes. Controlled presence only; no accepted survey or failed-save sequence replay.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/tests/fixtures/cartography-review.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate((data) => cartographyReview.import(data), data);
  const before = await page.evaluate(() => render_game_to_text());
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.equal(await page.evaluate(() => render_game_to_text()), before);
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
    await page.screenshot({ path: output + '/reloaded-completion-' + width + '.png' });
  }
  const access = JSON.parse(
    await fs.readFile(
      'output/verification/cartography-career-20261103/access-1793696455262/receipt.json'
    )
  );
  assert.equal(access.ok, true);
  report.currentAccess = [];
  for (const row of access.readings) {
    await page.evaluate((reading) => cartographyReview.current(reading), row.reading);
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
      assert.match(
        await page.locator('.research-station-body').innerText(),
        /virtual interior is available/
      );
      await page.screenshot({ path: `${output}/current-access-${row.variantId}-${width}.png` });
    }
    report.currentAccess.push({ variantId: row.variantId, entrySupport: row.reading.entrySupport });
  }
  await page.goto('http://127.0.0.1:4192/tests/fixtures/journey-journal.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (data) => {
    await journalTest.ctx.discoveryProfileStore.importData(data);
    await journalTest.open('journal');
  }, data);
  const plates = page.locator('.cartography-report');
  assert.equal(await plates.count(), 3);
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const p = plates.nth(i);
    await p.locator(':scope > summary').click();
    const text = await p.innerText();
    assert.doesNotMatch(text, /undefined|NaN|Infinity/);
    assert.match(text, /Mapped elevation was not established/);
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
      await page.screenshot({ path: `${output}/plate-${i}-map-${width}.png` });
      await p.locator('.cartography-reading').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/plate-${i}-reading-${width}.png` });
    }
  }
  assert.equal(report.plates.filter((s) => s.includes('Reciprocal comparison')).length, 1);
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
