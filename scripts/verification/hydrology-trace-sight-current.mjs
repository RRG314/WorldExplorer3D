import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/hydrology-career-20261103/trace-view-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'hydrology', maximumDurationMs: 60000 }),
  { page, report } = qa;
try {
  report.scope =
    'Only the failed source trace sight-line boundary, reconstructed at the observed source eye/float separation in the existing controlled scene. No field action/save or condition matrix replay.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/hydrology-presentation.html?flat=1'
  );
  await page.waitForFunction(() => window.ready);
  report.view = await page.evaluate(async () => {
    const v = hydroVisual,
      T = THREE;
    await v.setup('dry-return');
    v.start('a', 'trace');
    v.presentation.root.updateWorldMatrix(true, true);
    const f = v.presentation.floats[1].getWorldPosition(new T.Vector3()),
      c = v.runtime.camera;
    c.position.set(f.x + 0.4997, f.y + 1.2466, f.z + 3.2);
    c.lookAt(f);
    c.updateMatrixWorld(true);
    v.render();
    await new Promise((resolve) => setTimeout(resolve, 220));
    const { createFieldOpacitySampler } = await import('/app/js/campaign/field-opacity-sampler.js'),
      opacity = createFieldOpacitySampler(),
      ray = new T.Raycaster();
    ray.camera = c;
    ray.set(c.position, f.clone().sub(c.position).normalize());
    ray.far = c.position.distanceTo(f) + 0.1;
    const rows = [];
    for (const elapsed of [0, 1, 1.7246, 2.2]) {
      if (elapsed) v.step(elapsed - (rows.at(-1)?.elapsed || 0));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const target = v.presentation.floats[1].getWorldPosition(new T.Vector3());
      ray.set(c.position, target.clone().sub(c.position).normalize());
      ray.far = c.position.distanceTo(target) + 0.1;
      const hit = ray.intersectObjects(v.runtime.scene.children, true).find((h) => {
        for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
        return opacity.accepts(h);
      });
      rows.push({
        elapsed,
        clear: v.view(),
        hit: hit?.object.name,
        geometry: hit?.object.geometry?.type,
        position: hit?.object.getWorldPosition(new T.Vector3()),
        target: v.presentation.floats[1].name,
      });
    }
    opacity.dispose();
    const feet = v.feet();
    return {
      rows,
      from: { ...c.position },
      to: { ...f },
      supportCount: feet.length,
      maximumFootGap: Math.max(...feet.map((p) => Math.abs(p.actualY - p.groundY))),
    };
  });
  await page.screenshot({ path: output + '/source-eye-separation.png' });
  if (process.env.WE3D_DIAGNOSE !== '1') {
    for (const row of report.view.rows) assert.equal(row.clear, true, JSON.stringify(row));
    assert.ok(report.view.maximumFootGap < 1e-5);
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
