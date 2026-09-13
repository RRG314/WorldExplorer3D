export function frontageHit(point, nx, nz, edges, minimum, maximum) {
  let best = null;
  for (const edge of edges) {
    const { a, b, extendedFrontage=0 } = edge;
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (Math.abs((dx * nx + dz * nz) / length) > 0.25) continue;
    const den = nx * dz - nz * dx;
    if (Math.abs(den) < 1e-8) continue;
    const ax = a.x - point.x, az = a.z - point.z;
    const distance = (ax * dz - az * dx) / den;
    const t = (ax * nz - az * nx) / den;
    // A close facade blocks the ray even when it lies inside the nominal
    // sidewalk. Looking through it would mistake a rear wall for frontage.
    if (t >= -1e-7 && t <= 1 + 1e-7 && distance >= 0 && (!best || distance < best.distance))
      best = { edge, distance, maximum: Math.max(maximum, minimum + extendedFrontage) };
  }
  return best && best.distance >= minimum && best.distance <= best.maximum ? best : null;
}
