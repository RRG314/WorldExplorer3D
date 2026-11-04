import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/marine-biology-career-20261102/view-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'marine-biology',
    maximumDurationMs: 120000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Controlled camera/visibility boundary with actual licensed animated dolphin and barramundi GLBs. No source habitat/population admission, physical career procedure, persistence or release claim.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/marine-observation-view.html'
  );
  await page.waitForFunction(() => window.ready, {}, { timeout: 60000 });
  await page.waitForFunction(() => marineViewTest.frames > 5);
  const read = () => page.evaluate(() => marineViewTest.read());
  let records = await read();
  assert.equal(records.length, 1);
  assert.equal(records[0].speciesId, 'short_beaked_common_dolphin');
  assert.ok(records[0].diameterPixels >= 6);
  await page.screenshot({ path: output + '/licensed-dolphin-60m.png' });
  await page.evaluate(() => marineViewTest.placeDolphin(49));
  assert.equal((await read()).length, 0);
  await page.evaluate(() => marineViewTest.placeDolphin(50.5));
  assert.equal((await read()).length, 1);
  await page.evaluate(() => marineViewTest.setState('generated'));
  assert.equal((await read()).length, 0);
  await page.evaluate(() => marineViewTest.setState('licensed'));
  await page.evaluate(() => {
    marineViewTest.placeDolphin(60);
    marineViewTest.occlude(true);
  });
  assert.equal((await read()).length, 0);
  await page.screenshot({ path: output + '/blocked-by-geometry.png' });
  await page.evaluate(() => marineViewTest.occlude(false));
  await page.evaluate(() => marineViewTest.ownHull(true));
  assert.equal((await read()).length, 0);
  await page.evaluate(() => marineViewTest.ownHull(true, true));
  assert.equal((await read()).length, 1);
  await page.evaluate(() => marineViewTest.ownHull(false));
  await page.evaluate(() => marineViewTest.hud(true));
  assert.equal((await read()).length, 0);
  await page.evaluate(() => marineViewTest.hud(false));
  await page.evaluate(() => marineViewTest.showFish(10));
  records = await read();
  assert.equal(records.length, 1);
  assert.equal(records[0].speciesId, 'barramundi');
  assert.ok(records[0].distanceMeters >= 5);
  await page.screenshot({ path: output + '/licensed-barramundi-10m.png' });
  await page.evaluate(() => marineViewTest.showFish(4.9));
  assert.equal((await read()).length, 0);
  report.results = {
    dolphinMinimumMetres: 50,
    fishMinimumMetres: 5,
    licensedOnly: true,
    geometryBlocks: true,
    ownHullBlocks: true,
    transparentWindowAllows: true,
    hudBlocks: true,
    sourceAdmissionClaim: false,
  };
  report.dispose = await page.evaluate(() => marineViewTest.dispose());
  assert.deepEqual(report.dispose, { dolphinDetached: true, fishDetached: true });
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
