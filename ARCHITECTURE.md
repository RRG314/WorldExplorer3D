# Architecture

Last reviewed: 2026-02-16

This document describes the current deployed architecture in the `WorldExplorer` repository.

## 1. Platform Topology

World Explorer is split into static frontend pages plus server-side billing functions.

### Frontend (Firebase Hosting)

- `/` (`public/index.html`): marketing + pricing + trial CTA
- `/app/` (`public/app/index.html`): WebGL runtime
- `/account/` (`public/account/index.html`): plan management + billing actions
- `/legal/privacy`, `/legal/terms`: subscription-required legal pages

### Backend (Firebase Functions, 1st Gen, `us-central1`)

- `createCheckoutSession`
- `createPortalSession`
- `stripeWebhook`

### Data (Firestore)

- `users/{uid}` for plan/trial/entitlements/subscription references
- `flowerLeaderboard/{entryId}` for challenge leaderboard

## 2. Directory Architecture

```text
public/
  index.html
  app/index.html
  account/index.html
  legal/privacy.html
  legal/terms.html
  assets/landing/*
  js/
    firebase-init.js
    firebase-project-config.js
    auth-ui.js
    entitlements.js
    billing.js
functions/
  index.js
  package.json
firebase.json
.firebaserc
firestore.rules
firestore.indexes.json
```

## 3. Hosting Routing Model

Configured in `firebase.json`:

- Static pages/assets served from `public/`
- Function rewrites:
  - `/createCheckoutSession` -> `createCheckoutSession`
  - `/createPortalSession` -> `createPortalSession`
  - `/stripeWebhook` -> `stripeWebhook`
- Legal convenience rewrites:
  - `/legal/privacy` -> `/legal/privacy.html`
  - `/legal/terms` -> `/legal/terms.html`

Caching model:

- static assets: immutable 1 year
- HTML: short cache (`max-age=300`)

### 3.1 GitHub Pages Mirror Mode

The project also supports GitHub Pages publication from `public/` via:

- `.github/workflows/deploy-pages-public.yml`
- branch: `codex/github-pages-compat`

In this mode:

- route structure remains `/`, `/app/`, `/account/`, `/legal/*`
- Firebase Functions still handle checkout/portal/webhook endpoints
- frontend `billing.js` resolves direct function origin for non-Firebase-hosting domains

## 4. Identity and Entitlements Flow

### 4.1 Auth

Auth providers are Firebase Authentication.

Frontend path:

- `public/js/auth-ui.js` handles Email/Password and Google sign-in
- App listens to auth state in `/app/` and `/account/`

### 4.2 Trial creation

On first sign-in:

- `ensureEntitlements(user)` creates `users/{uid}` if missing
- default plan = `trial`
- `trialEndsAt = now + 48h`

### 4.3 Expiration handling

On entitlements resolution/subscription refresh:

- if trial expired and no active subscription, state downgrades to `free`

### 4.4 Plan gates

- `free`: core exploration only; no cloud sync, no Pro UI
- `trial`/`supporter`: full access, no Pro-only perks
- `pro`: full access + early demo/contact/feature flags

## 5. Billing Architecture

### 5.1 Checkout

1. User clicks upgrade in `/account/`
2. Frontend `billing.js` calls `/createCheckoutSession` with bearer token
3. Function validates user, resolves Stripe customer, creates subscription checkout session
4. Frontend redirects browser to Stripe Checkout URL

### 5.2 Billing Portal

1. User clicks `Manage Billing`
2. Frontend calls `/createPortalSession`
3. Function creates Stripe billing portal session for linked customer
4. Browser redirects to Stripe portal

### 5.3 Webhooks

`stripeWebhook` verifies `stripe-signature` then processes:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Function writes canonical subscription state to `users/{uid}`.

## 6. Firestore Model (Current)

### `users/{uid}`

Typical fields:

- `uid`
- `email`
- `displayName`
- `plan`
- `subscriptionStatus`
- `trialEndsAt`
- `entitlements`
- `stripeCustomerId`
- `stripeSubscriptionId`
- `createdAt`
- `updatedAt`

### `flowerLeaderboard/{entryId}`

- public-read leaderboard entries for challenge mode
- writes require authenticated user

## 7. Runtime UI Architecture (App)

In `/app/`:

- Left floating auth control is the auth/account surface.
- Pro panel is informational for non-Pro and auto-hides after ~4.5s.
- Top-center plan/account HUD has been removed to avoid title overlap.

## 8. Security Boundaries

- Firebase Auth token required for checkout/portal functions.
- Stripe secret/webhook secret are server-side only.
- Frontend never stores Stripe secret keys.
- Firestore rules restrict `users/{uid}` to owner-only read/write.

## 9. Operational Constraints

- Functions currently use `functions.config().stripe.*`.
- Firebase has announced runtime-config deprecation (March 2026).
- Node 20 runtime deprecation warning is active.

Required planned work:

1. migrate to Firebase Params/Secret Manager
2. move functions runtime to Node 22

## 10. Legacy/Reference Artifacts

Root-level legacy files (`index.html`, `js/`, `styles.css`) remain in repo history/reference, but production Hosting paths are under `public/`.

Use `public/app/index.html` as the active runtime entrypoint for deployed behavior.
