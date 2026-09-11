function stableSeed(value) {
  const text = String(value || 'world-explorer');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stellarClassForTemperature(temperatureK) {
  const temperature = Number(temperatureK) || 5772;
  if (temperature >= 30000) return 'O';
  if (temperature >= 10000) return 'B';
  if (temperature >= 7500) return 'A';
  if (temperature >= 6000) return 'F';
  if (temperature >= 5200) return 'G';
  if (temperature >= 3700) return 'K';
  return 'M';
}

const STAR_COLORS = Object.freeze({
  O: 0x9bb0ff,
  B: 0xaabfff,
  A: 0xcad7ff,
  F: 0xf8f7ff,
  G: 0xfff4d2,
  K: 0xffc98b,
  M: 0xff8a63
});

function deriveStarVisualProfile(system) {
  const temperatureK = Number(system?.physical?.hostTemperatureK) || 5772;
  const stellarClass = stellarClassForTemperature(temperatureK);
  const massSolar = Math.max(0.08, Number(system?.physical?.hostMassSolar) || 1);
  return Object.freeze({
    kind: 'model-derived-star',
    stellarClass,
    temperatureK,
    massSolar,
    color: Number(system?.visualProfile?.color) || STAR_COLORS[stellarClass],
    activity: stellarClass === 'M' ? 'active' : stellarClass === 'K' ? 'moderate' : 'steady',
    seed: Number(system?.visualProfile?.seed) || stableSeed(system?.id),
    evidence: 'Host temperature and mass are catalog values; animated surface and corona are model-derived.'
  });
}

function estimatePlanetTemperatureK(planet, system) {
  const axisAu = Math.max(0.005, Number(planet?.semiMajorAxisAu) || 1);
  const hostMass = Math.max(0.08, Number(system?.physical?.hostMassSolar) || 1);
  const luminositySolar = Math.max(0.0004, Math.pow(hostMass, hostMass < 0.43 ? 2.3 : 3.5));
  return Math.round(278 * Math.pow(luminositySolar, 0.25) / Math.sqrt(axisAu));
}

function planetClass(radiusEarth, temperatureK, densityEarth) {
  if (radiusEarth >= 7) return temperatureK < 170 ? 'ice-giant' : 'gas-giant';
  if (radiusEarth >= 2) return 'mini-neptune';
  if (temperatureK >= 900) return 'lava-world';
  if (temperatureK < 180) return 'ice-world';
  if (densityEarth > 1.45) return 'iron-rich-rocky';
  if (temperatureK >= 360) return 'arid-rocky';
  return 'temperate-rocky';
}

const PLANET_PALETTES = Object.freeze({
  'gas-giant': [0xd3a467, 0xf1d0a0, 0x8f5f42],
  'ice-giant': [0x62b5d9, 0xa8e7ef, 0x2c668c],
  'mini-neptune': [0x5d91b8, 0xaed4d9, 0x385d79],
  'lava-world': [0x2b2421, 0xf36b32, 0x7d211b],
  'ice-world': [0xb7d7df, 0xf1fbff, 0x718fa5],
  'iron-rich-rocky': [0x6d4b42, 0xb18468, 0x332b2a],
  'arid-rocky': [0xb67a46, 0xe0b070, 0x65402e],
  'temperate-rocky': [0x426b59, 0x8d9f72, 0x24485a]
});

function derivePlanetVisualProfile(planet, system) {
  const radiusEarth = Math.max(0.1, Number(planet?.radiusEarth) || 1);
  const massEarth = Math.max(0.01, Number(planet?.massEarth) || Math.pow(radiusEarth, 2.7));
  const densityEarth = massEarth / Math.pow(radiusEarth, 3);
  const estimatedTemperatureK = estimatePlanetTemperatureK(planet, system);
  const kind = planetClass(radiusEarth, estimatedTemperatureK, densityEarth);
  const seed = stableSeed(`${system?.id}/${planet?.id}`);
  const rings = radiusEarth >= 4 && seed % 5 <= 1;
  const atmosphere = radiusEarth >= 1.35 || ['gas-giant', 'ice-giant', 'mini-neptune'].includes(kind);
  const clouds = atmosphere && kind !== 'lava-world' && seed % 4 !== 0;
  return Object.freeze({
    kind,
    seed,
    radiusEarth,
    massEarth,
    densityEarth,
    estimatedTemperatureK,
    palette: PLANET_PALETTES[kind],
    atmosphere,
    clouds,
    rings,
    appearanceAccuracy: 'model-derived',
    evidence: 'Size, mass, and orbit use catalog parameters when available. Appearance is a deterministic exploration model, not an observation.'
  });
}

export {
  derivePlanetVisualProfile,
  deriveStarVisualProfile,
  estimatePlanetTemperatureK,
  stableSeed,
  stellarClassForTemperature
};
