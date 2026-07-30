# Changelog

Notable user-facing changes are recorded here. Git history and GitHub releases contain the complete change record.

## [4.1.2] - 2026-07-30

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
- Controller p95 diagnostics, lifecycle owner/resource diagnostics, sustained
  journey evidence, and ten-cycle space/ocean stress coverage.

### Changed

- Reworked walk, drive, drone, plane, boat, and space transitions to clear
  stale input while preserving valid accepted-surface pose.
- Rebuilt space camera/control math around explicit local axes and normalized
  quaternion interpolation.
- Made the generated hosting manifest bind the exact commit, dependency lock,
  source-release manifests, asset manifest, content hash, Firebase environment,
  and immutable deployment target.

### Fixed

- Eliminated missing-elevation-as-zero publication, duplicate road/building/
  water ownership, proximity-only boat selection, tunnel/bridge authority
  divergence, slow walk presentation-mesh raycasts, and leaked environment
  renderer/animation sessions.

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
