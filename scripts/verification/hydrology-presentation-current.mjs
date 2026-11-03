import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/hydrology-career-20261103/instrument-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'hydrology', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Actual Three geometry/ray optical paths and moving floats in a controlled supported slope scene. Controlled frame stepping/camera; no source gameplay, save, natural stream or calibrated turbidity claim.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/hydrology-presentation.html'
  );
  await page.waitForFunction(() => window.ready);
  report.studies = [];
  for (const id of ['campaign', 'dry-return', 'clear-water-rise']) {
    const result = await page.evaluate(async (id) => {
      const v = hydroVisual,
        budget = await v.setup(id),
        feet = v.feet(),
        results = [];
      for (const after of [false, true]) {
        v.condition(after);
        for (const station of ['a', 'b']) {
          v.start(station);
          const before = v.presentation.read();
          v.step(3);
          const reading = v.presentation.read();
          results.push({
            after,
            station,
            blocked: reading.paths.filter((p) => p.blocked).length,
            section: reading.section,
            progress: reading.lanes.map((l) => l.progress),
            moving: reading.lanes.every((l, i) => l.progress > before.lanes[i].progress),
          });
        }
      }
      v.face();
      v.render();
      return { id, budget, feet, results };
    }, id);
    assert.ok(result.feet.every((f) => Math.abs(f.actualY - f.groundY) < 0.001));
    assert.ok(result.results.every((r) => r.moving));
    assert.ok(result.budget.meshes < 100);
    report.studies.push(result);
    await page.screenshot({ path: `${output}/${id}.png` });
  }
  report.sight = await page.evaluate(async () => {
    const v = hydroVisual;
    await v.setup();
    v.start('a', 'trace');
    v.step(2.1);
    const clear = v.view();
    v.block();
    await new Promise((resolve) => setTimeout(resolve, 220));
    return { clear, blocked: v.view() };
  });
  assert.equal(report.sight.clear, true);
  assert.equal(report.sight.blocked, false);
  report.disposal = await page.evaluate(() => hydroVisual.dispose());
  assert.deepEqual(report.disposal, { attached: false, colliders: 0 });
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
