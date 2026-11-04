// Read-only normal-kernel observer. Held keyboard input is the only movement
// authority; no route/surface queries, tracing or screenshots occur in a sample.
export async function installSteadyDrivingSample(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__steadyCityStop?.();
    let recording = false,
      rows = [];
    window.__steadyCityStop = ctx.registerRuntimeSystem({
      id: 'private.city-driving-sample',
      owner: 'private-measurement',
      phase: 'render',
      priority: 100,
      update(frame) {
        if (!recording || rows.length >= 1800) return;
        const c = ctx.car,
          input = ctx.readControlActions('drive'),
          body = ctx.carMesh,
          camera = ctx.camera;
        rows.push({
          t: frame.timestamp,
          raw: frame.rawDelta,
          dt: frame.dt,
          car: [c.x, c.y, c.z, c.angle, c.speed, c.vx, c.vz, c.yawRate],
          body: [
            body.position.x,
            body.position.y,
            body.position.z,
            body.quaternion.x,
            body.quaternion.y,
            body.quaternion.z,
            body.quaternion.w,
          ],
          camera: [
            camera.position.x,
            camera.position.y,
            camera.position.z,
            camera.quaternion.x,
            camera.quaternion.y,
            camera.quaternion.z,
            camera.quaternion.w,
          ],
          input: [input.throttle, input.steer, input.brake, input.serviceBrake],
          airborne: c.isAirborne,
          onRoad: c.onRoad,
          roadCentered: c.groundContact?.roadCentered,
          supportSamples: c.groundContact?.sampleCount,
          condition: c.condition,
          draws: ctx.renderer.info.render.calls,
          triangles: ctx.renderer.info.render.triangles,
        });
      },
    });
    const state = () => ({
      mode: ctx.getCurrentTravelMode(),
      paused: ctx.paused,
      car: {
        x: ctx.car.x,
        y: ctx.car.y,
        z: ctx.car.z,
        angle: ctx.car.angle,
        speed: ctx.car.speed,
        condition: ctx.car.condition,
      },
      stream: ctx.streetOverview?.stats.status,
      kernel: ctx.getRuntimeKernelSnapshot(),
      renderer: {
        pixelRatio: ctx.renderer.getPixelRatio(),
        geometries: ctx.renderer.info.memory.geometries,
        textures: ctx.renderer.info.memory.textures,
        calls: ctx.renderer.info.render.calls,
        triangles: ctx.renderer.info.render.triangles,
      },
    });
    window.__steadyCity = {
      state,
      start() {
        rows = [];
        recording = true;
        return state();
      },
      finish() {
        recording = false;
        return { state: state(), rows };
      },
      cancel() {
        recording = false;
      },
    };
  });
}
export async function sampleHeldDriving(page, milliseconds = 10000) {
  if (milliseconds < 5000 || milliseconds > 12000)
    throw Error('Use one bounded five-to-twelve-second steady sample.');
  const admission = await page.evaluate(() => __steadyCity.state());
  if (admission.mode !== 'drive' || admission.paused)
    throw Error('Steady driving requires the original unpaused driving owner.');
  await page.keyboard.down('ArrowUp');
  try {
    const before = await page.evaluate(() => __steadyCity.start());
    await page.waitForTimeout(milliseconds);
    const sample = await page.evaluate(() => __steadyCity.finish());
    return {
      scope:
        'Normal held ArrowUp; no steering pulses, simulation stepping, pose writes, route/surface queries, tracing or screenshots during measurement.',
      milliseconds,
      before,
      ...sample,
    };
  } finally {
    await page.keyboard.up('ArrowUp').catch(() => {});
    await page.evaluate(() => __steadyCity.cancel()).catch(() => {});
  }
}

export function summarizeSteadyDrivingSample(sample, metersPerWorldUnit = 1.11) {
  const rows = sample.rows;
  if (!rows?.length || !(metersPerWorldUnit > 0))
    throw Error('A recorded sample and physical scale are required.');
  const intervals = rows.map((row) => row.raw * 1000).sort((a, b) => a - b);
  return {
    milliseconds: sample.milliseconds,
    frames: rows.length,
    p50ms: intervals[Math.floor(intervals.length * 0.5)],
    p95ms: intervals[Math.floor(intervals.length * 0.95)],
    maxms: intervals.at(-1),
    gapsOver50: intervals.filter((value) => value > 50.01).length,
    shortenedFrames: rows.filter((row) => row.raw - row.dt > 1e-7).length,
    discardedMilliseconds: rows.reduce((sum, row) => sum + Math.max(0, row.raw - row.dt) * 1000, 0),
    unsteadyInputFrames: rows.filter(
      (row) => row.input[0] !== 1 || row.input.slice(1).some(Boolean)
    ).length,
    offRoadFrames: rows.filter((row) => row.onRoad === false || row.roadCentered === false).length,
    unknownRoadFrames: rows.filter(
      (row) => typeof row.onRoad !== 'boolean' || typeof row.roadCentered !== 'boolean'
    ).length,
    airborneFrames: rows.filter((row) => row.airborne).length,
    maximumBodyPositionErrorMeters: Math.max(
      ...rows.map(
        (row) =>
          Math.hypot(row.car[0] - row.body[0], row.car[1] - row.body[1], row.car[2] - row.body[2]) *
          metersPerWorldUnit
      )
    ),
    conditionBefore: sample.before.car.condition,
    conditionAfter: sample.state.car.condition,
    travelMeters:
      Math.hypot(
        sample.state.car.x - sample.before.car.x,
        sample.state.car.z - sample.before.car.z
      ) * metersPerWorldUnit,
    simulationCapacity: sample.before.kernel.simulationCapacity ?? null,
  };
}
