import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/meteorology-career-20261103/view-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'meteorology',
    maximumDurationMs: 60000,
  });
try {
  qa.report.scope =
    'Changed instrument label spacing/framing only, reusing accepted actual rotor/vane/sky/shelter/support/disposal matrix; no method/save/source replay.';
  await qa.page.goto('http://127.0.0.1:4192/tests/fixtures/meteorology-presentation.html');
  await qa.page.waitForFunction(() => window.ready);
  for (const id of ['a', 'b']) {
    await qa.page.evaluate((id) => {
      const v = weatherVisual,
        p = v.qualified.points[id],
        u = v.qualified.metersPerUnit,
        c = v.runtime.camera;
      c.position.set(p.x + 2 / u, p.y + 2.6 / u, p.z + 3.5 / u);
      c.lookAt(p.x + 0.4 / u, p.y + 1.35 / u, p.z);
      c.updateMatrixWorld(true);
      v.render();
    }, id);
    await qa.page.screenshot({ path: output + '/station-' + id + '.png' });
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
