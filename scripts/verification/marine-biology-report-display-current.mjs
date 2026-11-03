import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_MARINE_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/marine-biology-career-20261102') + path.sep)
);
const data = JSON.parse(await fs.readFile(source));
const output = `output/verification/marine-biology-career-20261102/display-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'marine-biology',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Changed Marine report text/table headings only, using three actual source reports in the existing native journey Journal fixture with real memory reader. No gameplay, IndexedDB, or new profile acceptance claim.';
  report.source = source;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/journey-journal.html'
  );
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (data) => {
    await journalTest.ctx.discoveryProfileStore.importData(data);
    await journalTest.open('journal');
  }, data);
  const plates = page.locator('.marine-biology-report');
  assert.equal(await plates.count(), 3);
  report.plates = [];
  for (let i = 0; i < (process.env.WE3D_MARINE_DISPLAY_SCOPE ? 1 : 3); i++) {
    const p = plates.nth(i);
    await p.locator(':scope > summary').click();
    report.plates.push(await p.innerText());
    assert.equal(await p.locator('svg').count(), 2);
    for (const [width, height] of process.env.WE3D_MARINE_DISPLAY_SCOPE
      ? [[390, 844]]
      : [
          [1280, 800],
          [390, 844],
          [844, 390],
        ]) {
      await page.setViewportSize({ width, height });
      await p.locator('table').first().scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      if (process.env.WE3D_MARINE_DISPLAY_SCOPE)
        assert.ok(
          await p
            .locator('table')
            .first()
            .evaluate(
              (el) =>
                el.getBoundingClientRect().width <=
                el.parentElement.getBoundingClientRect().width + 1
            )
        );
      await page.screenshot({ path: `${output}/plate-${i}-${width}.png` });
    }
  }
  assert.ok(
    report.plates.filter((s) => s.includes('other recorded none')).length ===
      (process.env.WE3D_MARINE_DISPLAY_SCOPE ? 1 : 2)
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
