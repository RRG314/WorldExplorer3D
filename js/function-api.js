import { getCurrentUserToken } from './auth-ui.js?v=56';
import { getFirebaseAppCheckToken, readFirebaseConfig } from './firebase-init.js?v=58';
import { assertFunctionsOrigin } from './firebase-environment-policy.js';

const DEFAULT_FUNCTIONS_REGION = 'us-central1';
const ROUTING_MISS_STATUS_CODES = new Set([404, 405, 501]);

function normalizeBasePath(pathname = '/') {
  const path = String(pathname || '/');
  const anchors = ['/app/', '/account/', '/legal/'];
  for (const anchor of anchors) {
    const idx = path.indexOf(anchor);
    if (idx >= 0) return path.slice(0, idx);
  }

  if (path === '/' || path === '') return '';
  if (path.endsWith('/')) return path.slice(0, -1);

  const lastSlash = path.lastIndexOf('/');
  return lastSlash > 0 ? path.slice(0, lastSlash) : '';
}

export function getReturnUrlBase() {
  const origin = globalThis.location && globalThis.location.origin ? globalThis.location.origin : '';
  const basePath = normalizeBasePath(globalThis.location && globalThis.location.pathname ? globalThis.location.pathname : '/');
  return `${origin}${basePath}`;
}

function getDirectFunctionsOrigin() {
  const override = String(globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN || '').trim();
  const cfg = readFirebaseConfig();
  if (override) return assertFunctionsOrigin(override, cfg, globalThis.location, globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS);
  const projectId = cfg && cfg.projectId ? String(cfg.projectId).trim() : '';
  if (!projectId) return '';

  return `https://${DEFAULT_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
}

function normalizeFunctionPath(path) {
  const value = String(path || '').trim();
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function buildFunctionCandidates(path) {
  const normalizedPath = normalizeFunctionPath(path);
  const directOrigin = getDirectFunctionsOrigin();
  const host = String(globalThis.location?.hostname || '').toLowerCase();
  const preferDirectOrigin = host === 'localhost' || host === '127.0.0.1';
  const candidates = [];
  if (directOrigin && preferDirectOrigin) candidates.push(`${directOrigin}${normalizedPath}`);
  candidates.push(normalizedPath);
  if (directOrigin && !preferDirectOrigin) candidates.push(`${directOrigin}${normalizedPath}`);
  return [...new Set(candidates)];
}

function isJsonResponse(res, rawText = '') {
  const contentType = String(res && res.headers ? res.headers.get('content-type') || '' : '').toLowerCase();
  if (contentType.includes('application/json')) return true;
  const trimmed = String(rawText || '').trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function summarizeAttempt(attempt = {}) {
  const url = String(attempt.url || '');
  const status = Number(attempt.status);
  const statusLabel = Number.isFinite(status) ? status : 'network';
  return `${url || '<unknown>'} -> ${statusLabel}`;
}

function unavailableFunctionError(path, attempts = [], label = 'API') {
  const endpoint = normalizeFunctionPath(path);
  const summary = attempts.length
    ? attempts.map((attempt) => summarizeAttempt(attempt)).join('; ')
    : 'no endpoint responses';
  return new Error(
    `${label} endpoint unavailable for ${endpoint}. Tried ${summary}. ` +
    'Deploy functions for this project, or set WORLD_EXPLORER_FUNCTIONS_ORIGIN to a valid HTTPS origin.'
  );
}

function interruptedError(code, message) {
  return Object.assign(new Error(message), { code, outcomeUnknown: false });
}

// A deadline includes authentication, response headers and response-body delivery.
// Racing the operation also settles callers when a mocked or stuck provider ignores abort.
async function withRequestDeadline(options, operation) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 60000;
  let timer;
  let rejectInterrupted;
  const interrupted = new Promise((_, reject) => { rejectInterrupted = reject; });
  const cancel = (error) => { controller.abort(error); rejectInterrupted(error); };
  const onAbort = () => cancel(interruptedError('request-cancelled', 'Request cancelled.'));
  try {
    if (options.signal?.aborted) throw interruptedError('request-cancelled', 'Request cancelled.');
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => cancel(interruptedError('request-timeout', 'The request timed out.')), timeoutMs);
    return await Promise.race([operation(controller.signal), interrupted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

async function requestFunction(path, body, options, authenticated) {
  let dispatched = false;
  try {
    return await withRequestDeadline(options, async signal => {
      const token = authenticated ? await getCurrentUserToken(options.forceRefreshToken !== false) : null;
      const appCheckToken = await getFirebaseAppCheckToken();
      if (signal.aborted) throw signal.reason;
      const serializedBody = JSON.stringify(body);
      const candidates = buildFunctionCandidates(path);
      const attempts = [];
      for (let i = 0; i < candidates.length; i += 1) {
        if (signal.aborted) throw signal.reason;
        const url = candidates[i];
        dispatched = true;
        const res = await fetch(url, {
          method: options.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
            ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
            ...(options.headers || {})
          },
          body: serializedBody,
          signal
        });
        const rawText = await res.text();
        attempts.push({ url, status: res.status });
        let payload;
        try { payload = JSON.parse(rawText); } catch { payload = null; }
        const json = isJsonResponse(res, rawText);
        // Only a non-JSON routing rejection may select a different endpoint.
        // Network errors, gateway failures and malformed successful responses may
        // follow a committed write and must never trigger an automatic replay.
        if (!json && ROUTING_MISS_STATUS_CODES.has(res.status) && i < candidates.length - 1) {
          dispatched = false;
          continue;
        }
        if (!json || (res.ok && (!payload || typeof payload !== 'object'))) {
          const error = unavailableFunctionError(path, attempts, String(options.label || 'API'));
          error.status = res.status;
          error.outcomeUnknown = res.ok || res.status >= 500;
          throw error;
        }
        if (!res.ok) {
          throw Object.assign(new Error(payload?.error || `Request failed (${res.status})`), {
            status: res.status, payload, outcomeUnknown: res.status >= 500
          });
        }
        return payload;
      }
      throw unavailableFunctionError(path, attempts, String(options.label || 'API'));
    });
  } catch (error) {
    if (dispatched && (!error.status || error.status >= 500 || error.outcomeUnknown)) {
      error.outcomeUnknown = true;
      error.message = `${error.message} The operation may have completed. Check its status before submitting again.`;
    }
    throw error;
  }
}

export function postAppCheckedFunction(path, body = {}, options = {}) {
  return requestFunction(path, body, options, false);
}

export function postProtectedFunction(path, body = {}, options = {}) {
  return requestFunction(path, body, options, true);
}
