const EARTH_GRAVITY_MPS2 = 9.80665;

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

function updateRoadVehicleVerticalState(input = {}) {
  const dt = clamp(input.dt, 0, 0.05);
  const metersPerWorldUnit = Math.max(0.01, Math.abs(finite(input.metersPerWorldUnit, 1.11)));
  const bodyOffset = Math.max(0.2, finite(input.bodyOffset, 1.21));
  const supportY = finite(input.supportY);
  const targetY = supportY + bodyOffset;
  const bodyY = finite(input.bodyY, targetY);
  const groundedBodyY = Number.isFinite(Number(input.groundedBodyY))
    ? Number(input.groundedBodyY)
    : targetY;
  const previousSupportY = Number.isFinite(Number(input.previousSupportY))
    ? Number(input.previousSupportY)
    : supportY;
  const horizontalSpeedMps = Math.max(0, Math.abs(finite(input.horizontalSpeedMps)));
  const previousPitch = finite(input.previousPitch);
  const surfacePitch = finite(input.surfacePitch);
  const airborneTime = Math.max(0, finite(input.airborneTime));
  const gravityWorld = Math.max(0.1, finite(input.gravityMps2, EARTH_GRAVITY_MPS2)) / metersPerWorldUnit;
  const supportDropMeters = Math.max(0, previousSupportY - supportY) * metersPerWorldUnit;
  const crestRelease = previousPitch < -0.055 && surfacePitch - previousPitch > 0.035;
  const droveOffEdge = supportDropMeters >= 0.72;
  const fastEnoughToLaunch = horizontalSpeedMps >= (crestRelease ? 8 : 5.5);

  if (input.isAirborne !== true && fastEnoughToLaunch && (crestRelease || droveOffEdge)) {
    const rampVelocityMps = crestRelease
      ? clamp(Math.sin(Math.abs(previousPitch)) * horizontalSpeedMps, 1.2, 8.5)
      : 0;
    return Object.freeze({
      y: Math.max(bodyY, targetY),
      verticalVelocity: rampVelocityMps / metersPerWorldUnit,
      isAirborne: true,
      airborneTime: dt,
      pitch: crestRelease ? previousPitch : Math.min(0, surfacePitch),
      landed: false,
      launched: true,
      launchReason: crestRelease ? 'ramp-crest' : 'surface-edge',
      landingImpactMps: 0,
      landingDamageForce: 0
    });
  }

  if (input.isAirborne === true) {
    const nextAirborneTime = airborneTime + dt;
    const nextVerticalVelocity = finite(input.verticalVelocity) - gravityWorld * dt;
    const nextY = bodyY + nextVerticalVelocity * dt;
    // A rising road/terrain surface can meet the chassis before the vehicle has
    // started descending. Treat that as contact too so fast terrain streaming
    // cannot leave the car visually or physically below the ground.
    const surfaceCaughtVehicle = targetY >= bodyY - 0.05;
    const canLand = nextAirborneTime >= 0.1 && nextY <= targetY &&
      (nextVerticalVelocity <= 0 || surfaceCaughtVehicle);
    if (canLand) {
      const impactMps = Math.max(0, -nextVerticalVelocity * metersPerWorldUnit);
      const suspensionResistance = clamp(input.suspensionResistance, 0, 0.55);
      const damagingSpeed = Math.max(0, impactMps - 4.2);
      return Object.freeze({
        y: targetY,
        verticalVelocity: 0,
        isAirborne: false,
        airborneTime: 0,
        pitch: surfacePitch,
        landed: true,
        launched: false,
        launchReason: '',
        landingImpactMps: impactMps,
        landingDamageForce: damagingSpeed * 9.5 * (1 - suspensionResistance)
      });
    }
    const flightPitch = horizontalSpeedMps > 0.5
      ? -Math.atan2(nextVerticalVelocity * metersPerWorldUnit, horizontalSpeedMps)
      : 0;
    return Object.freeze({
      y: nextY,
      verticalVelocity: nextVerticalVelocity,
      isAirborne: true,
      airborneTime: nextAirborneTime,
      pitch: clamp(flightPitch, -0.48, 0.48),
      landed: false,
      launched: false,
      launchReason: '',
      landingImpactMps: 0,
      landingDamageForce: 0
    });
  }

  return Object.freeze({
    y: groundedBodyY,
    verticalVelocity: 0,
    isAirborne: false,
    airborneTime: 0,
    pitch: surfacePitch,
    landed: false,
    launched: false,
    launchReason: '',
    landingImpactMps: 0,
    landingDamageForce: 0
  });
}

export { EARTH_GRAVITY_MPS2, updateRoadVehicleVerticalState };
