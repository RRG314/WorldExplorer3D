function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeAngle(value) {
  return Math.atan2(Math.sin(Number(value) || 0), Math.cos(Number(value) || 0));
}

function createAmbientRouteMotion(points = [], options = {}) {
  const route = points.filter((point) => [point?.x, point?.z].every(Number.isFinite))
    .map((point) => Object.freeze({ x: Number(point.x), z: Number(point.z) }));
  if (route.length < 2) return null;
  return {
    route: Object.freeze(route),
    targetIndex: 1,
    speed: 0,
    cruiseSpeed: Math.max(.2, Number(options.cruiseSpeed) || 2),
    acceleration: Math.max(.05, Number(options.acceleration) || .5),
    yawRate: Math.max(.02, Number(options.yawRate) || .25),
    dwellSeconds: Math.max(0, Number(options.dwellSeconds) || 0),
    dwellRemaining: Math.max(0, Number(options.initialDwellSeconds ?? options.dwellSeconds) || 0),
    state: 'docked',
    laps: 0
  };
}

function advanceAmbientRouteMotion(entity, motion, dt = 0) {
  if (!entity || !motion?.route?.length) return null;
  const step = clamp(dt, 0, .05);
  if (motion.dwellRemaining > 0) {
    motion.dwellRemaining = Math.max(0, motion.dwellRemaining - step);
    motion.speed += (0 - motion.speed) * (1 - Math.exp(-4 * step));
    motion.state = 'docked';
    return motion;
  }
  const target = motion.route[motion.targetIndex];
  const dx = target.x - Number(entity.x || 0);
  const dz = target.z - Number(entity.z || 0);
  const distance = Math.hypot(dx, dz);
  if (distance <= Math.max(.7, motion.cruiseSpeed * .18)) {
    motion.targetIndex = (motion.targetIndex + 1) % motion.route.length;
    if (motion.targetIndex === 1) {
      motion.laps += 1;
      motion.dwellRemaining = motion.dwellSeconds;
    }
    return advanceAmbientRouteMotion(entity, motion, Math.min(step, .01));
  }
  const desiredYaw = Math.atan2(dx, dz);
  const yawError = normalizeAngle(desiredYaw - Number(entity.yaw || 0));
  entity.yaw = normalizeAngle(Number(entity.yaw || 0) + clamp(yawError, -motion.yawRate * step, motion.yawRate * step));
  const alignment = clamp((Math.cos(yawError) + .2) / 1.2, .08, 1);
  const desiredSpeed = motion.cruiseSpeed * alignment;
  motion.speed += (desiredSpeed - motion.speed) * (1 - Math.exp(-motion.acceleration * step));
  const travel = Math.min(distance, Math.max(0, motion.speed) * step);
  entity.x += dx / distance * travel;
  entity.z += dz / distance * travel;
  motion.state = 'underway';
  return motion;
}

function ambientRouteSnapshot(motion) {
  if (!motion) return null;
  return Object.freeze({
    state: motion.state,
    speed: Number(motion.speed.toFixed(2)),
    targetIndex: motion.targetIndex,
    routePointCount: motion.route.length,
    laps: motion.laps
  });
}

export { advanceAmbientRouteMotion, ambientRouteSnapshot, createAmbientRouteMotion };
