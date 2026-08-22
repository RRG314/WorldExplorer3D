const PARACHUTE_POLICY = Object.freeze({
  minimumClearance: 3.25,
  minimumDescentSpeed: 0.8,
  terminalDescentSpeed: 6.4,
  deployedGravity: -2.35
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

function integrateParachuteFall(verticalVelocity, dt, deployed = false) {
  const step = Math.max(0, Math.min(0.25, finite(dt)));
  if (!deployed) return finite(verticalVelocity);
  return Math.max(
    -PARACHUTE_POLICY.terminalDescentSpeed,
    finite(verticalVelocity) + PARACHUTE_POLICY.deployedGravity * step
  );
}

export { PARACHUTE_POLICY, evaluateParachuteDeployment, integrateParachuteFall };
