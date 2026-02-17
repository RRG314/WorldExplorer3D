# Technical Documentation

Last reviewed: 2026-02-16

This document is the engineering reference for the currently deployed World Explorer stack.

## 1. Runtime Stack Summary

Frontend:

- Static pages and assets served by Firebase Hosting
- ES module runtime in `/public/app/js/`
- Shared auth/entitlement/billing modules in `/public/js/`

Backend:

- Firebase Functions (1st gen, Node 20 currently)
- Stripe API calls in function layer
- Firestore for user plan state

## 2. Active Application Structure

```text
public/
  index.html
  account/index.html
  app/index.html
  js/
    firebase-init.js
    auth-ui.js
    entitlements.js
    billing.js
    firebase-project-config.js
functions/
  index.js
  package.json
firebase.json
firestore.rules
```

## 3. Frontend Modules

### `public/js/firebase-init.js`

Responsibilities:

- read config from `window.WORLD_EXPLORER_FIREBASE` or localStorage fallback
- initialize Firebase App/Auth/Firestore
- expose helper methods for config introspection and set/update

Storage key:

- `worldExplorer3D.firebaseConfig`

### `public/js/auth-ui.js`

Responsibilities:

- email/password sign in
- email/password sign up
- Google sign in (popup with redirect fallback)
- password reset
- auth-state observer callback utilities

### `public/js/entitlements.js`

Responsibilities:

- ensure user profile exists (`users/{uid}`)
- create initial `trial` plan for first-time users
- compute plan-specific entitlements
- downgrade expired trials to free when no active subscription
- broadcast entitlements changes to app via custom event and global state

### `public/js/billing.js`

Responsibilities:

- call function endpoints with Firebase ID token
- redirect to Stripe Checkout or Billing Portal

Endpoints called:

- `/createCheckoutSession`
- `/createPortalSession`

GitHub Pages compatibility behavior:

- detects non-Firebase-hosting domain
- resolves direct Cloud Functions origin via Firebase `projectId`
- sends `returnUrlBase` so Stripe returns to subpath deployments (for example `/WorldExplorer`)

## 4. Cloud Functions

Source: `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/functions/index.js`

### `createCheckoutSession`

- validates bearer token via `verifyIdToken`
- validates requested plan (`supporter|pro`)
- resolves or creates Stripe customer
- creates subscription checkout session
- returns `{ url }`

### `createPortalSession`

- validates bearer token
- resolves `stripeCustomerId` from Firestore user doc
- creates Stripe billing portal session
- returns `{ url }`

### `stripeWebhook`

- validates signature with `stripe.webhooks.constructEvent`
- processes:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- updates user plan and entitlements in Firestore

## 5. Firestore Rules Snapshot

`users/{userId}`:

- owner read/write only

`flowerLeaderboard/{entryId}`:

- public read
- authenticated create
- update/delete blocked

## 6. Hosting and Rewrites

Defined in `firebase.json`.

- hosting root: `public`
- immutable caching for static assets
- short cache for HTML
- function rewrites for checkout/portal/webhook
- legal route rewrites

GitHub Pages mirror mode:

- Uses `.github/workflows/deploy-pages-public.yml` to publish `public/`
- No Firebase rewrites available on Pages; billing calls use direct function URL resolution

## 7. Plan State Model

Plan values in use:

- `free`
- `trial`
- `supporter`
- `pro`

Subscription statuses treated as active:

- `active`
- `trialing`
- `past_due`

## 8. UI State Decisions

### App (`public/app/index.html`)

- Auth/account actions live in top-left float panel
- Top-center plan/account HUD removed
- Pro panel auto-hide for non-Pro users (`~4.5s`)

### Account (`public/account/index.html`)

- plan and trial status display
- upgrade buttons and billing management
- sign-out control

## 9. Deployment and Operations

### Full deploy

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase deploy
```

### Functions-only deploy

```bash
firebase deploy --only functions
```

### Hosting-only deploy

```bash
firebase deploy --only hosting
```

### Logs

```bash
firebase functions:log --only createCheckoutSession -n 50
firebase functions:log --only stripeWebhook -n 50
```

## 10. Stripe Configuration Contract

Runtime config keys expected by functions:

- `stripe.secret`
- `stripe.webhook`
- `stripe.price_supporter`
- `stripe.price_pro`

Currently set using legacy runtime config commands.

## 11. Known Technical Debt

1. `functions.config()` deprecation (March 2026 shutdown)
2. Node 20 runtime deprecation warnings for Functions
3. dual runtime copies (legacy root and active `/public/app`) can cause confusion
4. browser stale-cache edge cases can request legacy `/js/*` entrypoints after route/layout changes

## 12. Immediate Migration Plan (Recommended)

1. Migrate Stripe settings from `functions.config()` to Firebase Params/Secret Manager.
2. Upgrade `firebase-functions` and function runtime to Node 22.
3. Remove or archive legacy root runtime once operational confidence in `/public/app` is complete.
