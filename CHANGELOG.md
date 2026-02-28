# Changelog

## [2026-02-28]

### Changed

- Switched multiplayer access policy to signed-in free access (no payment required to create/join rooms).
- Updated room quota defaults to match new model:
  - free: `3`
  - supporter: `3`
  - pro: `10`
- Updated account/app/multiplayer UI copy from trial/paywall language to optional donation language.
- Donation CTAs now consistently route users to Account/Donations surfaces.

### Code Paths Updated

- Entitlements and account status:
  - `js/entitlements.js`
  - `public/js/entitlements.js`
  - `account/index.html`
  - `public/account/index.html`
- Multiplayer access and room creation flow:
  - `app/js/multiplayer/ui-room.js`
  - `public/app/js/multiplayer/ui-room.js`
  - `app/js/multiplayer/rooms.js`
  - `public/app/js/multiplayer/rooms.js`
- App auth/pro panel messaging:
  - `app/index.html`
  - `public/app/index.html`
- Rule/backend quota alignment:
  - `firestore.rules`
  - `functions/index.js`

### Documentation

- Rewrote and revalidated docs for donation model and free multiplayer access:
  - `README.md`
  - `USER_GUIDE.md`
  - `QUICKSTART.md`
  - `ARCHITECTURE.md`
  - `TECHNICAL_DOCS.md`
  - `API_SETUP.md`
  - `SECURITY_STORAGE_NOTICE.md`
  - `DOCUMENTATION_INDEX.md`
- Added new inventory snapshot: `COMPLETE_INVENTORY_REPORT_2026-02-28.md`.

## [2026-02-25]

### Changed

- Added new full inventory snapshot: `COMPLETE_INVENTORY_REPORT_2026-02-25.md`.
- Added canonical controls documentation: `CONTROLS_REFERENCE.md`.
- Refreshed core docs to match current runtime behavior and persisted room flow:
  - `README.md`
  - `QUICKSTART.md`
  - `USER_GUIDE.md`
  - `ARCHITECTURE.md`
  - `TECHNICAL_DOCS.md`
  - `DOCUMENTATION_INDEX.md`

### Notes

- Multiplayer remote visuals now documented as mode-based proxies (character/car/drone/space) with smoothing and extrapolation.
- Saved room behavior now explicitly documented (open/delete/persistence model).

## [2026-02-23]

### Changed

- PaintTown fire key changed from `Shift` to `Ctrl` (`ControlLeft`/`ControlRight`).
- PaintTown HUD helper text updated to match new `Ctrl` fire control.
- Paint input no longer binds right-click as alternate paint fire.
- Hidden overlay elements no longer block PaintTown key handling unexpectedly.

### Fixed

- Removed legacy double-left-click camera toggle in both runtime paths.
- Camera look remains right-click/middle-click hold to avoid rapid-fire camera interference.
- Root runtime (`js/*`) and public runtime (`public/app/js/*`) control behavior resynchronized.

### Documentation

- Rewrote core docs to match current gameplay, account, multiplayer, and deployment state:
  - `README.md`
  - `QUICKSTART.md`
  - `USER_GUIDE.md`
  - `ARCHITECTURE.md`
  - `TECHNICAL_DOCS.md`
  - `API_SETUP.md`
  - `GITHUB_DEPLOYMENT.md`
  - `KNOWN_ISSUES.md`
  - `DOCUMENTATION_INDEX.md`
- Removed outdated inventory documents:
  - `COMPLETE_INVENTORY_REPORT_2026-02-17.md`
  - `COMPLETE_INVENTORY_REPORT_2026-02-19.md`
  - `SYSTEMS_INVENTORY_REPORT_2026-02-14.md`

## [2026-02-18]

### Gameplay Update

- Added `Paint the Town`, `Police Chase`, and `Find the Flower` game modes.
- Switched PaintTown score emphasis to painted building count over fixed timer.
- Expanded challenge support for flower and paint tracks.
- Improved build-mode collision behavior for vehicles and walking mode.

## [2026-02-16]

### Platform/Billing Update

- Added Firebase/Stripe billing path (`checkout`, `portal`, `webhook`).
- Added trial and entitlement flow in account systems.
- Added Firebase-hosted app/account/legal route split.
