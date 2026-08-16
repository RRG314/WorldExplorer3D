export const ROAD_CAR_CONFIG = Object.freeze({
  // Simulation speed is 2 units per displayed MPH. Keep the road-car envelope
  // in one importable data contract so physics and verification share values.
  maxSpd: 180,
  accel: 80,
  boostAccel: 120,
  brake: 150,
  friction: 25,
  boostMax: 240,
  boostDur: 2.5,
  brakeForce: 4.0,
  gripRoad: 0.96,
  gripOff: 0.70,
  gripBrake: 0.48,
  gripDrift: 0.3,
  driftRec: 3.8,
  turnLow: 1.8,
  turnHigh: 0.8,
  turnMin: 30,
  roadForce: 0.93,
  roadPushback: 0.3,
  maxOffDist: 15,
  cpRadius: 25,
  trialTime: 120,
  policeSpd: 140,
  policeAccel: 60,
  policeDist: 800
});
