function aircraftGearSamplePoints(x, z, yaw, dimensions = {}) {
  const forwardX = Math.sin(Number(yaw) || 0);
  const forwardZ = Math.cos(Number(yaw) || 0);
  const rightX = Math.cos(Number(yaw) || 0);
  const rightZ = -Math.sin(Number(yaw) || 0);
  const hasDimensions = Number.isFinite(Number(dimensions.length));
  const length = Math.max(3, Number(dimensions.length) || 7.9);
  const span = Math.max(3, Number(dimensions.wingspan || dimensions.rotorDiameter) || 7.2);
  const nose = hasDimensions ? Math.min(length * .36, Math.max(1.8, length * .3)) : 1.8;
  const tail = hasDimensions ? Math.min(length * .34, Math.max(1.35, length * .24)) : 1.35;
  const lateral = hasDimensions ? Math.min(span * .26, Math.max(1.25, span * .17)) : 1.25;
  return Object.freeze([
    Object.freeze({ x: Number(x), z: Number(z) }),
    Object.freeze({ x: Number(x) + forwardX * nose, z: Number(z) + forwardZ * nose }),
    Object.freeze({ x: Number(x) - forwardX * tail, z: Number(z) - forwardZ * tail }),
    Object.freeze({ x: Number(x) + rightX * lateral, z: Number(z) + rightZ * lateral }),
    Object.freeze({ x: Number(x) - rightX * lateral, z: Number(z) - rightZ * lateral })
  ]);
}

export { aircraftGearSamplePoints };
