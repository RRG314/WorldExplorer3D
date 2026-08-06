import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'space-flight-controls');
await fs.mkdir(outputDir, { recursive: true });

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4230, 4231, 4232, 4233]
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?space-flight-controls=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx?.startSpaceFlightToMoon === 'function') return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Space runtime initialization timed out.');
  });

  const report = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const runtime = await import('/app/js/space/runtime.js?v=13');
    if (!ctx.getEnv?.()) ctx.commitEnvironment?.(ctx.ENV.EARTH, { source: 'space-control-test' });
    if (!await ctx.startSpaceFlightToMoon()) throw new Error('Space flight did not start');
    await new Promise((resolve) => setTimeout(resolve, 800));

    cancelAnimationFrame(ctx.spaceFlight.animationId);
    ctx.spaceFlight.animationId = null;
    ctx.spaceFlight.active = false;
    ctx.spaceFlight.mode = 'flying';
    ctx.spaceFlight.speed = 0;
    ctx.spaceFlight._frameScale = 1;
    ctx.spaceFlight.gravityVelocity?.set(0, 0, 0);

    const rocket = ctx.spaceFlight.rocket;
    const camera = ctx.spaceFlight.camera;
    const localForward = new THREE.Vector3(0, 1, 0);
    const localRight = new THREE.Vector3(1, 0, 0);
    const localUp = new THREE.Vector3(0, 0, -1);
    const previousForward = new THREE.Vector3();
    const currentForward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const cameraRightBefore = new THREE.Vector3();
    const cameraUpBefore = new THREE.Vector3();
    const controlResponse = new THREE.Vector3();
    const previousCameraQuaternion = camera.quaternion.clone();
    let maximumForwardStep = 0;
    let maximumCameraStep = 0;
    let minimumBasisOrthogonality = 1;
    let minimumScreenRightAlignment = 1;
    let maximumScreenRightAlignment = -1;
    let minimumScreenUpAlignment = 1;
    let minimumDirectionalResponse = 1;
    let samples = 0;

    const step = (keys) => {
      ctx.spaceFlight.keys = keys;
      ctx.spaceFlight.gravityVelocity?.set(0, 0, 0);
      previousForward.copy(localForward).applyQuaternion(rocket.quaternion);
      const cameraBefore = camera.quaternion.clone();
      cameraRightBefore.set(1, 0, 0).applyQuaternion(cameraBefore).normalize();
      cameraUpBefore.set(0, 1, 0).applyQuaternion(cameraBefore).normalize();
      runtime.updateSpaceFlightPhysics();
      runtime.updateSpaceFlightCamera();
      camera.updateMatrixWorld(true);
      currentForward.copy(localForward).applyQuaternion(rocket.quaternion).normalize();
      right.copy(localRight).applyQuaternion(rocket.quaternion).normalize();
      up.copy(localUp).applyQuaternion(rocket.quaternion).normalize();
      cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      maximumForwardStep = Math.max(maximumForwardStep, previousForward.angleTo(currentForward));
      maximumCameraStep = Math.max(
        maximumCameraStep,
        2 * Math.acos(Math.min(1, Math.abs(cameraBefore.dot(camera.quaternion))))
      );
      minimumBasisOrthogonality = Math.min(
        minimumBasisOrthogonality,
        1 - Math.abs(currentForward.dot(right)),
        1 - Math.abs(currentForward.dot(up)),
        1 - Math.abs(right.dot(up))
      );
      minimumScreenRightAlignment = Math.min(minimumScreenRightAlignment, cameraRight.dot(right));
      maximumScreenRightAlignment = Math.max(maximumScreenRightAlignment, cameraRight.dot(right));
      minimumScreenUpAlignment = Math.min(minimumScreenUpAlignment, cameraUp.dot(up));
      controlResponse.copy(currentForward).sub(previousForward).normalize();
      if (keys.arrowup && !keys.arrowleft && !keys.arrowright) {
        minimumDirectionalResponse = Math.min(minimumDirectionalResponse, controlResponse.dot(cameraUpBefore));
      } else if (keys.arrowdown && !keys.arrowleft && !keys.arrowright) {
        minimumDirectionalResponse = Math.min(minimumDirectionalResponse, -controlResponse.dot(cameraUpBefore));
      } else if (keys.arrowleft && !keys.arrowup && !keys.arrowdown) {
        minimumDirectionalResponse = Math.min(minimumDirectionalResponse, -controlResponse.dot(cameraRightBefore));
      } else if (keys.arrowright && !keys.arrowup && !keys.arrowdown) {
        minimumDirectionalResponse = Math.min(minimumDirectionalResponse, controlResponse.dot(cameraRightBefore));
      }
      samples += 1;
    };

    // Cross every world axis repeatedly. Local pitch/yaw must remain stable
    // even when the chase camera is upside down relative to world Y.
    for (let index = 0; index < 440; index += 1) step({ arrowup: true });
    for (let index = 0; index < 400; index += 1) step({ arrowleft: true });
    for (let index = 0; index < 160; index += 1) step({ arrowdown: true });
    for (let index = 0; index < 160; index += 1) step({ arrowright: true });
    for (let index = 0; index < 520; index += 1) step({ arrowup: true, arrowright: true });

    for (let index = 0; index < 90; index += 1) {
      runtime.updateSpaceFlightCamera();
      camera.updateMatrixWorld(true);
    }
    const flightCameraDistance = camera.position.distanceTo(rocket.position);
    const cameraQuaternionContinuity = 2 * Math.acos(
      Math.min(1, Math.abs(previousCameraQuaternion.dot(camera.quaternion)))
    );
    ctx.spaceFlight.renderer?.render(ctx.spaceFlight.scene, camera);

    return {
      samples,
      maximumForwardStep,
      maximumCameraStep,
      minimumBasisOrthogonality,
      minimumScreenRightAlignment,
      maximumScreenRightAlignment,
      minimumScreenUpAlignment,
      minimumDirectionalResponse,
      flightCameraDistance,
      cameraQuaternionContinuity,
      quaternionLength: rocket.quaternion.length(),
      catalog: globalThis.getWorldExplorerRuntimeDiagnostics?.().spaceCatalog || null,
      canvasVisible: getComputedStyle(ctx.spaceFlight.canvas).display !== 'none'
    };
  });

  await page.screenshot({
    path: path.join(outputDir, 'multi-axis-flight.png'),
    fullPage: false
  });
  await fs.writeFile(
    path.join(outputDir, 'report.json'),
    JSON.stringify({ report, consoleErrors }, null, 2)
  );

  assert.equal(report.samples, 1680);
  assert.ok(Math.abs(report.quaternionLength - 1) < 1e-5, 'spacecraft quaternion drifted');
  assert.ok(report.maximumForwardStep <= 0.027, `spacecraft steering jumped ${report.maximumForwardStep} radians`);
  assert.ok(report.maximumCameraStep <= 0.16, `space camera flipped ${report.maximumCameraStep} radians`);
  assert.ok(report.minimumBasisOrthogonality >= 0.9999, 'spacecraft local axes lost orthogonality');
  assert.ok(report.minimumScreenUpAlignment > 0, 'spacecraft up became screen-down after an axis crossing');
  assert.ok(report.minimumDirectionalResponse >= 0.65, 'an arrow key reversed its visible steering direction');
  assert.ok(
    report.flightCameraDistance >= 44 && report.flightCameraDistance <= 96,
    `world-up chase camera left its bounded follow envelope (${report.flightCameraDistance})`
  );
  assert.ok(report.canvasVisible, 'space flight canvas is hidden');
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
