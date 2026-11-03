import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/hydrology-career-20261103/instrument-delta-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'hydrology', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Changed actual channel/gate geometry reader and corrected visual fixture colour only. Reuses accepted float/optical/grounding/disposal matrix; no source gameplay claim.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/hydrology-presentation.html'
  );
  await page.waitForFunction(() => window.ready);
  report.geometry = await page.evaluate(() => {
    const v = hydroVisual;
    v.start('a');
    const surface = v.presentation.root.getObjectByName('Hydrology water surface'),
      gate = v.presentation.root.getObjectByName('Metre gate a finish'),
      width = () => {
        const r = v.presentation.read(),
          a = r.section.left,
          b = r.section.right;
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      };
    const before = width();
    surface.scale.z = 0.8;
    const changed = width();
    surface.scale.z = 1;
    gate.position.x += 0.2;
    const r = v.presentation.read(),
      lane = r.lanes[0],
      distance = Math.hypot(
        lane.end.x - lane.start.x,
        lane.end.y - lane.start.y,
        lane.end.z - lane.start.z
      );
    gate.position.x -= 0.2;
    v.face();
    v.render();
    return { before, changed, gateDistance: distance };
  });
  assert.ok(Math.abs(report.geometry.before - 0.9) < 1e-6);
  assert.ok(Math.abs(report.geometry.changed - 0.72) < 1e-6);
  assert.ok(Math.abs(report.geometry.gateDistance - 1.2) < 1e-6);
  await page.screenshot({ path: output + '/supported-reach.png' });
  for (const after of [false, true]) {
    await page.evaluate((after) => {
      const v = hydroVisual;
      v.condition(after);
      v.start('a');
      v.step(1);
      const p = v.qualified.points.a,
        c = v.runtime.camera;
      c.position.set(p.x, 1.3, p.z + 0.9);
      c.lookAt(p.x, 1, p.z - 0.15);
      c.updateMatrixWorld(true);
      v.render();
    }, after);
    await page.screenshot({ path: `${output}/optical-a-${after ? 'return' : 'baseline'}.png` });
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
