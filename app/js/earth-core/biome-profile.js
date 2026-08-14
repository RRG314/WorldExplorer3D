function boundedRatio(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function classifyBiomeProfile(options = {}) {
  const latitude = Math.max(-90, Math.min(90, Number(options.latitude) || 0));
  const absLatitude = Math.abs(latitude);
  const signals = options.signals || {};
  const vegetated = boundedRatio(signals.vegetated);
  const water = boundedRatio(signals.water);
  const arid = boundedRatio(signals.arid);
  const cryo = boundedRatio(signals.cryo);
  const scrub = boundedRatio(signals.scrub);
  const elevationMeters = Number(options.elevationMeters);
  const reliefMeters = Math.max(0, Number(options.reliefMeters) || 0);

  let id = 'temperate-mosaic';
  if (absLatitude >= 86 || cryo >= 0.08) id = 'polar-cryosphere';
  else if (absLatitude >= 66) id = vegetated >= 0.12 ? 'tundra' : 'polar-desert';
  else if (Number.isFinite(elevationMeters) && elevationMeters >= 3200) id = 'alpine';
  else if (absLatitude <= 24 && vegetated >= 0.2 && water >= 0.015) id = 'tropical-rainforest';
  else if (absLatitude <= 24 && vegetated >= 0.28) id = 'tropical-seasonal-forest';
  else if (arid >= 0.16 || (absLatitude >= 12 && absLatitude <= 35 && vegetated < 0.12)) id = 'hot-desert';
  else if (scrub >= 0.12 && vegetated < 0.34) id = 'shrubland';
  else if (vegetated >= 0.42) id = 'temperate-forest';
  else if (reliefMeters >= 700) id = 'montane-mosaic';
  else if (vegetated >= 0.18) id = 'grassland-woodland';

  const vegetationModel =
    id === 'tropical-rainforest' ? 'closed-multilayer-canopy' :
    id === 'tropical-seasonal-forest' ? 'open-tropical-canopy' :
    id === 'temperate-forest' ? 'temperate-canopy' :
    id === 'grassland-woodland' ? 'scattered-woodland' :
    id === 'shrubland' || id === 'tundra' ? 'low-vegetation' :
    'sparse-or-none';
  const surfacePalette =
    id === 'polar-cryosphere' ? 'snow-ice' :
    id === 'polar-desert' || id === 'alpine' ? 'snow-rock' :
    id === 'hot-desert' ? 'sand-rock' :
    id === 'tropical-rainforest' || id === 'tropical-seasonal-forest' ? 'forest-soil' :
    id === 'temperate-forest' ? 'forest-grass-soil' :
    'grass-soil-rock';

  return Object.freeze({
    id,
    latitude,
    vegetationModel,
    surfacePalette,
    hydrologyPolicy: 'mapped-water-only',
    sourcePolicy: 'mapped-semantics-with-global-land-cover-fallback'
  });
}
