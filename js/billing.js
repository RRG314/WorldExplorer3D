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

function getReturnUrlBase() {
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
  const candidates = [normalizedPath];
  if (directOrigin) candidates.push(`${directOrigin}${normalizedPath}`);

  return [...new Set(candidates)];
}

function isRetryableFunctionStatus(status) {
  return RETRYABLE_STATUS_CODES.has(Number(status));
}

<<<<<<< HEAD
function isJsonResponse(res, rawText = '') {
  const contentType = String(res && res.headers ? res.headers.get('content-type') || '' : '').toLowerCase();
  if (contentType.includes('application/json')) return true;
  const trimmed = String(rawText || '').trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

=======
>>>>>>> worldexplorer3d/main
function summarizeAttempt(attempt = {}) {
  const url = String(attempt.url || '');
  const status = Number(attempt.status);
  const statusLabel = Number.isFinite(status) ? status : 'network';
  return `${url || '<unknown>'} -> ${statusLabel}`;
}

function unavailableFunctionError(path, attempts = []) {
  const endpoint = normalizeFunctionPath(path);
  const summary = attempts.length
    ? attempts.map((attempt) => summarizeAttempt(attempt)).join('; ')
    : 'no endpoint responses';
  return new Error(
    `Account API endpoint unavailable for ${endpoint}. Tried ${summary}. ` +
    'Deploy functions for this project, or set WORLD_EXPLORER_FUNCTIONS_ORIGIN to a valid HTTPS origin.'
  );
}

async function postFunction(path, body = {}) {
  const token = await getCurrentUserToken(true);
  const candidates = buildFunctionCandidates(path);
  let lastError = null;
  const attempts = [];

  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    const isLast = i === candidates.length - 1;
    let responseRecorded = false;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const rawText = await res.text();
      let payload = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch (_) {
          payload = null;
        }
      }

      attempts.push({ url, status: res.status });
      responseRecorded = true;

<<<<<<< HEAD
      if (!isJsonResponse(res, rawText)) {
        if (!isLast) {
          continue;
        }
        throw unavailableFunctionError(path, attempts);
      }

=======
>>>>>>> worldexplorer3d/main
      if (isRetryableFunctionStatus(res.status) && !isLast) {
        continue;
      }

      if (!res.ok) {
        if (isRetryableFunctionStatus(res.status)) {
          throw unavailableFunctionError(path, attempts);
        }
        const message = payload && payload.error ? payload.error : `Request failed (${res.status})`;
        throw new Error(message);
      }

      return payload || {};
    } catch (err) {
      lastError = err;
      if (!responseRecorded) {
        attempts.push({ url, status: null });
      }
      if (!isLast && !responseRecorded) continue;
      throw err;
    }
  }

  if (lastError) throw lastError;
  throw unavailableFunctionError(path, attempts);
}

export async function createCheckoutSession(plan) {
  const payload = await postFunction('/createCheckoutSession', { plan, returnUrlBase: getReturnUrlBase() });
  if (!payload.url) {
    throw new Error('Checkout session did not return a URL.');
  }
  return payload.url;
}

export async function createPortalSession() {
  const payload = await postFunction('/createPortalSession', { returnUrlBase: getReturnUrlBase() });
  if (!payload.url) {
    throw new Error('Billing portal session did not return a URL.');
  }
  return payload.url;
}

export async function redirectToCheckout(plan) {
  const url = await createCheckoutSession(plan);
  globalThis.location.assign(url);
}

export async function redirectToPortal() {
  const url = await createPortalSession();
  globalThis.location.assign(url);
}

export async function getAccountOverview() {
  const payload = await postFunction('/getAccountOverview', {});
  return payload && payload.overview ? payload.overview : null;
}

export async function listBillingReceipts(options = {}) {
  const body = {};
  if (Number.isFinite(Number(options.limit))) body.limit = Number(options.limit);
  if (options.startingAfter) body.startingAfter = String(options.startingAfter);
  const payload = await postFunction('/listBillingReceipts', body);
  return {
    receipts: Array.isArray(payload && payload.receipts) ? payload.receipts : [],
    hasMore: !!(payload && payload.hasMore)
  };
}

export async function updateAccountProfile(displayName) {
  const payload = await postFunction('/updateAccountProfile', { displayName });
  return payload || {};
}

export async function startTrial() {
  const payload = await postFunction('/startTrial', {});
  return payload || {};
}

export async function enableAdminTester() {
  const payload = await postFunction('/enableAdminTester', {});
  return payload || {};
}

export async function deleteAccount() {
  const payload = await postFunction('/deleteAccount', { confirmation: 'DELETE' });
  return payload || {};
}
