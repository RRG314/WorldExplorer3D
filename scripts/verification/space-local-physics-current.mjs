import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

try {
  await page.goto(`${baseUrl}/app/?launch=space&physics=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 180_000 });

  const result = await page.evaluate(async () => {
    const [{ ctx }, { updateSpaceFlightPhysics }, { updateBlackHoleEncounter }] = await Promise.all([
      import('/app/js/shared-context.js?v=55'),
      import('/app/js/space/runtime.js?v=27'),
      import('/app/js/universe/black-hole.js?v=4')
    ]);
    cancelAnimationFrame(ctx.spaceFlight.animationId);
    ctx.spaceFlight.animationId = null;
    ctx.clearRenderedSpaceJourney?.();
    ctx.spaceFlight.mode = 'flying';
    ctx.spaceFlight.active = true;
    ctx.spaceFlight._frameScale = 1;
    ctx.spaceFlight._launchSource = null;
    ctx.spaceFlight.keys = {};

    const originalUniverse = ctx.universeRuntime.current;
    const originalGravityBodies = ctx.getUniverseGravityBodies;
    ctx.universeRuntime.current = { id: 'verification-empty-frame' };
    ctx.getUniverseGravityBodies = () => [];
    ctx.spaceFlight.rocket.position.set(0, 0, 0);
    ctx.spaceFlight.rocket.quaternion.identity();
    ctx.spaceFlight.speed = 1;
    ctx.spaceFlight.gravityVelocity.set(0, 0, 0);
    ctx.spaceFlight.velocity.set(1, 0.2, -0.1);
    const velocityBeforeTurn = ctx.spaceFlight.velocity.clone();
    ctx.spaceFlight.keys.arrowleft = true;
    updateSpaceFlightPhysics();
    ctx.spaceFlight.keys = {};
    const velocityAfterTurn = ctx.spaceFlight.velocity.clone();
    const forwardAfterTurn = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.spaceFlight.rocket.quaternion).normalize();
    const positionAfterTurn = ctx.spaceFlight.rocket.position.clone();
    ctx.universeRuntime.current = originalUniverse;
    ctx.getUniverseGravityBodies = originalGravityBodies;

    const samples = {};
    for (const bodyName of ['Moon', 'Earth', 'Jupiter']) {
      const body = ctx.getAllSpaceBodies().find((entry) => String(entry.name) === bodyName);
      const outward = new THREE.Vector3(0.61, 0.52, 0.6).normalize();
      ctx.spaceFlight.rocket.position.copy(body.position).addScaledVector(outward, Number(body.radius) * 1.3 + 8);
      ctx.spaceFlight.speed = 0;
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.gravityVelocity.set(0, 0, 0);
      for (let step = 0; step < 6; step += 1) updateSpaceFlightPhysics();
      const toward = body.position.clone().sub(ctx.spaceFlight.rocket.position).normalize();
      samples[bodyName.toLowerCase()] = {
        speed: ctx.spaceFlight.velocity.length(),
        inwardSpeed: ctx.spaceFlight.velocity.dot(toward)
      };
    }

    const blackHoleGroup = new THREE.Group();
    blackHoleGroup.userData.blackHole = {
      visualRadius: 100,
      schwarzschildRadiusKm: 100,
      photonSphereRadiusKm: 150,
      iscoRadiusKm: 300,
      entity: { physical: { massSolar: 4_000_000 } }
    };
    const blackHoleRocket = new THREE.Object3D();
    blackHoleRocket.position.set(0, 0, 500);
    const blackHoleVelocity = new THREE.Vector3();
    const blackHole = updateBlackHoleEncounter(blackHoleGroup, blackHoleRocket, blackHoleVelocity, 1);

    return {
      inertialVelocityBefore: velocityBeforeTurn.toArray(),
      inertialVelocityAfter: velocityAfterTurn.toArray(),
      forwardAfterTurn: forwardAfterTurn.toArray(),
      forwardAlignment: velocityAfterTurn.clone().normalize().dot(forwardAfterTurn),
      inertialPositionAfter: positionAfterTurn.toArray(),
      cameraModeButtonPresent: Boolean(document.getElementById('sfCameraBtn')),
      samples,
      blackHole: {
        velocity: blackHoleVelocity.toArray(),
        accelerationPerSecond: blackHole.accelerationPerSecond,
        captured: blackHole.captured
      }
    };
  });

  assert.notDeepEqual(result.inertialVelocityAfter, result.inertialVelocityBefore, '5.1 steering must redirect travel with the ship.');
  assert.ok(result.forwardAlignment > 0.999, JSON.stringify(result));
  assert.ok(Math.abs(result.inertialPositionAfter[0]) > 0.001, JSON.stringify(result));
  assert.equal(result.cameraModeButtonPresent, false, 'Space flight must use the released 5.1 chase camera, not added camera modes.');
  assert.ok(result.samples.moon.inwardSpeed > 0, JSON.stringify(result.samples));
  assert.ok(result.samples.earth.inwardSpeed > result.samples.moon.inwardSpeed, JSON.stringify(result.samples));
  assert.ok(result.samples.jupiter.inwardSpeed > result.samples.earth.inwardSpeed, JSON.stringify(result.samples));
  assert.ok(result.blackHole.velocity[2] < 0, JSON.stringify(result.blackHole));
  assert.equal(result.blackHole.captured, false);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
