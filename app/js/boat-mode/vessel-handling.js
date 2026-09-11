function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function resolveVesselHandling(catalog = {}) {
  const massKg = Math.max(1200, Number(catalog.dimensions?.massKg || catalog.massKg) || 2200);
  const length = Math.max(4, Number(catalog.dimensions?.length || catalog.length) || 8);
  const displacement = clamp((Math.log10(massKg) - 3.25) / 4.45, 0, 1);
  const size = clamp((length - 7) / 203, 0, 1);
  const inertia = clamp(displacement * .72 + size * .28, 0, 1);
  const role = String(catalog.role || 'runabout');
  const roleOverrides = {
    tug: { minimumYawRate: .025, maxYawRate: .28 },
    ferry: { minimumYawRate: .006, maxYawRate: .11 },
    research: { minimumYawRate: .005, maxYawRate: .1 },
    cargo: { minimumYawRate: .002, maxYawRate: .065 }
  }[role] || {};
  return Object.freeze({
    inertia,
    throttleResponse: lerp(3.1, .16, inertia),
    accelerationGain: lerp(1, .22, inertia),
    rudderResponse: lerp(3.4, .18, inertia),
    coastDeceleration: lerp(1.35, .045, inertia),
    serviceBrakeRate: lerp(4.6, .2, inertia),
    reverseAuthority: lerp(.68, .18, inertia),
    lateralDampingScale: lerp(1.08, .62, inertia),
    dragExposureScale: lerp(1, .15, inertia),
    waveResistanceScale: lerp(1, .18, inertia),
    minimumYawRate: roleOverrides.minimumYawRate ?? lerp(.045, .004, inertia),
    maxYawRate: roleOverrides.maxYawRate ?? lerp(1.05, .075, inertia)
  });
}

function vesselYawRateTarget(catalog = {}, forwardSpeed = 0, steerInput = 0) {
  const handling = resolveVesselHandling(catalog);
  const speed = Number(forwardSpeed) || 0;
  const direction = speed < -.05 ? -1 : 1;
  const turningRadius = Math.max(1, Number(catalog.performance?.turningRadius) || Number(catalog.dimensions?.length) || 8);
  const kinematicRate = Math.abs(speed) / turningRadius;
  const usableRate = clamp(
    kinematicRate,
    Math.abs(speed) > .12 ? handling.minimumYawRate : 0,
    handling.maxYawRate
  );
  return clamp(Number(steerInput) || 0, -1, 1) * direction * usableRate * Math.max(.1, Number(catalog.performance?.steeringScale) || 1);
}

export { resolveVesselHandling, vesselYawRateTarget };
