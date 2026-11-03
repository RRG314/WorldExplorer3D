// Read the existing marine geometry; do not move actors or create collision data.
const point = (p) => p && [p.x, p.y, p.z].every(Number.isFinite);
export function marineGeometryLineClear(plan, sample, from, target) {
  if (
    !point(from) ||
    !point(target) ||
    !Number.isFinite(target.radius) ||
    target.radius <= 0 ||
    target.radius > 12 ||
    typeof sample !== 'function'
  )
    return false;
  const d = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z),
    steps = Math.max(1, Math.ceil(d / 1.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps,
      p = {
        x: from.x + (target.x - from.x) * t,
        y: from.y + (target.y - from.y) * t,
        z: from.z + (target.z - from.z) * t,
      };
    if (Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z) <= target.radius + 0.5) break;
    const bottom = sample(p.x, p.z);
    if (!Number.isFinite(bottom) || p.y < bottom + 0.1) return false;
    for (const r of plan?.rocks || [])
      if (((p.x - r.x) / r.rx) ** 2 + ((p.y - r.y) / r.ry) ** 2 + ((p.z - r.z) / r.rz) ** 2 < 1)
        return false;
  }
  return true;
}
