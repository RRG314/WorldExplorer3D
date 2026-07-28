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
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return typeof ctx?.startSpaceFlightToMoon === 'function';
  }, { timeout: 120000 });

  const report = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const runtime = await import('/app/js/space/runtime.js?v=9');
    if (!ctx.startSpaceFlightToMoon()) throw new Error('Space flight did not start');
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
    const previousCameraQuaternion = camera.quaternion.clone();
    let maximumForwardStep = 0;
    let maximumCameraStep = 0;
    let minimumBasisOrthogonality = 1;
    let minimumCameraUpAlignment = 1;
    let samples = 0;

    const step = (keys) => {
      ctx.spaceFlight.keys = keys;
      ctx.spaceFlight.gravityVelocity?.set(0, 0, 0);
      previousForward.copy(localForward).applyQuaternion(rocket.quaternion);
      const cameraBefore = camera.quaternion.clone();
      runtime.updateSpaceFlightPhysics();
      runtime.updateSpaceFlightCamera();
      camera.updateMatrixWorld(true);
      currentForward.copy(localForward).applyQuaternion(rocket.quaternion).normalize();
      right.copy(localRight).applyQuaternion(rocket.quaternion).normalize();
      up.copy(localUp).applyQuaternion(rocket.quaternion).normalize();
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
      minimumCameraUpAlignment = Math.min(
        minimumCameraUpAlignment,
        camera.up.clone().normalize().dot(up)
      );
      samples += 1;
    };

    // Cross every world axis repeatedly. Local pitch/yaw must remain stable
    // even when the chase camera is upside down relative to world Y.
    for (let index = 0; index < 440; index += 1) step({ arrowup: true });
    for (let index = 0; index < 400; index += 1) step({ arrowleft: true });
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
      minimumCameraUpAlignment,
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

  assert.equal(report.samples, 1360);
  assert.ok(Math.abs(report.quaternionLength - 1) < 1e-5, 'spacecraft quaternion drifted');
  assert.ok(report.maximumForwardStep <= 0.027, `spacecraft steering jumped ${report.maximumForwardStep} radians`);
  assert.ok(report.maximumCameraStep <= 0.16, `space camera flipped ${report.maximumCameraStep} radians`);
  assert.ok(report.minimumBasisOrthogonality >= 0.9999, 'spacecraft local axes lost orthogonality');
  assert.ok(report.minimumCameraUpAlignment >= 0.9999, 'camera up stopped following spacecraft local up');
  assert.ok(
    report.flightCameraDistance >= 72 && report.flightCameraDistance <= 77,
    `space chase camera did not restore the v3 distance (${report.flightCameraDistance})`
  );
  assert.ok(report.canvasVisible, 'space flight canvas is hidden');
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
