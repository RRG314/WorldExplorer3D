# Changelog

## [2026-03-16]

### Changed

- First staged Earth boat travel pass:
  - added `app/js/boat-mode.js` as a dedicated Earth water-travel subsystem layered onto the shared travel-mode controller
  - boat travel now appears intentionally near valid larger water bodies only, including harbor/coastal/open-water and lakefront-style cases when the loaded world data supports them
  - boating applies lightweight wave-driven heave/pitch/roll plus sea-state cycling (`Calm`, `Moderate`, `Rough`) without switching to a disconnected minigame
  - offshore boating now feeds a detail-bias hint into `world.js` so shoreline/city identity is preserved near land while unnecessary distant land detail can be reduced farther offshore
  - HUD, controls, prompt flow, Earth location resolution, and physics now all understand `boat` as a real traversal mode
  - added `scripts/test-boat-smoke.mjs` for harbor/lakefront/coast/open-water validation coverage
  - second-pass polish:
    - wave response now smooths toward target sea motion instead of snapping directly to raw samples
    - harbor/coast/lake runs preserve more nearby shoreline detail than true open-ocean runs
    - docking/exiting now resolves back toward safe shoreline spawns
    - intentional water-target teleports and custom globe launches can auto-enter boat mode when the clicked target is truly boat-eligible
- Procedural urban surface pass:
  - `terrain.js` now generates a shared sidewalk batch from loaded road geometry plus nearby building/landuse context instead of relying on grass terrain with ad hoc per-building pavement
  - dense city corridors now bias terrain classification toward urban ground without letting sparse desert roads or real beach polygons get incorrectly overridden
  - near-road sloped building aprons are now suppressed in urban road-core cases so the runtime keeps the needed foundation skirt without stacking extra hidden pavement under city blocks
  - `ground.js` now samples generated urban surface meshes for walking, so the player stands on procedural sidewalks instead of clipping through them
  - second-pass polish tightened sidewalk width transitions, tapered intersection joins more cleanly, and added validation metrics for shared sidewalk batching plus skipped building aprons
- Weather cleanup follow-up:
  - removed the earlier boxed-in local weather deck approach and kept live/manual weather presentation inside the normal sky, fog, cloud, and light response

## [2026-03-15]

### Added

- First isolated contributor editor workflow:
  - `app/js/editor/session.js` for intentionally-entered editor mode
  - `app/js/editor/store.js` for staged Firestore submissions
  - `app/js/editor/public-layer.js` for nearby approved contribution rendering
- Second editor pass:
  - `app/js/editor/config.js` for shared contribution-type definitions
  - building-related (`building_note`), interior-prep (`interior_seed`), and photo-reference (`photo_point`) submission support
  - richer moderation filters, search, detail pane, and decision-note workflow inside the isolated editor session
- Large-map `Approved Contributions` filter section.
- Firestore editor submission rules and index coverage for staged moderation plus nearby approved-area queries.
- Backend moderation pass:
  - `functions/index.js` now exposes `submitContribution`, `getContributionModerationOverview`, `listContributionSubmissions`, and `moderateContributionSubmission`
  - `account/moderation.html` adds a private plain-language moderation page for owner/admin review
  - `js/function-api.js` and `js/contribution-api.js` add shared authenticated function clients for contribution workflows
  - optional direct email alerts for new submissions via configured function params/env

### Changed

- Editor contributions now follow one simple lifecycle:
  - private preview
  - pending submission
  - admin moderation
  - approved public world/map visibility
- Approved contributions are publicly readable only after moderation approval; pending and rejected items stay owner/admin-only.
- Editor previews now fit building/interior contributions to real active-world targets more accurately by outlining the active building or interior shell during private preview/review.
- Editor payload normalization and Firestore rules now cover place, building, interior-seed, and photo-reference metadata without exposing direct live-world edits.
- Submission and moderation writes now go through backend endpoints instead of direct browser-side Firestore writes.
- Runtime invariants now check editor API exposure plus the approved-contribution public layer API.
- User guide, technical docs, architecture, controls, quickstart, and release checklist now describe the current isolated contributor workflow accurately.
- Earth sky and lighting now use real location-aware astronomical state:
  - added `app/js/astro.js` for lightweight sun/moon/phase calculations
  - `sky.js` now derives day/night, sunrise/sunset, sun direction, moon direction, moon phase, and star visibility from the explored coordinates plus current date/time
  - `hud.js` now follows the shared `skyState` instead of inventing a second fake sun/moon path every frame
  - Ocean mode now reuses the same Earth-relative sky state when launched from a real-world ocean site
- Runtime cleanup pass:
  - cached astronomical sky refreshes now run on a timed interval instead of every frame
  - cloud repositioning now moves the cloud group as one unit instead of doing per-cloud follow easing every frame
  - `world.js` now triggers one shared astronomical refresh after Earth loads instead of splitting star/sky ownership across separate code paths
  - generated interiors now search multiple valid interior anchors before building their contained shell, which fixes irregular-footprint cases that could fail runtime containment checks
- Validation coverage now includes location-based astronomical checks and multi-time-zone sky assertions in runtime/world-matrix test flows.
- Earth weather and climate now use live explored-location conditions:
  - added `app/js/earth-location.js` so weather and sky resolve the same observed Earth coordinates from drive/walk/drone/ocean state
  - added `app/js/weather.js` for live Open-Meteo current-condition lookup, caching, HUD display, and lightweight weather-driven presentation adjustments
  - default environment state now follows the real explored location’s condition, temperature, cloud cover, wind context, and basic precipitation category
  - manual environment control still works as an override layer, cycling `Live`, `Clear`, `Cloudy`, `Overcast`, `Rain`, `Snow`, `Fog`, and `Storm`
- Weather polish follow-up:
  - weather HUD now labels live/manual state more clearly
  - local weather response now uses a low-cost overhead weather deck plus stronger fog/light/background tinting so overcast/rain/fog feel present around the player instead of only on the horizon
- Runtime cleanup pass for environment/weather:
  - weather refresh checks now run on low-frequency timers instead of every frame
  - weather HUD text is now updated from weather-state changes instead of on every HUD tick
  - ocean mode now uses the same throttled weather refresh path instead of frame-linked polling
  - initial live-weather fetches now retry once before giving up, which makes first-load weather more reliable without adding heavy polling
  - location jumps now invalidate the short weather-throttle window correctly, preventing stale weather from a previous city from carrying into a distant new one

## [2026-03-14]

### Changed

- Shared Earth surface classification:
  - added `app/js/surface-rules.js` so terrain, OSM landuse, and water rendering all use one climate-aware rule set
  - polar/high-latitude locations now render snow terrain and frozen water instead of default temperate grass + blue water
  - arid desert locations now classify to sand terrain, with procedural dune-style texture detail for sparse areas
  - OSM natural tags now include `sand`, `beach`, `bare_rock`, `scree`, `shingle`, and `glacier` in the Earth land-surface pipeline
  - `scripts/test-osm-smoke.mjs` now validates Arctic, Antarctica, and desert custom locations in addition to Monaco water visibility
- Terrain material classification follow-up:
  - terrain classification now layers precise rendered OSM polygons, cached raw surface-feature hints, and sparse-area fallback instead of relying on broad world hints alone
  - localized beach sand now beats nearby urban pressure, so actual loaded beach polygons classify as sand without turning inland/city tiles into desert ground
  - Hollywood now validates as non-sand while a loaded Santa Monica beach polygon validates as localized sand
  - world-matrix coverage now includes Hollywood, Las Vegas, London, and Tokyo in addition to the earlier preset/custom spread
- System-level Earth runtime stabilization pass:
  - added `app/js/travel-mode.js` so keyboard and UI float-menu mode switching share one drive/walk/drone transition path
  - moved road/building terrain-follow refresh ownership into `terrain.js` via `requestWorldSurfaceSync()`, removing duplicate rebuild triggers from walking mode
  - `world.js` now dedupes identical in-flight `loadRoads()` requests and only reuses cached traversal graphs when they still match the currently loaded road set
  - safe spawn validation now also rejects non-road placements inside mapped water polygons
- Interior/runtime jitter reduction:
  - interior prompt updates now cache nearby building candidates and suppress redundant DOM writes instead of rescanning every walking frame
- Unified building-entry / real-estate interior pass:
  - added `app/js/building-entry.js` as the shared support resolver for regular exploration buildings plus real-estate/historic destinations
  - `interiors.js` now uses one enterable-building model instead of a mapped-only path, so supported buildings can fall back to generated enclosed interiors when OSM indoor data is missing or slow
  - property and historic navigation now route to the same building entry anchor used by the interior system
  - large-map enterable-building scans now list mapped/generated/listing-backed supports instead of only mapped interiors
  - active interiors now expose placement targets for build blocks and record interior context in multiplayer artifact/home-base anchors
- Broader validation coverage:
  - added `scripts/world-test-locations.mjs`
  - added `scripts/test-world-matrix.mjs`
  - added `npm run test:world-matrix` for preset + custom coordinate coverage across dense downtown, coastal, mixed-terrain, sparse rural, suburban custom, and rural custom locations
- Documentation/update pass:
  - aligned README, architecture, technical docs, quickstart, and release checklist with the new system ownership and validation flow
  - corrected release/quickstart guidance so the currently paused path-overlay rollout is not described as active runtime behavior

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
- Mirror tooling now publishes the repository `CNAME` into `public/CNAME`, so GitHub Pages deployments keep `worldexplorer3d.io` bound to the current mirrored build.
- Earth runtime safety and controls update:
  - traversal switches now preserve valid positions and resolve invalid walk -> drive transitions to nearest safe road spawns
  - geolocation/custom-location launches validate spawn safety before placement
  - walking/drone controls now use `WASD` for movement and arrow keys for directional look
  - `M` remains the large-map key; `F4` is restored for debug overlay access
- Temporary path-rollout rollback:
  - disabled the added `railway` / `footway` / `cycleway` runtime load, overlay, and traversal integration in the active build
  - walking and navigation now stay on the core road-and-ground traversal path again while the separate path feature work is cleaned up
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
