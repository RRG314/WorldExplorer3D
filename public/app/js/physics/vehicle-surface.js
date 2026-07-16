const SURFACE_PROFILES = Object.freeze({
  asphalt: Object.freeze({ kind: 'asphalt', label: 'ROAD', grip: 1, rolling: 1, accel: 1, topSpeed: 1, drift: 1 }),
  paved: Object.freeze({ kind: 'paved', label: 'PAVED', grip: 0.96, rolling: 1.03, accel: 0.98, topSpeed: 0.97, drift: 1.02 }),
  grass: Object.freeze({ kind: 'grass', label: 'GRASS', grip: 0.84, rolling: 1.18, accel: 0.91, topSpeed: 0.84, drift: 0.86 }),
  dirt: Object.freeze({ kind: 'dirt', label: 'DIRT', grip: 0.78, rolling: 1.28, accel: 0.86, topSpeed: 0.78, drift: 0.92 }),
  gravel: Object.freeze({ kind: 'gravel', label: 'GRAVEL', grip: 0.74, rolling: 1.34, accel: 0.84, topSpeed: 0.76, drift: 0.96 }),
  sand: Object.freeze({ kind: 'sand', label: 'SAND', grip: 0.64, rolling: 1.55, accel: 0.76, topSpeed: 0.68, drift: 0.82 }),
  snow: Object.freeze({ kind: 'snow', label: 'SNOW', grip: 0.58, rolling: 1.25, accel: 0.72, topSpeed: 0.7, drift: 1.08 }),
  rock: Object.freeze({ kind: 'rock', label: 'ROCK', grip: 0.72, rolling: 1.4, accel: 0.78, topSpeed: 0.72, drift: 0.76 })
});

const LANDUSE_SURFACE = Object.freeze({
  paved: 'paved',
  parking: 'paved',
  commercial: 'paved',
  retail: 'paved',
  industrial: 'paved',
  residential: 'grass',
  grass: 'grass',
  meadow: 'grass',
  recreation_ground: 'grass',
  village_green: 'grass',
  garden: 'grass',
  park: 'grass',
  forest: 'dirt',
  wood: 'dirt',
  farmland: 'dirt',
  farmyard: 'dirt',
  orchard: 'dirt',
  soil: 'dirt',
  mud: 'dirt',
  quarry: 'gravel',
  scree: 'gravel',
  shingle: 'gravel',
  sand: 'sand',
  dune: 'sand',
  beach: 'sand',
  glacier: 'snow',
  snow: 'snow',
  bare_rock: 'rock',
  barren: 'rock'
});

const ROAD_SURFACE = Object.freeze({
  asphalt: 'asphalt',
  concrete: 'paved',
  concrete_plates: 'paved',
  paving_stones: 'paved',
  sett: 'paved',
  cobblestone: 'paved',
  compacted: 'gravel',
  fine_gravel: 'gravel',
  gravel: 'gravel',
  pebblestone: 'gravel',
  dirt: 'dirt',
  earth: 'dirt',
  ground: 'dirt',
  mud: 'dirt',
  grass: 'grass',
  grass_paver: 'grass',
  sand: 'sand',
  snow: 'snow',
  ice: 'snow'
});

function normalizedTag(value) {
  return String(value || '').trim().toLowerCase().replace(/[: -]+/g, '_');
}

function pointInsideRecord(appCtx, x, z, record) {
  const bounds = record?.bounds;
  if (bounds && (
    x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ
  )) return false;
  const points = Array.isArray(record?.pts) ? record.pts : null;
  return !!(points?.length >= 3 && appCtx.pointInPolygon?.(x, z, points));
}

function worldCoverTerrainSurface(appCtx, x, z) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const mesh of appCtx.terrainGroup?.children || []) {
    const mode = normalizedTag(mesh?.userData?.worldCoverSurfaceMode);
    if (!SURFACE_PROFILES[mode]) continue;
    const distance = Math.hypot(Number(mesh.position?.x || 0) - x, Number(mesh.position?.z || 0) - z);
    if (distance >= nearestDistance) continue;
    nearest = mode;
    nearestDistance = distance;
  }
  return nearest;
}

function localLandSurface(appCtx, x, z) {
  const baselineKind = worldCoverTerrainSurface(appCtx, x, z);
  const collections = [appCtx.landuses, appCtx.surfaceFeatureHints];
  for (const records of collections) {
    if (!Array.isArray(records)) continue;
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index];
      const kind = LANDUSE_SURFACE[normalizedTag(record?.type)];
      if (!kind || !pointInsideRecord(appCtx, x, z, record)) continue;
      if (baselineKind === 'sand' && (kind === 'grass' || kind === 'dirt')) return baselineKind;
      if (baselineKind === 'rock' && (kind === 'grass' || kind === 'dirt')) return baselineKind;
      return kind;
    }
  }
  if (baselineKind) return baselineKind;
  const worldHint = normalizedTag(appCtx.worldSurfaceProfile?.terrainModeHint);
  if (worldHint === 'sand') return 'sand';
  if (worldHint === 'snow') return 'snow';
  if (worldHint === 'rock') return 'rock';
  return 'grass';
}

export function resolveVehicleSurface(appCtx) {
  if (appCtx.onMars) return SURFACE_PROFILES.rock;
  if (appCtx.onMoon) return SURFACE_PROFILES.gravel;
  if (appCtx.car?.onRoad) {
    const tagged = ROAD_SURFACE[normalizedTag(appCtx.car.road?.surfaceTag)];
    return SURFACE_PROFILES[tagged || 'asphalt'];
  }
  return SURFACE_PROFILES[localLandSurface(appCtx, appCtx.car?.x || 0, appCtx.car?.z || 0)];
}

export function updateVehicleSurface(appCtx, dt) {
  const car = appCtx.car;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const moved = Math.hypot(
    (Number(car.x) || 0) - (Number(car._surfaceSampleX) || 0),
    (Number(car.z) || 0) - (Number(car._surfaceSampleZ) || 0)
  );
  if (!car._surfaceTarget || now - (car._surfaceSampleAt || 0) > 220 || moved > 6) {
    car._surfaceTarget = resolveVehicleSurface(appCtx);
    car._surfaceSampleAt = now;
    car._surfaceSampleX = Number(car.x) || 0;
    car._surfaceSampleZ = Number(car.z) || 0;
  }

  const target = car._surfaceTarget || SURFACE_PROFILES.asphalt;
  if (!car.surfaceDynamics) {
    car.surfaceDynamics = { ...target };
  } else {
    const blend = 1 - Math.exp(-Math.max(0, dt) * 2.4);
    for (const key of ['grip', 'rolling', 'accel', 'topSpeed', 'drift']) {
      car.surfaceDynamics[key] += (target[key] - car.surfaceDynamics[key]) * blend;
    }
    car.surfaceDynamics.kind = target.kind;
    car.surfaceDynamics.label = target.label;
  }
  car.surfaceKind = target.kind;
  return car.surfaceDynamics;
}

export { SURFACE_PROFILES };
