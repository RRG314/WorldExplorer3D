# API and Service Setup Guide

Last reviewed: 2026-02-16

This guide covers all external services used by the current deployment.

## 1. Firebase Services

### 1.1 Hosting

Configured via `firebase.json`.

- Hosting root: `public/`
- Function rewrites for billing endpoints
- Legal route rewrites

### 1.2 Auth

Enable in Firebase Console -> Authentication -> Sign-in method:

- `Email/Password`
- `Google`

Also add authorized domain(s) for GitHub Pages testing/deploy:

- `rrg314.github.io`

### 1.3 Firestore

Collections used:

- `users`
- `flowerLeaderboard`

Rules file: `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/firestore.rules`

## 2. Frontend Firebase Config

Current project config is stored in:

- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/public/js/firebase-project-config.js`

It sets:

```js
window.WORLD_EXPLORER_FIREBASE = {
  apiKey,
  authDomain,
  projectId,
  appId,
  storageBucket,
  messagingSenderId
};
```

Fallback storage key supported by runtime:

- `worldExplorer3D.firebaseConfig`

## 3. Stripe Setup

### 3.1 Create products/prices

Stripe Dashboard -> Products:

- Supporter product, recurring monthly price `$1`
- Pro product, recurring monthly price `$5`

Copy price IDs (`price_...`), not product IDs (`prod_...`).

### 3.2 Create webhook destination

Stripe Workbench -> Webhooks -> Create destination:

- Endpoint URL:
  - `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/stripeWebhook`
- Payload style: `Snapshot`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copy signing secret (`whsec_...`).

### 3.3 Set function config values

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  stripe.secret="sk_test_or_live_..." \
  stripe.webhook="whsec_..." \
  stripe.price_supporter="price_..." \
  stripe.price_pro="price_..."
firebase deploy --only functions
```

Check values:

```bash
firebase functions:config:get
```

Do not keep placeholders like `...` or `REAL`.

## 4. Function Endpoint Contracts

### `POST /createCheckoutSession`

Auth: bearer Firebase ID token required.

Request body:

```json
{ "plan": "supporter" }
```

or

```json
{ "plan": "pro" }
```

Optional field for GitHub Pages/subpath return routing:

```json
{ "returnUrlBase": "https://rrg314.github.io/WorldExplorer" }
```

Success response:

```json
{ "url": "https://checkout.stripe.com/..." }
```

### `POST /createPortalSession`

Auth: bearer Firebase ID token required.

Request body:

```json
{}
```

Optional field for GitHub Pages/subpath return routing:

```json
{ "returnUrlBase": "https://rrg314.github.io/WorldExplorer" }
```

Success response:

```json
{ "url": "https://billing.stripe.com/..." }
```

### `POST /stripeWebhook`

Public endpoint called by Stripe.

- Validates `stripe-signature`
- Applies plan updates in Firestore

## 5. Optional Real Estate APIs (Legacy Feature Layer)

The runtime still supports optional client-side property APIs.

Supported keys (stored client-side if used):

- `rentcastApiKey`
- `attomApiKey`
- `estatedApiKey`

These are optional and not required for auth/billing.

## 6. Troubleshooting

### `Unable to create checkout session.`

Likely causes:

- invalid `stripe.secret`
- missing `stripe.price_supporter`/`stripe.price_pro`
- auth token not present

Check:

```bash
firebase functions:log --only createCheckoutSession -n 50
```

### Stripe auth error `Invalid API Key provided`

- wrong key mode (test vs live)
- placeholder value stored

### Webhook not updating plan

Check:

- webhook endpoint URL correctness
- webhook event list includes all 4 required events
- `stripe.webhook` signing secret matches destination

Then inspect logs:

```bash
firebase functions:log --only stripeWebhook -n 50
```

## 7. Required Near-Term Migration

Current functions use `functions.config()`.

Before March 2026, migrate to Firebase Params/Secret Manager:

- `stripe.secret`
- `stripe.webhook`
- `stripe.price_supporter`
- `stripe.price_pro`
