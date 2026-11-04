import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_OCEAN_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/oceanography-career-20261102') + path.sep)
);
const data = JSON.parse(await fs.readFile(source)),
  reports = data.events
    .filter((e) => e.metadata?.oceanographyReport)
    .map((e) => e.metadata.oceanographyReport);
assert.equal(reports.length, 3);
const output = `output/verification/oceanography-career-20261102/transects-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'oceanography',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only affected lower transect/geometry-uncertainty presentation, using the three actual source reports in the existing native Journal fixture. Controlled DOM composition; no source navigation, persistence, badge or completed-study replay.';
  report.source = source;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/journey-journal.html'
  );
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (reports) => {
    await journalTest.open('journal');
    const { oceanographyReportMarkup } = await import('/app/js/campaign/oceanography-report.js');
    document.querySelector('#discoveryJournalList').innerHTML = reports
      .map((r) => `<article class="discoveryItem">${oceanographyReportMarkup(r)}</article>`)
      .join('');
  }, reports);
  report.views = [];
  const plates = page.locator('#discoveryJournalList .oceanography-report');
  for (let i = 0; i < 3; i++) {
    const plate = plates.nth(i);
    await plate.locator(':scope > summary').click();
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      const chart = plate.locator('.ocean-transect-chart');
      await chart.scrollIntoViewIfNeeded();
      const box = await chart.boundingBox();
      assert.ok(box.width > 100 && box.height <= height * 0.45 + 1);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      assert.equal(await chart.locator('circle').count(), 5);
      assert.ok((await chart.textContent()).includes('m'));
      assert.equal((await chart.locator('polyline').getAttribute('points')).includes('NaN'), false);
      await page.screenshot({ path: `${output}/transect-${i}-${width}.png` });
      report.views.push({ report: i, width, height, chart: box });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const details = plate.locator('.ocean-sonar-records');
    await details.locator('summary').click();
    await details.scrollIntoViewIfNeeded();
    assert.equal(await details.locator('li').count(), 3);
    const text = await details.innerText();
    for (const row of reports[i].pings) {
      assert.ok(text.includes(`±${row.uncertaintyMeters.toFixed(1)} m`));
      assert.ok(text.includes(`${row.distanceMeters.toFixed(1)} m range`));
    }
    await page.screenshot({ path: `${output}/uncertainty-${i}.png` });
    await details.locator('summary').click();
  }
  assert.deepEqual(report.errors, []);
  report.ok = true;
  await fs.writeFile(output + '/receipt.json', JSON.stringify(report, null, 2));
  console.log('PASS ' + output);
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
