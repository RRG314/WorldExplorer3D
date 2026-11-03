import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { createNormalRoadDriver } from './normal-road-driver.mjs';
const source =
    process.env.WE3D_PILOT_RECOVERY ||
    'output/verification/engineering-career-20261103/review-1793736943140/qa-fieldwork-backup.json',
  backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/pilot-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'pilot',
    maximumDurationMs: 15 * 60 * 1000,
  }),
  { page, report } = qa;
const homePossessions = await fs.readFile(
  'output/verification/engineering-career-20261103/entrance-1793735353782/possessions.json',
  'utf8'
);
let driver;
async function record(name) {
  await qa.record(name);
  await fs.writeFile(
    output + '/possessions.json',
    (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
      '\n',
    { mode: 0o600 }
  );
  await fs.writeFile(
    output + '/driving-trace.json',
    JSON.stringify(await page.evaluate(() => window.__pilotRows || [])) + '\n'
  );
  await fs.writeFile(
    output + '/driving-paths.json',
    JSON.stringify(await page.evaluate(() => window.__pilotPaths || [])) + '\n'
  );
}
async function read() {
  return page.evaluate(() => window.__pilotRead());
}
async function avoid(target) {
  return page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      c = ctx.car,
      dx = target.x - c.x,
      dz = target.z - c.z,
      length = Math.hypot(dx, dz),
      extent = Math.min(length, Math.max(7, Math.abs(c.speed) * 0.15)),
      base = { x: c.x + (dx / (length || 1)) * extent, z: c.z + (dz / (length || 1)) * extent };
    for (const offset of [0, -2, 2, -3.5, 3.5]) {
      const p = {
        x: base.x + (dz / (length || 1)) * offset,
        z: base.z - (dx / (length || 1)) * offset,
      };
      const contact = ctx.resolveUrbanActorCollision(c, p, {
        mode: 'walk',
        radius: 1.5,
        actorBaseY: c.y - 1.2,
        actorHeight: 2,
      });
      if (contact.collision) continue;
      if (offset === 0) return { target };
      let clear = true;
      for (let i = 1; i <= 4; i++) {
        const x = c.x + ((p.x - c.x) * i) / 4,
          z = c.z + ((p.z - c.z) * i) / 4,
          hit = ctx.SurfaceQuery.driveAt(x, z, { currentY: c.y, preferRoad: true });
        if (
          hit?.kind !== 'road' ||
          ctx.checkBuildingCollision(x, z, 1.2, {
            actorBaseY: hit.position.y + 0.1,
            actorHeight: 2.2,
          }).collision
        ) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      return { target: p, detour: true };
    }
    return { target, blocked: true };
  }, target);
}
async function focus() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(false);
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function panel() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('today');
  });
}
async function action(id) {
  await page.locator(`[data-delivery-action="${id}"]`).click();
  await page.waitForFunction(() => !window.__pilotRead().job.busy);
}
async function begin(variant) {
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  else {
    await page.locator('#exploreBtn').click();
    await page.locator('#fActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:expedition-pilot"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption(variant);
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer(variant);
}
async function state() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return (await ctx.discoveryProfileStore.getProfile()).harborRun;
  });
}
async function roadPath(target) {
  return page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
      { findTraversalRoute } = await import('/app/js/world/traversal.js?v=4'),
      frame = earthCoordinateFrame(ctx.LOC, ctx.SCALE),
      p = frame.toWorld(target.lat, target.lon),
      c = ctx.car,
      r = findTraversalRoute(c.x, c.z, p.x, p.z, { mode: 'drive', maxAnchorDistance: 16 });
    if (!r?.points?.length) throw Error('No supported driving approach to this cargo marker.');
    const center = r.points.map((p) => ({ x: p.x, z: p.z }));
    if (Math.hypot(center.at(-1).x - p.x, center.at(-1).z - p.z) > 0.5) center.push(p);
    // Traversal returns street centre lines, not traffic lanes. Use the same
    // right-hand lane offset as the loaded traffic graph, where physically
    // supported. This changes only the verification driver's steering targets.
    const points = [{ x: c.x, z: c.z }];
    for (let i = 1; i < center.length; i++) {
      const a = center[i - 1],
        b = center[i],
        length = Math.hypot(b.x - a.x, b.z - a.z),
        n = Math.max(1, Math.ceil(length / 3));
      for (let j = 1; j <= n; j++) {
        const t = j / n,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t,
          taper = Math.min(1, Math.hypot(p.x - x, p.z - z) / 10, Math.hypot(c.x - x, c.z - z) / 6),
          offset = 2.25 * taper,
          lane = {
            x: x - ((b.z - a.z) / (length || 1)) * offset,
            z: z + ((b.x - a.x) / (length || 1)) * offset,
          },
          hit = ctx.SurfaceQuery.driveAt(lane.x, lane.z, { currentY: c.y, preferRoad: true });
        if (
          hit?.kind === 'road' &&
          !ctx.checkBuildingCollision(lane.x, lane.z, 1.2, {
            actorBaseY: hit.position.y + 0.1,
            actorHeight: 2.2,
          }).collision
        )
          points.push(lane);
        else points.push({ x, z });
      }
    }
    (window.__pilotPaths ||= []).push({ points, center, from: { x: c.x, z: c.z }, to: p });
    return points;
  }, target);
}
try {
  report.scope =
    'Actual source Pilot campaign and Field Case Return through normal car/traffic/road/profile owners. Held keyboard controls with hysteresis; no actor/camera/velocity/physics write, teleport or time advance. Trace records real accepted frame/body/camera/contact/input data; older stepped H02 acceptance is not called a normal-drive acceptance.';
  report.source = source;
  await page.addInitScript(
    (raw) => localStorage.setItem('world-explorer:character-backpack:v3', raw),
    homePossessions
  );
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await begin(
    backup.profile.harborRun.continuations?.jobs?.['return-case'] &&
      !['complete'].includes(backup.profile.harborRun.continuations.jobs['return-case'].phase)
      ? 'return-case'
      : 'campaign'
  );
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { carSpeedToMph } = await import('/app/js/physics/vehicle-speed-units.js?v=2');
    window.__pilotRows = [];
    window.__pilotRead = () => {
      const c = ctx.car,
        s = ctx.SurfaceQuery.driveAt(c.x, c.z, { currentY: c.y, preferRoad: true });
      return {
        job: ctx.worldDiscoveryRuntime.harborRun.snapshot(),
        car: {
          x: c.x,
          y: c.y,
          z: c.z,
          angle: c.angle,
          yawRate: c.yawRate,
          speedMph: Math.abs(carSpeedToMph(c.speed)),
          condition: c.condition,
          airborne: c.isAirborne,
        },
        paused: ctx.paused,
        mode: ctx.getCurrentTravelMode(),
        road: { kind: s?.kind, y: s?.position?.y },
      };
    };
    window.__stopPilotTrace = ctx.registerRuntimeSystem({
      id: 'private.pilot-driving',
      owner: 'private-measurement',
      phase: 'render',
      priority: 100,
      update(f) {
        const c = ctx.car,
          a = ctx.readControlActions('drive'),
          v = (p) => (p ? [p.x, p.y, p.z] : null),
          q = (p) => (p ? [p.x, p.y, p.z, p.w] : null);
        window.__pilotRows.push({
          t: f.timestamp,
          dt: f.dt,
          raw: f.rawDelta,
          pose: [c.x, c.y, c.z, c.angle],
          body: v(ctx.carMesh?.position),
          bodyQ: q(ctx.carMesh?.quaternion),
          camera: v(ctx.camera.position),
          cameraQ: q(ctx.camera.quaternion),
          speed: c.speed,
          velocity: [c.vx, c.vz],
          yawRate: c.yawRate,
          pitch: c.terrainPitch,
          roll: c.terrainRoll,
          gap: c.maximumWheelGap,
          penetration: c.maximumWheelPenetration,
          airborne: c.isAirborne,
          input: [a.throttle, a.steer, a.serviceBrake],
          condition: c.condition,
          case: ctx.worldDiscoveryRuntime.harborRun.snapshot().phase,
        });
      },
    });
  });
  const units = (await qa.snapshot()).unit;
  driver = await createNormalRoadDriver(qa, { read, focus, avoid, units, onCheckpoint: record });
  for (const variant of ['campaign', 'return-case']) {
    let base = await state(),
      job = variant === 'campaign' ? base : base.continuations?.jobs?.['return-case'];
    if (job?.phase === 'complete') continue;
    if ((await read()).job.variantId !== variant) {
      await panel();
      await action('next');
      await page.locator('[data-experience-variant]').selectOption(variant);
      await page.locator('[data-experience-begin]').click();
      await qa.waitForCareer(variant);
    }
    await panel();
    if ((await read()).mode !== 'drive') {
      await action('prepare-drive');
      await page.waitForFunction(() => window.__pilotRead().mode === 'drive');
      await panel();
    }
    if (!job || job.phase === 'available') {
      await action('find');
      assert.ok((await read()).job.offers.length, JSON.stringify((await read()).job.admission));
      await action('accept:0');
      base = await state();
      job = variant === 'campaign' ? base : base.continuations.jobs['return-case'];
      await record(variant + ' · route reviewed and actual field case assigned');
    }
    if (job.phase === 'pickup') {
      await driver.drive(await roadPath(job.route.pickup), {
        name: variant + ' loading approach',
        timeoutMs: 180000,
      });
      await panel();
      await page.waitForFunction(
        () => !document.querySelector('[data-delivery-action="load"]').disabled
      );
      await action('load');
      await record(variant + ' · stopped car takes real case custody');
    }
    base = await state();
    job = variant === 'campaign' ? base : base.continuations.jobs['return-case'];
    if (job.phase === 'driving') {
      if ((await read()).job.resumeNeeded) {
        await driver.drive(await roadPath(job.route.points[Math.max(0, job.nextPoint - 1)]), {
          name: variant + ' saved route return',
          timeoutMs: 180000,
        });
      }
      await driver.drive(await roadPath(job.route.dropoff), {
        name: variant + ' full normal road drive',
        allowReverseAtStop: true,
        timeoutMs: 360000,
      });
      await panel();
      assert.equal(
        (await read()).job.phase,
        'unload',
        'Actual ordered road gates must be complete before unloading'
      );
    }
    await page.waitForFunction(
      () => !document.querySelector('[data-delivery-action="unload"]').disabled
    );
    await action('unload');
    assert.equal((await read()).job.phase, 'complete');
    await record(variant + ' · actual supported unload and durable result');
    await page.screenshot({ path: output + '/' + variant + '-complete.png' });
  }
  report.final = await state();
  assert.equal(report.final.phase, 'complete');
  assert.equal(report.final.continuations.jobs['return-case'].phase, 'complete');
  await qa.succeed();
} catch (error) {
  try {
    await record('Stopped at failed affected driving boundary');
    report.driverState = await read();
  } catch {}
  await qa.fail(error);
  throw error;
} finally {
  await driver?.stop().catch(() => {});
  await page.evaluate(() => window.__stopPilotTrace?.()).catch(() => {});
  await qa.close();
}
