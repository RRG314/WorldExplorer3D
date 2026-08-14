function finitePoint(point) {
  return point && [point.x, point.y, point.z].every(Number.isFinite);
}

export function resolveChaseCameraTerrainCollision(origin, target, sampleTerrainY, options = {}) {
  if (!finitePoint(origin) || !finitePoint(target) || typeof sampleTerrainY !== 'function') {
    return { ...target, collided: false };
  }
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!(distance > 1)) return { ...target, collided: false };

  const clearance = Math.max(0.2, Number(options.clearance) || 0.45);
  const sampleSpacing = Math.max(0.35, Number(options.sampleSpacing) || 0.7);
  const steps = Math.max(6, Math.ceil(distance / sampleSpacing));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const x = origin.x + dx * t;
    const y = origin.y + dy * t;
    const z = origin.z + dz * t;
    const terrainY = Number(sampleTerrainY(x, z));
    if (!Number.isFinite(terrainY) || y >= terrainY + clearance) continue;

    // Stop before the first terrain crossing instead of lifting the camera
    // through the hillside, which would change the intended chase framing.
    const safeT = Math.max(0.08, (step - 1.15) / steps);
    return {
      x: origin.x + dx * safeT,
      y: origin.y + dy * safeT,
      z: origin.z + dz * safeT,
      collided: true
    };
  }
  return { ...target, collided: false };
}
