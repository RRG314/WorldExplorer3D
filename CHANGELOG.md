# Changelog

## [Unreleased]

### Added

- New title-screen game modes:
  - `Paint the Town Red`
  - `Police Chase`
  - `Find the Flower`
- Paint challenge progression and scoring model:
  - 2-minute timer
  - score tracked as `painted buildings` (count) rather than percentage display
  - leaderboard support for best building-count runs
- Dual challenge leaderboard categories in the challenge panel:
  - `Flower` (fastest time)
  - `Paint` (most buildings in 2:00)
- Expanded landing page gameplay gallery with additional screenshots and descriptions
  covering:
  - Earth driving/walking/drone
  - Moon driving/walking/drone
  - Space flight
  - Paint challenge, police chase, and memory interactions
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
- Complete personal/internal inventory report:
  - `COMPLETE_INVENTORY_REPORT_2026-02-17.md`
  - includes full system/subsystem/feature/option catalog
- Initial launch release document:
  - `INITIAL_LAUNCH_RELEASE_2026-02-17.md`
  - includes badge-ready release narrative, RDT/PRNG citations, and licensing/attribution checklist
- Runtime graphics beta control:
  - `Photoreal Buildings (Beta)` toggle in title-screen Settings
  - persisted setting key: `worldExplorerPhotorealBuildings`
  - safe fallback to standard building materials if photoreal path fails

### Changed

- Paint the Town Red HUD copy and status format now emphasizes
  `Time + Buildings painted/total buildings`.
- Moon vehicle movement tuned for more realistic behavior:
  - stronger low-speed acceleration response
  - better ground adhesion on uneven lunar terrain
  - reduced "bouncing ball" feel during normal driving
- Build mode placement uses world raycast targets (roads, terrain, surfaces) so
  blocks land at the clicked world position more consistently across ground types.
- Build block interactions updated:
  - vehicles are blocked by placed blocks
  - walking character can stand on top of blocks
  - walking character no longer phases through block walls
- App auth/account controls moved to left floating panel; top-center plan/account HUD removed.
- Pro early-access panel now auto-hides after a short delay for non-Pro users.
- Landing hero now includes explicit `World Explorer` title line.
- Landing hero image now uses contained `<img>` rendering with bottom-scene cropping (no stretch and no stacked-card duplication).
- In-app auth/account float button now appears on title screen only and is hidden during gameplay.
- Firebase project targeting aligned to `worldexplorer3d-d9b83` in `.firebaserc`.
- Firestore rules and hosting rewrites aligned with subscription flow.
- GitHub Pages docs now include explicit branch-root deployment mode (`Deploy from a branch`, `/ (root)`) for root-runtime publishing without changing Firebase-hosted paths.

### Fixed

- Paint challenge rooftop landing detection now reliably applies building paint
  and updates challenge counters.
- Paint challenge timer/readout synchronization issues in HUD messaging.
- Character/build-block collision gaps that previously allowed walking through
  placed blocks.
- Auth panel hidden-row rendering bug (`.auth-row[hidden]`).
- Auto-open sign-in behavior from `?startTrial=1`; now prompts without forced panel open.
- Auth panel close behavior (outside click and ESC reliability).
- Checkout failures caused by missing Stripe config now return actionable errors.
- Dangerous-site false-positive risk reduced by removing unstable proxy fallback from app input path.

## [2026-02-18]

### Gameplay Update

- Added `Paint the Town Red`, `Police Chase`, and `Find the Flower` to title-screen
  `Game Mode` selection.
- Switched Paint challenge scoring UI from percentage emphasis to building-count
  challenge output over a fixed 2-minute run.
- Expanded challenge leaderboard support to include paint runs and flower runs.
- Updated build-mode collision behavior so:
  - cars are blocked by placed blocks
  - players collide with block walls
  - players can stand on top of placed blocks

### Documentation Update

- Updated branch docs to reflect current gameplay systems and challenge modes:
  - `README.md`
  - `USER_GUIDE.md`
  - `TECHNICAL_DOCS.md`
  - `ARCHITECTURE.md`
  - `KNOWN_ISSUES.md`
  - `DOCUMENTATION_INDEX.md`
- Added updated inventory snapshot:
  - `COMPLETE_INVENTORY_REPORT_2026-02-19.md`

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
