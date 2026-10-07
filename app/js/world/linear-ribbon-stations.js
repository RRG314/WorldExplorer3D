// Mapped vertices describe the horizontal route, not the terrain resolution.
// A two-vertex hillside path can be hundreds of metres long. Sampling only
// its ends draws a suspended chord through every intervening hill/cutting.
// Keep all source bends and exact engineered-profile stations, with bounded
// spacing between them. This is publication scratch, never a second route.
export function linearRibbonStations(feature, points, maxStep = 2) {
  if (!Array.isArray(points) || points.length < 2) return [];
  if (!Number.isFinite(maxStep) || maxStep <= 0) throw new RangeError('Invalid path spacing');
  const profile = points === feature?.pts ? feature.transportSurfaceModel?.distances : null;
  const result = [points[0]];
  let along = 0, station = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (!Number.isFinite(length)) throw new Error('Nonfinite mapped path');
    if (length < 1e-8) continue;
    const count = Math.ceil(length / maxStep), distances = [];
    for (let n = 1; n < count; n++) distances.push(length * n / count);
    if (profile) {
      while (station < profile.length && profile[station] <= along) station++;
      while (station < profile.length && profile[station] < along + length) {
        distances.push(profile[station++] - along);
      }
      distances.sort((x, y) => x - y);
    }
    let previous = 0;
    for (const d of distances) {
      if (d - previous < 1e-6 || length - d < 1e-6) continue;
      result.push({ x: a.x + dx * d / length, z: a.z + dz * d / length });
      previous = d;
    }
    result.push(b);
    along += length;
  }
  return result;
}
