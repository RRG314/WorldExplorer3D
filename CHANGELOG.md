# Changelog

## [Unreleased]

### Added

- Firebase Hosting production route split:
  - `/`
  - `/app/`
  - `/account/`
  - `/legal/privacy`
  - `/legal/terms`
- Shared Firebase frontend modules:
  - `public/js/firebase-init.js`
  - `public/js/auth-ui.js`
  - `public/js/entitlements.js`
  - `public/js/billing.js`
- Firebase Functions billing endpoints:
  - `createCheckoutSession`
  - `createPortalSession`
  - `stripeWebhook`
- Trial and entitlement automation:
  - first sign-in trial creation (`48h`)
  - expired trial downgrade handling
- Account page billing controls and plan display
- Landing page pricing/trial CTA flow
- Floating auth panel in `/app/` with:
  - email sign-in
  - email sign-up
  - Google sign-in
  - password reset
  - outside-click collapse behavior
- GitHub Pages deployment docs:
  - `GITHUB_DEPLOYMENT.md`
- Stale-cache compatibility bridge modules:
  - `public/js/bootstrap.js`
  - `public/js/app-entry.js`
  - `public/js/modules/manifest.js`
  - `public/js/modules/script-loader.js`

### Changed

- App auth/account controls moved to left floating panel; top-center plan/account HUD removed.
- Pro early-access panel now auto-hides after a short delay for non-Pro users.
- Landing hero now includes explicit `World Explorer` title line.
- Landing hero image now uses contained `<img>` rendering with bottom-scene cropping (no stretch and no stacked-card duplication).
- In-app auth/account float button now appears on title screen only and is hidden during gameplay.
- Firebase project targeting aligned to `worldexplorer3d-d9b83` in `.firebaserc`.
- Firestore rules and hosting rewrites aligned with subscription flow.

### Fixed

- Auth panel hidden-row rendering bug (`.auth-row[hidden]`).
- Auto-open sign-in behavior from `?startTrial=1`; now prompts without forced panel open.
- Auth panel close behavior (outside click and ESC reliability).
- Checkout failures caused by missing Stripe config now return actionable errors.
- Dangerous-site false-positive risk reduced by removing unstable proxy fallback from app input path.

## [2026-02-16]

### Documentation Refresh

- Rewrote top-level docs for current Firebase/Stripe architecture:
  - `README.md`
  - `QUICKSTART.md`
  - `ARCHITECTURE.md`
  - `API_SETUP.md`
  - `USER_GUIDE.md`
  - `TECHNICAL_DOCS.md`
  - `DOCUMENTATION_INDEX.md`
  - `KNOWN_ISSUES.md`
  - `SECURITY_STORAGE_NOTICE.md`
  - `SYSTEMS_INVENTORY_REPORT_2026-02-14.md`
  - `CONTRIBUTING.md`
- Added consistent setup instructions for:
  - webhook destination creation
  - price ID retrieval
  - function config keys
  - log-based troubleshooting
- Added explicit warnings for runtime-config and Node 20 deprecations.
