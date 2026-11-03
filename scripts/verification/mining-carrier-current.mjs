import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/mining-career-20261103/carrier-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'mining', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Only new native hand-carrier support/collision/follow/pause/position-change and pan footing boundary. Actual source movement owner is not exercised: fixture walker positions and obstruction/support are controlled on real frames. No delivery, saved job, stock or reward claim.';
  await page.goto(
    'http://127.0.0.1:4192/tests/fixtures/mining-view.html' +
      (process.env.WE3D_MINING_PAN_ONLY === '1' ? '?warm=1' : '')
  );
  await page.waitForFunction(() => window.ready);
  if (process.env.WE3D_MINING_PAN_ONLY !== '1') {
    report.follow = await page.evaluate(async () => {
      const { createMiningCarrier } = await import('/app/js/campaign/mining-carrier.js'),
        v = miningView,
        p = v.presentation,
        u = v.qualified.metersPerUnit,
        ctx = v.ctx,
        w = ctx.Walk.state.walker;
      ctx.getEnv = () => 'EARTH';
      ctx.getCurrentTravelMode = () => 'walk';
      w.onGround = true;
      ctx.paused = false;
      p.loadCarrier(['b:1:1', 'b:1:2']);
      w.x = p.cart.position.x;
      w.z = p.cart.position.z + 1 / u;
      w.y = ctx.SurfaceQuery.walkAt(w.x, w.z).position.y + 1.7 / u;
      const carrier = createMiningCarrier(ctx, v.qualified, p);
      window.nativeCarrier = carrier;
      carrier.attach();
      const before = carrier.snapshot();
      let last = performance.now(),
        start = last;
      while (performance.now() - start < 3500) {
        await new Promise(requestAnimationFrame);
        const now = performance.now(),
          dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        w.z += (dt * 0.8) / u;
        w.y = ctx.SurfaceQuery.walkAt(w.x, w.z).position.y + 1.7 / u;
        carrier.tick();
      }
      const after = carrier.snapshot();
      v.view = 'scale';
      v.draw();
      return { before, after };
    });
    assert.equal(report.follow.after.attached, true);
    assert.ok(report.follow.after.distanceMeters > 2);
    assert.ok(report.follow.after.position.z > report.follow.before.position.z + 1.7);
    report.blocker = await page.evaluate(() => {
      const v = miningView,
        p = v.presentation,
        u = v.qualified.metersPerUnit,
        c = p.cart.position,
        x = c.x,
        z = c.z + 0.8 / u;
      const wall = {
        sourceBuildingId: 'native-quarry-carrier-blocker',
        minX: x - 0.8 / u,
        maxX: x + 0.8 / u,
        minZ: z - 0.05 / u,
        maxZ: z + 0.05 / u,
        minY: c.y,
        maxY: c.y + 2 / u,
        isInteriorCollider: true,
        collisionKind: 'solid',
      };
      v.ctx.dynamicBuildingColliders.push(wall);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.6 / u, 2 / u, 0.1 / u),
        new THREE.MeshStandardMaterial({ color: 0x9b4234 })
      );
      mesh.position.set(x, c.y + 1 / u, z);
      v.ctx.scene.add(mesh);
      let stopped = false;
      for (let i = 0; i < 6; i++)
        if (!nativeCarrier.place(c.x, c.z + 0.1 / u)) {
          stopped = true;
          break;
        }
      const snapshot = nativeCarrier.snapshot();
      v.ctx.dynamicBuildingColliders.splice(v.ctx.dynamicBuildingColliders.indexOf(wall), 1);
      mesh.parent.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      return { stopped, snapshot };
    });
    assert.equal(report.blocker.stopped, true);
    assert.match(report.blocker.snapshot.reason, /blocked/);
    report.unsupported = await page.evaluate(() => {
      const v = miningView,
        c = v.presentation.cart.position,
        previous = v.ctx.SurfaceQuery.walkAt;
      v.ctx.SurfaceQuery.walkAt = () => null;
      const moved = nativeCarrier.place(c.x + 0.1 / v.qualified.metersPerUnit, c.z),
        r = nativeCarrier.snapshot();
      v.ctx.SurfaceQuery.walkAt = previous;
      return { moved, r };
    });
    assert.equal(report.unsupported.moved, false);
    assert.match(report.unsupported.r.reason, /supported/);
    report.pauseAndJump = await page.evaluate(async () => {
      const v = miningView,
        w = v.ctx.Walk.state.walker;
      w.x = v.presentation.cart.position.x;
      w.z = v.presentation.cart.position.z + 1 / v.qualified.metersPerUnit;
      nativeCarrier.attach();
      v.ctx.paused = true;
      const before = nativeCarrier.snapshot().position;
      await new Promise(requestAnimationFrame);
      nativeCarrier.tick();
      const after = nativeCarrier.snapshot().position;
      v.ctx.paused = false;
      w.x += 20;
      nativeCarrier.tick();
      return { before, after, jump: nativeCarrier.snapshot() };
    });
    assert.deepEqual(report.pauseAndJump.before, report.pauseAndJump.after);
    assert.equal(report.pauseAndJump.jump.attached, false);
  } else {
    await page.evaluate(async () => {
      const { createMiningCarrier } = await import('/app/js/campaign/mining-carrier.js');
      const v = miningView;
      v.presentation.loadCarrier(['b:1:1', 'b:1:2']);
      window.nativeCarrier = createMiningCarrier(v.ctx, v.qualified, v.presentation);
    });
    report.scope =
      'Only failed receiving-pan contact boundary; carrier7868608 supplies accepted follow/blocker/support/pause/jump evidence, not replayed.';
  }
  report.pan = await page.evaluate(() => {
    const v = miningView,
      p = v.presentation;
    nativeCarrier.detach();
    if (new URLSearchParams(location.search).has('warm'))
      for (const w of p.wheels) w.rotateY(2.9088 / 0.13);
    p.cart.position.copy(p.scaleGroup.position);
    const r = p.alignCarrierOnPan();
    v.view = 'scale';
    v.draw();
    const feet = p.feet.map((f) => new THREE.Box3().setFromObject(f.object).min.y - f.groundY);
    return {
      r,
      feet,
      wheelFloors: p.wheels.map((w) => new THREE.Box3().setFromObject(w).min.y),
      panY: p.scaleTopY(),
      center: new THREE.Box3().setFromObject(p.cart).getCenter(new THREE.Vector3()),
    };
  });
  assert.equal(report.pan.r.onPan, true);
  assert.equal(report.pan.r.massGrams, 40000);
  assert.ok(report.pan.feet.every((v) => Math.abs(v) < 1e-6));
  await page.screenshot({ path: output + '/supported-receiving-pan.png' });
  await page.evaluate(() => {
    nativeCarrier.dispose();
    miningView.presentation.dispose();
  });
  assert.equal(await page.evaluate(() => miningView.ctx.dynamicBuildingColliders.length), 0);
  report.checks.push(
    process.env.WE3D_MINING_PAN_ONLY === '1'
      ? 'Only warmed-wheel receiving pan boundary; earlier carrier motion evidence reused'
      : 'Actual native carrier follows controlled supported walking; common collision blocks it; missing support/paused frame/large position changes cannot move it; receiving pan feet and contact'
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
