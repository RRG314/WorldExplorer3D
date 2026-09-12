import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeKernel } from '../app/js/runtime/kernel.js';
import { createCoreRenderSystem } from '../app/js/runtime/core-frame-systems.js';

for (const useComposer of [false, true]) {
  test(`city drawing stops at the menu and resumes on entry (${useComposer ? 'composer' : 'direct'})`, () => {
    const draws = [];
    let measurements = 0;
    const app = {
      gameStarted: false, scene: {}, camera: {},
      renderer: { render: (scene, camera) => {
        assert.equal(scene, app.scene);
        assert.equal(camera, app.camera);
        draws.push('direct');
      } },
      composer: { render: () => draws.push('composer') },
      recordPerfRendererInfo: () => measurements++
    };
    const kernel = createRuntimeKernel();
    kernel.registerSystem(createCoreRenderSystem(app, () => useComposer));
    kernel.runFrame(0);
    assert.equal(draws.length, 0);
    app.gameStarted = true;
    kernel.runFrame(16);
    app.gameStarted = false;
    for (let frame = 2; frame < 120; frame++) kernel.runFrame(frame * 16);
    assert.equal(draws.length, 1, 'the retained city must not draw behind the globe');
    assert.equal(measurements, 1);
    app.gameStarted = true;
    kernel.runFrame(120 * 16);
    assert.deepEqual(draws, Array(2).fill(useComposer ? 'composer' : 'direct'));
    assert.equal(measurements, 2);
    assert.equal(kernel.snapshot().phases.render[0].failures, 0);
    kernel.dispose();
  });
}
