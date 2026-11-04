// An interior spawn anchor is inside the solid footprint. Outdoor navigation
// and personal-room admission must use an exterior approach instead.
export function exteriorApproach(support, origin = { x: 0, z: 0 }, metersPerUnit = 1.11) {
  if (!support?.enterable) return null;
  const e = support.exteriorEntrance;
  if (e && Number.isFinite(e.approachX) && Number.isFinite(e.approachZ))
    return { x: e.approachX, z: e.approachZ };
  const pts = support.footprint || support.building?.pts;
  if (!Array.isArray(pts) || pts.length < 3)
    return e && Number.isFinite(e.x) && Number.isFinite(e.z) ? { x: e.x, z: e.z } : null;
  const toward = e && Number.isFinite(e.x) && Number.isFinite(e.z) ? e : origin;
  let nearest = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length],
      dx = b.x - a.x,
      dz = b.z - a.z,
      t = Math.max(
        0,
        Math.min(1, ((toward.x - a.x) * dx + (toward.z - a.z) * dz) / (dx * dx + dz * dz || 1))
      ),
      point = { x: a.x + dx * t, z: a.z + dz * t },
      d = Math.hypot(point.x - toward.x, point.z - toward.z);
    if (!nearest || d < nearest.distance) nearest = { point, distance: d, dx, dz };
  }
  const inside = (p) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
      if (
        pts[i].z > p.z !== pts[j].z > p.z &&
        p.x < ((pts[j].x - pts[i].x) * (p.z - pts[i].z)) / (pts[j].z - pts[i].z) + pts[i].x
      )
        hit = !hit;
    return hit;
  };
  let dx = toward.x - nearest.point.x,
    dz = toward.z - nearest.point.z;
  if (Math.hypot(dx, dz) < 1e-8 || inside(toward)) {
    dx = -nearest.dz;
    dz = nearest.dx;
  }
  const length = Math.hypot(dx, dz) || 1,
    offset = 1.2 / (Number.isFinite(metersPerUnit) && metersPerUnit > 0 ? metersPerUnit : 1.11);
  for (const sign of [1, -1]) {
    const point = {
      x: nearest.point.x + ((sign * dx) / length) * offset,
      z: nearest.point.z + ((sign * dz) / length) * offset,
    };
    if (!inside(point)) return point;
  }
  return null;
}
