# Changelog

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
