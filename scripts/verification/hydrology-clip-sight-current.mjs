import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/hydrology-career-20261103/clip-view-${Date.now()}`;
const qa = await createFieldworkQaSession({
    output,
    careerId: 'hydrology',
    maximumDurationMs: 60000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only the source-proven near-plane visibility boundary: an opaque object at the observed first-person head distance is clipped; the same object beyond the plane blocks observation. Controlled actual WebGL/camera geometry, no field actions or accepted protocol replay.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/hydrology-presentation.html?flat=1'
  );
  await page.waitForFunction(() => window.ready);
  report.clipping = await page.evaluate(async () => {
    const v = hydroVisual,
      T = THREE;
    v.start('a', 'trace');
    const target = v.presentation.floats[1].getWorldPosition(new T.Vector3()),
      camera = v.runtime.camera;
    camera.position.set(target.x + 0.4, target.y + 1.24, target.z + 3.2);
    camera.near = 0.5;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    const direction = target.clone().sub(camera.position).normalize(),
      blocker = new T.Mesh(
        new T.BoxGeometry(0.08, 0.08, 0.08),
        new T.MeshStandardMaterial({ color: 0xdd5533 })
      );
    blocker.name = 'Controlled opaque clipping witness';
    v.runtime.scene.add(blocker);
    async function sight(distance) {
      blocker.position.copy(camera.position).addScaledVector(direction, distance);
      blocker.updateMatrixWorld(true);
      v.render();
      await new Promise((resolve) => setTimeout(resolve, 220));
      return v.view();
    }
    const clipped = await sight(0.21368),
      visibleBlocked = await sight(0.8);
    blocker.visible = false;
    v.render();
    await new Promise((resolve) => setTimeout(resolve, 220));
    const restored = v.view();
    blocker.geometry.dispose();
    blocker.material.dispose();
    v.runtime.scene.remove(blocker);
    return { near: camera.near, clipped, visibleBlocked, restored };
  });
  assert.deepEqual(report.clipping, {
    near: 0.5,
    clipped: true,
    visibleBlocked: false,
    restored: true,
  });
  await page.screenshot({ path: output + '/clip-correct-observation.png' });
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
