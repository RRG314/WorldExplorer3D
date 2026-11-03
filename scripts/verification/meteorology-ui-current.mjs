import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/meteorology-career-20261103/station-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'meteorology',
    maximumDurationMs: 180000,
  }),
  { page, report } = qa;
const recovered = process.env.WE3D_METEO_NATIVE_RECOVERY
  ? JSON.parse(await fs.readFile(process.env.WE3D_METEO_NATIVE_RECOVERY))
  : null;
if (recovered) {
  assert.match(
    process.env.WE3D_METEO_NATIVE_RECOVERY,
    /meteorology-career-20261103\/station-\d+\/qa-native-failed-backup\.json$/
  );
  assert.equal(recovered.profile.researchCareers.meteorology.active.phase, 'deploy');
  report.reusedSource = process.env.WE3D_METEO_NATIVE_RECOVERY;
}
const button = (name) => page.getByRole('button', { name, exact: true });
async function state() {
  return page.evaluate(() => weatherUi.state);
}
async function submit(name) {
  const before = (await state()).revision;
  await button(name).click();
  await page.waitForFunction(
    (n) =>
      weatherUi.state.revision > n ||
      [...document.querySelectorAll('.research-station-status')].some(
        (el) => el.textContent && !el.textContent.startsWith('Saving')
      ),
    before,
    { timeout: 8000 }
  );
  assert.ok(
    (await state()).revision > before,
    await page.locator('.research-station-status').innerText()
  );
}
async function arrive() {
  if (await page.locator('.research-station[open]').count()) await page.keyboard.press('Escape');
  await page.evaluate(() => {
    weatherUi.arrive();
    weatherUi.open();
  });
}
async function sizes(name, tag) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const b = button(name);
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    assert.ok(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: output + '/' + tag + '-' + width + '.png' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
async function measure(failFirst = false) {
  await arrive();
  await button('Deploy sensor and observe').click();
  await page.waitForFunction(() => weatherUi.snapshot().windowReady, {}, { timeout: 25000 });
  assert.equal(await page.evaluate(() => weatherUi.snapshot().paused), false);
  await page.locator('[data-weather-open]').click();
  if (failFirst) await sizes('Save matched reading', 'measured-reading');
  await page
    .getByRole('combobox', { name: 'What does the vane bearing mean?', exact: true })
    .selectOption('from-true-north');
  await page.getByRole('combobox', { name: 'Cup speed unit', exact: true }).selectOption('m/s');
  await page
    .getByRole('combobox', { name: 'Miniature replay sky cue', exact: true })
    .selectOption('patchy');
  if (failFirst) {
    const ready = await page.evaluate(() => weatherUi.tools.snapshot().window),
      revision = (await state()).revision;
    await page.evaluate(() => (weatherUi.failNext = true));
    await button('Save matched reading').click();
    await page.getByRole('status').filter({ hasText: 'Controlled save failure' }).waitFor();
    assert.equal((await state()).revision, revision);
    assert.deepEqual(await page.evaluate(() => weatherUi.tools.snapshot().window), ready);
    await page.screenshot({ path: output + '/failed-save-retained-reading.png' });
  }
  await submit('Save matched reading');
}
try {
  report.scope =
    'Actual native UI, real weather tools/recorder on normal fixture frames, canonical domain/profile transaction/IndexedDB. Controlled geometry and presence, not source-world gameplay. Finite one-case save failure/retry/A reload/forecast/report/reload with new body/primary actions at3sizes.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/meteorology-station.html');
  await page.waitForFunction(() => window.ready);
  if (recovered) await page.evaluate((data) => weatherUi.review(data), recovered);
  else {
    await sizes('Save source plan', 'source-check');
    await page
      .getByRole('combobox', { name: 'What is the existing weather source?', exact: true })
      .selectOption('forecast-model');
    await page
      .getByRole('combobox', { name: 'Age since the provider issued the data', exact: true })
      .selectOption('one-to-six-hours');
    await page
      .getByRole('combobox', { name: 'Comparison method', exact: true })
      .selectOption('explicit-simulated-replay');
    await submit('Save source plan');
  }
  await measure(true);
  const saved = (await state()).active.readings.baseline.a;
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.equal((await state()).active.phase, 'compare');
  assert.deepEqual((await state()).active.readings.baseline.a, saved);
  await measure();
  await arrive();
  await sizes('Save forecast & start replay', 'forecast');
  await page
    .getByRole('combobox', { name: 'Predicted miniature sky change', exact: true })
    .selectOption('similar');
  await submit('Save forecast & start replay');
  const forecast = (await state()).active.forecast;
  await measure();
  await measure();
  assert.deepEqual((await state()).active.forecast, forecast);
  await arrive();
  await sizes('Save forecast card', 'report');
  await page
    .getByRole('combobox', { name: 'How did the recorded forecast verify?', exact: true })
    .selectOption('within-all-bounds');
  await page
    .getByRole('combobox', { name: 'What does this verification establish?', exact: true })
    .selectOption('replay-not-public-forecast-validation');
  await page
    .getByRole('combobox', { name: 'Next investigation', exact: true })
    .selectOption('repeat-matched-time-and-independent-observations');
  await submit('Save forecast card');
  const complete = await state();
  assert.equal(complete.active.phase, 'complete');
  assert.equal(await page.locator('.meteorology-report').evaluate((el) => el.open), true);
  await sizes('Choose next study', 'complete');
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.deepEqual(await state(), complete);
  const data = await page.evaluate(() => weatherUi.store.exportData());
  assert.equal(data.events.filter((e) => e.metadata?.meteorologyReport).length, 1);
  report.result = {
    revision: complete.revision,
    capstones: 1,
    failedSaveRetainsReady: true,
    firstStationReload: true,
    forecastImmutable: true,
    completedReload: true,
  };
  await fs.writeFile(output + '/qa-native-backup.json', JSON.stringify(data) + '\n', {
    mode: 0o600,
  });
  await qa.succeed();
} catch (e) {
  try {
    await fs.writeFile(
      output + '/qa-native-failed-backup.json',
      JSON.stringify(await page.evaluate(() => weatherUi.store.exportData())) + '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
