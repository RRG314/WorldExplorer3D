// These models contain location-relative topology, feature references or
// closures. Clearing render collections alone does not retire their authority.
// Called only after runtime consumers stop during a full world reset.
export function releaseLocationModels(appCtx) {
  for (const key of [
    'transportNetworkModel', 'transportStructureModel', 'transportStructureAssembly',
    'transportJunctionProfile', 'sharedTransportSurfacePresentation',
    'structureProfileCompilation', 'tunnelSolidCompilation',
    'poiLifecycle', 'refreshActiveFunctionalPois'
  ]) appCtx[key] = null;
  appCtx.functionalPoiRecords = [];
  appCtx.activeFunctionalPois = [];
  appCtx.poiTenanciesByBuilding = new Map();
  // The diagnostic controls close over one pavement compilation. Detach them
  // on world reset so they cannot retain or export the previous location input.
  globalThis.document?.getElementById('streetSurfaceDiagnostics')?.remove();
}
