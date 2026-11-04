import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/cartography-career-20261103/geometry-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'cartography',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Controlled actual WebGL survey annotation positions, sight obstruction, original geometry mutation and complete lease disposal at source unit1.11; no movement, native save or source completion claim.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/cartography-presentation.html');
  await page.waitForFunction(() => window.ready);
  report.initial = await page.evaluate(() => surveyVisual.read());
  assert.deepEqual(
    report.initial.sights.map((s) => s.clear),
    [true, true]
  );
  assert.ok(Math.abs(report.initial.sights[0].rangeMeters - 14) < 0.001);
  await page.screenshot({ path: output + '/clear-controls.png' });
  await page.locator('#blocker').click();
  report.blocked = await page.evaluate(() => surveyVisual.read());
  assert.deepEqual(
    report.blocked.sights.map((s) => s.clear),
    [false, false]
  );
  await page.screenshot({ path: output + '/solid-blocker.png' });
  await page.locator('#blocker').click();
  report.mutation = await page.evaluate(() => {
    const v = surveyVisual,
      m = v.presentation.markers.a;
    m.position.x += 1 / v.runtime.METERS_PER_WORLD_UNIT;
    v.render();
    const r = v.read();
    m.position.x -= 1 / v.runtime.METERS_PER_WORLD_UNIT;
    v.render();
    return r;
  });
  assert.ok(Math.abs(report.mutation.sights[0].rangeMeters - 15) < 0.001);
  report.disposal = await page.evaluate(() => {
    const v = surveyVisual,
      before = v.presentation.budget;
    v.presentation.dispose();
    v.presentation.dispose();
    return {
      before,
      rootRemaining: !!v.runtime.scene.getObjectByName('Field course · cartography'),
      proxies: v.runtime.dynamicBuildingColliders.length,
    };
  });
  assert.equal(report.disposal.rootRemaining, false);
  assert.equal(report.disposal.proxies, 0);
  assert.equal(report.disposal.before.meshes, 12);
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
