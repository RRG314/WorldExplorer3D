import { getReturnUrlBase, postProtectedFunction } from './function-api.js?v=1';

export async function createCheckoutSession(plan) {
  const payload = await postProtectedFunction(
    '/createCheckoutSession',
    { plan, returnUrlBase: getReturnUrlBase() },
    { label: 'Account API' }
  );
  if (!payload.url) {
    throw new Error('Checkout session did not return a URL.');
  }
  return payload.url;
}

export async function createPortalSession() {
  const payload = await postProtectedFunction(
    '/createPortalSession',
    { returnUrlBase: getReturnUrlBase() },
    { label: 'Account API' }
  );
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
  const payload = await postProtectedFunction('/getAccountOverview', {}, { label: 'Account API' });
  return payload && payload.overview ? payload.overview : null;
}

export async function listBillingReceipts(options = {}) {
  const body = {};
  if (Number.isFinite(Number(options.limit))) body.limit = Number(options.limit);
  if (options.startingAfter) body.startingAfter = String(options.startingAfter);
  const payload = await postProtectedFunction('/listBillingReceipts', body, { label: 'Account API' });
  return {
    receipts: Array.isArray(payload && payload.receipts) ? payload.receipts : [],
    hasMore: !!(payload && payload.hasMore)
  };
}

export async function updateAccountProfile(input) {
  const payload = await postProtectedFunction(
    '/updateAccountProfile',
    typeof input === 'object' && input !== null
      ? input
      : { displayName: input },
    { label: 'Account API' }
  );
  return payload || {};
}

export async function startTrial() {
  const payload = await postProtectedFunction('/startTrial', {}, { label: 'Account API' });
  return payload || {};
}

export async function enableAdminTester() {
  const payload = await postProtectedFunction('/enableAdminTester', {}, { label: 'Account API' });
  return payload || {};
}

export async function deleteAccount() {
  const payload = await postProtectedFunction('/deleteAccount', { confirmation: 'DELETE' }, { label: 'Account API' });
  return payload || {};
}
