import assert from 'node:assert/strict';
export async function bindOceanQaState(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaOcean = () => ({
      started: ctx.gameStarted,
      loading: ctx.worldLoading,
      paused: ctx.paused,
      boat: ctx.boatMode?.active,
      helm: ctx.boat
        ? { x: ctx.boat.x, z: ctx.boat.z, angle: ctx.boat.angle, speed: ctx.boat.speed }
        : null,
      sub: ctx.oceanMode?.active
        ? {
            position: { ...ctx.oceanMode.submarine.position },
            yaw: ctx.oceanMode.submarine.yaw,
            speed: ctx.oceanMode.submarine.speed,
            verticalSpeed: ctx.oceanMode.submarine.verticalSpeed,
          }
        : null,
      onDeck: ctx.boatDeck?.active,
      underwater: ctx.oceanMode?.active,
      voyage: ctx.oceanVoyage?.current,
      deck: ctx.boatDeck?.snapshot(),
      survey: ctx.marineResearch?.oceanography.snapshot(),
    });
  });
}
export const oceanQaState = (page) => page.evaluate(() => window.__qaOcean());
export async function walkOceanStation(page, id) {
  await page.getByLabel('Deck destination').selectOption(id);
  await page.waitForTimeout(250);
  const route = (await oceanQaState(page)).deck.route;
  assert.ok(route.length > 0, 'Published walking route exists');
  const deadline = Date.now() + 140000;
  try {
    for (const target of route) {
      while (Date.now() < deadline) {
        const s = await oceanQaState(page),
          p = s.deck.pose,
          d = Math.hypot(target.x - p.x, target.z - p.z);
        if (d < 0.22) break;
        assert.equal(s.paused, false);
        assert.equal(s.onDeck, true);
        await page.evaluate(async (target) => {
          const { ctx } = await import('/app/js/shared-context.js?v=55'),
            p = ctx.boatDeck.snapshot().pose,
            yaw = Math.atan2(target.x - p.x, target.z - p.z),
            delta = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw));
          ctx.boatDeck.look(delta, -0.13 - (p.pitch || 0));
          ctx.renderer.domElement.focus({ preventScroll: true });
        }, target);
        await page.keyboard.down('w');
        await page.waitForTimeout(d < 0.6 ? 45 : 110);
        await page.keyboard.up('w');
      }
      if (Date.now() >= deadline)
        throw Error('The normal-frame walking route exceeded its bounded duration');
    }
  } finally {
    await page.keyboard.up('w').catch(() => {});
  }
  assert.ok(
    await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.boatDeck.stationDistance(id) < 2.4;
    }, id)
  );
}
export async function sailOceanStation(page, station) {
  const result = await page.evaluate(async (station) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
      target = earthCoordinateFrame(ctx.LOC, ctx.SCALE).toWorld(station.lat, station.lon),
      original = ctx.readControlActions,
      u = ctx.METERS_PER_WORLD_UNIT || 1,
      initialYaw = Math.atan2(target.x - ctx.boat.x, target.z - ctx.boat.z),
      initialError = Math.atan2(
        Math.sin(initialYaw - ctx.boat.angle),
        Math.cos(initialYaw - ctx.boat.angle)
      ),
      direction = Math.cos(initialError) < 0 ? -1 : 1,
      start = performance.now();
    let actions = {},
      distance = Infinity,
      traveled = 0,
      previous = { x: ctx.boat.x, z: ctx.boat.z };
    ctx.readControlActions = (domain) => (domain === 'boat' ? actions : original?.(domain) || {});
    try {
      while (performance.now() - start < 180000) {
        if (ctx.paused || !ctx.boatMode.active || ctx.boatDeck.active)
          throw Error('Normal sailing lost its active helm');
        const dx = target.x - ctx.boat.x,
          dz = target.z - ctx.boat.z;
        distance = Math.hypot(dx, dz) * u;
        const desired = Math.atan2(dx, dz) + (direction < 0 ? Math.PI : 0),
          error = Math.atan2(
            Math.sin(desired - ctx.boat.angle),
            Math.cos(desired - ctx.boat.angle)
          ),
          speed = Math.hypot(ctx.boat.vx || 0, ctx.boat.vz || 0, ctx.boat.speed || 0) * u,
          stopping = (speed * speed) / (2 * 0.2) + 13;
        if (distance < 23 && speed < 0.25)
          return {
            ok: true,
            distance,
            traveled,
            seconds: (performance.now() - start) / 1000,
            condition: ctx.boatMode.condition,
            direction,
          };
        actions =
          distance < stopping
            ? { brake: 1 }
            : {
                steer: Math.max(-1, Math.min(1, error * 2)) * direction,
                ...(direction < 0
                  ? { reverse: Math.abs(error) > 0.5 ? 0.6 : 1 }
                  : { throttle: Math.abs(error) > 0.5 ? 0.35 : 0.6 }),
              };
        await new Promise(requestAnimationFrame);
        traveled += Math.hypot(ctx.boat.x - previous.x, ctx.boat.z - previous.z) * u;
        previous = { x: ctx.boat.x, z: ctx.boat.z };
      }
      return {
        ok: false,
        distance,
        traveled,
        position: { x: ctx.boat.x, z: ctx.boat.z },
        seconds: (performance.now() - start) / 1000,
      };
    } finally {
      actions = {};
      ctx.readControlActions = original;
    }
  }, station);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
export async function pilotOceanSub(page, goal) {
  const result = await page.evaluate(async (goal) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      sub = ctx.oceanMode.submarine,
      original = ctx.readControlActions,
      u = ctx.METERS_PER_WORLD_UNIT || 1,
      start = performance.now();
    let actions = {},
      traveled = 0,
      previous = { ...sub.position };
    ctx.readControlActions = (domain) => (domain === 'ocean' ? actions : original?.(domain) || {});
    try {
      while (performance.now() - start < 150000) {
        if (ctx.paused || !ctx.oceanMode.active || ctx.oceanMode.diver?.active)
          throw Error('The normal-frame submarine leg lost its active pilot');
        const dx = goal.x - sub.position.x,
          dz = goal.z - sub.position.z,
          d = Math.hypot(dx, dz),
          dy = goal.y - sub.position.y,
          face = goal.face || goal,
          yaw =
            d > 1
              ? Math.atan2(dx, dz)
              : Math.atan2(face.x - sub.position.x, face.z - sub.position.z),
          error = Math.atan2(Math.sin(yaw - sub.yaw), Math.cos(yaw - sub.yaw));
        if (
          d < 1.2 &&
          Math.abs(dy) < 0.35 &&
          Math.abs(error) < 0.12 &&
          Math.abs(sub.speed) < 0.35 &&
          Math.abs(sub.verticalSpeed) < 0.35
        )
          return {
            ok: true,
            position: { ...sub.position },
            traveled,
            seconds: (performance.now() - start) / 1000,
          };
        actions = {
          turn: Math.max(-1, Math.min(1, error * 2)),
          move: d > 1 && Math.abs(error) < 0.25 ? Math.min(0.65, d / 18) : 0,
          vertical: Math.abs(dy) > 0.12 ? Math.max(-1, Math.min(1, dy * 0.55)) : 0,
        };
        await new Promise(requestAnimationFrame);
        traveled +=
          Math.hypot(
            sub.position.x - previous.x,
            sub.position.y - previous.y,
            sub.position.z - previous.z
          ) * u;
        previous = { ...sub.position };
      }
      return {
        ok: false,
        position: { ...sub.position },
        goal,
        traveled,
        seconds: (performance.now() - start) / 1000,
      };
    } finally {
      actions = {};
      ctx.readControlActions = original;
    }
  }, goal);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
