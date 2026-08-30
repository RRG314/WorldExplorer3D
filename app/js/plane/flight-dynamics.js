const GRAVITY_MPS2 = 9.80665;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function resolveAircraftFlightTuning(catalog = {}) {
  const role = String(catalog.role || 'personal');
  const defaults = {
    personal: { stallSpeed: 13, rotationSpeed: 15.5, groundAcceleration: 6.4, pitchControl: 1, rollControl: 1, thrustResponse: .72, liftSlope: 3.2, inducedDrag: .11, turnResponse: 1, maxBank: .58, maxPitch: .46, maxClimbRate: 13 },
    aerobatic: { stallSpeed: 18, rotationSpeed: 21, groundAcceleration: 9.2, pitchControl: 1.36, rollControl: 1.42, thrustResponse: .82, liftSlope: 3.8, inducedDrag: .075, turnResponse: 1.2, maxBank: Math.PI, maxPitch: Math.PI, maxClimbRate: 55 },
    bush: { stallSpeed: 13.5, rotationSpeed: 16, groundAcceleration: 5.4, pitchControl: .95, rollControl: .94, thrustResponse: .62, liftSlope: 3.15, inducedDrag: .12, turnResponse: .96, maxBank: .54, maxPitch: .44, maxClimbRate: 12 },
    business: { stallSpeed: 25, rotationSpeed: 29, groundAcceleration: 4.1, pitchControl: .72, rollControl: .7, thrustResponse: .34, liftSlope: 2.9, inducedDrag: .1, turnResponse: .82, maxBank: .46, maxPitch: .36, maxClimbRate: 22 },
    regional: { stallSpeed: 32, rotationSpeed: 37, groundAcceleration: 2.9, pitchControl: .5, rollControl: .48, thrustResponse: .22, liftSlope: 2.75, inducedDrag: .09, turnResponse: .7, maxBank: .38, maxPitch: .3, maxClimbRate: 17 },
    airliner: { stallSpeed: 42, rotationSpeed: 49, groundAcceleration: 2.25, pitchControl: .32, rollControl: .3, thrustResponse: .13, liftSlope: 2.55, inducedDrag: .08, turnResponse: .58, maxBank: .28, maxPitch: .22, maxClimbRate: 13 }
  };
  return Object.freeze({ ...(defaults[role] || defaults.personal), ...(catalog.flightDynamics || {}) });
}

function integrateFixedWingFlight(state = {}, input = {}, catalog = {}, dt = 0) {
  const step = clamp(dt, 0, .05);
  const tuning = resolveAircraftFlightTuning(catalog);
  const topSpeed = Math.max(tuning.rotationSpeed + 1, Number(input.topSpeed) || tuning.rotationSpeed * 4);
  const throttle = clamp(input.throttle, 0, 1);
  const powerFactor = clamp(input.powerFactor ?? 1, 0, 1);
  let speed = Math.max(0, Number(state.speed) || 0);
  let climbRate = Number(state.climbRate) || 0;
  if (String(catalog.role || '') === 'aerobatic') {
    const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const pitch = wrap(Number(state.pitch) || 0);
    const roll = wrap(Number(state.roll) || 0);
    let flightPathAngle = wrap(Number(state.flightPathAngle) || Math.atan2(climbRate, Math.max(1, speed)));
    const angleOfAttack = clamp(wrap(pitch - flightPathAngle), -.52, .52);
    const targetSpeed = throttle * topSpeed * powerFactor;
    const gravityAlongPath = GRAVITY_MPS2 * Math.sin(flightPathAngle);
    const maneuverDrag = (Math.abs(angleOfAttack) * .28 + Math.abs(Number(state.pitchRate) || 0) * .06) * Math.max(speed, tuning.stallSpeed);
    speed = clamp(speed + ((targetSpeed - speed) * tuning.thrustResponse - gravityAlongPath - maneuverDrag) * step, 0, topSpeed);
    const controlAuthority = clamp(speed / Math.max(1, tuning.stallSpeed), .24, 1.25);
    const pathError = wrap(pitch - flightPathAngle);
    const pathRate = clamp(pathError * 3.4 * controlAuthority + (Number(state.pitchRate) || 0) * .46, -2.2, 2.2);
    flightPathAngle = wrap(flightPathAngle + pathRate * step);
    const horizontalSpeed = speed * Math.cos(flightPathAngle);
    climbRate = speed * Math.sin(flightPathAngle);
    const stalled = speed < tuning.stallSpeed * .78;
    const liftLoad = clamp(1 + Math.abs(pathRate) * speed / Math.max(10, GRAVITY_MPS2 * 4.2), 0, 5.5);
    const turnRate = clamp(
      GRAVITY_MPS2 * Math.sin(roll) * Math.max(.18, Math.abs(Math.cos(flightPathAngle))) / Math.max(tuning.stallSpeed, speed) * tuning.turnResponse,
      -1.12,
      1.12
    );
    return Object.freeze({ speed, climbRate, horizontalSpeed, flightPathAngle, angleOfAttack, liftLoad, turnRate, stalled, tuning });
  }
  const pitch = clamp(state.pitch, -tuning.maxPitch, tuning.maxPitch);
  const roll = clamp(state.roll, -tuning.maxBank, tuning.maxBank);
  const flightPathAngle = Math.atan2(climbRate, Math.max(1, speed));
  const angleOfAttack = clamp(pitch - flightPathAngle, -.28, .36);
  const speedRatio = speed / Math.max(1, tuning.stallSpeed);
  const baselineLift = clamp(speedRatio * speedRatio, 0, 1);
  const liftLoad = clamp(
    baselineLift + angleOfAttack * tuning.liftSlope * clamp(speedRatio * speedRatio, .18, 2.4),
    0,
    2.45
  );
  const verticalAcceleration = (liftLoad * Math.cos(roll) - 1) * GRAVITY_MPS2;
  climbRate = clamp(
    climbRate + verticalAcceleration * step,
    -Math.max(16, tuning.maxClimbRate * 1.45),
    tuning.maxClimbRate
  );

  const targetSpeed = throttle * topSpeed * powerFactor;
  const thrustAcceleration = (targetSpeed - speed) * tuning.thrustResponse;
  const inducedDrag = Math.max(0, liftLoad - .82) ** 2 * tuning.inducedDrag * Math.max(speed, tuning.stallSpeed);
  const angleDrag = Math.abs(angleOfAttack) * Math.max(speed, tuning.stallSpeed) * .16;
  const climbEnergy = Math.max(0, climbRate) * GRAVITY_MPS2 / Math.max(tuning.stallSpeed, speed);
  speed = clamp(speed + (thrustAcceleration - inducedDrag - angleDrag - climbEnergy) * step, 0, topSpeed);

  const stalled = speed < tuning.stallSpeed * .92;
  const turnAuthority = clamp(liftLoad, stalled ? .08 : .25, 1.35);
  const turnRate = clamp(
    GRAVITY_MPS2 * Math.tan(roll) / Math.max(tuning.stallSpeed, speed) * tuning.turnResponse * turnAuthority,
    -.72,
    .72
  );
  const horizontalSpeed = Math.sqrt(Math.max(0, speed * speed - Math.min(speed * speed, climbRate * climbRate)));

  return Object.freeze({
    speed,
    climbRate,
    horizontalSpeed,
    flightPathAngle: Math.atan2(climbRate, Math.max(1, horizontalSpeed)),
    angleOfAttack,
    liftLoad,
    turnRate,
    stalled,
    tuning
  });
}

export { GRAVITY_MPS2, integrateFixedWingFlight, resolveAircraftFlightTuning };
