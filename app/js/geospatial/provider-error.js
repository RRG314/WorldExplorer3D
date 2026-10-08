// Keep provider response text out of errors and diagnostic receipts. HTTP
// Retry-After accepts delay seconds or an HTTP date; both become a duration.
export function providerResponseError(response, now = Date.now()) {
  void response?.body?.cancel?.().catch(() => {});
  const status = Number(response?.status) || 0;
  const value = String(response?.headers?.get?.('retry-after') || '').trim();
  const delay = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  const retryAfterMs = Number.isFinite(delay) ? Math.max(0, Math.min(86400000, delay)) : null;
  const category = status === 429 ? 'rate-limited' : status === 401 || status === 403 ? 'permission' : status >= 500 ? 'unavailable' : 'request-failed';
  return Object.assign(new Error(`Data source request failed (HTTP ${status}).`), { status, category, retryAfterMs });
}
export function providerFailureCategory(error, timedOut = false) {
  if (timedOut) return 'timeout';
  if (error?.name === 'AbortError') return 'cancelled';
  if (error?.status === 429) return 'rate-limited';
  if (error?.status === 401 || error?.status === 403) return 'permission';
  if (error?.status >= 500 || error instanceof TypeError) return 'unavailable';
  if (/size limit|exceeds.*budget/i.test(String(error?.message || ''))) return 'response-limit';
  return 'request-failed';
}
export function providerCooldownError(retryAt) {
  return Object.assign(new Error('Data source is temporarily unavailable. Retry after the current cooldown.'), { code:'PROVIDER_COOLDOWN', retryAt });
}
