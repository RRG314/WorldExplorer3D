const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();
const db = admin.firestore();

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due']);
const ALLOWED_PLANS = new Set(['support', 'supporter', 'pro']);
const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;
const ADMIN_TEST_ROOM_CREATE_LIMIT = 10000;
const ROOM_CREATE_LIMITS = Object.freeze({
  free: 0,
  trial: 3,
  supporter: 10,
  pro: 25
});

function stripeConfig() {
  const cfg = functions.config().stripe || {};
  return {
    secret: cfg.secret || '',
    webhook: cfg.webhook || '',
    price_supporter: cfg.price_supporter || '',
    price_pro: cfg.price_pro || ''
  };
}

function adminConfig() {
  const cfg = functions.config().admin || {};
  return {
    allowedEmails: cfg.allowed_emails || process.env.WE3D_ADMIN_EMAILS || '',
    allowedUids: cfg.allowed_uids || process.env.WE3D_ADMIN_UIDS || ''
  };
}

function parseCsvSet(value, normalize = (item) => item) {
  return new Set(
    String(value || '')
      .split(',')
      .map((part) => normalize(String(part || '').trim()))
      .filter(Boolean)
  );
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isAllowlistedAdminCandidate(authUser, uid) {
  const cfg = adminConfig();
  const allowedUidSet = parseCsvSet(cfg.allowedUids);
  if (allowedUidSet.has(String(uid || '').trim())) {
    return { allowed: true, source: 'uid' };
  }

  const allowedEmailSet = parseCsvSet(cfg.allowedEmails, normalizeEmail);
  const email = normalizeEmail(authUser && authUser.email ? authUser.email : '');
  if (email && allowedEmailSet.has(email)) {
    if (authUser && authUser.emailVerified === true) {
      return { allowed: true, source: 'email' };
    }
    return { allowed: false, reason: 'Email is allowlisted but not verified yet.' };
  }

  return { allowed: false, reason: 'Your account is not on the admin allowlist.' };
}

function getStripeClient() {
  const cfg = stripeConfig();
  if (!cfg.secret) {
    throw new Error('Stripe secret is missing. Set functions config: stripe.secret');
  }
  return new Stripe(cfg.secret, { apiVersion: '2024-06-20' });
}

function planEntitlements(plan) {
  const normalized = normalizePlan(plan);

  if (normalized === 'pro') {
    return {
      fullAccess: true,
      cloudSync: true,
      proEarlyAccess: true,
      prioritySupport: true,
      featureConsideration: true,
      directContact: true
    };
  }

  if (normalized === 'supporter' || normalized === 'trial') {
    return {
      fullAccess: true,
      cloudSync: true,
      proEarlyAccess: false,
      prioritySupport: false,
      featureConsideration: false,
      directContact: false
    };
  }

  return {
    fullAccess: true,
    cloudSync: false,
    proEarlyAccess: false,
    prioritySupport: false,
    featureConsideration: false,
    directContact: false
  };
}

function normalizePlan(plan) {
  const lowered = String(plan || '').toLowerCase();
  if (lowered === 'support') return 'supporter';
  if (lowered === 'pro' || lowered === 'supporter' || lowered === 'trial') return lowered;
  return 'free';
}

function roomCreateLimitForPlan(plan) {
  const normalized = normalizePlan(plan);
  return ROOM_CREATE_LIMITS[normalized] || ROOM_CREATE_LIMITS.free;
}

function normalizeRoomCreateCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.floor(n)));
}

function hasActiveSubscription(status) {
  return ACTIVE_SUB_STATUSES.has(String(status || '').toLowerCase());
}

function setCors(req, res) {
  const origin = req.get('origin') || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }

  return false;
}

async function verifyAuth(req, res) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return null;
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    console.error('[auth] verifyIdToken failed:', err);
    res.status(401).json({ error: 'Invalid auth token.' });
    return null;
  }
}

function currentBaseUrl(req) {
  const explicitOrigin = req.get('origin');
  if (explicitOrigin) return explicitOrigin.replace(/\/$/, '');

  const host = req.get('host');
  if (host) {
    const isLocal = host.includes('localhost') || host.startsWith('127.0.0.1');
    return `${isLocal ? 'http' : 'https'}://${host}`;
  }

  return `https://${process.env.GCLOUD_PROJECT}.web.app`;
}

function sanitizeReturnBaseUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
      return '';
    }

    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function resolveReturnBaseUrl(req) {
  const candidate = req && req.body && typeof req.body.returnUrlBase === 'string' ? req.body.returnUrlBase : '';
  const sanitized = sanitizeReturnBaseUrl(candidate);
  return sanitized || currentBaseUrl(req);
}

function planFromPriceId(priceId, cfg) {
  if (!priceId) return 'free';
  if (priceId === cfg.price_pro) return 'pro';
  if (priceId === cfg.price_supporter) return 'supporter';
  return 'free';
}

function priceIdForPlan(plan, cfg) {
  const normalized = normalizePlan(plan);
  if (normalized === 'pro') return cfg.price_pro;
  if (normalized === 'supporter') return cfg.price_supporter;
  return '';
}

function parsePositiveInt(value, fallback = 20, min = 1, max = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDisplayName(value) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  return cleaned.slice(0, 60);
}

async function assertStripeCustomerOwnership(stripe, customerId, uid, expectedEmail = '') {
  if (!stripe || !customerId || !uid) return false;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) return false;

  const metadataUid = customer.metadata && customer.metadata.uid ? String(customer.metadata.uid) : '';
  if (metadataUid && metadataUid === uid) return true;

  const normalizedExpectedEmail = String(expectedEmail || '').trim().toLowerCase();
  const normalizedCustomerEmail = String(customer.email || '').trim().toLowerCase();
  if (!normalizedExpectedEmail || normalizedExpectedEmail !== normalizedCustomerEmail) {
    return false;
  }

  const nextMetadata = {
    ...(customer.metadata || {}),
    uid
  };
  await stripe.customers.update(customerId, { metadata: nextMetadata });
  return true;
}

async function ensureUserDoc(uid, email, displayName) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  if (snap.exists) {
    const existing = snap.data() || {};
    const plan = normalizePlan(existing.plan);
    const roomCreateCount = normalizeRoomCreateCount(existing.roomCreateCount);
    const existingLimit = Number.isFinite(Number(existing.roomCreateLimit))
      ? Math.max(0, Math.min(10000, Math.floor(Number(existing.roomCreateLimit))))
      : null;
    const isAdminOverride = String(existing.subscriptionStatus || '').toLowerCase() === 'admin';
    const roomCreateLimit = isAdminOverride
      ? Math.max(existingLimit || 0, ADMIN_TEST_ROOM_CREATE_LIMIT)
      : roomCreateLimitForPlan(plan);
    await ref.set(
      {
        email: email || existing.email || '',
        displayName: displayName || existing.displayName || '',
        roomCreateCount,
        roomCreateLimit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return {
      ...existing,
      roomCreateCount,
      roomCreateLimit
    };
  }

  const plan = 'free';
  const created = {
    uid,
    email: email || '',
    displayName: displayName || '',
    plan,
    trialEndsAt: null,
    subscriptionStatus: 'none',
    entitlements: planEntitlements(plan),
    roomCreateCount: 0,
    roomCreateLimit: roomCreateLimitForPlan(plan),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await ref.set(created, { merge: true });
  return created;
}

async function resolveUidFromCustomer(customerId) {
  if (!customerId) return null;
  const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function resolveFallbackPlan(uid) {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  const trialEndsAt = data.trialEndsAt && typeof data.trialEndsAt.toMillis === 'function' ? data.trialEndsAt.toMillis() : null;

  if (trialEndsAt && trialEndsAt > Date.now()) {
    return 'trial';
  }

  return 'free';
}

async function upsertPlanFromSubscription({ uid, customerId, subscriptionId, status, priceId }) {
  if (!uid) return;

  const cfg = stripeConfig();
  const paidPlan = planFromPriceId(priceId, cfg);
  const active = hasActiveSubscription(status);
  const fallbackPlan = active ? 'free' : await resolveFallbackPlan(uid);
  const plan = active ? normalizePlan(paidPlan) : fallbackPlan;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const roomCreateCount = normalizeRoomCreateCount(userData.roomCreateCount);
  const isAdminOverride = String(userData.subscriptionStatus || '').toLowerCase() === 'admin';
  const existingLimit = Number.isFinite(Number(userData.roomCreateLimit))
    ? Math.max(0, Math.min(10000, Math.floor(Number(userData.roomCreateLimit))))
    : 0;
  const roomCreateLimit = isAdminOverride
    ? Math.max(existingLimit, ADMIN_TEST_ROOM_CREATE_LIMIT)
    : roomCreateLimitForPlan(plan);

  await userRef.set(
    {
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: subscriptionId || null,
      subscriptionStatus: status || 'none',
      plan,
      entitlements: planEntitlements(plan),
      roomCreateCount,
      roomCreateLimit,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

exports.createCheckoutSession = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const requestedPlan = normalizePlan(req.body && req.body.plan);
    if (!ALLOWED_PLANS.has(requestedPlan)) {
      res.status(400).json({ error: 'Invalid plan. Use support/supporter or pro.' });
      return;
    }

    const cfg = stripeConfig();
    const priceId = priceIdForPlan(requestedPlan, cfg);
    if (!priceId) {
      res.status(500).json({ error: `Missing Stripe price ID for ${requestedPlan}.` });
      return;
    }

    const userRecord = await admin.auth().getUser(auth.uid);
    const userDoc = await ensureUserDoc(auth.uid, userRecord.email || '', userRecord.displayName || '');

    const stripe = getStripeClient();
    let customerId = userDoc.stripeCustomerId || null;

    if (customerId) {
      const ownedByUser = await assertStripeCustomerOwnership(
        stripe,
        customerId,
        auth.uid,
        userRecord.email || userDoc.email || ''
      );
      if (!ownedByUser) {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userRecord.email || undefined,
        name: userRecord.displayName || undefined,
        metadata: { uid: auth.uid }
      });
      customerId = customer.id;
      await db.collection('users').doc(auth.uid).set(
        {
          stripeCustomerId: customerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    const baseUrl = resolveReturnBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/account/?checkout=success`,
      cancel_url: `${baseUrl}/account/?checkout=cancel`,
      client_reference_id: auth.uid,
      metadata: {
        uid: auth.uid,
        plan: requestedPlan
      },
      subscription_data: {
        metadata: {
          uid: auth.uid,
          plan: requestedPlan
        }
      }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[createCheckoutSession] failed:', err);
    res.status(500).json({ error: 'Unable to create checkout session.' });
  }
});

exports.createPortalSession = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const stripe = getStripeClient();
    const userRef = db.collection('users').doc(auth.uid);
    const authUser = await admin.auth().getUser(auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    let customerId = userData.stripeCustomerId || null;
    if (!customerId) {
      res.status(400).json({ error: 'No Stripe customer found for this account.' });
      return;
    }

    const ownedByUser = await assertStripeCustomerOwnership(
      stripe,
      customerId,
      auth.uid,
      authUser.email || userData.email || ''
    );
    if (!ownedByUser) {
      res.status(403).json({ error: 'Stripe customer ownership could not be verified.' });
      return;
    }

    const baseUrl = resolveReturnBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/account/`
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[createPortalSession] failed:', err);
    res.status(500).json({ error: 'Unable to create billing portal session.' });
  }
});

exports.startTrial = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const authUser = await admin.auth().getUser(auth.uid);
    const existing = await ensureUserDoc(auth.uid, authUser.email || '', authUser.displayName || '');
    const nowMs = Date.now();

    const existingPlan = normalizePlan(existing.plan);
    const subscriptionStatus = String(existing.subscriptionStatus || 'none');
    const trialEndsAtMs = timestampToMillis(existing.trialEndsAt);
    const trialConsumedAtMs = timestampToMillis(existing.trialConsumedAt);

    if (existingPlan === 'supporter' || existingPlan === 'pro' || hasActiveSubscription(subscriptionStatus)) {
      res.status(200).json({
        status: 'already-paid',
        plan: existingPlan,
        trialEndsAtMs: trialEndsAtMs || null
      });
      return;
    }

    if (existingPlan === 'trial' && trialEndsAtMs && trialEndsAtMs > nowMs) {
      res.status(200).json({
        status: 'already-active',
        plan: 'trial',
        trialEndsAtMs
      });
      return;
    }

    if (trialConsumedAtMs || (trialEndsAtMs && trialEndsAtMs <= nowMs)) {
      res.status(403).json({
        error: 'Trial already used. Upgrade to Supporter or Pro for multiplayer access.'
      });
      return;
    }

    const trialStartsAt = admin.firestore.Timestamp.fromMillis(nowMs);
    const trialEndsAt = admin.firestore.Timestamp.fromMillis(nowMs + TRIAL_DURATION_MS);
    const roomCreateCount = normalizeRoomCreateCount(existing.roomCreateCount);
    const roomCreateLimit = roomCreateLimitForPlan('trial');
    await db.collection('users').doc(auth.uid).set(
      {
        uid: auth.uid,
        email: authUser.email || existing.email || '',
        displayName: authUser.displayName || existing.displayName || '',
        plan: 'trial',
        subscriptionStatus,
        trialStartsAt,
        trialEndsAt,
        trialConsumedAt: trialStartsAt,
        entitlements: planEntitlements('trial'),
        roomCreateCount,
        roomCreateLimit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    res.status(200).json({
      status: 'activated',
      plan: 'trial',
      trialEndsAtMs: nowMs + TRIAL_DURATION_MS
    });
  } catch (err) {
    console.error('[startTrial] failed:', err);
    res.status(500).json({ error: 'Unable to start trial right now.' });
  }
});

exports.enableAdminTester = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const authUser = await admin.auth().getUser(auth.uid);
    const allowlistResult = isAllowlistedAdminCandidate(authUser, auth.uid);
    if (!allowlistResult.allowed) {
      res.status(403).json({
        error: allowlistResult.reason || 'Account is not allowlisted for admin access.'
      });
      return;
    }

    const existingClaims = authUser.customClaims || {};
    const nextClaims = {
      ...existingClaims,
      admin: true,
      role: 'admin'
    };
    const claimsChanged = existingClaims.admin !== true || existingClaims.role !== 'admin';
    if (claimsChanged) {
      await admin.auth().setCustomUserClaims(auth.uid, nextClaims);
    }

    const existingDoc = await ensureUserDoc(
      auth.uid,
      authUser.email || '',
      authUser.displayName || ''
    );
    const roomCreateCount = normalizeRoomCreateCount(existingDoc.roomCreateCount);
    const roomCreateLimit = ADMIN_TEST_ROOM_CREATE_LIMIT;

    await db.collection('users').doc(auth.uid).set(
      {
        uid: auth.uid,
        email: authUser.email || existingDoc.email || '',
        displayName: authUser.displayName || existingDoc.displayName || '',
        plan: 'pro',
        subscriptionStatus: 'admin',
        entitlements: planEntitlements('pro'),
        roomCreateCount,
        roomCreateLimit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    res.status(200).json({
      enabled: true,
      plan: 'pro',
      subscriptionStatus: 'admin',
      roomCreateLimit,
      claimsChanged,
      allowlistSource: allowlistResult.source
    });
  } catch (err) {
    console.error('[enableAdminTester] failed:', err);
    res.status(500).json({ error: 'Unable to enable admin test access right now.' });
  }
});

exports.getAccountOverview = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const userRef = db.collection('users').doc(auth.uid);
    const authUser = await admin.auth().getUser(auth.uid);
    const customClaims = authUser.customClaims || {};
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const plan = normalizePlan(userData.plan);
    const trialStartsAtMs = timestampToMillis(userData.trialStartsAt);
    const trialEndsAtMs = timestampToMillis(userData.trialEndsAt);
    const trialConsumedAtMs = timestampToMillis(userData.trialConsumedAt);
    const stripeCustomerId = userData.stripeCustomerId || null;
    const stripeSubscriptionId = userData.stripeSubscriptionId || null;
    const roomCreateCount = normalizeRoomCreateCount(userData.roomCreateCount);
    const rawRoomCreateLimit = Number.isFinite(Number(userData.roomCreateLimit))
      ? Math.max(0, Math.min(10000, Math.floor(Number(userData.roomCreateLimit))))
      : roomCreateLimitForPlan(plan);
    const isAdmin = customClaims.admin === true ||
      String(customClaims.role || '').toLowerCase() === 'admin' ||
      String(userData.subscriptionStatus || '').toLowerCase() === 'admin';
    const roomCreateLimit = isAdmin
      ? Math.max(rawRoomCreateLimit, ADMIN_TEST_ROOM_CREATE_LIMIT)
      : rawRoomCreateLimit;

    const overview = {
      uid: auth.uid,
      email: authUser.email || userData.email || '',
      emailVerified: !!authUser.emailVerified,
      displayName: authUser.displayName || userData.displayName || '',
      isAdmin,
      role: isAdmin ? 'admin' : 'member',
      providers: Array.isArray(authUser.providerData) ? authUser.providerData.map((p) => p.providerId).filter(Boolean) : [],
      authCreatedAt: authUser.metadata && authUser.metadata.creationTime ? authUser.metadata.creationTime : null,
      authLastSignInAt: authUser.metadata && authUser.metadata.lastSignInTime ? authUser.metadata.lastSignInTime : null,
      plan,
      subscriptionStatus: String(userData.subscriptionStatus || 'none'),
      trialStartsAtMs,
      trialEndsAtMs,
      trialConsumedAtMs,
      stripeCustomerId,
      stripeSubscriptionId,
      roomCreateCount,
      roomCreateLimit,
      nextBillingAtMs: null,
      cancelAtPeriodEnd: null
    };

    if (stripeCustomerId && stripeSubscriptionId) {
      try {
        const stripe = getStripeClient();
        const ownedByUser = await assertStripeCustomerOwnership(
          stripe,
          stripeCustomerId,
          auth.uid,
          overview.email || userData.email || ''
        );
        if (!ownedByUser) {
          throw new Error('Stripe customer ownership mismatch.');
        }
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (String(subscription.customer || '') !== String(stripeCustomerId)) {
          throw new Error('Stripe subscription/customer mismatch.');
        }
        overview.subscriptionStatus = String(subscription.status || overview.subscriptionStatus || 'none');
        overview.nextBillingAtMs = subscription.current_period_end ? Number(subscription.current_period_end) * 1000 : null;
        overview.cancelAtPeriodEnd = !!subscription.cancel_at_period_end;
      } catch (err) {
        console.warn('[getAccountOverview] Unable to load subscription details:', err.message || err);
      }
    }

    res.status(200).json({ overview });
  } catch (err) {
    console.error('[getAccountOverview] failed:', err);
    res.status(500).json({ error: 'Unable to load account overview.' });
  }
});

exports.listBillingReceipts = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const userRef = db.collection('users').doc(auth.uid);
    const authUser = await admin.auth().getUser(auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const stripeCustomerId = userData.stripeCustomerId || null;

    if (!stripeCustomerId) {
      res.status(200).json({ receipts: [] });
      return;
    }

    const stripe = getStripeClient();
    const ownedByUser = await assertStripeCustomerOwnership(
      stripe,
      stripeCustomerId,
      auth.uid,
      authUser.email || userData.email || ''
    );
    if (!ownedByUser) {
      res.status(403).json({ error: 'Stripe customer ownership could not be verified.' });
      return;
    }

    const listLimit = parsePositiveInt(req.body && req.body.limit, 20, 1, 40);
    const startingAfter = req.body && typeof req.body.startingAfter === 'string' ? req.body.startingAfter.trim() : '';

    const params = {
      customer: stripeCustomerId,
      limit: listLimit
    };
    if (startingAfter) params.starting_after = startingAfter;

    const invoiceList = await stripe.invoices.list(params);
    const receipts = Array.isArray(invoiceList.data) ? invoiceList.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number || invoice.id,
      status: invoice.status || 'unknown',
      currency: String(invoice.currency || 'usd').toUpperCase(),
      total: Number.isFinite(invoice.total) ? invoice.total : 0,
      amountPaid: Number.isFinite(invoice.amount_paid) ? invoice.amount_paid : 0,
      amountDue: Number.isFinite(invoice.amount_due) ? invoice.amount_due : 0,
      createdAtMs: invoice.created ? Number(invoice.created) * 1000 : null,
      paidAtMs: invoice.status_transitions && invoice.status_transitions.paid_at
        ? Number(invoice.status_transitions.paid_at) * 1000
        : null,
      periodStartMs: invoice.period_start ? Number(invoice.period_start) * 1000 : null,
      periodEndMs: invoice.period_end ? Number(invoice.period_end) * 1000 : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdfUrl: invoice.invoice_pdf || null
    })) : [];

    res.status(200).json({
      receipts,
      hasMore: !!invoiceList.has_more
    });
  } catch (err) {
    console.error('[listBillingReceipts] failed:', err);
    res.status(500).json({ error: 'Unable to load billing receipts.' });
  }
});

exports.updateAccountProfile = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const displayName = normalizeDisplayName(req.body && req.body.displayName);
    if (!displayName) {
      res.status(400).json({ error: 'Display name is required.' });
      return;
    }

    await admin.auth().updateUser(auth.uid, { displayName });
    await db.collection('users').doc(auth.uid).set({
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.status(200).json({ displayName });
  } catch (err) {
    console.error('[updateAccountProfile] failed:', err);
    res.status(500).json({ error: 'Unable to update account profile.' });
  }
});

exports.stripeWebhook = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const cfg = stripeConfig();
  if (!cfg.webhook) {
    res.status(500).send('Missing Stripe webhook secret.');
    return;
  }

  let event;
  try {
    const stripe = getStripeClient();
    const signature = req.get('stripe-signature');
    event = stripe.webhooks.constructEvent(req.rawBody, signature, cfg.webhook);
  } catch (err) {
    console.error('[stripeWebhook] signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed.');
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer || null;
        const subscriptionId = session.subscription || null;
        let uid = (session.metadata && session.metadata.uid) || session.client_reference_id || null;

        if (!uid) {
          uid = await resolveUidFromCustomer(customerId);
        }

        if (uid) {
          const stripe = getStripeClient();
          let status = 'active';
          let priceId = null;

          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            status = subscription.status || status;
            priceId =
              subscription.items &&
              subscription.items.data &&
              subscription.items.data[0] &&
              subscription.items.data[0].price
                ? subscription.items.data[0].price.id
                : null;
          }

          await upsertPlanFromSubscription({
            uid,
            customerId,
            subscriptionId,
            status,
            priceId
          });
        }

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer || null;
        const subscriptionId = subscription.id || null;
        const status = subscription.status || 'none';
        const priceId =
          subscription.items &&
          subscription.items.data &&
          subscription.items.data[0] &&
          subscription.items.data[0].price
            ? subscription.items.data[0].price.id
            : null;

        let uid = (subscription.metadata && subscription.metadata.uid) || null;
        if (!uid) {
          uid = await resolveUidFromCustomer(customerId);
        }

        if (uid) {
          await upsertPlanFromSubscription({
            uid,
            customerId,
            subscriptionId,
            status,
            priceId
          });
        }

        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripeWebhook] processing failed:', err);
    res.status(500).send('Webhook processing failed.');
  }
});
