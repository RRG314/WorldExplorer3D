import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_HYDRO_RECOVERY || '');
assert.match(
  source,
  /\/hydrology-career-20261103\/world-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.hydrology.completed).length, 3);
const output = `output/verification/hydrology-career-20261103/display-${Date.now()}`;
const qa = await createFieldworkQaSession({
    output,
    careerId: 'hydrology',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
const reused = process.env.WE3D_HYDRO_REUSE_DISPLAY;
if (reused) {
  assert.equal(
    path.resolve(reused),
    path.resolve('output/verification/hydrology-career-20261103/display-1793689565290')
  );
  const previous = JSON.parse(await fs.readFile(path.join(reused, 'failed.json')));
  assert.equal(previous.source, source);
  for (const name of [
    'completion-1280.png',
    'completion-390.png',
    'completion-844.png',
    'plate-0-map-1280.png',
    'plate-0-flow-1280.png',
    'plate-0-map-390.png',
    'plate-0-flow-390.png',
  ])
    await fs.access(path.join(reused, name));
  report.reused = {
    directory: reused,
    scope:
      'Completed native view at three sizes and first Journal plate map/flow at1280/390. Changed tables are rechecked; all other unaccepted display cases continue.',
  };
}
try {
  report.scope =
    'Only the new Hydro maps, equal-flow plot labels and compact comparison tables at three sizes, projecting three actual source reports through the existing native journey Journal/memory reader. No field or IndexedDB sequence replay.';
  report.source = source;
  if (!reused) {
    await page.goto(
      (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
        '/tests/fixtures/hydrology-station.html'
    );
    await page.waitForFunction(() => window.ready);
    await page.evaluate((data) => hydroUi.review(data), data);
    assert.equal(
      await page.locator('.research-station[open] .hydrology-report').evaluate((el) => el.open),
      true
    );
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator('.research-station[open] h2').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/completion-${width}.png` });
    }
  }
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/journey-journal.html'
  );
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (data) => {
    await journalTest.ctx.discoveryProfileStore.importData(data);
    await journalTest.open('journal');
  }, data);
  const plates = page.locator('.hydrology-report');
  assert.equal(await plates.count(), 3);
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const p = plates.nth(i);
    await p.locator(':scope > summary').click();
    assert.equal(await p.locator('svg').count(), 2);
    report.plates.push(await p.innerText());
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
      if (!(reused && i === 0 && [1280, 390].includes(width))) {
        await p.locator('svg').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/plate-${i}-map-${width}.png` });
        await p.locator('svg').nth(1).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/plate-${i}-flow-${width}.png` });
      }
      const table = p.locator('table').first();
      await table.scrollIntoViewIfNeeded();
      assert.ok(
        await table.evaluate(
          (el) =>
            el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width + 1
        )
      );
      await page.screenshot({ path: `${output}/plate-${i}-table-${width}.png` });
    }
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
