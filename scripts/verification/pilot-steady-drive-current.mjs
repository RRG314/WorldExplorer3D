import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { createNormalRoadDriver } from './normal-road-driver.mjs';
const source = process.env.WE3D_PILOT_STEADY;
if (!source) throw Error('Choose a genuine source driving checkpoint.');
const backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/pilot-career-20261103/steady-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'pilot',
    maximumDurationMs: 6 * 60 * 1000,
  }),
  { page, report } = qa;
let driver,
  cdp,
  recording = false,
  frames = [];
const read = () => page.evaluate(() => window.__readSteady());
const focus = () =>
  page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(false);
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
try {
  report.scope =
    'One actual source city steady driving boundary. Normal held keyboard controls, existing road/traffic/body/camera/frame owners. No actor, camera, velocity or physics writes, time advance or route stepping. No route/surface queries or automation evaluations during the three-second held-throttle measurement.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:expedition-pilot"]').click();
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('campaign');
  await page.locator('[data-delivery-action=prepare-drive]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { carSpeedToMph } = await import('/app/js/physics/vehicle-speed-units.js?v=2');
    window.__readSteady = () => ({
      car: {
        x: ctx.car.x,
        z: ctx.car.z,
        angle: ctx.car.angle,
        yawRate: ctx.car.yawRate,
        speedMph: Math.abs(carSpeedToMph(ctx.car.speed)),
      },
      mode: ctx.getCurrentTravelMode(),
      paused: ctx.paused,
    });
    window.__steadyRows = [];
    window.__steadyRecording = false;
    window.__stopSteady = ctx.registerRuntimeSystem({
      id: 'private.steady-drive',
      owner: 'private-measurement',
      phase: 'render',
      priority: 100,
      update(f) {
        if (!window.__steadyRecording) return;
        const c = ctx.car,
          a = ctx.readControlActions('drive'),
          v = (p) => [p.x, p.y, p.z],
          q = (p) => [p.x, p.y, p.z, p.w];
        window.__steadyRows.push({
          t: f.timestamp,
          raw: f.rawDelta,
          dt: f.dt,
          pose: [c.x, c.y, c.z, c.angle],
          body: v(ctx.carMesh.position),
          bodyQ: q(ctx.carMesh.quaternion),
          camera: v(ctx.camera.position),
          cameraQ: q(ctx.camera.quaternion),
          speed: c.speed,
          velocity: [c.vx, c.vz],
          yawRate: c.yawRate,
          pitch: c.terrainPitch,
          roll: c.terrainRoll,
          airborne: c.isAirborne,
          condition: c.condition,
          input: [a.throttle, a.steer, a.brake, a.serviceBrake],
          slow: Object.values(ctx.getRuntimeKernelSnapshot().phases)
            .flat()
            .filter((s) => s.lastDurationMs > 8)
            .map((s) => ({ id: s.id, ms: s.lastDurationMs })),
        });
      },
    });
  });
  const points = await page.evaluate(async (route) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
      f = earthCoordinateFrame(ctx.LOC, ctx.SCALE),
      p = route.points.slice(0, 4).map((g) => f.toWorld(g.lat, g.lon));
    return [
      { x: ctx.car.x, z: ctx.car.z },
      ...p.slice(1).map((b, i) => {
        const a = p[i],
          dx = b.x - a.x,
          dz = b.z - a.z,
          n = Math.hypot(dx, dz);
        return { x: b.x - (dz / n) * 2.25, z: b.z + (dx / n) * 2.25 };
      }),
    ];
  }, backup.profile.harborRun.route);
  driver = await createNormalRoadDriver(qa, { read, focus });
  await driver.drive(points, {
    name: 'One normal approach to a straight-road measurement',
    timeoutMs: 90000,
  });
  await driver.keys(['Space']);
  await page.waitForTimeout(1200);
  await driver.stop();
  await focus();
  report.admission = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      c = ctx.car,
      fx = Math.sin(c.angle),
      fz = Math.cos(c.angle),
      end = { x: c.x + fx * 65, z: c.z + fz * 65 };
    const samples = [];
    for (let d = 0; d <= 65; d += 5) {
      const x = c.x + fx * d,
        z = c.z + fz * d,
        h = ctx.SurfaceQuery.driveAt(x, z, { currentY: c.y, preferRoad: true });
      samples.push({
        d,
        kind: h?.kind,
        solid:
          h?.kind !== 'road' ||
          ctx.checkBuildingCollision(x, z, 1.3, {
            actorBaseY: h.position.y + 0.1,
            actorHeight: 2.2,
          }).collision,
      });
    }
    return {
      car: { x: c.x, y: c.y, z: c.z, angle: c.angle, yawRate: c.yawRate, condition: c.condition },
      samples,
      trafficClear: !ctx.resolveUrbanActorCollision(c, end, {
        mode: 'walk',
        radius: 1.5,
        actorBaseY: c.y - 1.2,
        actorHeight: 2,
      }).collision,
    };
  });
  assert.ok(report.admission.trafficClear);
  assert.ok(report.admission.samples.every((s) => !s.solid));
  assert.ok(Math.abs(report.admission.car.yawRate) < 0.04);
  await page.screenshot({ path: output + '/before.png' });
  cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', (event) => {
    if (recording) frames.push({ data: event.data, metadata: event.metadata });
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 65,
    maxWidth: 960,
    maxHeight: 600,
    everyNthFrame: 2,
  });
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,v8,blink.user_timing',
    transferMode: 'ReturnAsStream',
  });
  recording = true;
  await page.evaluate(() => {
    window.__steadyRecording = true;
  });
  await driver.keys(['ArrowUp']);
  await page.waitForTimeout(3000);
  await driver.keys(['Space']);
  await page.evaluate(() => {
    window.__steadyRecording = false;
  });
  recording = false;
  await cdp.send('Page.stopScreencast');
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const event = await complete;
  let trace = '',
    eof = false;
  while (!eof) {
    const r = await cdp.send('IO.read', { handle: event.stream });
    trace += r.data;
    eof = r.eof;
    if (trace.length > 25 * 1024 * 1024) throw Error('Bounded three-second trace exceeded 25 MiB.');
  }
  await cdp.send('IO.close', { handle: event.stream });
  await fs.writeFile(output + '/timeline.json', trace);
  const rows = await page.evaluate(() => window.__steadyRows);
  await fs.writeFile(output + '/frames.json', JSON.stringify(rows) + '\n');
  for (let i = 0; i < frames.length; i++)
    await fs.writeFile(
      output + '/frame-' + String(i).padStart(3, '0') + '.jpg',
      Buffer.from(frames[i].data, 'base64')
    );
  await fs.writeFile(
    output + '/screencast-timestamps.json',
    JSON.stringify(frames.map((f) => f.metadata)) + '\n'
  );
  report.frames = rows.length;
  report.screencastFrames = frames.length;
  await page.waitForTimeout(1500);
  await driver.stop();
  await page.screenshot({ path: output + '/after.png' });
  await qa.record(
    'Three-second actual held-throttle measurement captured without route-query interference'
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await driver?.stop().catch(() => {});
  await page.evaluate(() => window.__stopSteady?.()).catch(() => {});
  await cdp?.detach().catch(() => {});
  await qa.close();
}
