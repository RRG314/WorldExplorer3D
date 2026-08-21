function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function directedSurfacePitch(p1 = {}, p2 = {}, maximumPitch = 0.55) {
  const dx = finiteNumber(p2.x) - finiteNumber(p1.x);
  const dz = finiteNumber(p2.z) - finiteNumber(p1.z);
  const run = Math.hypot(dx, dz);
  if (!(run > 1e-6)) return 0;
  const rise = finiteNumber(p2.y) - finiteNumber(p1.y);
  const limit = Math.max(0, finiteNumber(maximumPitch, 0.55));
  return Math.max(-limit, Math.min(limit, -Math.atan2(rise, run)));
}

export { directedSurfacePitch };
