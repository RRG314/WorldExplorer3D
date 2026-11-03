import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/wildlife-career-20261102/station-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'wildlife', maximumDurationMs: 120000 }),
  { page, report } = qa;
try {
  report.scope =
    'Native station UI and actual IndexedDB with controlled presence and effort fixtures. One case, affected boundaries resized; physical observations are separate source evidence.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/wildlife-station.html'
  );
  await page.waitForFunction(() => window.wildlifeCheck);
  const layout = async (label, selector) => {
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390]
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator(selector).scrollIntoViewIfNeeded();
      const b = await page.locator(selector).boundingBox();
      assert.ok(
        b.height >= 44 && b.y >= 0 && b.y + b.height <= height,
        `${label} visible action ${width}`
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      await page.screenshot({ path: `${output}/${label}-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  };
  const submit = async (name) => {
    const old = await page.evaluate(() => wildlifeCheck.state.revision);
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForFunction((old) => wildlifeCheck.state.revision > old, old, { timeout: 3000 });
  };
  await layout('instruments', '[data-wildlife-tool=record]');
  await page.evaluate(() => (wildlifeCheck.failNextSave = true));
  await page.getByRole('button', { name: 'File measured checklist', exact: true }).click();
  await page
    .locator('.wildlife-instruments [role=status]')
    .filter({ hasText: 'could not save' })
    .waitFor();
  assert.equal(await page.evaluate(() => wildlifeCheck.effort.complete), true);
  assert.equal(await page.evaluate(() => wildlifeCheck.state.revision), 3);
  // Frozen fixture remains available after failure, just as the real instrument does.
  await submit('File measured checklist');
  await page.reload();
  await page.waitForFunction(() => window.wildlifeCheck);
  assert.equal(await page.evaluate(() => wildlifeCheck.state.active.habitatIndex), 1);
  assert.equal(
    await page.evaluate(() => wildlifeCheck.state.active.surveys.a.observations[0].taxon),
    'white-tailed-deer'
  );
  await page.getByRole('button', { name: 'Restart observation', exact: true }).click();
  await submit('File measured checklist');
  await page.locator('[data-research-station]').click();
  await layout('review', '.research-station-actions button');
  await page.locator('select[name=effortComparison]').selectOption('matched');
  for (const [id, taxon] of [
    ['a', 'white-tailed-deer'],
    ['b', 'woodland-fox']
  ]) {
    await page.locator(`select[name=taxon-${id}]`).selectOption(taxon);
    await page.locator(`select[name=confidence-${id}]`).selectOption('confident');
  }
  await submit('Save evidence review');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => wildlifeCheck.globalEscapes), 0);
  assert.equal(await page.locator('#world').evaluate((el) => el === document.activeElement), true);
  await page.locator('[data-research-station]').click();
  for (const [name, value] of Object.entries({
    coverContrast: 'wooded-versus-open',
    interpretation: 'paired-observations-only',
    limitation: 'short-pair-not-population',
    followUp: 'repeat-same-method-other-time'
  }))
    await page.locator(`select[name=${name}]`).selectOption(value);
  await submit('Save paired habitat report');
  await layout('report', '.research-station-actions button:first-child');
  await page.reload();
  await page.waitForFunction(() => window.wildlifeCheck);
  assert.equal(await page.evaluate(() => wildlifeCheck.state.active.phase), 'complete');
  const data = await page.evaluate(() => wildlifeCheck.store.exportData());
  assert.equal(data.events.filter((row) => row.metadata?.wildlifeReport).length, 1);
  assert.equal(data.items.length, 0);
  report.checks.push(
    'Failed checklist save retains frozen result; retry advances exactly once; actual IndexedDB reload retains A then the final report',
    'Review and report actions plus field instruments remain at least44px and reachable across three sizes',
    'Escape stays within native station and returns world focus'
  );
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
