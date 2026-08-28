function aircraftGearSamplePoints(x, z, yaw) {
  const forwardX = Math.sin(Number(yaw) || 0);
  const forwardZ = Math.cos(Number(yaw) || 0);
  const rightX = Math.cos(Number(yaw) || 0);
  const rightZ = -Math.sin(Number(yaw) || 0);
  return Object.freeze([
    Object.freeze({ x: Number(x), z: Number(z) }),
    Object.freeze({ x: Number(x) + forwardX * 1.8, z: Number(z) + forwardZ * 1.8 }),
    Object.freeze({ x: Number(x) - forwardX * 1.35, z: Number(z) - forwardZ * 1.35 }),
    Object.freeze({ x: Number(x) + rightX * 1.25, z: Number(z) + rightZ * 1.25 }),
    Object.freeze({ x: Number(x) - rightX * 1.25, z: Number(z) - rightZ * 1.25 })
  ]);
}

export { aircraftGearSamplePoints };
