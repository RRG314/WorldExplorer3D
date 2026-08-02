const PRIMARY_TRAVEL_MODE_ORDER = Object.freeze(['walk', 'drive', 'plane', 'drone']);

function nextPrimaryTravelMode(currentMode = 'walk') {
  const index = PRIMARY_TRAVEL_MODE_ORDER.indexOf(String(currentMode || ''));
  return PRIMARY_TRAVEL_MODE_ORDER[(index + 1 + PRIMARY_TRAVEL_MODE_ORDER.length) % PRIMARY_TRAVEL_MODE_ORDER.length];
}

function resolveCarDriveCommand(options = {}) {
  const speed = Number(options.speed) || 0;
  const throttle = Math.max(0, Number(options.throttle) || 0);
  const reverse = Math.max(0, Number(options.reverse) || 0);
  const brake = Math.max(0, Number(options.brake) || 0);
  const stopSpeed = Math.max(0.05, Number(options.stopSpeed) || 0.5);
  const requestedDirection = throttle > 0.05 && reverse <= 0.05
    ? 1
    : reverse > 0.05 && throttle <= 0.05
      ? -1
      : 0;
  const movingDirection = speed > stopSpeed ? 1 : speed < -stopSpeed ? -1 : 0;
  const changingDirection = requestedDirection !== 0 && movingDirection !== 0 && requestedDirection !== movingDirection;

  return Object.freeze({
    requestedDirection,
    movingDirection,
    changingDirection,
    serviceBrake: changingDirection,
    handbrake: brake > 0.05,
    forward: requestedDirection === 1 && !changingDirection ? throttle : 0,
    reverse: requestedDirection === -1 && !changingDirection ? reverse : 0
  });
}

function integrateAerobaticAttitude(state = {}, input = {}, dt = 0) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  const authority = Math.max(0.3, Math.min(1.25, Number(input.authority) || 1));
  const pitchInput = Math.max(-1, Math.min(1, Number(input.pitch) || 0));
  const rollInput = Math.max(-1, Math.min(1, Number(input.roll) || 0));
  const damp = (current, target, rate) => current + (target - current) * (1 - Math.exp(-rate * step));
  const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const pitchRate = damp(Number(state.pitchRate) || 0, pitchInput * 1.12 * authority, 4.2);
  const rollRate = damp(Number(state.rollRate) || 0, rollInput * 1.72 * authority, 5.2);
  let pitch = wrap((Number(state.pitch) || 0) + pitchRate * step - Math.max(0, Number(input.stallBlend) || 0) * 0.12 * step);
  let roll = wrap((Number(state.roll) || 0) + rollRate * step);
  if (Math.abs(pitchInput) < 0.05) pitch = damp(pitch, 0, 0.72);
  if (Math.abs(rollInput) < 0.05) roll = damp(roll, 0, 1.05);
  return Object.freeze({ pitch, roll, pitchRate, rollRate });
}

function aircraftForwardVector(yaw = 0, pitch = 0, roll = 0) {
  const heading = Number(yaw) || 0;
  const elevation = Number(pitch) || 0;
  // Roll rotates the aircraft around its longitudinal axis, so it must not
  // alter the direction of that axis.
  void roll;
  const horizontal = Math.cos(elevation);
  return Object.freeze({
    x: Math.sin(heading) * horizontal,
    y: Math.sin(elevation),
    z: Math.cos(heading) * horizontal
  });
}

function aircraftChaseOffset(yaw = 0, pitch = 0, distance = 12, height = 4.2) {
  // Third-person chase cameras follow heading but deliberately ignore aircraft
  // pitch. This is the stable v3.1 behavior: loops do not swing the camera over
  // and underneath the aircraft, while cockpit view still inherits attitude.
  void pitch;
  const forward = aircraftForwardVector(yaw, 0);
  const chaseDistance = Math.max(0, Number(distance) || 0);
  return Object.freeze({
    x: -forward.x * chaseDistance,
    y: Number(height) || 0,
    z: -forward.z * chaseDistance
  });
}

function arcadeSteeringYawTarget(speed = 0, steeringAngle = 0, wheelBase = 2.6, maxYawRate = Infinity) {
  const target = Math.abs(Number(speed) || 0) /
    Math.max(0.1, Number(wheelBase) || 2.6) *
    Math.tan(Number(steeringAngle) || 0);
  const limit = Math.max(0, Number(maxYawRate));
  return Math.max(-limit, Math.min(limit, target));
}

function aircraftBankTurnFactor(roll = 0, rollRate = 0) {
  const aerobaticBlend = Math.max(0, Math.min(1, Math.abs(Number(rollRate) || 0) / 0.72));
  return Math.sin(Number(roll) || 0) * (1 - aerobaticBlend);
}

export {
  PRIMARY_TRAVEL_MODE_ORDER,
  arcadeSteeringYawTarget,
  aircraftChaseOffset,
  aircraftBankTurnFactor,
  aircraftForwardVector,
  integrateAerobaticAttitude,
  nextPrimaryTravelMode,
  resolveCarDriveCommand
};
