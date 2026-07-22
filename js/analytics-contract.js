const ANALYTICS_VISIT_WINDOW_MS = 30 * 60 * 1000;
const ANALYTICS_VISIT_STORAGE_KEY = 'worldExplorer3D.analyticsVisit.v1';
const BLOCKED_PRODUCT_PARAM = /(?:uid|user|email|name|token|code|coordinate|latitude|longitude|message|text)/i;

function sanitizeAnalyticsName(value, fallback = 'unknown', max = 40) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.:/]+/g, '_')
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
  return normalized || fallback;
}

function sanitizeProductParams(params = {}) {
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(params || {})) {
    const key = sanitizeAnalyticsName(rawKey, '', 36);
    if (!key || BLOCKED_PRODUCT_PARAM.test(key)) continue;
    if (typeof rawValue === 'boolean') result[key] = rawValue;
    else if (Number.isFinite(rawValue)) result[key] = Math.max(-1e9, Math.min(1e9, rawValue));
    else if (typeof rawValue === 'string') result[key] = sanitizeAnalyticsName(rawValue, 'unknown', 60);
  }
  return result;
}

function updateVisitContext(storage, now = Date.now()) {
  const safeNow = Math.max(0, Number(now) || Date.now());
  let previous = {};
  try {
    previous = JSON.parse(storage?.getItem?.(ANALYTICS_VISIT_STORAGE_KEY) || '{}') || {};
  } catch {
    previous = {};
  }
  const firstAt = Math.max(0, Number(previous.firstAt) || safeNow);
  const previousAt = Math.max(0, Number(previous.lastAt) || 0);
  const startsNewVisit = !previousAt || safeNow - previousAt >= ANALYTICS_VISIT_WINDOW_MS;
  const visitIndex = Math.max(1, Math.floor(Number(previous.visitIndex) || 1) + (startsNewVisit && previousAt ? 1 : 0));
  try {
    storage?.setItem?.(ANALYTICS_VISIT_STORAGE_KEY, JSON.stringify({ firstAt, lastAt: safeNow, visitIndex }));
  } catch {
    // Analytics must never block the app when storage is unavailable.
  }
  return {
    visit_index: visitIndex,
    returning: visitIndex > 1,
    days_since_first: Math.max(0, Math.floor((safeNow - firstAt) / 86400000)),
    days_since_previous: previousAt ? Math.max(0, Math.floor((safeNow - previousAt) / 86400000)) : 0,
    new_visit: startsNewVisit
  };
}

export { sanitizeAnalyticsName, sanitizeProductParams, updateVisitContext };
