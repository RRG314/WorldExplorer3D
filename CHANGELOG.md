# Changelog

Notable changes to this project are documented in this file.

This project follows Semantic Versioning where possible.  
Entries reflect changes made relative to the most recent public release.

---

## [Unreleased]

### Added
- Documentation updates for RDT/RGE-256 research provenance, DOI references, and implementation mapping.
- Explicit deterministic PRNG direction notes documenting ongoing migration away from `Math.random` where reproducibility is required.
- `KNOWN_ISSUES.md` with contributor-focused engineering targets.
- Repository baseline files for consistency: `.editorconfig`, `.eslintrc.cjs`, `.prettierrc.json`, `.prettierignore`.
- Updated GitHub issue templates for structured bug and feature intake.

### Changed
- Technical documentation examples now show deterministic RNG usage patterns aligned with the `rdt.js` seeded runtime helpers.
- README, QUICKSTART, CONTRIBUTING, and DOCUMENTATION_INDEX are now aligned with the current branch architecture and source-available all-rights-reserved license model.

---

## [1.1.0] - 2026-02-10

### Highlights vs v1.0.0
- Introduced **RDT (Recursive Division Tree)** complexity analysis and deterministic seed utilities to make each location's procedural look repeatable while preserving neighborhood variation.
- Upgraded procedural visual consistency (building/window/road variation now seeded by location), delivering more stable and polished graphics between sessions.
- Improved world/physics performance behavior with RDT-aware adaptive road-query throttling plus safety overrides in high-speed/off-road edge cases.
- Continued refinement of **space/solar-system flow** and environment transitions (Earth ↔ Space Flight ↔ Moon) for smoother mode switching and cleanup behavior.

### Added
- Recursive Division Tree (RDT) utility module (`js/rdt.js`) for deterministic, location-keyed procedural behavior.
- Stable geo-hash and seeded pseudo-random helpers to keep location visuals consistent across reloads.
- RDT self-test vectors that run on load and warn if `rdtDepth` calculations regress.

### Changed
- World loading now computes and uses an RDT complexity index to adapt query strategy in dense vs. sparse locations.
- Procedural generation now uses deterministic seeds for building/window/road texture variation instead of purely non-deterministic randomness.
- Physics road proximity checks now use adaptive RDT-aware throttling to reduce per-frame cost in high-complexity areas.
- Ongoing performance tuning during city and environment switches.
- Incremental improvements to road and terrain alignment.
- Refinements to environment transitions and cleanup logic.


### Fixed
- Added road-cache invalidation hooks during location reloads and major mode transitions to prevent stale proximity data.
- Added safety overrides so road proximity checks re-run immediately when steering, moving at high speed, or recovering from off-road states.

---

## [1.0.0]

### Changed
- Refactored project from a single large HTML/JS file into a modular JavaScript structure
  - Logic split into focused files for engine, world loading, physics, input, UI, map, terrain, sky, and state
  - Improved maintainability and extensibility
  - Enabled further feature development without increasing coupling

### Added
- Space flight mode allowing transition from Earth into space within a single session
- Solar system model with orbiting planets and visible orbital paths
- Clickable planets with informational panels
- Moon travel sequence including landing and return to Earth
- Moon surface exploration with environment-specific physics
- Support for walking and driving on the Moon
- Star field and constellation rendering integrated into sky system

### Fixed
- Multiple issues related to environment switching stability
- Camera and control handoff between Earth, space, and Moon modes
- Scene cleanup issues that caused objects to persist between location changes

### Known Issues
- Performance spikes may occur when switching cities or environments
- Occasional terrain and road alignment edge cases remain
- FPS may vary depending on hardware and browser
- Road elevation issues causing clipping or z-fighting in some areas
- Inconsistent grounding behavior when switching cities
---
Most recently updated on 02/10/26
