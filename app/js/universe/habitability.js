const HABITABILITY_MODEL_VERSION = 1;

const KOPPARAPU_2014 = Object.freeze({
  recentVenus: Object.freeze({ seffSun: 1.776, a: 2.136e-4, b: 2.533e-8, c: -1.332e-11, d: -3.097e-15 }),
  runawayGreenhouse: Object.freeze({ seffSun: 1.107, a: 1.332e-4, b: 1.58e-8, c: -8.308e-12, d: -1.931e-15 }),
  maximumGreenhouse: Object.freeze({ seffSun: 0.356, a: 6.171e-5, b: 1.698e-9, c: -3.198e-12, d: -5.575e-16 }),
  earlyMars: Object.freeze({ seffSun: 0.32, a: 5.547e-5, b: 1.526e-9, c: -2.874e-12, d: -5.011e-16 })
});

function modeledLuminositySolar(system = {}) {
  const explicit = Number(system?.physical?.hostLuminositySolar);
  if (Number.isFinite(explicit) && explicit > 0) return Object.freeze({ value: explicit, source: 'catalog' });
  const mass = Math.max(0.08, Number(system?.physical?.hostMassSolar) || 1);
  let value;
  if (mass < 0.43) value = 0.23 * mass ** 2.3;
  else if (mass < 2) value = mass ** 4;
  else if (mass < 55) value = 1.4 * mass ** 3.5;
  else value = 32000 * mass;
  return Object.freeze({ value, source: 'mass-luminosity-model' });
}

function effectiveFluxLimit(temperatureK, coefficients) {
  const temperature = Math.max(2600, Math.min(7200, Number(temperatureK) || 5780));
  const delta = temperature - 5780;
  return coefficients.seffSun
    + coefficients.a * delta
    + coefficients.b * delta ** 2
    + coefficients.c * delta ** 3
    + coefficients.d * delta ** 4;
}

function rockyLikelihood(radiusEarth, densityEarth = null) {
  const radius = Number(radiusEarth);
  const density = Number(densityEarth);
  if (Number.isFinite(density) && density >= 0.65 && density <= 1.65 && radius <= 2) return 'high';
  if (!Number.isFinite(radius)) return 'unknown';
  if (radius <= 1.5) return 'high';
  if (radius <= 2) return 'plausible';
  if (radius <= 2.75) return 'uncertain';
  return 'low';
}

function zoneClassification(insolation, limits) {
  if (!Number.isFinite(insolation)) return 'unknown';
  if (insolation <= limits.recentVenus && insolation >= limits.earlyMars) {
    if (insolation <= limits.runawayGreenhouse && insolation >= limits.maximumGreenhouse) return 'conservative-zone-candidate';
    return 'optimistic-zone-candidate';
  }
  if (insolation > limits.recentVenus) return 'interior-hot';
  return 'exterior-cold';
}

function assessPlanetHabitability(planet = {}, system = {}) {
  const temperatureK = Math.max(2600, Math.min(7200, Number(system?.physical?.hostTemperatureK) || 5780));
  const luminosity = modeledLuminositySolar(system);
  const semiMajorAxisAu = Number(planet.semiMajorAxisAu);
  const catalogInsolation = Number(planet.insolationEarth);
  const insolationEarth = Number.isFinite(catalogInsolation) && catalogInsolation > 0
    ? catalogInsolation
    : Number.isFinite(semiMajorAxisAu) && semiMajorAxisAu > 0
      ? luminosity.value / semiMajorAxisAu ** 2
      : null;
  const catalogEquilibrium = Number(planet.equilibriumTemperatureK);
  const equilibriumTemperatureK = Number.isFinite(catalogEquilibrium) && catalogEquilibrium > 0
    ? catalogEquilibrium
    : Number.isFinite(insolationEarth)
      ? 278 * insolationEarth ** 0.25
      : null;
  const limits = Object.freeze(Object.fromEntries(Object.entries(KOPPARAPU_2014).map(([key, coefficients]) => [
    key,
    effectiveFluxLimit(temperatureK, coefficients)
  ])));
  const zone = zoneClassification(insolationEarth, limits);
  const composition = rockyLikelihood(planet.radiusEarth, planet.densityEarth);
  const candidate = ['conservative-zone-candidate', 'optimistic-zone-candidate'].includes(zone)
    && ['high', 'plausible'].includes(composition);
  const activityRisk = temperatureK < 3700 ? 'elevated-unknown' : temperatureK < 5200 ? 'moderate-unknown' : 'catalog-review-required';
  return Object.freeze({
    type: 'HabitabilityAssessment',
    version: HABITABILITY_MODEL_VERSION,
    destinationId: String(planet.id || ''),
    zone,
    candidate,
    rockyLikelihood: composition,
    insolationEarth: Number.isFinite(insolationEarth) ? insolationEarth : null,
    equilibriumTemperatureK: Number.isFinite(equilibriumTemperatureK) ? equilibriumTemperatureK : null,
    stellarTemperatureK: temperatureK,
    stellarLuminositySolar: luminosity.value,
    luminositySource: luminosity.source,
    activityRisk,
    atmosphereEvidence: planet.atmosphereEvidence || 'unknown',
    waterEvidence: planet.waterEvidence || 'unknown',
    lifeEvidence: 'none-confirmed',
    limits,
    truthClass: 'model-derived-screening',
    caveat: 'A habitable-zone orbit is a screening result, not evidence of surface water, a suitable atmosphere, or life.'
  });
}

export {
  assessPlanetHabitability,
  effectiveFluxLimit,
  HABITABILITY_MODEL_VERSION,
  KOPPARAPU_2014,
  modeledLuminositySolar,
  rockyLikelihood
};
