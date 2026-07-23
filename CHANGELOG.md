# Changelog

## [Unreleased]

## [4.0.0] - 2026-07-22

### Added

- Added an authoritative multiplayer server foundation with shared contracts, command validation, interest management, recovery snapshots, persistence adapters, reconnect support, and bounded-load verification.
- Added reusable progression, mission, combat, vehicle, inventory, building, demolition, leaderboard, and activity-platform contracts for browser and server gameplay.
- Added contributor governance, conduct, DCO, self-hosting, extension, support, data/media licensing, trademark, and third-party notice documentation.
- Added landmark footprint ownership that prevents ordinary mapped buildings from rendering beneath curated or mapped landmark geometry.

### Changed

- Relicensed original project code and documentation under Apache-2.0 while retaining third-party assets, data, APIs, and trademarks under their own terms.
- Reworked multiplayer, editor, block-building, account, save, admin, analytics, and browser-storage paths around explicit ownership and backward-compatible record normalization.
- Split browser-admin community, moderation, and formatting presentation from the controller without changing administrative routes or access boundaries.
- Made Cloud Functions billing dependencies lazy so unrelated functions no longer pay Stripe startup cost.
- Consolidated the globe-first start hub, mobile controls, travel-mode input, environment sessions, surface ownership, streaming budgets, and visual diagnostics.
- Made Earth, ocean, Moon, Mars, and space transitions preserve compatible state and dispose incompatible actors, renderers, controls, and resources in one runtime.
- Replaced duplicate Giza pyramid layers with one measured footprint-and-height owner per mapped pyramid and made curated landmark loading independent of optional network enrichment.
- Made all unhashed hosted code, documents, fonts, models, and media revalidate so a deployment cannot mix assets from different releases.
- Added verified live-release snapshotting and exact-build rollback commands; production promotion remains a separate, explicit approval step.

### Removed

- Removed source assets whose redistribution terms were not verified and removed the superseded layered Giza pyramid renderer.

### Verification

- Added release gates for Apache-2.0 distribution metadata, emulator-backed MMO compatibility, Firestore rules, browser gameplay, mobile environments, planetary round trips, plane/interior lifecycle, operational feeds, hosting identity, and hosted-source reachability.
- Added release-version consistency, hosting-size budgets, release-harness privacy checks, and a final artifact hash verification after the complete release suite.
- Made continuous-streaming resource certification compare reachable scene/stream geometry ownership and exact disposal completion; mapped-source retention and bounded visible LOD density are verified separately.

## [3.1.0] - 2026-07-20

### Added

- Added a consolidated globe-first start hub that keeps location selection, destinations, missions, multiplayer, Live Earth, library, and quick-start navigation in one responsive workspace.
- Added a shared geospatial provider registry with bounded caching, request deduplication, timeouts, provenance, truth classification, and provider-health diagnostics.
- Added current OpenSky aircraft placement on the globe, Panoramax and KartaView street-imagery inspection, CelesTrak satellite groups, USGS earthquakes, Open-Meteo weather and marine guidance, and NOAA water-level/tide coverage.
- Added an always-visible top-down logarithmic Solar System inset that distinguishes the real 2.06-3.27 AU asteroid belt from the 30-50 AU Kuiper belt.
- Added runtime-kernel, platform-service, gameplay-plugin, transport-controller, account-service, geospatial-contract, and operational-endpoint verification.

### Changed

- Replaced the globe selector's ambiguous Explore panel tab and hidden Start Here footer with an always-visible Explore action that launches the selected coordinates; the former tab is now labeled Choose Location.
- Split Earth source ownership by play profile: detailed location sessions retain OSM data, while continuous streaming consumes normalized Overture transportation, building, base land-cover, and water tiles.
- Routed continuous Earth cold starts directly through a scheduler-owned Overture neighborhood bootstrap; continuous sessions no longer construct and later retire a temporary OSM world.
- Replaced source-order road/building truncation with deterministic transportation-class priorities and spatially distributed building budgets.
- Made continuous building budgets distance-aware: the active tile retains up to 3,600 mapped footprints, adjacent tiles retain 1,200, and diagonal context tiles retain 900, preserving nearby city completeness without applying the full cost to the entire streaming ring.
- Accelerated and instrumented retired streaming-geometry disposal with deduplication and bounded time slices, eliminating the disposal backlog seen during repeated long-distance travel.
- Removed full-animation-frame barriers from streamed vector construction, reducing a 300-feature road build from roughly 38 seconds to milliseconds in the browser profiling fixture.
- Gated initial-world retirement and Earth-origin rebasing on current-tile neighborhood coverage, with decoded terrain pruning after streamed chunk and terrain-mesh handoffs.
- Added source/tile provenance to streamed terrain, road, path, cycleway, building, land-cover, vegetation, and water meshes so visual regressions can be traced to their owning dataset and renderer.
- Conformed at-grade road edges and streamed building foundations to sampled terrain while preserving engineered bridge, ramp, and tunnel profiles.
- Split Overture transportation rendering by vehicle, pedestrian, and cycle surface class instead of drawing every segment as dark asphalt; expanded normalized Overture land-use coverage for parks, managed land, recreation, residential, education, and related classes.
- Removed Esri aerial photography from the playable 3D Earth surface and replaced it with a crisp ESA WorldCover semantic baseline under authoritative OSM/Overture roads, water, and land-use geometry.
- Made streamed road ribbons consistently upward-facing across OSM, Overture, terrain rebuilds, fallback roads, elevated connectors, and painted markings so roads remain visible from walking and driving cameras.
- Consolidated terrain-tile texture ownership and disposal for the semantic baseline, preventing classified textures from accumulating across repeated continuous-world travel.
- Removed legacy grass normal/roughness detail from continuous semantic terrain, including the pre-classification loading state, so continuous ground never falls back to a satellite-like textured presentation.
- Added shared surface-composition precedence across OSM location and Overture continuous land classes, eliminating coplanar land-use conflicts and dark triangular surface fans.
- Made vector geometry acquire retryable DEM coverage immediately before construction and include the vector-tile buffer around nominal bounds, preventing steep-terrain roads near tile edges from being baked at sea level.
- Added a continuous-renderer browser gate covering Overture neighborhood handoff, terrain contact, semantic surface ownership, mesh provenance, actor continuity, and walking/drone screenshots.
- Replaced the tracked Firebase Hosting mirror with a generated, ignored `dist/` artifact.
- Added content-hashed hosting manifests tied to the Git commit, Firebase environment, and canonical source fingerprint.
- Updated preview, runtime, release, and integration-test tooling to verify the generated artifact instead of copying and comparing a second source tree.
- Added a strict hosted-source reachability audit and included it in runtime verification.
- Consolidated title/loading/planetary transition media onto the canonical landing assets without changing their pixels.
- Reserved OSM-focused data access for high-detail location play in the architecture plan; continuous travel will use globally tiled sources through the same world and surface contracts.
- Added a session coordinator as the sole environment-state commit owner plus cancellable lifecycle scopes for transition/session timers.
- Routed Earth, Ocean, Moon, Mars, Space, title, and menu environment commits through the coordinator; Space delayed callbacks now expire with their owning flight session.
- Registered lifecycle adapters for all five environments with owner-specific exit hooks and debug resource snapshots; title exits now stop Space and Ocean through the coordinator instead of cross-calling their internals.
- Separated Ocean resource teardown from environment selection so a superseded Ocean session cannot redirect a newer planetary transition back to Earth.
- Removed cross-environment Space/Ocean teardown calls from planetary, menu, title, and boat-transfer modules; callers now request an owner-controlled exit from the coordinator.
- Added a repeated lifecycle plateau check covering three Space and three Ocean launches, adapter/render-loop shutdown, GPU resource stability, renderer disposal, and duplicate-canvas prevention.
- Added the first normalized Earth surface contract with explicit OSM-location/global-continuous source profiles, surface kinds, provenance/confidence, vertical-datum metadata, traversal capabilities, and tile descriptors; current `GroundHeight` behavior remains the compatibility backend.
- Migrated spawn, walking, driving, drone/plane altitude, navigation, blocks, editor/activity placement, interiors, memories, flower markers, and Paint Town surface reads to the normalized query boundary with loaded-world height parity checks.
- Added explicit stream-layer source profiles and normalized loading/loaded tile descriptors so diagnostics expose OSM-backed continuous-world layers instead of mislabeling them as global-source data.
- Bounded editor/multiplayer overlay readiness in the browser audit so an unavailable external overlay service cannot hang verification indefinitely.
- Corrected inland-water vertical datum ownership so lakes and canal reservoirs retain real elevation while open ocean remains at sea level; water polygons remain individually reprojectable and boat mode no longer hides whole shoreline terrain tiles.
- Normalized water areas and waterways behind one identity/datum contract used by location rendering, continuous rendering, terrain reprojection, boat physics, and surface queries; delayed DEM updates now reclassify elevated lakes atomically instead of leaving stale ocean physics.
- Made custom globe starts enter the mapped boat flow when the selected point is valid water, preserving that successful boat start through title finalization and supporting a boat/submarine/boat round trip at the same geographic water body.
- Added water acceptance contracts for Atlantic open ocean, Lake Tahoe, and Gatun Lake covering classification, elevation bands, flat water geometry, boat/surface alignment, and rendered shoreline context.
- Kept title launch disabled until the complete runtime boot sequence is registered, preventing touch users from entering a partially initialized app.
- Added a mobile-only initial location budget that reduces source radius and geometry counts before construction while leaving desktop location detail and continuous-world scheduling unchanged.
- Strengthened iPhone/Android acceptance to use the real title launch, wait for a visibly completed world transaction, verify reachable dock controls and mode handoffs, and retain portrait/landscape screenshots.
- Expanded the single release gate to cover hosted-source reachability, normalized surfaces, Overture adapters and budgets, renderer provenance, continuous-world visuals, and repeated environment lifecycle plateaus.
- Corrected transportation ribbon winding so OSM location roads, Overture continuous roads, terrain-rebuilt roads, fallback roads, elevated connectors, and painted markings render from the gameplay side instead of being culled from walking and driving views.
- Made the Earth scene root authoritative during location reloads and replaced unsupported Three.js detach calls with compatible parent removal, preventing deferred city geometry from surviving into later ocean, mountain, or rural worlds.
- Corrected subgrade road-height selection so tunnel profiles win over overlapping surface roads; mapped, rendered, and playable Holland Tunnel floor heights now agree.
- Added explicit bridge/tunnel gameplay probes and representative visual acceptance across New York, Monaco, Atlantic open ocean, the Swiss Alps, Sahara, Amazon, Everglades, Iowa farmland, Lake Tahoe, Golden Gate Bridge, Holland Tunnel, and Panama Canal.
- Completed Phase 5 Earth-realism acceptance while preserving the semantic ground and aerial presentation: city density, biome-specific terrain, blue navigable water, elevated lake datum, shore context, bridge rails, and tunnel traversal were checked in rendered browser frames.
- Added `.mjs` MIME support to the local preview server and aligned runtime module/cache identity for deterministic visual candidate checks.
- Added one semantic keyboard, touch, and gamepad action layer across walking, driving, drone, plane, boat, and submarine travel, with a shared active-actor pose/velocity contract for streaming prediction.
- Moved plane throttle to `X/Z`, retained inverted arrow-key pitch, and claimed gameplay keys from the browser without intercepting form controls, eliminating Control-plus-arrow browser shortcut conflicts during flight.
- Added bounded low-frame-rate physics stepping for cars, planes, and boats plus fast surface-safe plane handoffs to walking, driving, and drone modes.
- Made synthetic open-ocean traversal a recentering navigation envelope while preserving mapped shoreline authority, so boats can continue across unmapped ocean instead of being pinned to their entry point.
- Replaced generated faint-star filler on Earth, Moon, Mars, Sol space, and universe frames with a bundled ESA Gaia DR3 bright/nearby-star sample; display color remains an explicitly documented BP-RP approximation.
- Added a closable desktop/mobile universe navigator that releases flight controls on close, supports Escape and outside-click dismissal, and closes automatically when travel begins.
- Added catalog-framed black-hole destinations and an explicitly labeled speculative M87* to Sagittarius A* wormhole gameplay route; the endpoints remain observed catalog positions while the connection is not presented as science.
- Restored asteroid- and Kuiper-belt placement to their proportional 2.06-3.27 AU and 30-50 AU ranges, with an always-visible logarithmic Sol distance inset instead of physically compressing the two regions together.
- Replaced the procedural Apollo 11 crater/noise surface with an LROC NAC 2 m/post, LOLA-controlled DTM and matching orthophoto converted to bounded browser assets; lunar traversal and landing equipment now query that same measured mesh at 1:1 vertical scale.
- Replaced the Mars sky box with a camera-centered atmosphere dome, removed synthetic volcano/noise relief from Olympus Mons, and retained the bundled MOLA-derived elevation field as the terrain owner.
- Made direct Moon title launch await the environment transition contract, eliminating its false launch-rejected error while the surface loaded successfully.
- Made Mars entry playable before the optional rover GLB finishes downloading; a request-owned fallback rover now permits the environment commit immediately, while a late model response may only replace the vehicle that requested it.
- Made globe-selector launches transactional and request-owned, with strict coordinate validation, duplicate-launch prevention, and visible recovery when an Earth, Moon, or Space transition fails.
- Reworked the globe selector into one responsive scroll surface with mobile-safe globe gestures, reachable actions, populated nearby locations, and a valid Baltimore fallback instead of an unconfigured zero-coordinate start.
- Removed unimplemented Live Earth preview layers and labeled the remaining derived and modeled layers honestly; fixed their shared render context so satellite, earthquake, weather, storm, ocean-state, ship, and aircraft views update without breaking the selector.

### Removed

- Removed the duplicated `public/` source mirror, obsolete mirror sync/verification scripts, and the tracked generated Itch wrapper archive.
- Removed an unreachable pre-refactor root simulation tree (about 31,000 lines), its unused styles/media, and one superseded activity-editor event module.

## [3.0.0] - 2026-07-15

### Added

- Continuous, budgeted Earth streaming with aerial context, road labels, land-cover fallbacks, and stable mode transitions.
- Plane traversal with chase, cockpit, and overhead cameras plus compact street takeoff and landing behavior.
- Full Mars destination flow, rover traversal, planetary gravity, surface tracks, minimap support, and in-runtime return to Earth or Space.
- Expanded solar system and navigable universe with planets, asteroid and Kuiper belts, spacecraft, galaxies, nebulae, catalog-backed destinations, and deep-space encounters.
- Inner and outer solar-system map views that make the asteroid and Kuiper belts visible without replacing normal rocket flight.
- Boat fishing game with multiple species, rarity and size records, tension/drag/fatigue mechanics, persisted catches, and unified leaderboards.
- Four-shape, eight-color Build with Blocks catalog with a 200-block limit, exact stacking, walk collision, and driveable ramps.
- Landmark structure passes for Giza pyramids, Golden Gate Bridge, Eiffel Tower, and Elizabeth Tower, plus bridge guardrails and safety geometry.

### Changed

- Refactored runtime ownership across Earth, terrain, water, planetary, interior, map, and streaming systems to reduce cross-mode state leakage.
- Improved OSM and fallback building coverage, facade variation, rooftop presentation, distant aerial context, vegetation, water placement, bridge elevation, and tunnel semantics.
- Reworked walking, driving, drone, plane, boat, rover, and camera controls around consistent travel-mode transitions.
- Replaced colored square star points with round white star materials and body-specific astronomical orientation on Earth, Moon, and Mars.
- Updated multiplayer/editor transitions, account-safe leaderboard rules, mobile controls, tutorials, and title destination navigation.
- Made Mars/Earth transitions session-owned so an interrupted return cannot overwrite a newer Mars launch or leave a Mars rover in an Earth scene.
- Made first-launch Mars setup retain environment ownership across asynchronous terrain and rover loading instead of leaving a partially styled Earth scene.
- Separated GitHub Pages from production hosting; Pages now publishes a project explainer while `worldexplorer3d.io` remains the live application.

### Validation

- Production release gate covers mirror and module integrity, 45 Firestore security cases, local-data safety, editor/multiplayer transitions, block-builder contracts, planetary round trips, provider outages, water/biome smoke tests, and a global preset/custom-location matrix.

## [2026-03-14]

### Changed

- Shared Earth surface classification:
  - added `app/js/surface-rules.js` so terrain, OSM landuse, and water rendering all use one climate-aware rule set
  - polar/high-latitude locations now render snow terrain and frozen water instead of default temperate grass + blue water
  - arid desert locations now classify to sand terrain, with procedural dune-style texture detail for sparse areas
  - OSM natural tags now include `sand`, `beach`, `bare_rock`, `scree`, `shingle`, and `glacier` in the Earth land-surface pipeline
  - `scripts/test-osm-smoke.mjs` now validates Arctic, Antarctica, and desert custom locations in addition to Monaco water visibility
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

- New full code-first inventory snapshot completed for the March stabilization pass.

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
