import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/oceanography-career-20261102/display-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'oceanography',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only the changed native protocol label and recovered-instrument display at three sizes. Controlled UI snapshot; no cast, voyage, profile-write or repeated full station acceptance claim.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/oceanography-station.html'
  );
  await page.waitForFunction(() => window.oceanUi);
  await page.getByRole('button', { name: 'Review both station charts', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Matched downcast protocol', exact: true })
    .selectOption('virtual-ctd-three-depths-v1');
  report.sizes = [];
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const select = page.getByRole('combobox', { name: 'Matched downcast protocol', exact: true });
    await select.scrollIntoViewIfNeeded();
    assert.equal(await select.locator('option:checked').innerText(), '2 / 4 / 6 m downcast');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
  }
  await page.evaluate(async () => {
    const { createOceanographyControls } = await import('/app/js/campaign/oceanography-ui.js');
    const s = {
      visible: true,
      ready: true,
      phase: 'casts',
      study: { label: 'Across the Water Column' },
      active: { runId: 'display-only', stationIndex: 1, pings: [], casts: {} },
      cast: {
        ready: true,
        activeSeconds: 10.2,
        depthMeters: -3.28,
        reason: 'Cast recovered and ready to save',
      },
      message: 'Downcast started. Remain at the instrument until it is recovered.',
    };
    const controls = createOceanographyControls({ api: () => ({}), prefix: 'display-only' });
    document.querySelector('#deck').replaceChildren(controls.node);
    controls.render(s);
  });
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const button = page.getByRole('button', { name: 'File recovered cast', exact: true });
    await button.scrollIntoViewIfNeeded();
    assert.equal(await button.isEnabled(), true);
    const text = await page.locator('#deck').innerText();
    assert.ok(text.includes('Instrument recovered'));
    assert.ok(text.includes('Recovered cast is ready to file.'));
    assert.equal(text.includes('-3.28'), false);
    assert.equal(text.includes('Downcast started'), false);
    const box = await button.boundingBox(),
      footer = await page.locator('.hudUtilityActions').boundingBox();
    assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= footer.y + 0.5);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/recovered-${width}.png` });
    report.sizes.push({ width, height, reachable: true });
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
