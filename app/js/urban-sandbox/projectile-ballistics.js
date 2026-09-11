function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalized(vector = {}, fallback = { x: 0, y: 0, z: 1 }) {
  const x = finite(vector.x);
  const y = finite(vector.y);
  const z = finite(vector.z);
  const length = Math.hypot(x, y, z);
  if (length <= 0.000001) return normalized(fallback, { x: 0, y: 0, z: 1 });
  return Object.freeze({ x: x / length, y: y / length, z: z / length });
}

function playerMuzzleOrigin(actor = {}, aimDirection = {}) {
  const aim = normalized(aimDirection);
  const flatLength = Math.hypot(aim.x, aim.z);
  const forward = flatLength > 0.000001
    ? { x: aim.x / flatLength, z: aim.z / flatLength }
    : { x: Math.sin(finite(actor.angle)), z: Math.cos(finite(actor.angle)) };
  const right = { x: forward.z, z: -forward.x };
  return Object.freeze({
    x: finite(actor.x) + forward.x * 0.34 + right.x * 0.16,
    y: finite(actor.y, 1.7) - 0.52,
    z: finite(actor.z) + forward.z * 0.34 + right.z * 0.16
  });
}

function directVelocity(origin, target, speed) {
  const direction = normalized({
    x: finite(target.x) - finite(origin.x),
    y: finite(target.y) - finite(origin.y),
    z: finite(target.z) - finite(origin.z)
  });
  const magnitude = Math.max(0.1, finite(speed, 48));
  return Object.freeze({
    x: direction.x * magnitude,
    y: direction.y * magnitude,
    z: direction.z * magnitude
  });
}

function ballisticVelocity(origin, target, speed, gravity = 9.81, minimumAngle = 0.01) {
  const dx = finite(target.x) - finite(origin.x);
  const dz = finite(target.z) - finite(origin.z);
  const dy = finite(target.y) - finite(origin.y);
  const horizontal = Math.max(0.001, Math.hypot(dx, dz));
  const magnitude = Math.max(1, finite(speed, 18));
  const g = Math.max(0.1, Math.abs(finite(gravity, 9.81)));
  const speedSquared = magnitude * magnitude;
  const discriminant = speedSquared * speedSquared - g * (g * horizontal * horizontal + 2 * dy * speedSquared);
  let angle;
  if (discriminant >= 0) {
    angle = Math.atan((speedSquared - Math.sqrt(discriminant)) / (g * horizontal));
  } else {
    angle = Math.PI / 4;
  }
  angle = Math.max(Math.max(-Math.PI * 0.2, finite(minimumAngle, 0.01)), Math.min(Math.PI * 0.38, angle));
  const horizontalSpeed = magnitude * Math.cos(angle);
  const nx = dx / horizontal;
  const nz = dz / horizontal;
  return Object.freeze({
    velocity: Object.freeze({
      x: nx * horizontalSpeed,
      y: magnitude * Math.sin(angle),
      z: nz * horizontalSpeed
    }),
    flightSeconds: horizontal / Math.max(0.1, horizontalSpeed),
    angleRadians: angle
  });
}

function resolvePlayerProjectileLaunch(input = {}) {
  const kind = String(input.kind || 'pulse');
  const speed = Math.max(0.1, finite(input.speed, 48));
  const range = Math.max(1, finite(input.range, 40));
  const aimDirection = normalized(input.aimDirection);
  const origin = playerMuzzleOrigin(input.actor, aimDirection);
  const target = input.aimPoint || {
    x: origin.x + aimDirection.x * range,
    y: origin.y + aimDirection.y * range,
    z: origin.z + aimDirection.z * range
  };
  const gravity = Math.max(0, finite(input.gravity));
  if (kind === 'thrown-charge' || gravity > 0) {
    // Keep the physically solved low arc even when the reticle is close. A
    // forced minimum lob looks dramatic, but it overshoots the actual aim
    // point and recreates the same reticle mismatch this authority removes.
    const launch = ballisticVelocity(origin, target, speed, gravity || 9.81, -0.2);
    if (kind !== 'thrown-charge') {
      const maxDistance = Math.max(range, speed * (launch.flightSeconds + 0.4));
      return Object.freeze({
        origin,
        target: Object.freeze({ x: finite(target.x), y: finite(target.y), z: finite(target.z) }),
        velocity: launch.velocity,
        expectedFlightSeconds: launch.flightSeconds,
        launchAngleRadians: launch.angleRadians,
        maxDistance,
        maxLife: maxDistance / speed + 0.3
      });
    }
    const fuseSeconds = Math.max(0.5, finite(input.fuseSeconds, 2.2));
    return Object.freeze({
      origin,
      target: Object.freeze({ x: finite(target.x), y: finite(target.y), z: finite(target.z) }),
      velocity: launch.velocity,
      expectedFlightSeconds: launch.flightSeconds,
      launchAngleRadians: launch.angleRadians,
      maxDistance: Math.max(range + 2, speed * (launch.flightSeconds + 0.75)),
      maxLife: Math.max(fuseSeconds, launch.flightSeconds + 0.35)
    });
  }
  const targetDistance = Math.hypot(
    finite(target.x) - origin.x,
    finite(target.y) - origin.y,
    finite(target.z) - origin.z
  );
  const maxDistance = Math.max(range, targetDistance + 0.75);
  return Object.freeze({
    origin,
    target: Object.freeze({ x: finite(target.x), y: finite(target.y), z: finite(target.z) }),
    velocity: directVelocity(origin, target, speed),
    expectedFlightSeconds: targetDistance / speed,
    launchAngleRadians: null,
    maxDistance,
    maxLife: maxDistance / speed + 0.3
  });
}

export {
  ballisticVelocity,
  playerMuzzleOrigin,
  resolvePlayerProjectileLaunch
};
