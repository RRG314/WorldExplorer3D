function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function resolvePlanetarySurfaceBoundary(position = {}, manifest = {}, options = {}) {
  const x = finite(position.x, 'Planetary position X');
  const z = finite(position.z, 'Planetary position Z');
  const bounds = manifest.localBounds;
  const placement = manifest.renderPlacement || { x: 0, z: 0 };
  if (!bounds) return Object.freeze({ x, z, clamped: false, edge: null });
  const width = finite(bounds.maxX, 'Surface maximum X') - finite(bounds.minX, 'Surface minimum X');
  const depth = finite(bounds.maxZ, 'Surface maximum Z') - finite(bounds.minZ, 'Surface minimum Z');
  const maximumInset = Math.max(0, Math.min(width, depth) * 0.45);
  const inset = Math.min(maximumInset, Math.max(0, Number(options.inset) || 0));
  const minX = finite(placement.x ?? 0, 'Surface placement X') + bounds.minX + inset;
  const maxX = finite(placement.x ?? 0, 'Surface placement X') + bounds.maxX - inset;
  const minZ = finite(placement.z ?? 0, 'Surface placement Z') + bounds.minZ + inset;
  const maxZ = finite(placement.z ?? 0, 'Surface placement Z') + bounds.maxZ - inset;
  const resolvedX = Math.max(minX, Math.min(maxX, x));
  const resolvedZ = Math.max(minZ, Math.min(maxZ, z));
  const edges = [];
  if (x < minX) edges.push('west');
  if (x > maxX) edges.push('east');
  if (z < minZ) edges.push('north');
  if (z > maxZ) edges.push('south');
  return Object.freeze({
    x: resolvedX,
    z: resolvedZ,
    clamped: resolvedX !== x || resolvedZ !== z,
    edge: edges.length > 0 ? edges.join('-') : null,
    bounds: Object.freeze({ minX, maxX, minZ, maxZ })
  });
}

export { resolvePlanetarySurfaceBoundary };
