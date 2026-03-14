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
- Earth runtime safety and controls update:
  - traversal switches now preserve valid positions and resolve invalid walk -> drive transitions to nearest safe road spawns
  - geolocation/custom-location launches validate spawn safety before placement
  - walking/drone controls now use `WASD` for movement and arrow keys for directional look
  - `M` remains the large-map key; `F4` is restored for debug overlay access
- OSM Earth scene expansion:
  - added separate runtime/map overlay support for `railway`, `footway`, and `cycleway` features
  - added walkable traversal/path routing support so loaded roads, footways, cycleways, and rail corridors participate in walking navigation instead of render-only overlays
  - expanded vegetation support so woods / parks / green landuse, `natural=tree`, and `natural=tree_row` feed a batched tree pass
  - added a selective indoor subsystem that loads a mapped building floor only when the player deliberately enters it
- Building presentation refresh:
  - broader facade color variation
  - rooftop HVAC/detail variation for appropriate near-LOD flat roofs without cap/parapet overlays
- Water + path surface presentation refresh:
  - water polygons/ribbons now render more reliably on steep/coastal terrain instead of fading out behind terrain
  - footways / cycleways / rail corridors now render as solid terrain-following surfaces instead of translucent ribbons
  - path overlay now starts hidden by default so the initial world view is cleaner while traversal/pathfinding still use the loaded path data
- Interior containment + legend finder pass:
  - enterable buildings now require full building footprints before indoor shells are generated, preventing oversized white-box walls from extending outside approximate bbox colliders
  - temporary interior wall colliders now honor their own base elevation so walking inside a mapped room no longer leaks out through terrain-level collision checks
  - large-map legend now includes a nearby enterable-buildings section with on-demand support scanning and cached building listing when indoor data is present
- Walking terrain-follow pass:
  - walk mode now resamples ground after horizontal movement on slopes so downhill travel no longer hops as sharply and the character mesh stays closer to the rendered ground
- Runtime/account/landing copy updated so donations remain clearly optional and never imply map/core-play gating.
- Mirror tooling now syncs and verifies landing/account roots alongside `app/*`, keeping `index.html`, `account/index.html`, and `app/*` aligned with `public/*`.
- Earth startup path trimmed without removing gameplay systems:
  - vendor boot now loads dependent Three.js loader scripts in parallel after the core script is ready
  - core Earth load no longer blocks on the recently added `railway` / `footway` / `cycleway` OSM pass; those layers now load immediately after the base world is ready and then rebuild the walk traversal network

### Runtime / App Integration Included

- Preserves current geolocation launch controls (`Use My Location`) in title + globe selector.
- Preserves current Ocean destination mode and Earth/Ocean switching flow.
- Preserves public mirror tooling with app/data plus landing/account parity checks.
- Runtime invariants now check spawn fallback safety, walkable traversal graph availability, linear-feature route support, `M` map behavior, `F4` debug behavior, updated controls text, and free-access copy across runtime/landing/account.

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
