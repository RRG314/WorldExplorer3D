# Changelog

## [2026-03-13]

### Added

- OSM-facing documentation package:
  - `DATA_SOURCES.md`
  - `ATTRIBUTION.md`
  - `LIMITATIONS.md`
  - `OSM_ECOSYSTEM_METADATA.md`
  - `OSM_WIKI_ENTRY_DRAFT.md`
- README screenshot section including Ocean mode example image.

### Changed

- `README.md` rewritten for public OSM/community discovery clarity:
  - plain-language project framing
  - feature and scope summary
  - data/attribution links
  - quick run/test commands
  - limitations visibility
- `DOCUMENTATION_INDEX.md` reorganized into public-facing and engineering groupings.
- `QUICKSTART.md`, `CONTRIBUTING.md`, and `GITHUB_DEPLOYMENT.md` aligned to `WorldExplorer3D` repo flow.
- package metadata (`package.json`) aligned to `WorldExplorer3D` identity and discoverability.
- Pages workflow trigger aligned to `main` release flow.

### Runtime / App Integration Included

- Preserves current geolocation launch controls (`Use My Location`) in title + globe selector.
- Preserves current Ocean destination mode and Earth/Ocean switching flow.
- Preserves app/public mirror tooling with `app/data` parity checks.

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
