export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle = 0) {
  let value = Number(angle) || 0;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

export function shortestAngleDelta(target = 0, current = 0) {
  return normalizeAngle(target - current);
}

export function stepBoatSpring(value, velocity, target, dt, stiffness, damping, maxVelocity = Infinity) {
  const currentValue = Number.isFinite(value) ? value : target;
  const currentVelocity = Number.isFinite(velocity) ? velocity : 0;
  if (!Number.isFinite(dt) || dt <= 0) return { value: target, velocity: 0 };
  let nextVelocity = currentVelocity + (target - currentValue) * stiffness * dt;
  nextVelocity *= Math.exp(-damping * dt);
  if (Number.isFinite(maxVelocity)) nextVelocity = clamp(nextVelocity, -maxVelocity, maxVelocity);
  return { value: currentValue + nextVelocity * dt, velocity: nextVelocity };
}
