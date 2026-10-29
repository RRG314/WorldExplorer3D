import {roadPlaneForces,roadPlaneHorizontalVelocity} from './road-plane-dynamics.js';
import {arcadeSteeringYawTarget,earthDrivingSteeringProfile,resolveCarDriveCommand} from '../controls/traversal-control-policy.js?v=9';
import {carSpeedToMph,carSpeedToWorldUnitsPerSecond,mphToCarSpeed} from './vehicle-speed-units.js?v=2';
import {ROAD_CAR_CONFIG,PLANETARY_ROVER_CONFIG} from './vehicle-config.js?v=1';
import {stepAutomaticPowertrain} from './automatic-powertrain.js';

// One planar driving calculation for player vehicles and controller-driven race
// actors. Callers retain surface/collision/pose ownership and their existing
// frame or server-session clock. No scene, context singleton or persistence.
export function prepareVehicleDriveFrame(car,actions,dt,config=ROAD_CAR_CONFIG){
  const steerControl = Number(actions.steer) || 0;
  const throttleControl = Math.max(0, Number(actions.throttle) || 0);
  const reverseControl = Math.max(0, Number(actions.reverse) || 0);
  const brakeControl = Math.max(0, Number(actions.brake) || 0);
  const left = steerControl > 0.05, right = steerControl < -0.05;
  const driveCommand = resolveCarDriveCommand({
    speed: car.speed,
    throttle: throttleControl,
    reverse: reverseControl,
    brake: brakeControl,
    serviceBrake: actions.serviceBrake
  });
  const gas = driveCommand.forward > 0.05;
  const reverse = driveCommand.reverse > 0.05;
  const braking = driveCommand.handbrake;
  const boostKey = Number(actions.boost) > 0.05;

  // Ensure new handling state exists (safe even if car object persisted)
  if (car.yawRate === undefined) car.yawRate = 0;
  if (car.vFwd === undefined) car.vFwd = 0;
  if (car.vLat === undefined) car.vLat = 0;
  if (car.rearSlip === undefined) car.rearSlip = 0;
  if (car.steerSm === undefined) car.steerSm = 0;
  if (car.throttleSm === undefined) car.throttleSm = 0;
  if (car.isDrifting === undefined) car.isDrifting = false;
  if (car._driftHoldTimer === undefined) car._driftHoldTimer = 0;
  if (car.vy === undefined) car.vy = 0;
  if (car._lastSurfaceY === undefined) car._lastSurfaceY = null;
  if (car._lastRawSurfaceY === undefined) car._lastRawSurfaceY = null;
  if (car._terrainAirTimer === undefined) car._terrainAirTimer = 0;
  if (car._roadContinuityTimer === undefined) car._roadContinuityTimer = 0;
  if (car._driveDirection === undefined) car._driveDirection = 1;

  if (boostKey && car.boostReady && !car.boost) {
    car.boost = true;
    car.boostTime = config.boostDur;
    car.boostReady = false;
    car.boostDecayTime = 0;
  }
  if (car.boost) {
    car.boostTime -= dt;
    if (car.boostTime <= 0) {
      car.boost = false;
      car.boostTime = 0;
      car.boostDecayTime = 1.5;
    }
  }
  if (!boostKey && !car.boost) car.boostReady = true;

  let boostDecayFactor = 0;
  if (car.boostDecayTime > 0) {
    car.boostDecayTime -= dt;
    boostDecayFactor = Math.max(0, car.boostDecayTime / 1.5);
  }

  return {serviceBrakeControl:actions.serviceBrake,steerControl,throttleControl,reverseControl,brakeControl,left,right,driveCommand,gas,reverse,braking,boostKey,boostDecayFactor};
}

export function stepVehiclePlanarDrive(car,dt,frame,environment){
  const {serviceBrakeControl,steerControl,throttleControl,brakeControl,left,right,driveCommand,gas,reverse,braking,boostDecayFactor}=frame;
  const {config=ROAD_CAR_CONFIG,planetary=false,metersPerWorldUnit=1.11,surfaceDynamics,
    vehicleHandling,vehicleCondition,vehicleUpgrades,characterVehicle,planetaryNormalMaxSpd=18}=environment;
  let {maxSpd,friction,accel}=environment;
  maxSpd *= surfaceDynamics.topSpeed;
  friction *= surfaceDynamics.rolling;
  accel *= surfaceDynamics.accel;
  if (!planetary) {
    maxSpd *= vehicleCondition.topSpeedScale;
    accel *= vehicleCondition.accelerationScale;
  }
  accel *= characterVehicle.accelerationScale;
  accel *= vehicleUpgrades.accelerationScale;

  const spd = Math.abs(car.speed);
  const hasGroundControl = !car.isAirborne;
  const canAccelerate = hasGroundControl && (planetary || vehicleCondition.operable);
  const driftBrakeSpeed = mphToCarSpeed(16);
  const earthDriftBrakeIntent = !planetary && braking && (left || right) && spd > driftBrakeSpeed;

  const tyreGrip=Math.max(.2,Math.min(1.35,Number(config.gripRoad||.96)*surfaceDynamics.grip*vehicleHandling.gripScale*vehicleCondition.gripScale*vehicleUpgrades.gripScale));
  const roadPlane=!planetary&&hasGroundControl&&environment.roadPlane?roadPlaneForces({...environment.roadPlane,forwardSpeedMetersPerSecond:carSpeedToMph(car.speed)*.44704,yawRate:car.yawRate||0,tyreGrip}):null;
  const gripAcceleration=(roadPlane?.tractionAcceleration??tyreGrip*9.81)/.22352;
  const lateralAcceleration=Math.min(gripAcceleration*.9,Math.abs((car.yawRate||0)*carSpeedToMph(car.speed)*.44704)/.22352);
  const availableLongitudinal=roadPlane?roadPlane.longitudinalTractionAcceleration/.22352:Math.sqrt(Math.max(0,gripAcceleration*gripAcceleration-lateralAcceleration*lateralAcceleration));
  // Apply grade gravity before the service brake so a brake with adequate
  // remaining traction can hold a stopped vehicle on the incline.
  if(roadPlane)car.speed+=roadPlane.gravityForward/.22352*dt;
  const transmission=planetary?1:stepAutomaticPowertrain(car,frame,dt,vehicleHandling);
  if (driveCommand.serviceBrake && hasGroundControl) {
    const configuredStopRate = Math.max(6, Number(planetary?PLANETARY_ROVER_CONFIG.brake:config.brake) || 18) *
      (planetary ? 1 : vehicleHandling.brakeScale * vehicleCondition.brakeScale) *
      characterVehicle.brakingScale * vehicleUpgrades.brakeScale;
    const stopRate=planetary?configuredStopRate:Math.min(configuredStopRate,availableLongitudinal);
    const brakeStrength = driveCommand.changingDirection ? 1 : Math.min(1, Math.max(0, Number(serviceBrakeControl) || 0));
    const nextMagnitude = Math.max(0, Math.abs(car.speed) - stopRate * brakeStrength * dt);
    car.speed = Math.sign(car.speed) * nextMagnitude;
    if (nextMagnitude < 0.5) car.speed = 0;
  }

  if (gas && !braking && !driveCommand.serviceBrake && canAccelerate) {
    let throttleAccel = planetary?accel:Math.min(accel*transmission,availableLongitudinal);
    if (planetary) {
      const lowSpeedBoost = Math.max(0, 1 - spd / 14);
      throttleAccel *= 1 + lowSpeedBoost * 0.75;
    }
    car.speed += throttleAccel * driveCommand.forward * (1 - spd / maxSpd * 0.7) * dt;
  }

  if (braking && spd > 0.5 && hasGroundControl) {
    if (earthDriftBrakeIntent) {
      // Handbrake-like brake response: keep momentum so brake+steer can initiate drift.
      const driftBrakeRate = 0.72;
      car.speed *= Math.exp(-driftBrakeRate * dt);
    } else {
      car.speed *= 1 - config.brakeForce * brakeControl * dt;
    }
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  }

  if (reverse && !braking && !driveCommand.serviceBrake && canAccelerate) {
    const reverseAccelScale = planetary ? 0.65 : 0.5;
    car.speed -= (planetary?accel:Math.min(accel*transmission,availableLongitudinal)) * reverseAccelScale * driveCommand.reverse * dt;
  }

  // Natural friction when coasting
  if (!gas && !reverse && !braking && !driveCommand.serviceBrake) {
    car.speed *= 1 - friction * dt * 0.01;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  }

  const reverseLimit=planetary?maxSpd*.3:Math.min(maxSpd*.3,mphToCarSpeed(18));
  car.speed = Math.max(-reverseLimit, Math.min(maxSpd, car.speed));

  if (boostDecayFactor > 0 && !car.boost) {
    const normalMaxSpd = planetary
      ? planetaryNormalMaxSpd
      : Math.min(config.maxSpd, mphToCarSpeed(vehicleHandling.topSpeedMph));
    if (Math.abs(car.speed) > normalMaxSpd) {
      const targetSpeed = normalMaxSpd + (Math.abs(car.speed) - normalMaxSpd) * boostDecayFactor;
      const sign = car.speed >= 0 ? 1 : -1;
      car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
    }
  }

  // =========================================================================
  // Existing arcade handling core (yaw inertia + slip)
  // =========================================================================

  const steerInput = steerControl;
  const throttleInput = gas && !reverse ? throttleControl : 0;

  const steerSmooth = 1 - Math.exp(-dt * 14 * characterVehicle.steeringResponseScale);
  const throttleSmooth = 1 - Math.exp(-dt * 6);
  if (Math.abs(steerInput) > 0.05 && steerInput * car.steerSm < 0) {
    // A deliberate steering reversal must not spend visible frames applying
    // the previous steering sign.
    car.steerSm = 0;
    car.yawRate *= 0.28;
    car.rearSlip *= 0.2;
  }
  car.steerSm += (steerInput - car.steerSm) * steerSmooth;
  car.throttleSm += (throttleInput - car.throttleSm) * throttleSmooth;

  const spdAbs = Math.abs(car.speed);
  const driveDirection =
    car.speed < -0.5 ? -1 :
    car.speed > 0.5 ? 1 :
    reverse ? -1 :
    1;
  if (driveDirection !== car._driveDirection) {
    car.yawRate = 0;
    car.vLat = 0;
    car.rearSlip = 0;
    car._driveDirection = driveDirection;
  }

  const earthSteering = earthDrivingSteeringProfile(carSpeedToMph(spdAbs));
  const maxSteer = planetary
    ? 1.02 + (0.28 - 1.02) * Math.max(0, Math.min(1, (spdAbs - 5) / 90))
    : earthSteering.maxSteeringAngle * vehicleHandling.steeringScale * vehicleCondition.steeringScale * characterVehicle.steeringAngleScale;

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const steerMag = Math.abs(car.steerSm);
  const speedNorm = planetary?clamp01((spdAbs-8)/70):clamp01((carSpeedToMph(spdAbs)-10)/60);
  const parkingTurnBlend = clamp01(1 - spdAbs / 14);
  const reverseTurnBlend = car.speed < -1 ? clamp01((Math.abs(car.speed) - 1) / 12) : 0;
  const lowSpeedTurnBoost = Math.max(parkingTurnBlend, reverseTurnBlend);
  const handbrakeTurnIntent = !planetary && braking && steerMag >= 0.1 && spdAbs >= 16;
  const handbrakeSteerBoost = handbrakeTurnIntent ? 1 + (0.20 + 0.35 * speedNorm) : 1;
  // The signed-speed yaw target below reverses chassis rotation in reverse so
  // the rear trajectory continues toward the requested A/D side.
  const steerAngle = car.steerSm * Math.min(
    1.08,
    maxSteer * handbrakeSteerBoost * (1 + lowSpeedTurnBoost * 0.42)
  );
  const driftStartSteer = 0.12;
  const driftHoldSteer = 0.05;
  const driftStartSpeed = mphToCarSpeed(18);
  const driftHoldSpeed = mphToCarSpeed(14);
  const driftStartIntent = !planetary && braking && steerMag >= driftStartSteer && spdAbs >= driftStartSpeed;

  if (planetary) {
    car._driftHoldTimer = 0;
  } else if (driftStartIntent) {
    car._driftHoldTimer = 0.65;
  } else {
    car._driftHoldTimer = Math.max(0, car._driftHoldTimer - dt);
  }

  const driftCanSustain = !planetary &&
  (braking || car._driftHoldTimer > 0) &&
  steerMag >= driftHoldSteer &&
  spdAbs >= driftHoldSpeed;
  const isDrifting = driftStartIntent || !!car.isDrifting && driftCanSustain;

  // Surface grip baseline using existing runtime config values.
  let gripBase = Number(config.gripRoad || 0.88) * surfaceDynamics.grip * (planetary ? 1 : vehicleHandling.gripScale * vehicleCondition.gripScale * vehicleUpgrades.gripScale);

  // Moon handling remains unchanged by drift tuning.
  if (planetary) gripBase = 1.0;

  let driftGrip = gripBase;
  if (isDrifting) {
    const brakeGrip = Number(config.gripBrake || 0.60);
    const driftGripFloor = Number(config.gripDrift || 0.36);
    const blend = (0.72 + 0.28 * speedNorm) * surfaceDynamics.drift;
    driftGrip = Math.max(driftGripFloor, gripBase * (1 - blend) + brakeGrip * blend);
  }
  const grip = Math.max(0.2, Math.min(1.2, driftGrip));

  let latDamp, yawDamp, yawResponse;
  if (planetary) {
    // Preserve moon handling behavior exactly as before.
    latDamp = 11.0 * (0.75 + grip * 0.55);
    yawDamp = 8.8 * (0.7 + grip * 0.6);
    yawResponse = 2.4 * (0.65 + grip * 0.45);
  } else {
    latDamp = 15.5 * (0.72 + grip * 0.58);
    yawDamp = 9.2 * (0.7 + grip * 0.6);
    yawResponse = 4.4 * (0.64 + grip * 0.42);
    if (lowSpeedTurnBoost > 0) {
      yawResponse += lowSpeedTurnBoost * 1.35;
      yawDamp *= 1 - lowSpeedTurnBoost * 0.12;
    }

    if (isDrifting) {
      latDamp *= 0.28;
      yawDamp *= 0.58;
      yawResponse *= 1.78;
    } else {
      const driftRecovery = Math.max(0, Number(config.driftRec || 6));
      latDamp += driftRecovery * 0.55;
      yawDamp += driftRecovery * 0.32;
    }
  }

  if (!isDrifting) {
    latDamp *= characterVehicle.recoveryScale * vehicleUpgrades.recoveryScale;
    yawResponse *= characterVehicle.steeringResponseScale;
  }

  const wheelBase = planetary ? 2.6 : vehicleHandling.wheelBase;
  const v = planetary
    ? car.speed
    : carSpeedToWorldUnitsPerSecond(car.speed, metersPerWorldUnit);
  let steerAuthority = 1.08;
  if (!planetary && lowSpeedTurnBoost > 0) {
    steerAuthority *= 1 + lowSpeedTurnBoost * 0.48;
  }
  if (!planetary && (isDrifting || handbrakeTurnIntent)) {
    steerAuthority *= 1.22;
  }
  const radiusAuthority = Math.max(.76, Math.min(1.22, 5.2 / vehicleHandling.turningRadius));
  const tyreYawLimit=tyreGrip*9.81/Math.max(2,Math.abs(carSpeedToMph(car.speed))*.44704)*(isDrifting?1.35:1);
  const bankForces=roadPlane?roadPlaneForces({...roadPlane,forwardSpeedMetersPerSecond:carSpeedToMph(car.speed)*.44704,yawRate:car.yawRate||0,tyreGrip}):null;
  const bankMinimumYaw=bankForces?.minimumYawRate??-tyreYawLimit,bankMaximumYaw=bankForces?.maximumYawRate??tyreYawLimit;
  const maxYawRate = planetary
    ? Infinity
    : Math.min(bankForces?Math.max(Math.abs(bankMinimumYaw),Math.abs(bankMaximumYaw)):tyreYawLimit,earthSteering.maxYawRate * vehicleHandling.steeringScale * radiusAuthority * characterVehicle.steeringAngleScale);
  let yawRateTarget = arcadeSteeringYawTarget(
    v,
    steerAngle * steerAuthority,
    wheelBase,
    maxYawRate
  );

  if(bankForces)yawRateTarget=Math.max(bankMinimumYaw,Math.min(bankMaximumYaw,yawRateTarget));
  car.yawRate += (yawRateTarget - car.yawRate) * (1 - Math.exp(-dt * yawResponse));
  if (planetary) {
    car.yawRate *= Math.exp(-dt * yawDamp);
  } else if (steerMag < 0.04) {
    car.yawRate *= Math.exp(-dt * yawDamp);
  } else if (!isDrifting) {
    car.yawRate *= Math.exp(-dt * yawDamp * 0.08);
  }
  if (hasGroundControl) {
    car.angle += car.yawRate * dt;
  } else {
    car.yawRate *= Math.exp(-dt * 2.0);
    car.angle += car.yawRate * dt;
  }

  const bankGripReserve=bankForces?.lateralGripReserve??1;
  if(bankForces)latDamp*=bankGripReserve;
  car.vFwd += (car.speed - car.vFwd) * (1 - Math.exp(-dt * 8));
  car.vLat *= Math.exp(-dt * latDamp);

  // Rear-biased slip model:
  // front axle keeps more grip while handbrake drifting, rear axle breaks loose.
  const halfWheelBase = wheelBase * 0.5;
  let frontLat = car.vLat + car.yawRate * halfWheelBase;
  let rearLat = car.vLat - car.yawRate * halfWheelBase;

  let frontGripDamp = 22 * (0.7 + grip * 0.55);
  let rearGripDamp = 18 * (0.72 + grip * 0.52);
  if (!planetary) {
    if (isDrifting) {
      frontGripDamp *= 0.90;
      rearGripDamp *= 0.12;
      rearLat += car.steerSm * 2.35 * (0.5 + 0.5 * speedNorm);
    }
  }

  if(bankForces){frontGripDamp*=bankGripReserve;rearGripDamp*=bankGripReserve;}
  frontLat *= Math.exp(-dt * frontGripDamp);
  rearLat *= Math.exp(-dt * rearGripDamp);
  car.vLat = (frontLat + rearLat) * 0.5;

  let slipGain = 0.005 * steerMag * speedNorm;
  if (!planetary) {
    if (isDrifting) {
      const driftSlip = 0.064;
      slipGain = driftSlip * steerMag * (0.45 + 0.55 * speedNorm);
    } else {
      slipGain = 0.0012 * steerMag * speedNorm;
    }
  }
  car.vLat += car.yawRate * spdAbs * slipGain;

  if (!planetary && isDrifting) {
    const rearStep = rearLat - frontLat;
    const rearSlipGain = 1.38;
    const steerSlipGain = 1.05;
    car.rearSlip += rearStep * dt * rearSlipGain;
    car.rearSlip += car.steerSm * dt * steerSlipGain;
    const rearSlipLimit = 1.75;
    car.rearSlip = Math.max(-rearSlipLimit, Math.min(rearSlipLimit, car.rearSlip));
    car.rearSlip *= Math.exp(-dt * 3.1);
    car.yawRate += car.rearSlip * (0.86 + 0.34 * speedNorm);
    // Keep front axle planted so drift pivots from the rear instead of full-body slide.
    car.vLat *= Math.exp(-dt * 4.3);
  } else {
    car.rearSlip *= Math.exp(-dt * 9.5);
  }

  if (isDrifting) {
    const yawKick = car.steerSm * 1.28 * (0.35 + 0.65 * speedNorm);
    car.yawRate += yawKick * dt * 4.6;
  }
  if(!planetary)car.yawRate=Math.max(bankMinimumYaw,Math.min(bankMaximumYaw,car.yawRate));
  if(bankForces){const forces=roadPlaneForces({...bankForces,forwardSpeedMetersPerSecond:carSpeedToMph(car.vFwd)*.44704,yawRate:car.yawRate,tyreGrip});car.vLat+=forces.lateralResidualAcceleration/.22352*dt;}
  car.isDrifting = isDrifting;

  return {wheelBase,steerAngle,isDrifting,spdAbs,...(roadPlane?{roadPlane:{pitch:roadPlane.pitch,roll:roadPlane.roll}}:{})};
}

export function integrateVehiclePlanarPosition(car,dt,{wheelBase,isDrifting,spdAbs,roadPlane},metersPerWorldUnit=1.11,planetary=false){
  const sinA = Math.sin(car.angle),cosA = Math.cos(car.angle);
  const lateralVelForPosition = !planetary && isDrifting ?
    car.vLat * 0.34 :
    car.vLat;
  let worldForwardVelocity = planetary
    ? car.vFwd
    : carSpeedToWorldUnitsPerSecond(car.vFwd, metersPerWorldUnit);
  let worldLateralVelocity = planetary
    ? lateralVelForPosition
    : carSpeedToWorldUnitsPerSecond(lateralVelForPosition, metersPerWorldUnit);
  if(!planetary&&roadPlane){const horizontal=roadPlaneHorizontalVelocity(worldForwardVelocity,worldLateralVelocity,roadPlane);worldForwardVelocity=horizontal.forward;worldLateralVelocity=horizontal.right;}
  car.vx = sinA * worldForwardVelocity + cosA * worldLateralVelocity;
  car.vz = cosA * worldForwardVelocity - sinA * worldLateralVelocity;

  const velMag = Math.hypot(car.vx, car.vz);
  if (velMag > 5) {
    const velAngle = Math.atan2(car.vx, car.vz);
    let da = car.angle - velAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    car.driftAngle = da;
  } else {
    car.driftAngle = 0;
  }

  let nx;
  let nz;
  if (!planetary && isDrifting && spdAbs > 6) {
    const frontPivotDist = wheelBase * 0.42;
    const frontX = car.x + sinA * frontPivotDist;
    const frontZ = car.z + cosA * frontPivotDist;
    const frontVx = sinA * worldForwardVelocity + cosA * (worldLateralVelocity * 0.35);
    const frontVz = cosA * worldForwardVelocity - sinA * (worldLateralVelocity * 0.35);
    const nextFrontX = frontX + frontVx * dt;
    const nextFrontZ = frontZ + frontVz * dt;
    nx = nextFrontX - Math.sin(car.angle) * frontPivotDist;
    nz = nextFrontZ - Math.cos(car.angle) * frontPivotDist;
  } else {
    nx = car.x + car.vx * dt;
    nz = car.z + car.vz * dt;
  }
  return {x:nx,z:nz};
}
