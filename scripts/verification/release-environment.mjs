// Diagnostic entry points may select a subset; a release gate must run its
// complete default coverage. Gate commands can still deliberately opt into a
// scenario (for example the separate provider-outage gate).
export function completeReleaseEnvironment(environment) {
  const result = { ...environment };
  for (const name of [
    'WE3D_VERIFY_LOCATIONS', 'WE3D_ACTOR_VEHICLE_LOCATIONS',
    'WE3D_BACKEND_FROM', 'WE3D_HOTBAR_RESUME_STAGE', 'WE3D_HOTBAR_ONLY_ACTION',
    'WE3D_VERIFY_PROFILE', 'WE3D_VERIFY_AUDIT_ONLY',
    'WE3D_VERIFY_INITIAL_ONLY', 'WE3D_VERIFY_SLICE_ONLY',
    'WE3D_FORCE_TRANSPORT_FALLBACK',
    'WE3D_URBAN_SCOPE', 'WE3D_VERIFY_JOURNEY', 'WE3D_VIEWPORT_SCOPE',
    'WE3D_BLOCKS_SCOPE', 'WE3D_ROAD_TERRAIN_JOURNEY', 'WE3D_TRANSPORT_FACILITY_JOURNEY'
  ]) delete result[name];
  return result;
}
