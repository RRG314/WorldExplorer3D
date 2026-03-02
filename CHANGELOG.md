# Changelog

## [2026-03-02]

### Added

- New full code-first inventory snapshot:
  - `COMPLETE_INVENTORY_REPORT_2026-03-02.md`

### Changed

- Documentation suite refreshed to reflect current branch behavior:
  - `README.md`
  - `QUICKSTART.md`
  - `USER_GUIDE.md`
  - `ARCHITECTURE.md`
  - `TECHNICAL_DOCS.md`
  - `API_SETUP.md`
  - `DOCUMENTATION_INDEX.md`
  - `RELEASE_CHECKLIST.md`
  - `KNOWN_ISSUES.md`
  - `SECURITY_STORAGE_NOTICE.md`
  - `GITHUB_DEPLOYMENT.md`
  - `CONTRIBUTING.md`
- Globe selector docs now reflect:
  - grouped favorites list (preset + saved)
  - delete support for saved favorites
  - zoom-scaled markers
  - immediate place label fallback on globe picks
- Tutorial docs now reflect one-time completion behavior with manual restart option.

### Validation

- Documentation consistency pass completed against current source modules:
  - `app/js/ui/globe-selector.js`
  - `app/js/tutorial/tutorial.js`
  - `app/js/multiplayer/*`
  - `functions/index.js`
  - `firestore.rules`

## [2026-02-28]

### Changed

- Multiplayer access policy documented as signed-in free access (no payment required to create/join rooms).
- Room quota defaults documented and aligned:
  - free: `3`
  - supporter: `3`
  - pro: `10`
- Donation/account copy updated to optional-donation model.

### Documentation

- Prior documentation refresh completed across README, user guide, architecture, technical docs, setup, and index docs.

## [2026-02-25]

### Changed

- Added full inventory snapshot and controls documentation updates.

## [2026-02-23]

### Changed

- PaintTown fire key moved to `Ctrl`.
- Legacy double-left-click camera toggle removed.

## [2026-02-18]

### Gameplay Update

- Added Paint the Town, Police Chase, and Find the Flower modes.

## [2026-02-16]

### Platform/Billing Update

- Added Firebase/Stripe billing path and account flow integration.

