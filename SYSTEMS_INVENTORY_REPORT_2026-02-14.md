# Systems Inventory Report

Date: 2026-02-16
Repository: `WorldExplorer`
Branch baseline: `codex/firebase-hosting-rollout`
Project target: `worldexplorer3d-d9b83`

This report reflects the current Firebase-hosted product stack and replaces older snapshot assumptions.

## 1. Executive Summary

World Explorer is operating as a multi-page Firebase Hosting product with integrated subscription billing.

Primary capability areas:

- Public landing and legal pages
- WebGL runtime at `/app/`
- Account/billing management at `/account/`
- Firebase Auth + Firestore entitlement management
- Stripe subscription checkout and customer portal via Cloud Functions

## 2. Active Route Inventory

| Route | Purpose | Source File |
| --- | --- | --- |
| `/` | Landing page and pricing | `public/index.html` |
| `/app/` | Runtime/game UI | `public/app/index.html` |
| `/account/` | Plan + billing controls | `public/account/index.html` |
| `/legal/privacy` | Privacy policy | `public/legal/privacy.html` |
| `/legal/terms` | Terms | `public/legal/terms.html` |

## 3. Hosting and Backend Inventory

### Hosting (`firebase.json`)

- Hosting root: `public`
- Static cache headers for assets and HTML
- Rewrites:
  - `/createCheckoutSession`
  - `/createPortalSession`
  - `/stripeWebhook`
  - `/legal/privacy`
  - `/legal/terms`

### Functions (`functions/index.js`)

| Function | Auth Required | Purpose |
| --- | --- | --- |
| `createCheckoutSession` | Yes | Create Stripe subscription checkout URL |
| `createPortalSession` | Yes | Create Stripe billing portal URL |
| `stripeWebhook` | No (Stripe signed) | Apply subscription state updates |

## 4. Data Inventory (Firestore)

### `users` collection

Stores per-user account state:

- identity fields
- plan and subscription status
- trial end time
- entitlement flags
- Stripe customer/subscription IDs

### `flowerLeaderboard` collection

Challenge leaderboard entries.

Rules summary:

- public read
- authenticated create
- no update/delete

## 5. Subscription and Entitlement Inventory

Plan states used by runtime:

- `free`
- `trial`
- `supporter`
- `pro`

Trial rules:

- first sign-in initializes a 48-hour trial
- expired trial with no active subscription downgrades to free

Stripe event coverage:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## 6. Frontend Module Inventory

| Module | Role |
| --- | --- |
| `public/js/firebase-init.js` | Firebase app/auth/db initialization |
| `public/js/auth-ui.js` | Sign in/up/reset/sign out workflows |
| `public/js/entitlements.js` | User doc creation, trial checks, plan gating |
| `public/js/billing.js` | Authenticated calls to checkout/portal functions |
| `public/js/firebase-project-config.js` | Hosted Firebase web config injection |

## 7. Operational Configuration Inventory

Current function runtime keys expected:

- `stripe.secret`
- `stripe.webhook`
- `stripe.price_supporter`
- `stripe.price_pro`

Current implementation still uses legacy `functions.config()` access.

## 8. Risk Inventory

High priority operational risks:

1. runtime-config deprecation cutoff (March 2026)
2. Node 20 function runtime deprecation timeline
3. test/live Stripe credential mode mismatch during manual setup

## 9. Validation Artifacts Inventory

Recent workflow includes local and hosted smoke checks for:

- auth float panel behavior
- top HUD removal
- Pro panel auto-hide behavior
- landing hero title presence
- account upgrade flow and function deployment

Artifacts are under:

- `output/playwright/`

## 10. Documentation Integrity Status

Top-level docs were refreshed on 2026-02-16 to align with this inventory and current deployment behavior.
