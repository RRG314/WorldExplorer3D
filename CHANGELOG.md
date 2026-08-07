# Changelog

Notable user-facing changes are recorded here. Git history and GitHub releases contain the complete change record.

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
