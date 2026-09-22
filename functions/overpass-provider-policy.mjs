// One approved policy for browser and server supplemental OSM queries.
// The main overpass-api.de service (including its lz4 alias) is not a suitable
// automatic fallback for this commercial app: its policy calls for self-hosted
// or paid service, and hosted probes return 406 without CORS permission.
// Private.coffee permits project use. Keep bounded cache/tile fallback when it
// is unavailable; do not route rejected requests through a proxy or aliases.
// https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
export const OVERPASS_ENDPOINTS = Object.freeze([
  'https://overpass.private.coffee/api/interpreter'
]);

export function overpassAttemptBudget(remainingMs, remainingProviders) {
  return Math.max(1, Math.floor(Math.max(0, remainingMs - 50) / Math.max(1, remainingProviders)));
}
