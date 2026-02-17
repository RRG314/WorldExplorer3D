# World Explorer

World Explorer is a browser-based 3D exploration runtime with a production Firebase deployment stack:

- Public marketing site and legal pages
- WebGL runtime at `/app/`
- Account and billing at `/account/`
- Firebase Auth + Firestore entitlements
- Stripe subscriptions through Firebase Cloud Functions

Repository: `https://github.com/RRG314/WorldExplorer.git`

## License

This repository is source-visible but proprietary (`LICENSE`).
All rights are reserved unless explicitly granted by the owner.

## Current Production Routes

- `/` - landing page and pricing
- `/app/` - game/runtime
- `/account/` - plan status, upgrades, billing portal
- `/legal/privacy` - privacy policy
- `/legal/terms` - terms

## Plan and Trial Model

- `Free`
  - Core exploration
  - No cloud sync
  - No Pro-only controls
- `Trial` (2 days, no card)
  - Created on first sign-in
  - Full access equivalent to Supporter (no Pro-only perks)
  - Auto-downgrades to Free when expired and no active subscription
- `Supporter` (`$1/mo`)
  - Full access
  - Cloud sync entitlement enabled
- `Pro` (`$5/mo`)
  - Full access
  - Early demo toggles
  - Priority contact/feature consideration entitlements

## Repository Layout (Active)

```text
public/
  index.html                    # landing
  app/index.html                # runtime
  account/index.html            # account + billing
  legal/privacy.html
  legal/terms.html
  assets/landing/*
  js/firebase-init.js
  js/auth-ui.js
  js/entitlements.js
  js/billing.js
  js/firebase-project-config.js
functions/
  index.js                      # createCheckoutSession/createPortalSession/stripeWebhook
  package.json
firebase.json
.firebaserc
firestore.rules
firestore.indexes.json
```

Notes:

- `public/` is the only Firebase Hosting root.
- Root-level legacy runtime files (`index.html`, `js/`, `styles.css`) still exist for historical/local reference, but production serves `public/app/index.html`.

## Local Development

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
python3 -m http.server --directory public 4173
```

Open:

- `http://localhost:4173/`
- `http://localhost:4173/app/`
- `http://localhost:4173/account/`

## GitHub Pages Deployment

This repo supports GitHub Pages via GitHub Actions publishing from `public/`.

- Branch: `codex/github-pages-compat`
- Workflow: `.github/workflows/deploy-pages-public.yml`
- Pages source: `GitHub Actions`

Full deployment and troubleshooting guide:

- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/GITHUB_DEPLOYMENT.md`

## Firebase Deployment

### Prerequisites

- Node.js 20+ installed
- Firebase CLI installed
- Firebase project created (`worldexplorer3d-d9b83` currently configured)
- Blaze plan enabled (required for Cloud Functions + Artifact Registry)

### Deploy

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase login
firebase use worldexplorer3d-d9b83
firebase deploy
```

## Stripe Setup (Production)

1. Create products/prices in Stripe Live:
   - Supporter: recurring monthly `$1`
   - Pro: recurring monthly `$5`
2. Create live webhook destination in Stripe Workbench:
   - URL: `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/stripeWebhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
3. Configure function runtime values:

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  stripe.secret="sk_live_..." \
  stripe.webhook="whsec_..." \
  stripe.price_supporter="price_..." \
  stripe.price_pro="price_..."
firebase deploy --only functions
```

4. Verify:

```bash
firebase functions:config:get
firebase functions:log --only createCheckoutSession -n 30
firebase functions:log --only stripeWebhook -n 30
```

Important:

- Use real keys/IDs, not placeholders.
- Do not store secret keys in frontend code.
- Keep test-mode and live-mode credentials separated.

## Firebase Frontend Config

Frontend Firebase web config is loaded from `public/js/firebase-project-config.js` into `window.WORLD_EXPLORER_FIREBASE`.

Required fields:

- `apiKey`
- `projectId`
- `appId`

Optional fallback is localStorage key `worldExplorer3D.firebaseConfig`.

## Firestore Data Model (Subscription Layer)

Collection: `users/{uid}`

Key fields used by runtime/account/functions:

- `plan`: `free | trial | supporter | pro`
- `trialEndsAt`
- `subscriptionStatus`
- `stripeCustomerId`
- `stripeSubscriptionId`
- `entitlements`

## Current Operational Notes

- Cloud Functions currently use `functions.config().stripe.*` and emit Firebase deprecation warnings.
- Migration to Firebase Params/Secret Manager is required before March 2026 runtime-config shutdown.
- Node 20 runtime deprecation warnings are active; schedule upgrade to Node 22 for Functions.

## Documentation Map

- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/QUICKSTART.md`
- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/ARCHITECTURE.md`
- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/API_SETUP.md`
- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/USER_GUIDE.md`
- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/TECHNICAL_DOCS.md`
- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/KNOWN_ISSUES.md`
- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/CHANGELOG.md`
- `/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine/progress.md`
