const EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const BLOCKED_PARAM = /(?:lat|lon|coord|email|room_code|room_name|player_name|free_text|message)/i;
const QUEUE_KEY = '__WE3D_PRODUCT_TELEMETRY_QUEUE__';
const MAX_QUEUE = 50;

function safeToken(value, max = 64) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
}

function sanitizeProductParams(params = {}) {
  const safe = {};
  Object.entries(params && typeof params === 'object' ? params : {}).slice(0, 20).forEach(([rawKey, rawValue]) => {
    const key = safeToken(rawKey, 40);
    if (!key || BLOCKED_PARAM.test(key) || rawValue == null) return;
    if (typeof rawValue === 'boolean') safe[key] = rawValue;
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) safe[key] = rawValue;
    else safe[key] = safeToken(rawValue, 64) || 'unknown';
  });
  return safe;
}

function emitProductTelemetry(name, params = {}) {
  const eventName = safeToken(name, 40);
  if (!EVENT_NAME.test(eventName)) return false;
  const detail = Object.freeze({
    name: eventName,
    params: Object.freeze(sanitizeProductParams(params)),
    schemaVersion: 1
  });
  if (globalThis.__WE3D_ANALYTICS_PRODUCT_EVENTS_BOUND__ !== true) {
    const queue = Array.isArray(globalThis[QUEUE_KEY]) ? globalThis[QUEUE_KEY] : [];
    queue.push(detail);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    globalThis[QUEUE_KEY] = queue;
  }
  globalThis.dispatchEvent?.(new CustomEvent('we3d:product-telemetry', { detail }));
  return true;
}

export { QUEUE_KEY, emitProductTelemetry, sanitizeProductParams };
