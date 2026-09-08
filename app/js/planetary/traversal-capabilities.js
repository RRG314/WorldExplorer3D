const SOLID_SURFACE_TRAVEL_CAPABILITIES = Object.freeze({
  drive: true,
  walk: true,
  drone: true,
  plane: false,
  boat: false,
  ocean: false,
  earth: false,
  space: false
});

function isPlanetarySurfaceActive(appContext) {
  return !!(
    appContext?.onMoon ||
    appContext?.onMars ||
    appContext?.activePlanetaryBodyId
  );
}

function resolvePlanetaryTravelCapabilities(appContext) {
  if (!isPlanetarySurfaceActive(appContext)) return null;
  return appContext?.planetaryTravelCapabilities || SOLID_SURFACE_TRAVEL_CAPABILITIES;
}

export {
  SOLID_SURFACE_TRAVEL_CAPABILITIES,
  isPlanetarySurfaceActive,
  resolvePlanetaryTravelCapabilities
};
