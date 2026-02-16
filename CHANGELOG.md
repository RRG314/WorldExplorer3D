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
- Title-screen benchmark mode controls for `RDT` vs `Baseline` switching.
- Benchmark snapshot export and optional in-game live perf overlay controls.
- Auto quality manager in `perf.js` with FPS/frame-time spike-aware tiering (`performance` / `balanced` / `quality`).
- Dynamic load-profile and LOD scaling path in `world.js` driven by runtime quality budget state.
- Shareable experience links in `ui.js` (`Copy Experience Link`) with URL import for seed/location/mode/camera context.
- Overpass fetch telemetry fields in snapshots (`overpassSource`, `overpassEndpoint`, `overpassCacheAgeMs`).
- In-memory Overpass response cache with endpoint preference reuse for faster repeat loads.
- Title launch mode row (`Earth`, `Moon`, `Space`) in the start menu.
- Kuiper belt simulation layer in `solar-system.js` with region HUD context.
- Explicit visual belt bands for both asteroid and Kuiper belts for reliable visibility.
- Clickable galaxy catalog (RA/Dec-positioned) with deep-sky info panel support.
- Start-menu Controls tab coverage for space-flight keys and interactions.
- Persistent memory marker module (`js/memory.js`) for placeable pin/flower notes (200-char limit).
- In-world memory marker removal flow (`Remove Marker`) to erase pins/pull flowers.
- Memory composer bulk-delete action (`Delete All`) with confirmation.
- Memory pin/flower overlay rendering on minimap and large map.
- Legend-layer checkboxes for memory `Pin` and `Flower` overlays.
- Brick block builder module (`js/blocks.js`) with in-world place/stack/remove controls.
- Persistent per-location build-block storage (`worldExplorer3D.buildBlocks.v1`) with runtime status hook (`getBuildPersistenceStatus()`).
- Security/storage notice document for persistent memory behavior and disclaimer boilerplate.
- Touch-first control profiles for mobile across driving, walking, drone, and rocket modes.
- Expanded share entry points: title-footer icon rail, in-game share quick menu, and coordinate-readout click-copy.
- Moon-only low-gravity terrain airborne handling for lunar driving over hill/crater transitions.
- Moon runtime stabilization documentation coverage in `TECHNICAL_DOCS.md` and `SYSTEMS_INVENTORY_REPORT_2026-02-14.md` (desktop validation + scene-isolation notes).

### Changed
- Technical documentation examples now show deterministic RNG usage patterns aligned with the `rdt.js` seeded runtime helpers.
- README, QUICKSTART, CONTRIBUTING, and DOCUMENTATION_INDEX are now aligned with the current branch architecture and source-available all-rights-reserved license model.
- Restored main-style location selection behavior (`Custom` card + suggested city cards) and integrated launch-mode toggles at top of Location tab.
- Expanded deep-space render envelope: farther star shell, farther galaxy placement, larger visual galaxy scale.
- Space info panel metric rows are now reusable for planets, asteroids, spacecraft, and galaxies.
- POI map rendering now follows legend category filters on both minimap and large map.
- Dynamic map/property/historic UI templates now escape untrusted string fields before insertion.
- Top benchmark/debug overlays now auto-anchor between top HUD widgets to avoid overlap with controls.
- Module loader cache-bust chain incremented through `v=54` (`index.html`, `bootstrap.js`, `manifest.js`, `app-entry.js`).
- Core docs now include benchmark workflow instructions and supporting measured stats for RDT vs baseline and cache-backed repeat loads.
- Documentation set refreshed to match current control surfaces, mobile touch layouts, and share UI paths.

### Fixed
- Non-responsive title menu interactions for suggested/custom selection after UI rework.
- Belt rendering visibility issues caused by distance attenuation and low-contrast boundary rings.
- Stale client asset issues caused by outdated cache-bust query strings after pushes.
- False-positive "persistent" memory behavior when browser storage is unavailable (marker placement now gated by storage round-trip check).
- Large-map POI click handling blocked by old POI-mode gate even when legend filters were enabled.
- Build blocks being wiped during world reload instead of rehydrating from storage.
- Walking physics not treating placed build blocks as climbable/standable collision surfaces.
- Missing hard cap for user-placed build blocks (now limited to 100).
- Walking-mode HUD street label not showing the active/nearest road name.
- Redundant global delete-all blocks menu option (kept existing clear-current-location flow only).
- Memory markers rendering at terrain ground instead of top surface when placed on roofs/blocks.
- Load regressions caused by partial retry accumulation after runtime errors in world-load passes.
- World-load failure path where batching errors could abort load completion instead of recovering.
- Intermittent stale-client behavior after hotfix pushes due to cache-bust drift (resolved with aligned loader version updates).
- Share-link parsing bug where missing `lat/lon` could coerce to `0` and incorrectly force custom location payloads.
- Pre-start share-link copy path now preserves pending mode/camera/seed state loaded from URL parameters.
- Earth driving physics no longer applies moon-style low-gravity airborne terrain behavior (now moon-only as intended).
- Desktop moon transition no longer leaks Earth world meshes into moon view after async load completion (roads/buildings/landuse/POIs/furniture are now force-suppressed while moon/space is active).
- Moon/space load race handling now prevents late Earth-load passes from re-attaching city meshes during non-Earth environments.
- Desktop lunar driving now consistently triggers low-gravity airborne float behavior over subtle crater/hill transitions (updated launch thresholds + raycast matrix sync).
- Moon terrain readability improved with stronger local relief near spawn, slope-aware shading, and denser lunar rock cues for movement depth perception.

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
Most recently updated on 02/16/26
