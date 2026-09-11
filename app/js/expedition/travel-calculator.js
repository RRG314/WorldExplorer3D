import {
  distanceLightYears,
  icrsToCartesian,
  resolveUniverseAddress
} from '../universe/catalog.js?v=11';

const LIGHT_SPEED_MPS = 299_792_458;
const LIGHT_YEAR_M = 9.4607304725808e15;
const JULIAN_YEAR_S = 31_557_600;
const DAY_S = 86_400;

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be positive.`);
  return number;
}

function routeDistanceLy(originOrId, destinationOrId) {
  const origin = typeof originOrId === 'string' ? resolveUniverseAddress(originOrId) : originOrId;
  const destination = typeof destinationOrId === 'string' ? resolveUniverseAddress(destinationOrId) : destinationOrId;
  if (!destination) throw new TypeError('The Expedition destination is unavailable.');
  if (!origin || origin.id === 'sol') return finitePositive(distanceLightYears(destination), 'route distance');
  if (destination.id === 'sol') return finitePositive(distanceLightYears(origin), 'route distance');
  const a = icrsToCartesian(origin, 1);
  const b = icrsToCartesian(destination, 1);
  return finitePositive(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 'route distance');
}

function relativisticLeg(distanceM, accelerationMps2, maxVelocityFractionC) {
  const distance = finitePositive(distanceM, 'distance');
  const acceleration = finitePositive(accelerationMps2, 'acceleration');
  const betaCap = Math.min(0.999999, finitePositive(maxVelocityFractionC, 'maximum velocity fraction'));
  const gammaCap = 1 / Math.sqrt(1 - betaCap ** 2);
  const capAccelerationDistanceM = LIGHT_SPEED_MPS ** 2 / acceleration * (gammaCap - 1);
  const reachesCruise = capAccelerationDistanceM * 2 < distance;

  let accelerationDistanceM;
  let betaPeak;
  let gammaPeak;
  if (reachesCruise) {
    accelerationDistanceM = capAccelerationDistanceM;
    betaPeak = betaCap;
    gammaPeak = gammaCap;
  } else {
    accelerationDistanceM = distance / 2;
    gammaPeak = 1 + acceleration * accelerationDistanceM / LIGHT_SPEED_MPS ** 2;
    betaPeak = Math.sqrt(1 - 1 / gammaPeak ** 2);
  }

  const rapidity = Math.acosh(gammaPeak);
  const accelerationExternalS = LIGHT_SPEED_MPS / acceleration * Math.sinh(rapidity);
  const accelerationProperS = LIGHT_SPEED_MPS / acceleration * rapidity;
  const cruiseDistanceM = Math.max(0, distance - accelerationDistanceM * 2);
  const cruiseExternalS = cruiseDistanceM > 0 ? cruiseDistanceM / (betaPeak * LIGHT_SPEED_MPS) : 0;
  const cruiseProperS = cruiseExternalS / gammaPeak;

  return Object.freeze({
    accelerationDistanceM,
    cruiseDistanceM,
    peakVelocityFractionC: betaPeak,
    peakVelocityMps: betaPeak * LIGHT_SPEED_MPS,
    peakLorentzFactor: gammaPeak,
    reachesCruise,
    externalElapsedS: accelerationExternalS * 2 + cruiseExternalS,
    properElapsedS: accelerationProperS * 2 + cruiseProperS
  });
}

function expectedResourceUse({ durationDays, crewCount, ship, propulsion }) {
  const crewDays = durationDays * crewCount;
  const waterUseBeforeRecoveryKg = crewDays * 3.2;
  return Object.freeze({
    foodKg: crewDays * 0.75 * Math.max(0.02, 1 - ship.foodProductionFraction),
    waterKg: waterUseBeforeRecoveryKg * Math.max(0.001, 1 - ship.waterRecoveryFraction),
    powerMWh: durationDays * propulsion.powerMWhPerShipDay + crewDays * 0.018,
    propellantKg: durationDays / 365.25 * propulsion.propellantKgPerShipYear,
    medicalUnits: crewDays * 0.002,
    maintenanceKg: durationDays * (0.35 + crewCount * 0.025),
    feedstockKg: durationDays * 0.14,
    scienceCargoKg: Math.max(1200, crewCount * 180)
  });
}

function calculateExpeditionTravel({
  originId = 'sol',
  destinationId,
  ship,
  propulsion,
  crewCount,
  expectedPlayerMinutes = 24
}) {
  if (!ship || !propulsion) throw new TypeError('A ship and propulsion profile are required.');
  const crew = Math.max(1, Math.round(finitePositive(crewCount, 'crew count')));
  const distanceLy = routeDistanceLy(originId, destinationId);
  const distanceM = distanceLy * LIGHT_YEAR_M;
  const leg = relativisticLeg(distanceM, propulsion.accelerationMps2, propulsion.maxVelocityFractionC);
  const externalYears = leg.externalElapsedS / JULIAN_YEAR_S;
  const properYears = leg.properElapsedS / JULIAN_YEAR_S;
  const durationDays = leg.properElapsedS / DAY_S;
  const resources = expectedResourceUse({ durationDays, crewCount: crew, ship, propulsion });
  const playerSeconds = Math.max(60, Number(expectedPlayerMinutes) * 60 || 1440);
  const strategicCompression = leg.properElapsedS / playerSeconds;

  return Object.freeze({
    type: 'ExpeditionTravelCalculation',
    schemaVersion: 1,
    originId,
    destinationId,
    distanceLy,
    distanceM,
    externalElapsedS: leg.externalElapsedS,
    properElapsedS: leg.properElapsedS,
    externalYears,
    properYears,
    expectedPlayerMinutes: playerSeconds / 60,
    strategicCompression,
    peakVelocityFractionC: leg.peakVelocityFractionC,
    peakLorentzFactor: leg.peakLorentzFactor,
    reachesCruise: leg.reachesCruise,
    accelerationDistanceM: leg.accelerationDistanceM,
    cruiseDistanceM: leg.cruiseDistanceM,
    expectedResources: resources,
    crewCount: crew,
    classification: propulsion.classification
  });
}

export {
  calculateExpeditionTravel,
  DAY_S,
  JULIAN_YEAR_S,
  LIGHT_SPEED_MPS,
  LIGHT_YEAR_M,
  relativisticLeg,
  routeDistanceLy
};
