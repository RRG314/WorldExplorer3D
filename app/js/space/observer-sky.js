// Positions are heliocentric equatorial light years: +X RA 0, +Y north,
// +Z RA 6h. Rendering scale never changes this catalog frame.
export function catalogStarPosition(star) {
  const ra = star.ra * Math.PI / 12, dec = star.dec * Math.PI / 180;
  const distance = Number(star.dist);
  if (!(distance > 0)) return null;
  return { x: distance * Math.cos(dec) * Math.cos(ra), y: distance * Math.sin(dec), z: distance * Math.cos(dec) * Math.sin(ra) };
}
export function projectCatalogStar(star, observer = { x: 0, y: 0, z: 0 }, radius = 300000) {
  const physical = catalogStarPosition(star);
  if (!physical && Math.hypot(observer.x, observer.y, observer.z) > 0.001) return null;
  const p = physical || catalogStarPosition({ ...star, dist: 1 });
  const x = p.x - observer.x, y = p.y - observer.y, z = p.z - observer.z;
  const distance = Math.hypot(x, y, z);
  if (distance < 1e-9) return null;
  return { x: x / distance * radius, y: y / distance * radius, z: z / distance * radius,
    distanceLy: physical ? distance : null,
    magnitude: physical ? star.mag + 5 * Math.log10(distance / star.dist) : star.mag };
}
