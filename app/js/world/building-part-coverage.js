import * as bundled from '../../../functions/vendor/polygon-clipping/index.js';
const polygons = bundled.default || globalThis.polygonClipping;

const area = multi => multi.reduce((total, polygon) => total + polygon.reduce((sum, ring, index) => {
  let signed = 0;
  for (let i = 0; i < ring.length - 1; i++) signed += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum + (index ? -1 : 1) * Math.abs(signed) / 2;
}, 0), 0);

// Successful tile downloads establish transport completeness, not architectural
// completeness. One accepted roof or wing must not erase an entire complex.
// Use union coverage: overlapping parts cannot count the same area twice.
export function buildingPartsCoverFootprint(outline, parts) {
  if (!Array.isArray(outline) || outline.length < 4 || !Array.isArray(parts) || !parts.length) return false;
  // Bounded work; uncertain/oversized input keeps the existing mapped outline.
  if (parts.length > 256 || outline.length + parts.reduce((n, ring) => n + (ring?.length || 0), 0) > 16384) return false;
  const origin = outline[0];
  if (![...outline, ...parts.flat()].every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return false;
  const sx = 111000 * Math.cos(origin[1] * Math.PI / 180);
  const local = ring => ring.map(p => [(p[0] - origin[0]) * sx, (p[1] - origin[1]) * 111000]);
  try {
    const parent = [local(outline)], total = area([parent]);
    if (!(total > 0)) return false;
    const remainder = polygons.difference(parent, ...parts.map(ring => [local(ring)]));
    // Numerical tolerance only, not permission to discard a missing wing.
    return area(remainder) <= Math.max(.01, total * 1e-6);
  } catch {
    return false;
  }
}
