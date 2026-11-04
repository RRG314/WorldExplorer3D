import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source =
    'output/verification/pilot-career-20261103/review-1793741706007/qa-fieldwork-backup.json',
  data = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/pilot-career-20261103/report-view-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'pilot', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Only affected Journal disclosure refresh and actual completed-source report display. Current native shared Journal/real reader/whole actual backup. No repeated drive, custody, quota, Profile or backup matrix.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/tests/fixtures/journey-journal.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (b) => {
    await journalTest.ctx.discoveryProfileStore.importData(b);
    await journalTest.open('journal');
  }, data);
  assert.equal(await page.locator('.pilot-delivery-report').count(), 1);
  assert.equal(await page.locator('.workspace-design-report').count(), 3);
  const plate = page.locator('.pilot-delivery-report');
  await plate.locator('summary').click();
  const disclosureReceipt = process.env.WE3D_PILOT_DISCLOSURE_RECEIPT;
  if (disclosureReceipt) {
    const prior = JSON.parse(await fs.readFile(disclosureReceipt));
    assert.equal(prior.source, source);
    assert.deepEqual(prior.refresh, {
      sameDom: true,
      open: true,
      keyboardFocus: true,
      newRecordRefresh: true,
    });
    report.reusedDisclosure = disclosureReceipt;
  } else
    await page.evaluate(async () => {
      const e = document.querySelector('.pilot-delivery-report');
      window.__samePlate = e;
      e.querySelector('summary').focus();
      await journalTest.refresh();
      if (
        e !== document.querySelector('.pilot-delivery-report') ||
        !e.open ||
        document.activeElement !== e.querySelector('summary')
      )
        throw Error('Unchanged refresh must preserve the actual reader DOM and keyboard focus.');
      const id = e.closest('[data-journal-record]').dataset.journalRecord;
      const event = await journalTest.ctx.discoveryProfileStore.getEventsById([id]);
      await journalTest.ctx.discoveryProfileStore.recordExplorerEvent({
        ...event[0],
        eventId: 'private:journal-refresh-boundary',
        name: 'Separate verification refresh record',
        metadata: {},
      });
      await journalTest.refresh();
      const updated = document.querySelector('.pilot-delivery-report');
      if (!updated.open || document.activeElement !== updated.querySelector('summary'))
        throw Error('Changed records must preserve the opened report and keyboard focus.');
    });
  report.refresh = { sameDom: true, open: true, keyboardFocus: true, newRecordRefresh: true };
  report.views = [];
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const svg = plate.locator('svg');
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    assert.ok(box?.width > 100 && box?.height > 50);
    assert.ok(box.height <= height * 0.38 + 1);
    assert.equal(await plate.evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
    assert.doesNotMatch(await plate.innerText(), /NaN|undefined|Infinity/);
    report.views.push({ width, height, plot: box });
    await page.screenshot({ path: output + '/report-' + width + '.png' });
  }
  await page.evaluate(async () => {
    journalTest.fail(true);
    await journalTest.refresh();
  });
  assert.equal(await page.locator('[data-journey-retry]').count(), 1);
  await page.evaluate(async () => {
    journalTest.fail(false);
    await journalTest.refresh();
  });
  assert.equal(await plate.count(), 1);
  assert.equal(await page.locator('[data-journey-retry]').count(), 0);
  report.refresh.errorRetry = true;
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
