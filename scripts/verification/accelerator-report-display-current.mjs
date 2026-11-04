import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = process.env.WE3D_ACCELERATOR_RECOVERY;
assert.match(
  source || '',
  /accelerator-career-20261103\/(?:world|review)-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.accelerator.completed).length, 3);
const output = 'output/verification/accelerator-career-20261103/report-view-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'accelerator',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only the failed short-landscape chart fit, using the actual three completed source notebooks in the existing native Journal fixture. Controlled presentation; no repeated source walking, method, clock, save-failure, backup or completed-revisit claim.';
  report.source = source;
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('http://127.0.0.1:4192/tests/fixtures/journey-journal.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (data) => {
    await journalTest.ctx.discoveryProfileStore.importData(data);
    await journalTest.open('journal');
  }, data);
  const plates = page.locator('.accelerator-report');
  assert.equal(await plates.count(), 3);
  report.plots = [];
  for (let i = 0; i < 3; i++) {
    const plate = plates.nth(i);
    await plate.locator(':scope > summary').click();
    const plots = plate.locator('svg');
    assert.equal(await plots.count(), 3);
    for (let j = 0; j < 3; j++) {
      const plot = plots.nth(j);
      await plot.scrollIntoViewIfNeeded();
      const measured = await plot.evaluate((el) => {
        let p = el.parentElement;
        while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement;
        if (!p) throw Error('Journal needs a bounded scroller');
        const a = el.getBoundingClientRect(),
          b = p.getBoundingClientRect();
        return {
          plot: { top: a.top, bottom: a.bottom, height: a.height, width: a.width },
          scroller: { top: b.top, bottom: b.bottom, height: p.clientHeight },
          fontPixels:
            (Number(el.querySelector('[font-size]')?.getAttribute('font-size')) * a.height) /
            Number(el.getAttribute('viewBox').split(' ')[3]),
        };
      });
      assert.ok(measured.plot.height <= measured.scroller.height - 10);
      assert.ok(
        measured.plot.top >= measured.scroller.top - 1 &&
          measured.plot.bottom <= measured.scroller.bottom + 1
      );
      assert.ok(measured.fontPixels >= 13);
      report.plots.push({ report: i, plot: j, ...measured });
      await page.screenshot({ path: output + '/report-' + i + '-plot-' + j + '.png' });
    }
  }
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
