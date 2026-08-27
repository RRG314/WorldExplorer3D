const MPH_PER_SIMULATION_SPEED_UNIT = 0.5;
const METERS_PER_SECOND_PER_MPH = 0.44704;
const MPH_PER_METER_PER_SECOND = 1 / METERS_PER_SECOND_PER_MPH;
const KNOTS_PER_METER_PER_SECOND = 1.9438444924406;
const DEFAULT_METERS_PER_WORLD_UNIT = 1.11;

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function carSpeedToMph(simulationSpeed = 0) {
  return finiteNumber(simulationSpeed) * MPH_PER_SIMULATION_SPEED_UNIT;
}

function mphToCarSpeed(mph = 0) {
  return finiteNumber(mph) / MPH_PER_SIMULATION_SPEED_UNIT;
}

function mphToWorldUnitsPerSecond(mph = 0, metersPerWorldUnit = DEFAULT_METERS_PER_WORLD_UNIT) {
  const scale = Math.max(0.001, Math.abs(finiteNumber(metersPerWorldUnit, DEFAULT_METERS_PER_WORLD_UNIT)));
  return finiteNumber(mph) * METERS_PER_SECOND_PER_MPH / scale;
}

function carSpeedToWorldUnitsPerSecond(
  simulationSpeed = 0,
  metersPerWorldUnit = DEFAULT_METERS_PER_WORLD_UNIT
) {
  return mphToWorldUnitsPerSecond(carSpeedToMph(simulationSpeed), metersPerWorldUnit);
}

function worldUnitsPerSecondToMetersPerSecond(
  worldUnitsPerSecond = 0,
  metersPerWorldUnit = DEFAULT_METERS_PER_WORLD_UNIT
) {
  const scale = Math.max(0.001, Math.abs(finiteNumber(metersPerWorldUnit, DEFAULT_METERS_PER_WORLD_UNIT)));
  return finiteNumber(worldUnitsPerSecond) * scale;
}

function worldUnitsPerSecondToMph(worldUnitsPerSecond = 0, metersPerWorldUnit = DEFAULT_METERS_PER_WORLD_UNIT) {
  return worldUnitsPerSecondToMetersPerSecond(worldUnitsPerSecond, metersPerWorldUnit) * MPH_PER_METER_PER_SECOND;
}

function worldUnitsPerSecondToKnots(worldUnitsPerSecond = 0, metersPerWorldUnit = DEFAULT_METERS_PER_WORLD_UNIT) {
  return worldUnitsPerSecondToMetersPerSecond(worldUnitsPerSecond, metersPerWorldUnit) * KNOTS_PER_METER_PER_SECOND;
}

export {
  DEFAULT_METERS_PER_WORLD_UNIT,
  KNOTS_PER_METER_PER_SECOND,
  METERS_PER_SECOND_PER_MPH,
  MPH_PER_METER_PER_SECOND,
  MPH_PER_SIMULATION_SPEED_UNIT,
  carSpeedToMph,
  carSpeedToWorldUnitsPerSecond,
  mphToCarSpeed,
  mphToWorldUnitsPerSecond,
  worldUnitsPerSecondToKnots,
  worldUnitsPerSecondToMetersPerSecond,
  worldUnitsPerSecondToMph
};
