function resolveThirdPersonCameraCollision({
  anchor,
  target,
  checkBuildingCollision,
  probeSpacing = 0.45,
  clearance = 0.32
} = {}) {
  if (!anchor || !target || typeof checkBuildingCollision !== 'function') {
    return { ...target, collided: false, ratio: 1 };
  }
  const deltaX = Number(target.x) - Number(anchor.x);
  const deltaY = Number(target.y) - Number(anchor.y);
  const deltaZ = Number(target.z) - Number(anchor.z);
  const distance = Math.hypot(deltaX, deltaY, deltaZ);
  if (!(distance > 0.5)) return { ...target, collided: false, ratio: 1 };

  const probes = Math.max(8, Math.ceil(distance / Math.max(0.2, Number(probeSpacing) || 0.45)));
  for (let probe = 1; probe <= probes; probe += 1) {
    const ratio = probe / probes;
    const x = Number(anchor.x) + deltaX * ratio;
    const y = Number(anchor.y) + deltaY * ratio;
    const z = Number(anchor.z) + deltaZ * ratio;
    const collision = checkBuildingCollision(x, z, 0.28, {
      actorBaseY: y - 0.28,
      actorHeight: 0.56,
      acceptCollision: (candidate) => candidate?.building?.buildingType !== 'bridge_guardrail'
    });
    if (collision?.collision !== true) continue;
    const safeRatio = Math.max(0.08, ratio - Math.max(0.04, Number(clearance) / distance));
    return {
      x: Number(anchor.x) + deltaX * safeRatio,
      y: Number(anchor.y) + deltaY * safeRatio,
      z: Number(anchor.z) + deltaZ * safeRatio,
      collided: true,
      ratio: safeRatio
    };
  }
  return { ...target, collided: false, ratio: 1 };
}

export { resolveThirdPersonCameraCollision };
