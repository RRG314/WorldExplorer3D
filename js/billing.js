import { getCurrentUserToken } from './auth-ui.js';
import { readFirebaseConfig } from './firebase-init.js';

const DEFAULT_FUNCTIONS_REGION = 'us-central1';

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

function isFirebaseHostingDomain(hostname = '') {
  return hostname.endsWith('.web.app') || hostname.endsWith('.firebaseapp.com');
}

function getFunctionsOrigin() {
  const override = String(globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN || '').trim();
  if (override) return override.replace(/\/$/, '');

  const hostname = String(globalThis.location && globalThis.location.hostname ? globalThis.location.hostname : '');
  if (isFirebaseHostingDomain(hostname)) return '';

  const cfg = readFirebaseConfig();
  const projectId = cfg && cfg.projectId ? String(cfg.projectId).trim() : '';
  if (!projectId) return '';

  return `https://${DEFAULT_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
}

function functionUrl(path) {
  const origin = getFunctionsOrigin();
  return origin ? `${origin}${path}` : path;
}

async function postFunction(path, body = {}) {
  const token = await getCurrentUserToken(true);
  const res = await fetch(functionUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {
    payload = null;
  }

  if (!res.ok) {
    const message = payload && payload.error ? payload.error : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return payload || {};
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
