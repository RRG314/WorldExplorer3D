import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Exercise the shipped HTTP signature handler and Firestore writes, using only
// an isolated emulator identity and non-service signing/price fixtures.
export async function verifyBillingWebhook({ projectId, functionsOrigin, uid }) {
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
    assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/, `Billing verification requires loopback ${key}`);
  }
  assert.equal(new URL(functionsOrigin).hostname, '127.0.0.1');
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
    const payload = JSON.stringify({ id: event.id || `evt_emulator_${Date.now()}_${sequence++}`, type: 'customer.subscription.updated',
      object: 'event', created: event.created || eventEpoch + sequence, livemode: false,
      data: { object: { id: 'sub_emulator_billing', object: 'subscription', customer: 'cus_emulator_billing', status,
        metadata: { uid }, items: { data: [{ price: { id: price } }] } } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: validSignature ? 'local-emulator-unused' : 'wrong-emulator-secret' });
    const response = await fetch(`${functionsOrigin}/stripeWebhook`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, validSignature ? 200 : 400, await response.text());
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
    state = await send('canceled', 'price_emulator_supporter', true, committedEvent);
    assert.equal(state.updatedAt.toMillis(), committedUpdatedAt);
    checks.push('exact duplicate event returns success without a second write');
    state = await send('active', 'price_emulator_pro', true, { id: 'evt_emulator_delayed', created: eventEpoch });
    assert.equal(state.plan, 'trial'); assert.equal(state.subscriptionStatus, 'canceled');
    assert.equal(state.stripeEventId, committedEvent.id);
    checks.push('delayed signed paid event cannot restore canceled access');
    return { ok: true, scope: 'signed HTTP webhook and emulator persistence; no Stripe payment or external API request', checks };
  } finally {
    // Restore this fixture before the separate account deletion test. Fake
    // subscription IDs must never cause a request to Stripe’s live API.
    await userRef.set(before);
    await app.delete();
  }
}
