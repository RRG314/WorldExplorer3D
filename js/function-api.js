import { getCurrentUserToken } from './auth-ui.js';
import { readFirebaseConfig } from './firebase-init.js';

const DEFAULT_FUNCTIONS_REGION = 'us-central1';
const RETRYABLE_STATUS_CODES = new Set([404, 405, 406, 501, 502, 503, 504]);

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
  if (override) return override.replace(/\/$/, '');

  const cfg = readFirebaseConfig();
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

function isRetryableFunctionStatus(status) {
  return RETRYABLE_STATUS_CODES.has(Number(status));
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

export async function postProtectedFunction(path, body = {}, options = {}) {
  const token = await getCurrentUserToken(options.forceRefreshToken !== false);
  const candidates = buildFunctionCandidates(path);
  let lastError = null;
  const attempts = [];
  const label = String(options.label || 'API');

  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i];
    const isLast = i === candidates.length - 1;
    let responseRecorded = false;

    try {
      const res = await fetch(url, {
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        },
        body: JSON.stringify(body)
      });

      const rawText = await res.text();
      let payload = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = null;
        }
      }

      attempts.push({ url, status: res.status });
      responseRecorded = true;

      if (!isJsonResponse(res, rawText)) {
        if (!isLast) continue;
        throw unavailableFunctionError(path, attempts, label);
      }

      if (isRetryableFunctionStatus(res.status) && !isLast) continue;

      if (!res.ok) {
        if (isRetryableFunctionStatus(res.status)) {
          throw unavailableFunctionError(path, attempts, label);
        }
        const message = payload && payload.error ? payload.error : `Request failed (${res.status})`;
        throw new Error(message);
      }

      return payload || {};
    } catch (err) {
      lastError = err;
      if (!responseRecorded) attempts.push({ url, status: null });
      if (!isLast && !responseRecorded) continue;
      throw err;
    }
  }

  if (lastError) throw lastError;
  throw unavailableFunctionError(path, attempts, label);
}
