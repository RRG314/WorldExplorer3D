const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();
const db = admin.firestore();

const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;
const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due']);
const ALLOWED_PLANS = new Set(['supporter', 'pro']);

function stripeConfig() {
  const cfg = functions.config().stripe || {};
  return {
    secret: cfg.secret || '',
    webhook: cfg.webhook || '',
    price_supporter: cfg.price_supporter || '',
    price_pro: cfg.price_pro || ''
  };
}

function getStripeClient() {
  const cfg = stripeConfig();
  if (!cfg.secret) {
    throw new Error('Stripe secret is missing. Set functions config: stripe.secret');
  }
  return new Stripe(cfg.secret, { apiVersion: '2024-06-20' });
}

function planEntitlements(plan) {
  const normalized = String(plan || '').toLowerCase();

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
  if (lowered === 'pro' || lowered === 'supporter' || lowered === 'trial') return lowered;
  return 'free';
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
  if (plan === 'pro') return cfg.price_pro;
  if (plan === 'supporter') return cfg.price_supporter;
  return '';
}

async function ensureUserDoc(uid, email, displayName) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  if (snap.exists) {
    const existing = snap.data() || {};
    await ref.set(
      {
        email: email || existing.email || '',
        displayName: displayName || existing.displayName || '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return existing;
  }

  const trialEndsAt = admin.firestore.Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS);
  const created = {
    uid,
    email: email || '',
    displayName: displayName || '',
    plan: 'trial',
    trialEndsAt,
    subscriptionStatus: 'none',
    entitlements: planEntitlements('trial'),
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

  await db.collection('users').doc(uid).set(
    {
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: subscriptionId || null,
      subscriptionStatus: status || 'none',
      plan,
      entitlements: planEntitlements(plan),
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
      res.status(400).json({ error: 'Invalid plan. Use supporter or pro.' });
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
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    let customerId = userData.stripeCustomerId || null;
    if (!customerId) {
      res.status(400).json({ error: 'No Stripe customer found for this account.' });
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
