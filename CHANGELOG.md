# Changelog

Notable user-facing changes are recorded here. Git history and GitHub releases contain the complete change record.

## [5.1.0] - 2026-08-27

### Added

- Ten source-bounded regional Field Guide packs for built-in destinations in
  addition to Baltimore, bringing the attainable guide to 180 entries across
  eleven regional packs.
- A dedicated Journal with Fieldwork, Games, Making, Travel, Community, and
  Companion paths.
- Journal backup and restore, current-region and World Guide scopes, grouped
  unidentified entries, and regional life-list progress.
- Backpack categories, item history, inspection, equip and use actions, hotbar
  assignment, and Field Kit synchronization.

### Changed

- Games, creation, Blocks, place visits, room joins, companion care, fieldwork,
  and fishing now contribute to the same Explorer profile and Journal.
- Every built-in Earth destination now selects a bounded regional field pack;
  expansion entries remain reference fallbacks unless reviewed media or models
  are available.
- The Explorer panel separates permanent Journal progress from recurring Field
  Today, Expedition, and seasonal opportunities.

### Fixed

- Regional Guide totals now count entries the player can actually reach with
  released activities.
- Fishing only credits a regional Guide entry when the caught species matches
  that entry.
- Backpack tools and the Explorer Field Kit remain synchronized across game
  modes.
- Player-facing Guide and Journal language no longer exposes implementation
  labels or repeats generic unknown-entry names.

## [5.0.0] - 2026-08-26

### Added

- Field Today activities, daily and weekly Expeditions, seasonal surveys, life
  lists, specialties, companions, and non-punitive return progression connected
  to the Backpack, Journal, and Field Guide.
- A Baltimore–Chesapeake ecology pack covering 60 plants, mammals, birds,
  insects and arachnids, freshwater fish, and marine fish, with distinct
  observation, photography, track/sign, macro, habitat, geology, and community
  survey activities.
- Shore, boat, and underwater fishing connected to the same Journal and Field
  Guide records, including catch, loss, retry, and recovery outcomes.
- Persistent local and multiplayer Blocks inside the World Editor, plus shared
  room building, activities, and vehicles.
- Browser zoom, visible focus, keyboard navigation, live status announcements,
  reduced motion, larger text, increased contrast, and larger touch targets.

### Changed

- Player-facing wildlife opportunities use game language such as field leads;
  they never claim a generated opportunity proves a real animal is present.
- Live GPS and free-roam walking share field activity and progression authority.
- Mobile walking, driving, drone, plane, map, Backpack, settings, reload, reset,
  and recovery remain on the stabilized control implementation.
- The former standalone Block Builder entry is replaced by the integrated World
  Editor Blocks workspace. Supported local and room builds are preserved.
- Existing Backpack data upgrades automatically with a local recovery backup.

### Fixed

- Returning to the title screen or changing locations more reliably clears the
  previous world and its browser memory.
- Released multiplayer vehicles remain reclaimable after reconnecting or when
  local terrain and collision detail differ.
- Walking routes avoid vehicle-only and engineered transport surfaces while
  retaining safe attributed sidewalk fallbacks.
- Kept the loading image above the game until the selected world is ready.
- Kept globe selection markers attached to the chosen location while zooming.
- Corrected mobile walking left/right direction and kept the camera behind the
  character during movement.
- Removed contextual field and interaction prompts while a bottom menu is open.
- Unified walking, driving, boat, plane, drone, and underwater speed units.

## [4.3.1] - 2026-08-22

### Added

- Street-oriented building entrances and storefront presentation integrated
  into the owning facade material, with contextual keyboard and touch entry.
- Multi-floor generated interiors with stable floor identity, walkable stairs
  and a proximity elevator for eligible buildings.
- A six-slot character equipment loop, contextual world actions, richer
  pedestrian roles, vehicle families and bounded civic-response gameplay.
- More expressive water, wake, sky and evidence-labeled bathymetry presentation.

### Changed

- Preserved mapped building height through selection, batching and every
  published LOD so distant presentation cannot silently shorten authoritative
  skyline metadata.
- Unified final terrain, at-grade roads, junction footprints, building
  clearance and vehicle wheel contact around the same published surface.
- Reconciled bridge, ramp, overpass, elevated-road and tunnel endpoint profiles
  inside the shared transport compiler instead of adding city-specific geometry.
- Kept Earth as one bounded selected-location world. No actor-centered or
  continuous-world streaming system was added.
- Released location-owned terrain, provider state and scene resources during
  teardown, and kept one shared Firebase/module authority in packaged output.

### Fixed

- Restored Baltimore and Manhattan tall-building visibility without reducing
  distant mapped detail or changing authoritative building heights by quality.
- Closed false cross-layer transport joins, duplicate structure ownership,
  jagged at-grade junction wedges and conflicting road/terrain cross-sections.
- Aligned non-player vehicles to four-wheel road contact on grades and kept
  pedestrians off vehicle-only transport surfaces.
- Preserved the nearest valid mapped arrival instead of relocating the player
  to a different road solely to satisfy a test.
- Removed obsolete hosted assets and internal audit, handoff and R&D records
  from the public release tip.

## [4.3.0] - 2026-08-17

Superseded by 4.3.1, the corrected 4.3 release.

### Production-candidate repair — 2026-08-19

- Reconciled exact bridge, ramp, overpass, elevated-road and tunnel joins after
  all terrain and structural profile finalization, retaining one transport
  surface authority and measured/provenance-labeled elevation inputs.
- Rebuilt distant pedestrians and traffic as recognizable multi-part actors,
  retained stable LOD identity, increased visibility hysteresis and preserved
  real-scale vehicle family dimensions and curb-aware parked placement.
- Added segment-continuous pedestrian/vehicle collision, coherent Backpack
  condition and ammunition presentation, fallen-actor ammunition recovery, and
  mapped hospital recovery distinct from mapped police custody.
- Restored Live GPS behind-actor camera alignment for walking and sustained-speed
  vehicle transition, with one current browser journey covering both states.
- Kept entrances inside the owning facade shader, added context-gated pitched
  roofs, restored the previously approved aerial Baltimore harbor/skyline hero
  byte-for-byte and limited the supporting gallery to current product flows.
- Replaced the compromised historical test suite with current source,
  complete-world, Live GPS, environment, security, multiplayer and
  immutable-artifact release boundaries.
- Added a full assembled-game location matrix for Baltimore/JFX, Golden Gate,
  London, Monaco, Manhattan and rural Iowa. It validates exact structure joins
  and engineered grades while inspecting the same terrain, buildings, water,
  traffic, pedestrians and renderer delivered to the player.
- Removed the competing tunnel-system mutation that rewrote compiled road
  heights back to raw terrain, and changed internal tunnel-way splits to one
  graph-corridor elevation solve anchored only by real surface portals.
- Hardened account deletion coverage for discovery trades, room activities,
  world modifications and DeFlock state; token checks now reject revoked
  sessions. Added baseline anti-sniffing, referrer, frame and opener headers.

### Added

- A coherent World Discovery loop with contextual wildlife, geology, field
  tools, Journal, Field Guide, Collection, Explorer progression and regional
  goals.
- Multiple dog, cat and bird companions with catalog-owned scale, grounded or
  airborne following, care state and contextual AR presentation.
- A capability-aware AR platform for companions, recorded specimens and
  habitat-gated virtual wildlife challenges, with WebXR, camera-overlay and
  interactive-3D fallback modes.
- Consolidated account/admin operations, guided onboarding, current analytics
  events and trusted Discovery inventory/trading backend contracts.

### Changed

- Reorganized Explorer UI into collapsible, task-focused surfaces that reuse the
  existing application shell instead of occupying the play view continuously.
- Expanded living-world pedestrian and vehicle variety while retaining bounded
  logical draw-call and triangle budgets.
- Updated the landing page with current gameplay media and a clearer explanation
  of the connected real-location exploration experience.

### Fixed

- Restored visible regional bridge, ramp and tunnel continuity for Baltimore,
  San Francisco and connected multi-segment tunnel systems.
- Prevented Discovery targets, equipment, wildlife and companions from sampling
  the wrong surface coordinates or appearing inside buildings.
- Preserved fixed-world ownership through travel, editor, multiplayer,
  planetary, Ocean and title transitions, with explicit world-memory release.
- Removed obsolete landing media and an orphaned duplicate Discovery progression
  implementation so strict production reachability is green.

## [4.2.1] - 2026-08-16

### Added

- Performance-bounded Field Navigator, Classic Utility car, Harbor Scout boat,
  Trailblazer plane, and Wayfinder spacecraft procedural presentation.
- A worldwide browser-gameplay gallery and a developer-facing system inventory.
- A release regression gate for traversal-model triangle, draw, material,
  transparency, footprint, propeller, and thrust-effect budgets.

### Changed

- Replaced the simplest player and traversal silhouettes without changing
  physics, collision, controls, cameras, water ownership, or world loading.
- Expanded the README, landing page, and GitHub Pages overview with direct
  browser captures of worldwide gameplay and phone-sized DeFlock states.

### Fixed

- Kept utility-car paint readable across quality tiers instead of inheriting a
  near-black sports-car material override.
- Shared spacecraft exhaust materials so the upgraded presentation does not
  multiply transparent material state.

## [4.2.0] - 2026-08-15

### Added

- DeFlock Hunt, a location game using publicly mapped OpenStreetMap
  surveillance nodes with single-player and shared-room virtual progress.
- Live GPS Explore, an optional foreground-only location-following mode inside
  one bounded fixed world with filtering, smoothing, pause, and low-power controls.
- Atomic publication of six immutable selected-location products for terrain,
  water, transport, buildings, land use, and places.
- Release checks for provider cancellation/failure behavior, 30-second drive
  and flight, fixed-world boundary traversal, Space return, and cold/warm load
  performance against the exact 4.1.3 release.
- Worldwide land, open-ocean, and cryosphere classification with dedicated
  non-streaming polar surfaces and biome-aware terrain/vegetation presentation.
- A two-browser multiplayer integration gate for private room joining,
  presence, movement, chat, and shared half-grid building shapes.

### Changed

- One location-wide PBR base material now spans WorldCover tiles while mapped
  per-pixel tint retains local grass, built, sand, rock, soil, and snow detail.
- Far terrain reuses mapped surface colors at the detailed seam and retries a
  missing elevation child through one bounded parent tile instead of dropping
  the complete horizon.
- Location changes cancel superseded provider work and reveal the replacement
  scene only after its matching immutable snapshot commits.
- Multiplayer discovery now separates invite-code joining, room creation,
  saved rooms, city discovery, and administrator-curated featured rooms.
- Earth, Moon, Mars, and Ocean destination controls are circular at desktop and
  mobile sizes; Space remains the rectangular destination control.

### Fixed

- Switching between travel modes now preserves the active actor's current
  traveled position instead of returning the car or character to the original
  location spawn.
- Removed rectangular land-cover color changes in farmland, dense cities, and
  sparse-data polar terrain by giving detailed and far ground one semantic
  color composition.
- Prevented a missing far elevation tile from producing a flat or empty inland
  horizon.
- Prevented travel-mode changes, ready-world movement, and Space return from
  reloading or republishing the selected Earth world.
- Preserved the requested location label and aircraft pose through publication
  and Earth→Space→Earth transitions.
- Prevented land coordinates from inheriting boat/open-water state, including
  provider-limited and polar locations, while retaining mapped water ownership.
- Restored private invite-room joining, compatible world-frame presence, and
  exact half-height stacking for shared cubes, slabs, ramps, and columns.
- Kept dense mapped city blocks developed when optional land-cover tiles are
  unavailable, while mapped parks and other natural surfaces remain exact.
- Restored the Shortbread building fallback when Overture is unavailable by
  awaiting decoded vector-tile elements before publication.

## [4.1.3] - 2026-08-07

### Added

- A fixed, one-time selected-location background that extends mapped land and
  up to 10,000 additional building masses toward a 22 km terrain horizon.
- Tile-exact ownership between detailed accepted ground and the coarse horizon
  mesh, retaining fallback terrain only beneath unavailable edge tiles.

### Changed

- Astronomical catalog stars render as the sky background while preserving
  their mapped positions, observer orientation, time-of-day visibility, and
  brightness; Earth geometry now reliably occludes them at the horizon.
- The initial location transaction waits for the fixed background to finish.
  Actor movement does not stream, rebuild, or recenter that background.
- Large mapped water polygons now continue through the fixed far context at
  worldwide locations; glaciers remain terrain and only mapped geometry may
  publish water.

### Fixed

- Restored terrain and mapped building context beyond the detailed city grid
  without restoring the false blue square, elevation-derived water, or a
  competing water publisher.
- Removed terrain holes, square seams, coarse/detailed z-fighting stripes, and
  stars drawing through distant ground.
- Reconciled infeasible connected bridge tie-ins against the engineered grade
  ceiling while preserving structural clearance bounds.
- Restored the v3.1 movement/look mapping on mobile touch pads and made the
  visible mobile Main Menu control reliably tappable above the HUD and canvas.
- Made multiplayer Space room synchronization await the lazy-loaded flight
  runtime before reporting completion, preventing Moon/Space/Earth races.
- Kept the transition screen opaque while a new location loads, prevented a
  previous location name from surviving publication, and removed the green
  bootstrap ground from open-ocean destinations.
- Improved custom-city arrivals by checking a usable terrain corridor along
  the selected mapped road instead of validating only the spawn point.

## [4.1.2] - 2026-08-06

### Added

- Integrity-checked accepted-ground artifacts for the documented worldwide
  release scenarios, with explicit datum, provenance, coverage, uncertainty,
  and fail-closed loading.
- One provenance-preserving OSM transport graph and surface shared by road
  rendering, collision, navigation, bridges, tunnels, ramps, and stacked
  structures.
- Building and water authority registries that retain source identity,
  mapped/inferred status, foundation datum, navigability, and publication
  ownership.
- Settlement-aware building publication with dense-city coverage targets,
  conservative real-data roof inference, and footprint-aware road exclusion.
- Mapped WorldCover terrain semantics and reusable PBR surface materials for
  vegetation, built-up land, bare ground, snow, and water-adjacent terrain.
- Observation-derived space imagery, physical body metadata, and stable local
  flight axes for consistent controls throughout space.

### Changed

- Reworked walk, drive, drone, plane, boat, and space transitions around one
  location-based world while preserving valid accepted-surface pose.
- Restored responsive vehicle acceleration and steering, reduced repeated
  terrain/road queries, and aligned speed presentation with world scale.
- Improved road junctions, bridge and tunnel transitions, watercraft entry,
  aerial travel, worldwide coordinate selection, and regional building
  coverage.
- Made the generated hosting manifest bind the exact commit, dependency lock,
  source-release manifests, asset manifest, content hash, Firebase environment,
  and immutable deployment target.

### Fixed

- Eliminated missing-elevation-as-zero publication, duplicate road/building/
  water ownership, proximity-only boat selection, tunnel/bridge authority
  divergence, slow presentation-mesh queries, and leaked environment sessions.
- Removed the post-4.1.1 square far-terrain clipmap that created false blue
  city borders and terrain bands; water now remains owned by mapped water
  geometry instead of elevation or rectangular fallback classification.
- Removed disabled sidewalk publication and its unused loading/batching path,
  along with duplicate far-terrain build work that was immediately discarded.
- Fixed city terrain composition so mapped built-up areas surround buildings
  without inventing additional OSM sidewalks or footpaths.

### Removed

- The experimental rectangular far-field terrain owner introduced after
  4.1.1, including its diagnostics, water coloring, and runtime update hooks.
- Superseded streaming, sidewalk batching, interpolation, and terrain-overlay
  paths that competed with the selected-location world.

## [4.1.1] - 2026-07-28

### Added

- Structure-aware compilation for bridges, elevated roads, ramps, underpasses, tunnels, and stacked transportation.
- Material-aware building facades, improved roof forms, rooftop detail, terrain seam handling, stable shadow policy, and render interpolation.
- Worldwide regression coverage across dense cities, mountains, coasts, deserts, rural areas, open water, landmarks, and complex road structures.
- My Places list behavior with double-click exploration.

### Changed

- Consolidated Earth loading into one selected-location transaction with cancellation and atomic publication.
- Unified terrain and traversal queries used by movement, spawning, placement, navigation, and cameras.
- Improved walking, driving, drone, and plane transitions and surface contact.
- Updated the title interface, destination parity, building presentation, terrain composition, and aerial rendering.

### Removed

- Removed Continuous World and its duplicate Overture and streaming renderers.
- Removed visible walking-path geometry while retaining the data needed for traversal.
- Removed superseded facade shaders, procedural facade generators, and conflicting road-structure presentation paths.

## [4.1.0] - 2026-07-26

This release was withdrawn after runtime and world-presentation regressions were found. It was not retained as the production baseline.

## [4.0.0] - 2026-07-23

- Introduced the 4.x interface and destination experience.
- Expanded Earth, Ocean, Moon, Mars, Space, gameplay, editor, account, and multiplayer integration.
- Added generated hosting artifacts and a separate GitHub Pages project site.

## [3.1.0] - 2026-07-20

- Added the globe-first start hub and provenance-aware Live Earth tools.
- Consolidated environment transitions and normalized surface queries.
- Expanded provider, mobile, editor, multiplayer, planetary, and release verification.
- Established the generated, content-hashed Firebase Hosting artifact workflow.

## [3.0.0] - 2026-07-15

- Added expanded Earth travel, Mars, the Solar System, ocean play, fishing, building tools, landmarks, and broader mobile support.
- Improved terrain, buildings, water, traversal modes, interiors, and runtime ownership.

## Earlier Releases

Release notes for versions 1.0.0 through 2.1.0 are available in [GitHub Releases](https://github.com/RRG314/WorldExplorer3D/releases).
