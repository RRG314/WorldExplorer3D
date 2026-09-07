const PARACHUTE_POLICY = Object.freeze({
  minimumClearance: 3.25,
  minimumAutomaticOfferClearance: 8,
  minimumAircraftExitClearance: 12,
  automaticEquipClearance: 18,
  minimumDescentSpeed: 0.8,
  terminalDescentSpeed: 6.4,
  flaredDescentSpeed: 3.1,
  flareRecovery: 8.2,
  deployedGravity: -2.35,
  canopyForwardSpeed: 8.5,
  freefallControlSpeed: 12,
  freefallTerminalSpeed: 34,
  canopyBankLimit: .72,
  canopyTurnRate: 1.18,
  canopyGlideSpeed: 10.5
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function evaluateParachuteDeployment(input = {}) {
  if (String(input.environment || 'EARTH').toUpperCase() !== 'EARTH') {
    return Object.freeze({ allowed: false, reason: 'earth-only', clearance: 0 });
  }
  if (String(input.travelMode || 'walk') !== 'walk') {
    return Object.freeze({ allowed: false, reason: 'walking-only', clearance: 0 });
  }
  if (input.onGround === true) {
    return Object.freeze({ allowed: false, reason: 'on-ground', clearance: 0 });
  }
  const clearance = Math.max(0, finite(input.feetY) - finite(input.groundY));
  if (finite(input.verticalVelocity) > -PARACHUTE_POLICY.minimumDescentSpeed) {
    return Object.freeze({ allowed: false, reason: 'not-descending', clearance });
  }
  if (clearance < PARACHUTE_POLICY.minimumClearance) {
    return Object.freeze({ allowed: false, reason: 'too-low', clearance });
  }
  return Object.freeze({ allowed: true, reason: '', clearance });
}

function evaluateHighDropParachuteOffer(input = {}) {
  const clearance = Math.max(0, finite(input.feetY) - finite(input.groundY));
  if (String(input.environment || 'EARTH').toUpperCase() !== 'EARTH') {
    return Object.freeze({ allowed: false, reason: 'earth-only', clearance });
  }
  if (String(input.travelMode || 'walk') !== 'walk') {
    return Object.freeze({ allowed: false, reason: 'walking-only', clearance });
  }
  if (input.alreadySkydiving === true || input.onGround === true) {
    return Object.freeze({ allowed: false, reason: 'already-resolved', clearance });
  }
  if (input.leftElevatedSupport !== true) {
    return Object.freeze({ allowed: false, reason: 'not-an-elevated-drop', clearance });
  }
  if (finite(input.verticalVelocity) >= 0) {
    return Object.freeze({ allowed: false, reason: 'not-descending', clearance });
  }
  if (clearance < PARACHUTE_POLICY.minimumAutomaticOfferClearance) {
    return Object.freeze({ allowed: false, reason: 'too-low', clearance });
  }
  return Object.freeze({ allowed: true, reason: '', clearance, autoEquip: true });
}

function integrateParachuteFall(verticalVelocity, dt, deployed = false, flaring = false) {
  const step = Math.max(0, Math.min(0.25, finite(dt)));
  if (!deployed) return finite(verticalVelocity);
  if (flaring) {
    return Math.min(
      -PARACHUTE_POLICY.flaredDescentSpeed,
      Math.max(-PARACHUTE_POLICY.terminalDescentSpeed, finite(verticalVelocity)) + PARACHUTE_POLICY.flareRecovery * step
    );
  }
  return Math.max(
    -PARACHUTE_POLICY.terminalDescentSpeed,
    finite(verticalVelocity) + PARACHUTE_POLICY.deployedGravity * step
  );
}

function evaluateAircraftSkydivingExit(input = {}) {
  const clearance = Math.max(0, finite(input.aircraftY) - finite(input.groundY));
  if (input.airborne !== true) return Object.freeze({ allowed: false, reason: 'aircraft-grounded', clearance, autoEquip: false });
  if (clearance < PARACHUTE_POLICY.minimumAircraftExitClearance) {
    return Object.freeze({ allowed: false, reason: 'too-low-to-jump', clearance, autoEquip: false });
  }
  return Object.freeze({
    allowed: true,
    reason: '',
    clearance,
    autoEquip: clearance >= PARACHUTE_POLICY.automaticEquipClearance
  });
}

function parachuteHorizontalSpeed(deployed = false) {
  return deployed ? PARACHUTE_POLICY.canopyForwardSpeed : PARACHUTE_POLICY.freefallControlSpeed;
}

function integrateSkydivingDynamics(previous = {}, input = {}, dt = 0) {
  const prior = previous && typeof previous === 'object' ? previous : {};
  const step = Math.max(0, Math.min(.05, finite(dt)));
  const deployed = input.deployed === true;
  const forward = Math.max(-1, Math.min(1, finite(input.forward)));
  const turn = Math.max(-1, Math.min(1, finite(input.turn)));
  const flare = deployed && input.flare === true;
  const initialHeading = Number.isFinite(prior.heading)
    ? prior.heading
    : Math.atan2(finite(input.vx), finite(input.vz));
  const targetBank = turn * (deployed ? PARACHUTE_POLICY.canopyBankLimit : .42);
  const bankRate = deployed ? 4.2 : 3.1;
  const bank = finite(prior.bank) + (targetBank - finite(prior.bank)) * (1 - Math.exp(-bankRate * step));
  const turnRate = deployed
    ? bank / Math.max(.1, PARACHUTE_POLICY.canopyBankLimit) * PARACHUTE_POLICY.canopyTurnRate
    : turn * .74;
  // Preserve the established traversal convention used by aircraft and the
  // world camera: positive turn input advances positive world heading.
  const heading = initialHeading + turnRate * step;
  let verticalSpeed = finite(input.verticalVelocity, -1.2);
  let horizontalSpeed;
  let bodyPitch;
  if (deployed) {
    const glideTarget = PARACHUTE_POLICY.canopyGlideSpeed * (flare ? .48 : 1 + forward * .16) * (1 - Math.abs(bank) * .16);
    horizontalSpeed = finite(prior.horizontalSpeed, glideTarget) + (glideTarget - finite(prior.horizontalSpeed, glideTarget)) * (1 - Math.exp(-3.2 * step));
    const sinkTarget = -(flare ? PARACHUTE_POLICY.flaredDescentSpeed : PARACHUTE_POLICY.terminalDescentSpeed + Math.abs(bank) * 2.1);
    verticalSpeed += (sinkTarget - verticalSpeed) * (1 - Math.exp(-(flare ? 5.4 : 3.2) * step));
    bodyPitch = -.08 + (flare ? .28 : forward * -.08);
  } else {
    const trackTarget = PARACHUTE_POLICY.freefallControlSpeed * (1 + Math.max(0, forward) * .48);
    horizontalSpeed = finite(prior.horizontalSpeed, Math.hypot(finite(input.vx), finite(input.vz))) +
      (trackTarget - finite(prior.horizontalSpeed, trackTarget)) * (1 - Math.exp(-1.65 * step));
    verticalSpeed = Math.max(-PARACHUTE_POLICY.freefallTerminalSpeed, verticalSpeed - 9.80665 * step);
    bodyPitch = 1.02 - Math.max(-.18, forward * .28);
  }
  return Object.freeze({
    phase: deployed ? 'canopy' : 'freefall',
    heading,
    bank,
    bodyPitch,
    horizontalSpeed,
    verticalSpeed,
    vx: Math.sin(heading) * horizontalSpeed,
    vz: Math.cos(heading) * horizontalSpeed,
    flare,
    profileId: 'standard-ram-air-v1'
  });
}

export {
  PARACHUTE_POLICY,
  evaluateAircraftSkydivingExit,
  evaluateHighDropParachuteOffer,
  evaluateParachuteDeployment,
  integrateParachuteFall,
  integrateSkydivingDynamics,
  parachuteHorizontalSpeed
};
