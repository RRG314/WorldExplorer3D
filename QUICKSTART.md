# Quick Start

This guide gets World Explorer running locally and on Firebase with subscriptions enabled.

## 1. Prerequisites

- Node.js `20` or newer
- npm
- Firebase CLI (`npm i -g firebase-tools`)
- Firebase project (current default: `worldexplorer3d-d9b83`)
- Stripe account (test and/or live)

## 2. Install Dependencies

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
cd functions && npm install && cd ..
```

## 3. Run Locally

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
python3 -m http.server --directory public 4173
```

Open:

- `http://localhost:4173/`
- `http://localhost:4173/app/`
- `http://localhost:4173/account/`

## 3A. GitHub Pages (This Repo)

1. Push branch `codex/github-pages-compat`.
2. In GitHub repo settings, set Pages source to `GitHub Actions`.
3. Ensure workflow `.github/workflows/deploy-pages-public.yml` succeeds.
4. Open:
   - `https://rrg314.github.io/WorldExplorer/`
   - `https://rrg314.github.io/WorldExplorer/app/`
5. Hard refresh if stale scripts are cached.

See full guide:

- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/GITHUB_DEPLOYMENT.md`

## 4. Firebase Project Setup

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase login
firebase use worldexplorer3d-d9b83
```

If `.firebaserc` points to a different project, update it before deploying.

## 5. Firebase Auth Setup (Console)

In Firebase Console for your project:

1. Open `Authentication`
2. Enable at least:
   - `Email/Password`
   - `Google`

Without this, sign-in/sign-up UI opens but cannot authenticate.

## 6. Stripe Setup (Test or Live)

### 6.1 Create products and prices

Create two recurring monthly prices:

- Supporter: `$1/month`
- Pro: `$5/month`

Copy the two `price_...` IDs.

### 6.2 Configure webhook destination

Stripe Workbench -> Webhooks -> Create destination:

- Endpoint URL:
  - `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/stripeWebhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copy signing secret `whsec_...`.

### 6.3 Set Firebase function config

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  stripe.secret="sk_test_or_live_..." \
  stripe.webhook="whsec_..." \
  stripe.price_supporter="price_..." \
  stripe.price_pro="price_..."
```

Deploy functions:

```bash
firebase deploy --only functions
```

Verify stored values:

```bash
firebase functions:config:get
```

If you see placeholders like `...` or `REAL`, checkout will fail.

## 7. Deploy Hosting + Firestore + Functions

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase deploy
```

## 8. Smoke Test Checklist

1. Open hosted app URL from Firebase deploy output.
2. Landing page loads and includes World Explorer title.
3. `/app/`:
   - Sign In / Sign Up float opens and closes correctly.
   - Pro panel appears briefly, then auto-hides for non-Pro plans.
4. `/account/`:
   - Current plan visible.
   - Upgrade buttons open Stripe Checkout.
5. Complete checkout (test card in test mode).
6. Confirm Firestore `users/{uid}` updated (`plan`, `subscriptionStatus`, `entitlements`).

Logs when troubleshooting:

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase functions:log --only createCheckoutSession -n 50
firebase functions:log --only stripeWebhook -n 50
```

## 9. Common Failures

- `Missing Firebase config (WORLD_EXPLORER_FIREBASE)`
  - Ensure `public/js/firebase-project-config.js` exists and loads.
- `Unable to create checkout session.`
  - Usually invalid/missing Stripe secret or price IDs.
- Stripe `401 Invalid API Key`
  - Wrong key mode or placeholder value in config.
- Blaze plan error during deploy
  - Upgrade Firebase project billing plan.

## 10. Production Follow-up (Important)

Before March 2026:

- Migrate from `functions.config()` to Firebase Params/Secret Manager.

Before October 2026:

- Upgrade Functions runtime from Node 20 to Node 22.
