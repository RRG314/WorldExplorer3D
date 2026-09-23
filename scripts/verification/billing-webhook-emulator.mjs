import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);

// Exercise the shipped HTTP signature handler and Firestore writes, using only
// an isolated emulator identity and non-service signing/price fixtures.
export async function verifyBillingWebhook({ projectId, functionsOrigin, uid }) {
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
    assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/, `Billing verification requires loopback ${key}`);
  }
  assert.equal(new URL(functionsOrigin).hostname, '127.0.0.1');
  const fixture = process.env.WE3D_VERIFICATION_STRIPE_FIXTURE;
  assert.ok(fixture, 'Run billing through the isolated account emulator wrapper');
  const requestCount = () => readFileSync(`${fixture}.requests`, 'utf8').split('\n').filter(Boolean).length;
  const admin = require('../../functions/node_modules/firebase-admin');
  const Stripe = require('../../functions/node_modules/stripe');
  const app = admin.initializeApp({ projectId }, `billing-verification-${Date.now()}`);
  const userRef = app.firestore().collection('users').doc(uid);
  const before = (await userRef.get()).data();
  assert.ok(before?.uid === uid && before.plan === 'trial', 'Use the account journey’s isolated test identity');
  const stripe = new Stripe('local-emulator-unused');
  const checks = [];
  let sequence = 0;
  const eventEpoch = Math.floor(Date.now() / 1000) - 60;
  async function send(status, price, validSignature = true, event = {}) {
    const canonical = event.canonical || { status, price };
    writeFileSync(fixture, JSON.stringify({ status: event.apiFailure ? 503 : 200,
      body: event.apiFailure ? { error: { type: 'api_error', message: 'Controlled Stripe outage' } } : {
        id: 'sub_emulator_billing', object: 'subscription', status: canonical.status,
        items: { data: [{ price: { id: canonical.price } }] }
      } }));
    const requestsBefore = requestCount();
    const payload = JSON.stringify({ id: event.id || `evt_emulator_${Date.now()}_${sequence++}`, type: 'customer.subscription.updated',
      object: 'event', created: event.created || eventEpoch + sequence, livemode: false,
      data: { object: { id: 'sub_emulator_billing', object: 'subscription', customer: 'cus_emulator_billing', status,
        metadata: { uid }, items: { data: [{ price: { id: price } }] } } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: validSignature ? 'local-emulator-unused' : 'wrong-emulator-secret' });
    const response = await fetch(`${functionsOrigin}/stripeWebhook`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, validSignature ? (event.apiFailure ? 500 : 200) : 400, await response.text());
    if (!validSignature || event.duplicate) assert.equal(requestCount(), requestsBefore, 'Rejected/duplicate event must not fetch Stripe state');
    else assert.ok(requestCount() > requestsBefore, 'Signed update must use the Stripe SDK to retrieve canonical state');
    return (await userRef.get()).data();
  }
  try {
    await userRef.update({ roomCreateCount: 2 });
    let state = await send('active', 'price_emulator_pro', false);
    assert.equal(state.plan, 'trial');
    checks.push('invalid signature rejected without changing plan');
    state = await send('active', 'price_emulator_pro');
    assert.equal(state.plan, 'pro'); assert.equal(state.entitlements.proEarlyAccess, true);
    assert.equal(state.roomCreateLimit, 10); assert.equal(state.roomCreateCount, 2);
    checks.push('signed subscription update grants Pro entitlements and room limit');
    state = await send('active', 'price_emulator_pro');
    assert.equal(state.roomCreateCount, 2); assert.equal(state.plan, 'pro');
    checks.push('repeated update preserves existing room count');
    state = await send('active', 'price_emulator_supporter');
    assert.equal(state.plan, 'supporter'); assert.equal(state.entitlements.proEarlyAccess, false);
    assert.equal(state.roomCreateLimit, 3);
    checks.push('plan change removes Pro-only entitlements');
    state = await send('canceled', 'price_emulator_supporter');
    assert.equal(state.plan, 'trial'); assert.equal(state.subscriptionStatus, 'canceled');
    assert.equal(state.roomCreateCount, 2);
    checks.push('ended subscription restores the still-valid trial');
    const committedEvent = { id: state.stripeEventId, created: state.stripeEventCreated };
    const committedUpdatedAt = state.updatedAt.toMillis();
    state = await send('canceled', 'price_emulator_supporter', true, { ...committedEvent, duplicate: true });
    assert.equal(state.updatedAt.toMillis(), committedUpdatedAt);
    checks.push('exact duplicate event returns success without a second write');
    state = await send('active', 'price_emulator_pro', true, { id: 'evt_emulator_delayed', created: eventEpoch,
      canonical: { status: 'canceled', price: 'price_emulator_supporter' } });
    assert.equal(state.plan, 'trial'); assert.equal(state.subscriptionStatus, 'canceled');
    assert.equal(state.stripeEventId, 'evt_emulator_delayed');
    checks.push('delayed signed paid event cannot restore canceled access');
    await userRef.update({ stripeEventCreated: admin.firestore.FieldValue.delete(), stripeEventId: admin.firestore.FieldValue.delete() });
    const legacyUpdatedAt = state.updatedAt.toMillis();
    state = await send('active', 'price_emulator_pro', true, { apiFailure: true });
    assert.equal(state.plan, 'trial'); assert.equal(state.updatedAt.toMillis(), legacyUpdatedAt);
    assert.equal(state.stripeEventId, undefined);
    checks.push('canonical API outage returns 500 without changing the legacy account');
    state = await send('active', 'price_emulator_pro', true, { canonical: { status: 'canceled', price: 'price_emulator_supporter' } });
    assert.equal(state.plan, 'trial'); assert.equal(state.subscriptionStatus, 'canceled');
    checks.push('pre-cursor account reconciles current state instead of replaying stale paid access');
    return { ok: true, scope: 'signed HTTP webhook, real Stripe SDK with controlled transport, and emulator persistence; no hosted Stripe API or payment', checks };
  } finally {
    // Restore this fixture before the separate account deletion test. Fake
    // subscription IDs must never cause a request to Stripe’s live API.
    await userRef.set(before);
    await app.delete();
  }
}
