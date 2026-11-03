import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/palaeontology-career-20261102/station-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 180000
  }),
  { page, report } = qa;
try {
  report.scope =
    'Actual native station UI and IndexedDB, controlled presence and JPEG fixtures. Each step performed once, affected layout resized at its boundary. Physical world/camera acceptance is separate.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/palaeontology-station.html?phase=preparation&open=1'
  );
  await page.locator('dialog[open]').waitFor();
  const layout = async (label) => {
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390]
    ]) {
      await page.setViewportSize({ width, height });
      const r = await page.locator('.research-station-actions button').first().boundingBox();
      assert.ok(r.height >= 44 && r.y >= 0 && r.y + r.height <= height, `${label} footer ${width}`);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      await page.screenshot({ path: `${output}/${label}-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  };
  const submit = async (name) => {
    const revision = await page.evaluate(() => JSON.parse(render_game_to_text()).revision);
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForFunction(
      (prior) => JSON.parse(render_game_to_text()).revision > prior,
      revision,
      { timeout: 5000 }
    );
  };
  await layout('preparation');
  for (const [zone, tool] of [
    ['outer-matrix', 'blunt-probe'],
    ['margin', 'soft-brush']
  ]) {
    await page.locator('select[name=zone]').selectOption(zone);
    await page.locator('select[name=tool]').selectOption(tool);
    await submit('Expose bounded patch');
  }
  await page.locator('select[name=support]').selectOption('padded-matrix-tray');
  await page.evaluate(() => (fossilCheck.failNextSave = true));
  await page.getByRole('button', { name: 'Support and label specimen', exact: true }).click();
  await page.locator('.research-station-status').filter({ hasText: 'could not save' }).waitFor();
  assert.equal(await page.locator('select[name=support]').inputValue(), 'padded-matrix-tray');
  await submit('Support and label specimen');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => fossilCheck.globalEscapes), 0);
  await page.reload();
  await page.locator('dialog[open]').waitFor();
  await submit('Lift supported specimen');
  await page.locator('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#world').evaluate((el) => el === document.activeElement), true);
  await page.locator('#open').click();
  await layout('comparison');
  assert.equal(
    await page
      .getByRole('button', { name: 'Save morphology comparison', exact: true })
      .isDisabled(),
    true
  );
  for (const method of ['structure', 'surface', 'sediment']) {
    const revision = await page.evaluate(() => JSON.parse(render_game_to_text()).revision);
    await page.locator(`[data-research-action=examine][data-method=${method}]`).click();
    await page.waitForFunction(
      (prior) => JSON.parse(render_game_to_text()).revision > prior,
      revision
    );
  }
  await page.locator('select[name=structure]').selectOption('coils-in-one-plane');
  await page.locator('select[name=surface]').selectOption('curved-ribs');
  await page.locator('select[name=classification]').selectOption('coiled-mollusc');
  await submit('Save morphology comparison');
  await page.locator('select[name=interpretation]').selectOption('marine-deposition');
  await page.locator('select[name=limitation]').selectOption('precise-depth-and-age-unknown');
  await submit('Save fossil report and museum plate');
  await layout('report');
  const saved = await page.evaluate(() => fossilCheck.store.exportData());
  assert.equal(saved.researchMedia.length, 2);
  assert.equal(saved.items.length, 1);
  assert.equal(saved.profile.researchCareers.palaeontology.active.phase, 'complete');
  report.checks.push(
    'single case UI: bounded exposure, failed support retry, actual reload, exact specimen, lab prerequisites and durable report',
    'preparation/comparison/report at desktop, portrait and short landscape: no horizontal overflow and visible 44px footer action',
    'Escape stays within the station; station change restores world focus'
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
