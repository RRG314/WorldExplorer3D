// One provider identity per service: lz4.overpass-api.de is an alias of the
// main instance, not an independent fallback. Keep browser and server aligned.
export const OVERPASS_ENDPOINTS = Object.freeze([
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
]);

export function overpassAttemptBudget(remainingMs, remainingProviders) {
  return Math.max(1, Math.floor(Math.max(0, remainingMs - 50) / Math.max(1, remainingProviders)));
}
