import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source =
    'output/verification/botany-career-20261102/world-1793673730438/qa-fieldwork-backup.json',
  data = JSON.parse(await fs.readFile(source));
assert.equal(data.profile.researchCareers.botany.revision, 2);
const output = `output/verification/botany-career-20261102/station-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'botany', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Native Botany form and actual IDB failure/retry/reload boundary using accepted photo-A prefix; controlled presence and sensors. No repeated physical field procedure.';
  report.source = source;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/botany-station.html'
  );
  await page.waitForFunction(() => window.botanyCheck);
  await page.evaluate((data) => botanyCheck.initialize(data), data);
  await page.locator('[data-research-station]').click();
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390]
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('button[type=submit]').scrollIntoViewIfNeeded();
    const b = await page.locator('button[type=submit]').boundingBox();
    assert.ok(b.height >= 44 && b.y + b.height <= height && b.y >= 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/form-${width}.png` });
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => botanyCheck.globalEscapes), 0);
  assert.equal(await page.locator('#world').evaluate((el) => el === document.activeElement), true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('[data-research-station]').click();
  await page.locator('select[name=form]').selectOption('divided-fronds');
  await page.evaluate(() => {
    botanyCheck.failNextSave = true;
  });
  await page.getByRole('button', { name: 'Read sensors and save comparison', exact: true }).click();
  await page.locator('.research-station-status').filter({ hasText: 'could not save' }).waitFor();
  assert.equal(await page.evaluate(() => botanyCheck.state.revision), 2);
  assert.equal(await page.locator('select[name=form]').inputValue(), 'divided-fronds');
  assert.equal(
    await page
      .getByRole('button', { name: 'Read sensors and save comparison', exact: true })
      .isEnabled(),
    true
  );
  await page.getByRole('button', { name: 'Read sensors and save comparison', exact: true }).click();
  await page.waitForFunction(() => botanyCheck.state.revision === 3);
  await page.reload();
  await page.waitForFunction(() => botanyCheck?.ready);
  assert.equal(await page.evaluate(() => botanyCheck.state.active.plantIndex), 1);
  assert.equal(await page.evaluate(() => Object.keys(botanyCheck.state.active.captures).length), 1);
  report.checks = [
    'Failed save keeps original photo/prefix and form choice; retry advances exactly once; actual IDB reload retains result',
    'Primary action reachable at three sizes; Escape remains in station and restores world focus'
  ];
  report.ok = true;
  await fs.writeFile(output + '/receipt.json', JSON.stringify(report, null, 2));
  console.log('PASS ' + output);
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
