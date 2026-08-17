const ALLOWED_EVENTS = new Set([
  'activity_started', 'activity_completed', 'discovery_recorded',
  'companion_adopted', 'companion_activated', 'companion_cared_for',
  'museum_viewed', 'trade_opened'
]);
const ALLOWED_CONTEXTS = new Set([
  'urban', 'urban-core', 'park', 'field', 'forest', 'wetland', 'riverbank',
  'stream', 'fresh-water', 'coast', 'open-ocean', 'beach', 'mountain', 'desert', 'outcrop'
]);

function boundedId(value, max = 80) {
  const text = String(value || '').trim().slice(0, max);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text) ? text : '';
}

function createDiscoveryTelemetryEvent(type, input = {}) {
  if (!ALLOWED_EVENTS.has(type)) return null;
  return Object.freeze({
    type,
    activityId: boundedId(input.activityId),
    catalogFamily: boundedId(input.catalogFamily),
    discipline: boundedId(input.discipline),
    contextBands: [...new Set((Array.isArray(input.contextBands) ? input.contextBands : []).filter((value) => ALLOWED_CONTEXTS.has(value)))].slice(0, 4),
    durationBand: ['instant', 'short', 'medium', 'long'].includes(input.durationBand) ? input.durationBand : 'instant',
    result: boundedId(input.result),
    multiplayer: input.multiplayer === true,
    liveGps: input.liveGps === true,
    schemaVersion: 1
  });
}

function emitDiscoveryTelemetry(type, input = {}) {
  const event = createDiscoveryTelemetryEvent(type, input);
  if (!event) return false;
  globalThis.dispatchEvent?.(new CustomEvent('we3d:discovery-telemetry', { detail: event }));
  return true;
}

export { ALLOWED_EVENTS, createDiscoveryTelemetryEvent, emitDiscoveryTelemetry };
