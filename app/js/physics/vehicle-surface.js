const SURFACE_PROFILES = Object.freeze({
  asphalt: Object.freeze({ kind: 'asphalt', label: 'ROAD', grip: 1, rolling: 1, accel: 1, topSpeed: 1, drift: 1 }),
  gravel: Object.freeze({ kind: 'gravel', label: 'GRAVEL', grip: 0.74, rolling: 1.34, accel: 0.84, topSpeed: 0.76, drift: 0.96 }),
  rock: Object.freeze({ kind: 'rock', label: 'ROCK', grip: 0.72, rolling: 1.4, accel: 0.78, topSpeed: 0.72, drift: 0.76 })
});

export function resolveVehicleSurface(appCtx) {
  if (appCtx.onMars) return SURFACE_PROFILES.rock;
  if (appCtx.onMoon) return SURFACE_PROFILES.gravel;
  // Earth driving has one neutral handling profile. Road proximity still
  // selects the correct physical deck, but surface tags, land use, and terrain
  // never branch vehicle physics.
  return SURFACE_PROFILES.asphalt;
}

export function updateVehicleSurface(appCtx, dt) {
  const car = appCtx.car;
  const target = resolveVehicleSurface(appCtx);
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
