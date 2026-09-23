import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// Execute shipped handlers with a versioned store. A controlled concurrent write
// invalidates the first read, forcing the same retry contract as Firestore.
// The separate account-backend gate exercises actual HTTP and emulator commits.
const source = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('async function ensureUserDoc('), source.indexOf('exports.getPublicSiteStats ='));
const trialHandler = source.slice(source.indexOf('exports.startTrial ='), source.indexOf('exports.enableAdminTester ='));
function fixture(initial, conflict) {
  let state = initial ? { ...initial } : undefined, version = 0, reads = 0, creatorWrites = 0;
  const snapshot = () => ({ exists: !!state, data: () => state ? { ...state } : undefined });
  const overwrite = patch => { state = { ...state, ...patch }; version++; };
  const ref = { get: async () => {
    const snap = snapshot(), data = snap.data(); reads++;
    if (conflict) { const effect = conflict; conflict = null; effect(overwrite); }
    return { ...snap, data: () => data };
  }, set: async patch => overwrite(patch) };
  const db = { collection: () => ({ doc: () => ref }), runTransaction: async callback => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const readVersion = version; let patch;
      const result = await callback({ get: () => ref.get(), set: (_, data) => { patch = data; } });
      if (version !== readVersion) continue;
      if (patch) overwrite(patch);
      return result;
    }
    throw new Error('transaction conflict never resolved');
  } };
  const limits = { free: 0, trial: 3, supporter: 3, pro: 10 };
  const fn = { region: () => fn, runWith: () => fn, https: { onRequest: handler => handler } };
  const scope = { db, console, exports: {}, functions: fn,
    normalizeDisplayName: value => String(value || '').trim(), normalizePlan: value => value || 'free',
    normalizeRoomCreateCount: value => Number(value) || 0, normalizeRoomCreateLimit: value => Number(value) || 0,
    roomCreateLimitForPlan: value => limits[value], planEntitlements: plan => ({ proEarlyAccess: plan === 'pro' }),
    timestampToMillis: value => value?.toMillis?.() || Number(value) || null,
    AdminTimestamp: { fromMillis: value => ({ toMillis: () => value }) },
    FieldValue: { serverTimestamp: () => 'server-time' }, ADMIN_TEST_ROOM_CREATE_LIMIT: 10000, TRIAL_DURATION_MS: 86400000,
    ensureCreatorProfileDoc: async () => { creatorWrites++; }, stripeConfig: () => ({}), planFromPriceId: value => value,
    hasActiveSubscription: status => status === 'active', setCors: () => false, verifyAuth: async () => ({ uid: 'test-user' }),
    admin: { auth: () => ({ getUser: async () => ({ email: 'test@example.test', displayName: 'Explorer' }) }) }
  };
  vm.createContext(scope); vm.runInContext(helpers + trialHandler, scope);
  return { scope, state: () => state, reads: () => reads, creatorWrites: () => creatorWrites,
    trial: async () => {
      let status, body, responses = 0;
      const res = { status: value => { status = value; return res; }, json: value => { body = value; responses++; } };
      await scope.exports.startTrial({ method: 'POST' }, res);
      assert.equal(responses, 1, 'HTTP response must occur once, after the transaction commits');
      return { status, body };
    } };
}

test('billing updates retry a concurrent room increment instead of losing it', async () => {
  const f = fixture({ plan: 'pro', roomCreateCount: 2 }, write => write({ roomCreateCount: 3 }));
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', status: 'active', priceId: 'pro' });
  assert.equal(f.state().roomCreateCount, 3); assert.ok(f.reads() >= 2);
});
test('profile provisioning preserves a concurrently created paid profile and room count', async () => {
  const f = fixture(null, write => write({ uid: 'test-user', plan: 'pro', displayName: 'Paid Explorer', roomCreateCount: 3, roomCreateLimit: 10 }));
  await f.scope.ensureUserDoc('test-user', '', '');
  assert.equal(f.state().plan, 'pro'); assert.equal(f.state().roomCreateCount, 3);
  assert.equal(f.state().roomCreateLimit, 10); assert.equal(f.creatorWrites(), 1);
});
test('trial admission rechecks a paid plan written after initial profile provisioning', async () => {
  const f = fixture({ plan: 'free', roomCreateCount: 0 }, write => write({ plan: 'pro', subscriptionStatus: 'active', roomCreateCount: 2 }));
  // Isolate the trial decision from the separately tested provisioning transaction.
  f.scope.ensureUserDoc = async () => ({ plan: 'free', roomCreateCount: 0 });
  const result = await f.trial();
  assert.equal(result.status, 200); assert.equal(result.body.status, 'already-paid');
  assert.equal(f.state().plan, 'pro'); assert.equal(f.state().roomCreateCount, 2);
});
test('simultaneous trial requests activate once and return the same expiry', async () => {
  const f = fixture({ uid: 'test-user', plan: 'free', roomCreateCount: 0 });
  f.scope.ensureUserDoc = async () => f.state();
  const results = await Promise.all([f.trial(), f.trial()]);
  assert.deepEqual(results.map(row => row.body.status).sort(), ['activated', 'already-active']);
  assert.equal(results[0].body.trialEndsAtMs, results[1].body.trialEndsAtMs);
});
test('subscription fallback reads trial expiry from the committed account snapshot', async () => {
  const f = fixture({ plan: 'pro', roomCreateCount: 2, trialEndsAtMs: Date.now() + 60000 }, write => write({ trialEndsAtMs: Date.now() - 1 }));
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', status: 'canceled', priceId: 'pro' });
  assert.equal(f.state().plan, 'free'); assert.equal(f.state().roomCreateCount, 2);
});

test('delayed subscription event cannot restore canceled paid access', async () => {
  const f = fixture({ plan: 'free', subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_current', stripeEventCreated: 200, stripeEventId: 'evt_cancel', roomCreateCount: 2 });
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async () => ({ status: 'canceled', items: { data: [{ price: { id: 'pro' } }] } }) } });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_current', status: 'active', priceId: 'pro', eventCreated: 100, eventId: 'evt_old' });
  assert.equal(f.state().plan, 'free'); assert.equal(f.state().subscriptionStatus, 'canceled');
  assert.equal(f.state().stripeEventId, 'evt_old');
});
test('duplicate signed event does not rewrite the committed account', async () => {
  const f = fixture({ plan: 'supporter', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_current', stripeEventCreated: 200, stripeEventId: 'evt_same', updatedAt: 'original' });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_current', status: 'active', priceId: 'supporter', eventCreated: 200, eventId: 'evt_same' });
  assert.equal(f.state().updatedAt, 'original');
});
test('same-second subscription changes reconcile current Stripe state inside the transaction', async () => {
  const f = fixture({ plan: 'supporter', stripeSubscriptionId: 'sub_current', stripeEventCreated: 200, stripeEventId: 'evt_newer' });
  let lookups = 0;
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async id => {
    assert.equal(id, 'sub_current'); lookups++;
    return { status: 'active', items: { data: [{ price: { id: 'supporter' } }] } };
  } } });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_current', status: 'active', priceId: 'pro', eventCreated: 200, eventId: 'evt_delayed_same_second' });
  assert.equal(f.state().plan, 'supporter'); assert.equal(lookups, 1);
});
test('ending an older subscription cannot cancel the current active subscription', async () => {
  const f = fixture({ plan: 'pro', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_current', stripeEventCreated: 200, stripeEventId: 'evt_current' });
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async () => ({ status: 'canceled', items: { data: [{ price: { id: 'pro' } }] } }) } });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_old', status: 'canceled', priceId: 'pro', eventCreated: 201, eventId: 'evt_old_cancel' });
  assert.equal(f.state().plan, 'pro'); assert.equal(f.state().stripeSubscriptionId, 'sub_current');
});
test('same-second reconciliation fetches again after a concurrent account change', async () => {
  const f = fixture({ plan: 'pro', stripeSubscriptionId: 'sub_current', stripeEventCreated: 200, stripeEventId: 'evt_previous' }, write => write({ plan: 'free', subscriptionStatus: 'canceled' }));
  let lookups = 0;
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async () => ({ status: ++lookups === 1 ? 'active' : 'canceled', items: { data: [{ price: { id: 'pro' } }] } }) } });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_current', status: 'active', priceId: 'pro', eventCreated: 200, eventId: 'evt_incoming' });
  assert.equal(lookups, 2); assert.equal(f.state().plan, 'free');
});
test('failed same-second reconciliation cannot commit an unverified entitlement', async () => {
  const f = fixture({ plan: 'supporter', stripeSubscriptionId: 'sub_current', stripeEventCreated: 200, stripeEventId: 'evt_previous' });
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async () => { throw new Error('Stripe unavailable'); } } });
  await assert.rejects(f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_current', status: 'active', priceId: 'pro', eventCreated: 200, eventId: 'evt_incoming' }), /Stripe unavailable/);
  assert.equal(f.state().plan, 'supporter'); assert.equal(f.state().stripeEventId, 'evt_previous');
});


test('existing subscription without an event cursor reconciles before accepting delayed paid access', async () => {
  const f = fixture({ plan: 'free', subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_legacy', roomCreateCount: 2 });
  let lookups = 0;
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async id => {
    assert.equal(id, 'sub_legacy'); lookups++;
    return { status: 'canceled', items: { data: [{ price: { id: 'pro' } }] } };
  } } });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_legacy', status: 'active', priceId: 'pro', eventCreated: 100, eventId: 'evt_legacy_delayed' });
  assert.equal(f.state().plan, 'free'); assert.equal(f.state().subscriptionStatus, 'canceled');
  assert.equal(f.state().roomCreateCount, 2); assert.equal(lookups, 1);
  assert.equal(f.state().stripeEventCreated, 100);
});

test('failed legacy subscription reconciliation preserves the account and leaves the cursor unset', async () => {
  const f = fixture({ plan: 'free', subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_legacy', updatedAt: 'original' });
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async () => { throw new Error('Stripe unavailable'); } } });
  await assert.rejects(f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_legacy', status: 'active', priceId: 'pro', eventCreated: 100, eventId: 'evt_legacy_delayed' }), /Stripe unavailable/);
  assert.equal(f.state().plan, 'free'); assert.equal(f.state().updatedAt, 'original');
  assert.equal(f.state().stripeEventId, undefined);
});


test('a later event timestamp still uses current subscription state, not its payload', async () => {
  const f = fixture({ plan: 'free', subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_current', stripeEventCreated: 100, stripeEventId: 'evt_previous' });
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async () => ({ status: 'canceled', items: { data: [{ price: { id: 'pro' } }] } }) } });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_current', status: 'active', priceId: 'pro', eventCreated: 200, eventId: 'evt_later_timestamp' });
  assert.equal(f.state().plan, 'free'); assert.equal(f.state().subscriptionStatus, 'canceled');
});

test('first signed subscription event uses canonical state before granting paid access', async () => {
  const f = fixture({ plan: 'free', subscriptionStatus: 'none' });
  f.scope.getStripeClient = () => ({ subscriptions: { retrieve: async () => ({ status: 'canceled', items: { data: [{ price: { id: 'pro' } }] } }) } });
  await f.scope.upsertPlanFromSubscription({ uid: 'test-user', subscriptionId: 'sub_first', status: 'active', priceId: 'pro', eventCreated: 200, eventId: 'evt_first' });
  assert.equal(f.state().plan, 'free'); assert.equal(f.state().subscriptionStatus, 'canceled');
});
