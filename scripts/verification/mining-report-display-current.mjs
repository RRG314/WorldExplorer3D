import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_MINING_RECOVERY || '');
assert.match(source, /mining-career-20261103\/world-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.mining.completed).length, 3);
const output = 'output/verification/mining-career-20261103/display-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'mining', maximumDurationMs: 90000 }),
  { page, report } = qa;
const sizes = [
  [1280, 800],
  [390, 844],
  [844, 390],
];
try {
  report.scope =
    'Only actual-source quarry report projections at three viewport sizes in the existing native UI and journey Journal fixtures. Controlled presentation/presence; no instrument clock, field method, carrier journey or accepted storage-failure sequence replay.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/tests/fixtures/mining-view.html?station=1');
  await page.waitForFunction(() => window.ready);
  await page.evaluate((data) => miningUi.review(data), data);
  report.coldCarrierProxy = await page.evaluate(() => {
    const p = miningUi.presentation,
      b = new THREE.Box3().setFromObject(p.cart),
      c = p.cartProxy;
    return Math.max(
      ...['x', 'y', 'z'].flatMap((axis) => [
        Math.abs(c['min' + axis.toUpperCase()] - b.min[axis]),
        Math.abs(c['max' + axis.toUpperCase()] - b.max[axis]),
      ])
    );
  });
  assert.ok(
    report.coldCarrierProxy < 1e-9,
    'Cold restored carrier collision bounds follow its real receiving-pan pose'
  );
  assert.equal(await page.locator('.mining-report').evaluate((el) => el.open), true);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.locator('.research-station h2').scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: output + '/completion-' + width + '.png' });
  }
  await page.goto('http://127.0.0.1:4192/tests/fixtures/journey-journal.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (data) => {
    await journalTest.ctx.discoveryProfileStore.importData(data);
    await journalTest.open('journal');
  }, data);
  const plates = page.locator('.mining-report');
  assert.equal(await plates.count(), 3);
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const plate = plates.nth(i);
    await plate.locator(':scope > summary').click();
    await plate.getByText('Original evidence and settings', { exact: true }).click();
    const text = await plate.innerText();
    assert.doesNotMatch(text, /undefined|NaN|Infinity/);
    assert.match(text, /15 original assay readings/);
    assert.match(text, /Probing does not remove stock/);
    assert.match(text, /Every loss remains in a named retained fraction/);
    assert.equal(await plate.locator('svg').count(), 1);
    report.plates.push(text);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      await plate.locator('svg').scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/plate-' + i + '-ledger-' + width + '.png' });
      const table = plate.locator('table').first();
      await table.scrollIntoViewIfNeeded();
      assert.ok(
        await table.evaluate(
          (el) => el.parentElement.getBoundingClientRect().right <= innerWidth + 1
        )
      );
      await page.screenshot({ path: output + '/plate-' + i + '-assays-' + width + '.png' });
    }
  }
  assert.ok(report.plates.some((t) => t.includes('delivered 20.000 kg')));
  assert.ok(report.plates.some((t) => t.includes('delivered 40.000 kg')));
  assert.ok(report.plates.some((t) => t.includes('delivered 60.000 kg')));
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
