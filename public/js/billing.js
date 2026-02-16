import { getCurrentUserToken } from './auth-ui.js';

async function postFunction(path, body = {}) {
  const token = await getCurrentUserToken(true);
  const res = await fetch(path, {
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
  const payload = await postFunction('/createCheckoutSession', { plan });
  if (!payload.url) {
    throw new Error('Checkout session did not return a URL.');
  }
  return payload.url;
}

export async function createPortalSession() {
  const payload = await postFunction('/createPortalSession', {});
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
