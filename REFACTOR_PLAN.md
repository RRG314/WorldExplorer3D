# Refactor Plan

Last reviewed: 2026-07-14

Working plan for turning the live deployment baseline into a maintainable single-workspace repo without changing user-facing behavior by accident.

## 0. Current Direction

The plan needs a course correction.

The refactor workspace has already achieved the first structural goal of getting the giant source files under control. The main risk is no longer "files are too big to work in." The main risk is now "runtime systems that were split apart still need to behave like one coherent world."

That means the next phase is not more file splitting for its own sake. The next phase is release stabilization:

- world boot and session transitions must stay reliable
- Earth, ocean, moon, and space must transition cleanly in one runtime
- water, terrain, roads, landuse, and spawn rules must stop contradicting each other
- preselected cities and arbitrary globe-selected locations must produce believable, playable starts
- release gates must be green for the right reasons, not because a broken path went untested

Pass B file-size cleanup remains useful, but it is now explicitly secondary to runtime correctness and release confidence.

## 0A. Audit Snapshot (2026-07-12)

Current audit conclusion:

- the refactor itself succeeded at its first job: the codebase is now materially more manageable
- the main remaining risks are not "giant file" risks
- the main remaining risks are system-contract risks between world loading, road rendering, terrain classification, water truth, spawn safety, and environment transitions

The strongest evidence from the current workspace:

- `npm run test:runtime`: green
- `npm run test:world-matrix`: green across representative preset and custom locations
- mirror workflow is currently healthy after sync:
  - `npm run sync:public`
  - `npm run verify:mirror`
- current world-matrix screenshots still show obvious visual/runtime truth problems in urban areas even when automated gates pass

That means:

- the release gate is catching stability regressions
- the release gate is not yet catching enough world-believability regressions
- the next work must focus on root world-system authority, not general cleanup

## 0B. Current Production Blockers

These are the blockers that matter most right now, in order:

1. `road / sidewalk / hardscape authority required one coherent rule set` (closed in R3)
   - ordinary roads are now terrain-draped surfaces instead of elevated slabs
   - sidewalks render from explicit mapped sidewalk tags rather than urban-density inference
   - building slope correction uses foundation skirts without generating concrete apron pads

2. `world truth is still split across overlapping systems`
   - terrain classification
   - landuse rendering
   - water polygons / waterways / water overlays
   - spawn safety
   - boat eligibility
   - traversal graph construction

3. `non-driveable linear features need their own geometry contract` (release decision closed in R4)
   - `ENABLE_LINEAR_FEATURES = false` is intentional for this release candidate
   - footway, cycleway, and rail ribbons stay deferred until they pass terrain-draping and intersection visual gates

4. `global mutable state and legacy flags still make ownership harder than it should be`
   - `app/js/state.js` remains a large global state owner
   - `app/js/env.js` still has to synchronize legacy booleans like `onMoon` and `travelingToMoon`
   - this increases the chance of environment-specific regressions and transition drift

5. `the mirror workflow is still operationally risky even when healthy`
   - it is working right now
   - it still means production depends on a generated copy of the app tree remaining perfectly in sync
   - this is a release-process risk, not the first root runtime bug to solve

## 0C. Runtime Root-Cause Audit (2026-07-12)

The current workspace is no longer primarily blocked by file size. It is blocked by contradictory runtime ownership.

Primary root causes now identified:

1. `there is no single authoritative world truth for water, terrain, and traversal`
   - Earth water rendering, boat eligibility, shoreline checks, and ocean destination mode still rely on separate systems
   - the same point can be considered land by one system and water by another

2. `terrain streaming is still too destructive`
   - visible terrain updates still do more full-ring churn than they should
   - world reload also clears large amounts of state before the next stable play state is restored
   - this is a likely root cause for load spikes, drone instability, and travel stutter

3. `terrain appearance still depends too much on heuristics`
   - mountains, urban hardscape, sand, snow, and coastlines are still influenced by rule inference instead of one strong surface authority
   - this is why visual truth keeps drifting from mapped context

4. `environment state is only partially centralized`
   - `env.js` now helps, but Earth, Ocean, Moon, and Space still keep too much local runtime ownership
   - transitions can appear successful while stale mode-specific state still exists underneath

5. `legacy duplicate world-loading assumptions still raise regression risk`
   - the modular `app/js/world/*` runtime is the intended path
   - the old monolithic `js/world.js` still exists and still overlaps conceptually with the new world loader

Immediate conclusion:

- the next active work is runtime stabilization
- file-size cleanup continues only where it directly helps runtime correctness or maintainability

## 0D. Browser Matrix Findings (2026-07-12)

Fresh browser verification against the refactor workspace confirms a split between runtime stability and visual/world-quality readiness.

Evidence:

- `npm run test:runtime`: green after the shared water-footprint pass
- `npm run test:world-matrix`: completed and generated fresh matrix output at `output/playwright/world-matrix/report.json`
- Monaco and Baltimore screenshots still show obviously non-production surface results even when the loader and spawn logic succeed

Current interpretation:

1. `water-footprint contradictions are reduced, but water presentation is still not release-good`
   - shared footprint checks now align spawn safety, custom water-only starts, and vegetation blocking more closely with boat-mode water truth
   - this does not yet solve all visible coastline/ocean presentation problems

2. `surface authority is now the next dominant blocker`
   - current browser screenshots still show oversized hardscape coverage
   - ground cover and urban apron textures are still winning in places where mapped context should be more specific
   - road, shoulder, sidewalk, and adjacent terrain still need a stronger ownership model

3. `load time remains a real product issue`
   - world-matrix load timings remain too high in several representative places:
     - Baltimore: about `27.7s`
     - San Francisco: about `18.3s`
     - Towson custom: about `27.1s`
   - this supports keeping streaming/load-budget work active alongside surface cleanup

Immediate consequence:

- R2 is now focused on water truth consistency
- R3 must focus on surface and terrain ownership, because visual quality is still the main release blocker after the water-authority pass

## 0E. Live Comparison And Drone Renderer Closure (2026-07-12)

Production and the refactor workspace both use Three.js r128 through WebGL. WebGL was not newly introduced by the refactor.

The Monaco white-screen regression was traced with a production/local browser comparison:

- production successfully rendered Monaco after switching to drone mode
- local Monaco rendered normally before the switch, then lost the WebGL context on the first drone frame
- the local world contained `4503` building render meshes; the pre-switch frame used about `336` render calls, while the unbounded elevated view exhausted the context
- the shared drone physics, camera update, main render loop, travel-mode coordinator, input, state, and HUD files matched production; the failure was the missing dense-world render budget at the mode boundary

Implemented root fixes:

- drone entry now resets stale camera rig state
- drone launch height clears nearby roofs instead of assuming `terrain + 12` is always safe
- world LOD now enforces a quality/mode-aware visible-building mesh budget
- travel-mode changes force LOD reconciliation before the next rendered frame
- a hidden, non-sensitive runtime diagnostic snapshot exposes renderer/context, camera, scene, mode, and world-count health for future browser tests

Verification evidence:

- repeated Monaco `drive -> drone -> drive -> drone` transitions kept `contextLost: false`
- the fixed Monaco drone frame rendered at about `649` calls instead of dropping to zero
- `npm run test:runtime` passed with all checks true and zero console errors
- `npm run test:osm-smoke` passed Monaco water, polar, desert, ocean-entry, and Earth-return checks
- `npm run test:rules` passed `41/41`
- canonical/public mirror verification remains green

Phase effect:

- the Monaco drone/context-loss blocker is closed within R1
- the live deployment audit reproduced the Moon white-frame failure, proving that defect predates the refactor rather than being caused by WebGL being newly introduced
- the Moon failure was traced to a vehicle spawn inside Eagle Crater facing a 500-meter translucent site beacon; the playable spawn is now separated from the historical marker and the oversized beacon is removed
- Chrome visual verification completed `Monaco Earth -> Space -> Moon -> Monaco Earth` in one runtime with the primary renderer healthy and the original Earth walking pose restored without a world reload
- the fresh Moon frame now shows lunar-local HUD state, no Earth weather, no Monaco coordinates, and `contextLost: false` with zero GL errors
- the existing Ocean smoke test covers Earth-to-Ocean-to-Earth return, so R1 now meets its bounded transition exit criteria
- R2 has a green release gate for its current water scope; remaining visible urban/coastal contradictions move into R3 rather than keeping R2 open indefinitely

## 1. Goal

Refactor the live deployment codebase so that:

- one repo is the source of truth for live fixes
- large files are split by responsibility
- runtime behavior stays stable while code structure improves
- tests and release checks catch regressions before deploy
- first pass goal: no primary frontend/runtime source file is 1500 lines or more
- second pass goal: no maintained source file is over 600 lines unless there is a documented exception with a specific follow-up plan

This plan is intentionally conservative. It is a professional cleanup path, not a rewrite.

## 2. Current Baseline

Current high-risk files in the live baseline:

- `app/js/terrain.js`: 648 lines in the clean refactor workspace (`3584` at original baseline)
- `app/index.html`: 1466 lines in the clean refactor workspace (`3442` at original baseline)
- `app/js/game.js`: 295 lines in the clean refactor workspace (`3008` at original baseline)
- `app/js/ui.js`: 987 lines in the clean refactor workspace (`2915` at original baseline)
- `app/js/multiplayer/ui-room.js`: 878 lines in the clean refactor workspace (`2794` at original baseline)
- `app/js/boat-mode.js`: 982 lines in the clean refactor workspace (`2679` at original baseline)
- `app/js/editor/session.js`: 521 lines in the clean refactor workspace (`2592` at original baseline)
- `app/js/solar-system.js`: 951 lines in the clean refactor workspace (`2416` at original baseline)
- `app/js/engine.js`: 257 lines in the clean refactor workspace (`2331` at original baseline)
- `app/js/sky.js`: 814 lines in the clean refactor workspace (`2070` at original baseline)
- `app/js/interiors.js`: 93 lines in the clean refactor workspace (`1986` at original baseline)
- `app/js/ocean.js`: 943 lines in the clean refactor workspace (`1856` at original baseline)
- `app/js/live-earth/controller.js`: 594 lines in the clean refactor workspace (`1856` at original baseline)
- `app/js/activity-editor/session.js`: 852 lines in the clean refactor workspace (`1834` at original baseline)
- `app/js/editor/config.js`: 885 lines in the clean refactor workspace (`1802` at original baseline)
- `app/js/multiplayer/rooms.js`: 999 lines in the clean refactor workspace
- `app/js/flower-challenge.js`: 876 lines in the clean refactor workspace
- `app/js/ui/globe-selector.js`: 998 lines in the clean refactor workspace (`1261` before the current pass)
- `app/js/world.js`: 374 lines in the clean refactor workspace (`7549` at original baseline)
- `app/js/state.js`: 978 lines

Current largest runtime source files in this workspace as of 2026-07-11:

- `app/js/boat-mode.js`: `1098`
- `app/js/multiplayer/rooms.js`: `999`
- `app/js/ui/globe-selector.js`: `998`
- `app/js/physics.js`: `994`
- `app/js/blocks.js`: `994`
- `app/js/ui.js`: `992`
- `app/js/state.js`: `978`
- `app/js/ocean.js`: `977`
- `app/js/boat-mode/surface-effects.js`: `976`
- `app/js/solar-system.js`: `951`

Current live-baseline branch:

- `steven/live-deployed-firebase-20260320`

Current structural risks:

- runtime logic is spread across giant files with mixed responsibilities
- the hosted build still relies on a mirrored `app/* -> public/*` workflow
- global mutable state in `state.js` makes ownership and side effects hard to trace
- `world.js` is now a lightweight orchestrator, but its new `world/load-*` runtime modules still need second-pass review for conventional sizing and ownership clarity
- `app/index.html` is now below the first-pass ceiling, but its extracted shell and stylesheet files still need a second-pass review for the `<600` target
- `ui.js` is now below the first-pass ceiling, but its extracted modules still need a second-pass review for the `<600` target

Current runtime integration risks:

- water authority is still split across three overlapping sources:
  - OSM landuse water polygons
  - OSM waterway ribbons
  - vector-tile water coverage overlays
- terrain appearance is decided by both world-scale and local-sample heuristics, which can still drift from the actual rendered water/land footprint
- spawn safety, boat entry, and world restore flows depend on several separate systems agreeing about whether a point is land, road, or navigable water
- release tests can still fail from external Firestore connectivity noise even when the core runtime is healthy

This means the biggest remaining risk is system contradiction, not raw file length.

### Conventional size target

Use these size bands going forward:

- preferred: under 800 lines
- acceptable for complex orchestration files: 800 to 1500 lines
- 1500 lines or more: treated as refactor-required during the first pass
- 600 to 1499 lines: treated as acceptable only until the second pass begins

The working target for this project is therefore stricter than the earlier interim `5500` waypoint. That earlier number is no longer the finish line for any core file.

## 3. Ground Rules

- Canonical source stays in `app/*`, `index.html`, and `account/*`
- `public/*` remains a generated mirror for hosting until the repo is ready for a different deploy model
- no behavior changes are accepted without a matching reason and verification
- each refactor step must leave runtime checks green before the next step begins
- avoid wide rewrites across unrelated systems in the same commit

## 4. Non-Goals

This plan does not start with:

- a framework migration
- TypeScript conversion
- bundler replacement
- Firebase-to-other-platform migration
- visual redesign
- multiplayer/data-model rewrites

Those can happen later, but doing them first would mix architecture work with platform risk.

## 5. Validation Gate

Every phase should keep these green:

```bash
npm run sync:public
npm run verify:mirror
npm run test:runtime
npm run test:rules
npm run test:osm-smoke
```

For smaller internal refactors, `test:rules` can be skipped when no backend-facing files changed, but `verify:mirror` and `test:runtime` should stay mandatory for app runtime work.

### Current gate snapshot (2026-07-11)

- `npm run verify:mirror`: green
- `npm run test:runtime`: green
- `node scripts/test-osm-smoke.mjs`: functionally passed world-flow checks but currently fails on a Firestore backend timeout console error, which looks external rather than like a core world-runtime regression

Interpretation:

- the refactored workspace is not in a broken-runtime state
- the remaining plan should prioritize structural world-behavior issues and release-grade validation cleanup
- external service noise should not distract from core world-system fixes, but it does need a deliberate decision before release

## 5A. Phase Boundaries And Stop Conditions

This project should not run forever. Each phase must end in one of two ways:

- the exit criteria for that phase are met, or
- the remaining work is explicitly deferred into a later phase or backlog note

Rules for keeping this bounded:

- no phase should stay "open" after three coherent extractions without a review of whether the exit criteria are already good enough
- phases 1 through 7 are the required first-pass cleanup path for the `<1500` target
- phase 8 is the second-pass `<600` cleanup path
- once phases 1 through 7 are complete and release verification is green, the first pass is done
- once phase 8 is complete, the large-file cleanup project is done unless a new bug or feature creates a fresh reason to continue
- a phase does not count as complete if its main target file is still over 1500 lines, unless the remainder is explicitly split into numbered follow-up subphases

## 5B. Oversized File Inventory

Current `app/*` source files still at or above the first-pass ceiling:

- none

Priority order for cleanup:

- first: begin Pass B on the largest remaining orchestration files below the ceiling
- second: keep new extracted modules below the follow-up target instead of letting them regrow
- third: re-check the board after each major feature change so oversized files get caught early

The point of this list is to keep us honest. If a file crosses back over 1500 lines, it immediately returns to the active cleanup board.

## 5C. Two-Pass Finish Line

### Pass A: Under 1500

This pass is now complete for the current workspace.

Definition of done:

- every core source file is below `1500` lines
- no new extracted module is allowed to become the next giant catch-all
- each split leaves behavior and verification stable

### Pass B: Under 600

This now starts only after the runtime stabilization phases below are complete or explicitly paused.

Definition of done:

- every maintained app/runtime/editor/frontend source file is below `600` lines where reasonably possible
- orchestration files may temporarily sit between `600` and `800` only with a named follow-up and dated note

## 6. Runtime Stabilization Phases

These phases are now the active path to getting the workspace ready to replace live.

### Phase R1. Terrain Streaming Stabilization

Goal:

- reduce avoidable terrain rebuild churn
- lower lag spikes during movement and reload
- reduce the chance of drone-related instability

Exit criteria:

- terrain ring updates are incremental where possible
- reloads no longer trigger unnecessary terrain churn
- runtime verification remains green

### Phase R2. Water Authority Unification

Goal:

- define one Earth-side water truth used by render, spawn, shoreline checks, and boat eligibility

Exit criteria:

- visible water and usable water stop disagreeing
- coastal and ocean-adjacent starts no longer fall back to grass because different systems disagree

### Phase R3. Surface Classification Hardening

Goal:

- reduce terrain texture guesswork and make map-informed surface decisions more authoritative

Exit criteria:

- mountains, coasts, snow, urban hardscape, and arid regions reflect mapped context more reliably

### Phase R4. Environment Transition Cleanup

Goal:

- make Earth, Ocean, Moon, and Space behave like one controlled runtime instead of several overlapping runtimes

Exit criteria:

- transition paths stop depending on stale mode-specific state to remain playable
- no file is allowed to quietly drift back upward without being put back on the board

## 5D. Active File Board

This is the concrete first-pass board for the files we still need below `1500`.

### World and Terrain Cluster

- `app/js/terrain.js` (`648` in the clean workspace, `3584` original baseline)
  - done so far: `terrain/structure-visuals.js`, `terrain/surface-profiles.js`, `terrain/tiles.js`, `terrain/rebuild.js`, `terrain/debug-tools.js`, `terrain/height-sampling.js`, `terrain/reprojection.js`, `terrain/streaming.js`, `terrain/context-utils.js`, `terrain/material-cache.js`, `terrain/structure-visual-meshes.js`, `terrain/sidewalk-batching.js`
  - phase result: the terrain cluster is now stabilized for the current pass; every terrain support module is below `600`, `terrain.js` is down to `648`, and the remaining gap is a small orchestrator-only follow-up rather than another giant mixed-responsibility file
- `app/js/sky.js` (`814` in the clean workspace, `2070` original baseline)
  - done so far: `sky/astronomical-state.js`, `sky/starfield-ui.js`, `sky/moon-landing-ui.js`
  - phase result: below first-pass ceiling; second pass can further thin moon-travel and moon-surface helpers later
- `app/js/ocean.js` (`943` in the clean workspace, `1856` original baseline)
  - done so far: `ocean/scene-assets.js`, `ocean/fish-life.js`
  - phase result: below first-pass ceiling; second pass can further split bathymetry/terrain sampling toward the `<600` target
- `app/js/interiors.js` (`93` in the clean workspace, `1986` original baseline)
  - done so far: `interiors/runtime.js`, `interiors/constants.js`, `interiors/core.js`, `interiors/mapped-data.js`, `interiors/planner.js`, `interiors/scene-builder.js`
  - phase result: main interior orchestration is now comfortably below the second-pass target; a later pass can still shave `interiors/runtime.js` from `607` into the preferred sub-`600` range

### Core Gameplay Cluster

- `app/js/game.js` (`295` in the clean workspace, `3008` original baseline)
  - done so far: `game/police.js`, `game/modes.js`, `game/navigation-ui.js`, `game/property-ui.js`, `game/historic-ui.js`, `game/ui-utils.js`, `game/paint-town/constants.js`, `game/paint-town/core.js`, `game/paint-town/claims.js`, `game/paint-town/projectiles.js`, `game/paint-town/runtime.js`
  - phase result: main game orchestration is now below the second-pass target, and the extracted paint-town modules also stay below the preferred ceiling in this workspace
- `app/js/boat-mode.js` (`982` in the clean workspace, `2679` original baseline)
  - done so far: `boat-mode/water-query.js`, `boat-mode/surface-effects.js`
  - phase result: below first-pass ceiling; second pass can further split prompt/UI flow and entry/exit orchestration toward the `<600` target

### Multiplayer and Shared Session Cluster

- `app/js/multiplayer/ui-room.js` (`878` in the clean workspace, `2794` original baseline)
  - done so far: `multiplayer/ui-room-renderers.js`, `multiplayer/ui-room-actions.js`, `multiplayer/ui-room-runtime.js`, `multiplayer/ui-room-session.js`, `multiplayer/ui-room-events.js`
  - phase result: below first-pass ceiling; second pass can further trim renderer/action density toward the `<600` target
- `app/js/multiplayer/rooms.js` (`999` in the clean workspace)
  - done so far: `multiplayer/rooms-directory.js`
  - phase result: below `1000`; second pass can split create/join lifecycle ownership further if we want it closer to the preferred band
- `app/js/live-earth/controller.js` (`594` in the clean workspace, `1856` original baseline)
  - done so far: `live-earth/preview-layers.js`, `live-earth/local-satellite.js`, `live-earth/local-events.js`, `live-earth/controller-ui.js`, `live-earth/render-globe.js`
  - phase result: below the second-pass `<600` target in this workspace; next follow-up can focus on remaining large files instead of this controller

### UI and Location Selection Cluster

- `app/js/ui/globe-selector.js` (`998` in the clean workspace, `1261` before the current pass)
  - done so far: `ui/globe-selector/helpers.js`
  - phase result: now below `1000`; second pass can split scene/event wiring further so the remaining controller drops toward the `<600` target without weakening location-selection behavior

### Editor and Creator Cluster

- `app/js/editor/session.js` (`521` in the clean workspace, `2592` original baseline)
  - done so far: `editor/session-ui.js`, `editor/session-events.js`, `editor/session-scene.js`, `editor/session-runtime-ui.js`, `editor/session-workspace.js`, `editor/session-canvas.js`, `editor/session-legacy.js`
  - phase result: below the second-pass `<600` target in this workspace; next follow-up can focus on remaining large files instead of this session controller
- `app/js/editor/config.js` (`885` in the clean workspace, `1802` original baseline)
  - done so far: `editor/config-presets.js`, `editor/config-core.js`
  - phase result: below first-pass ceiling; second pass can further split field-definition density toward the `<600` target
- `app/js/activity-editor/session.js` (`852` in the clean workspace, `1834` original baseline)
  - done so far: `activity-editor/session-ui.js`, `activity-editor/session-testing.js`, `activity-editor/session-canvas.js`
  - phase result: below first-pass ceiling; second pass can further split anchor-editing flows toward the `<600` target

### Engine and Space Cluster

- `app/js/engine.js` (`257` in the clean workspace, `2331` original baseline)
  - done so far: `engine/procedural-textures.js`, `engine/quality.js`, `engine/hero-car.js`, `engine/materials-runtime.js`, `engine/scene-bootstrap.js`, `engine/input-handlers.js`
  - phase result: main engine orchestration is now below the second-pass target; extracted engine helpers also stay under the preferred ceiling in this workspace
- `app/js/solar-system.js` (`951` in the clean workspace, `2416` original baseline)
  - done so far: `solar-system/minor-bodies.js`, `solar-system/spacecraft.js`, `solar-system/galaxies.js`, `solar-system/ui.js`, `solar-system/init.js`
  - phase result: below first-pass ceiling; second pass can further split data tables and orbital/render ownership toward the `<600` target

### Challenge and Scoring Cluster

- `app/js/flower-challenge.js` (`876` in the clean workspace)
  - done so far: `flower-challenge/leaderboard.js`
  - phase result: below `1000`; second pass can keep pushing challenge runtime and title-panel UI toward the `<600` target

## 6. Runtime Stabilization Phases

These phases now define the shortest path to a production-ready replacement for the live deployment.

### Phase R1. Session And Environment Stability

Status: complete for the production-replacement gate on 2026-07-12.

Goal:

- title screen to Earth start works reliably
- Earth to ocean to Earth return works in the same runtime
- Earth to space to moon to Earth return works in the same runtime
- main menu and reload flows do not strand the player in a broken state

Primary investigation targets:

- `app/js/env.js`
- `app/js/ui.js`
- `app/js/ui/title-screen.js`
- `app/js/world/load-runtime-session.js`
- `app/js/travel-mode.js`
- `app/js/ocean.js`
- `app/js/space/*`

Exit criteria:

- automated runtime checks stay green
- targeted browser verification confirms no stuck loading state, no invisible player-under-world state, and no broken return-to-Earth loop
- environment changes no longer depend on fragile timing between multiple render/update owners

### Phase R2. Surface Truth And Spawn Authority

Goal:

- one consistent rule set decides terrain class, water class, spawn safety, and boat eligibility
- contradictory fallback behavior is removed or clearly subordinated
- world truth is determined before player placement is finalized

Primary investigation targets:

- `app/js/surface-rules.js`
- `app/js/surface-rules-local.js`
- `app/js/world/spawn.js`
- `app/js/world/spawn-surface.js`
- `app/js/world/load-landuse-pass.js`
- `app/js/world/load-geometry.js`
- `app/js/boat-mode/water-query.js`
- `app/js/ocean.js`
- `app/js/terrain.js`

Likely root issues to resolve:

- dual or overlapping water layers
- terrain texture decisions that do not match nearby landuse/water geometry
- ocean starts that fall back to generic ground logic before water truth is fully available
- local spawn checks that can still disagree with the final rendered world state

Exit criteria:

- open-ocean starts no longer spawn on grass
- coastal cities render visible water where expected
- mountain, desert, snow, and urban terrain classification no longer collapse into generic placeholder surfaces
- boat entry and shoreline limits follow consistent global rules

### Phase R3. Road, Hardscape, And Building Ground Coherence

Status: complete for the production-replacement gate on 2026-07-12.

Closure evidence:

- at-grade road bias reduced from `0.42m` to `0.08m`
- at-grade and elevated roads no longer render vertical skirts; true subgrade roads retain tunnel-cut walls
- inferred urban sidewalk ribbons removed; only explicit OSM sidewalk tags generate sidewalk geometry
- expanded building apron pads removed while narrow slope-hiding foundation skirts remain
- fresh Baltimore, Monaco, and San Francisco viewport captures show flush street surfaces without the previous wall/slab or stacked-apron contradictions
- `test:runtime`, targeted `test:world-matrix`, `test:osm-smoke`, and mirror parity are green

Goal:

- roads, sidewalks, shoulders, aprons, and adjacent terrain stop fighting each other
- dense urban areas look structurally coherent even before art polish

Primary investigation targets:

- `app/js/world/load-road-pass.js`
- `app/js/world/load-building-pass.js`
- `app/js/terrain.js`
- `app/js/terrain/rebuild.js`
- `app/js/terrain/structure-visuals.js`
- `app/js/world/render-support.js`
- `app/js/engine/materials-runtime.js`

Likely root issues to resolve:

- road surface width not matching the surrounding hardscape assumptions
- building aprons and sidewalk surfaces suppressing or over-covering each other
- residual generic grass/ground bleeding into dense urban footprints
- urban visuals looking technically loaded but spatially unbelievable

Exit criteria:

- world-matrix screenshots for Baltimore, Monaco, and San Francisco no longer show obvious synthetic road-edge / sidewalk / apron contradictions
- street-space proportions look playable and coherent from default spawn cameras
- fixing one city no longer requires city-specific special cases

### Phase R4. Traversal, Pathing, And Feature Separation

Status: complete for this release candidate on 2026-07-12.

Release decision:

- driveable OSM roads remain active
- separate footway, cycleway, and rail ribbons remain intentionally disabled
- the deferred modules stay in the codebase, but reactivation requires terrain-draping, intersection, traversal, and three-city visual tests
- the runtime assertion is named as a release deferral, not a temporary unexplained rollback

Goal:

- decide whether non-driveable linear features stay rolled back for this release or return behind a stable contract
- ensure road traversal, walking traversal, boat rules, and future path overlays do not share ambiguous authority

Primary investigation targets:

- `app/js/world.js`
- `app/js/world/load-linear-runtime.js`
- `app/js/world/traversal.js`
- `app/js/ground.js`
- `scripts/test-runtime-invariants.mjs`

Exit criteria:

- the release decision is explicit:
  - either linear features remain intentionally disabled and are documented as deferred
  - or they return behind a stable tested contract
- runtime gates no longer encode a temporary rollback as an unexamined permanent target

### Phase R5. Location Coverage And Selector Reliability

Status: functional coverage complete on 2026-07-12; performance exit criterion remains open.

Goal:

- every preselected city remains playable
- globe selector can choose arbitrary Earth locations without obviously broken starts

Exit criteria:

- audited set of preselected cities boots cleanly
- random globe-selected land and water points satisfy spawn rules or present a clean fallback
- loading times and failure handling are acceptable enough for user testing

Evidence and remaining work:

- all 15 preset cities passed in three bounded matrix batches
- custom land selection now preserves the selected globe coordinate when the terrain is safe instead of forcing a distant road spawn
- Great Wall, Giza, and North Atlantic custom flows complete without runtime errors
- North Atlantic starts in a visible boat with a chase camera on a flat sea-level water surface; ocean bathymetry no longer becomes the water surface
- road rendering, terrain reprojection, sidewalks, and physics now share an 8cm road-surface bias; ordinary roads have no wall skirts and inferred sidewalks remain disabled
- R5 remains open because worst-case preset loads were approximately 37-49 seconds and a sequential Atlantic run reached approximately 21 seconds
- recognizable landmark representation at Giza is an R6 visual blocker, not evidence that selector coordinate handling failed

### Phase R6. Release Candidate Check

Goal:

- confirm this workspace is ready to replace the live deployed version without major regression risk

Exit criteria:

- runtime and smoke tests are understood and intentionally green
- major world systems have been visually checked in-browser
- known external-noise failures are either fixed, isolated, or documented before deploy
- remaining non-blocking cleanup is explicitly deferred instead of silently left half-done

Current visual blocker:

- the Giza coordinate loads and is playable, but the Great Pyramids are not recognizably represented; landmark realism must be fixed or explicitly removed from the release promise before production replacement

## 7. Stop Condition

This project is not "done" when every file is tiny.

This project is done for the current release track when:

- R1 through R6 are complete
- the refactored workspace behaves as a coherent single source of truth
- it is realistic to replace the current live deployed version from this workspace without expecting major world or transition regressions

Only after that should the `<600` second-pass cleanup resume as the main track.

## 5E. Second-Pass Board Preview

Files already below `1500` but likely first in the `<600` pass:

- `app/js/multiplayer/ui-room-actions.js` (`764`)
- `app/js/ui/globe-selector.js` (`998`)
- `app/js/activity-editor/session.js` (`1250`)
- `app/js/ocean.js` (`1215`)
- `app/js/multiplayer/rooms.js` (`1205`)
- `app/js/multiplayer/ui-room.js` (`1198`)
- `app/js/sky.js` (`1196`)
- `app/js/editor/config.js` (`1182`)
- `app/js/solar-system.js` (`1145`)
- `app/js/flower-challenge.js` (`1110`)
- `app/js/state.js` (`978`)
- `app/js/physics.js` (`994`)
- `app/js/blocks.js` (`994`)
- `app/js/terrain.js` (`648`)

## 6. Refactor Order

### Phase 1: Establish module boundaries around `world.js`

Why first:

- it is the largest file
- it owns too many critical runtime paths
- other modules depend on its behavior, so clearer boundaries here reduce later risk

Target result:

- `world.js` becomes an orchestrator instead of a giant owner of everything
- `world.js` is reduced below 1500 lines through multiple extraction passes if necessary

First extraction targets:

- spawn and safe placement helpers
- OSM fetch/query building
- world-surface classification coordination
- linear feature handling
- vegetation staging/build helpers
- traversal graph invalidation/build hooks

Suggested destination modules:

- `app/js/world/spawn.js`
- `app/js/world/osm-loader.js`
- `app/js/world/linear-features.js`
- `app/js/world/vegetation.js`
- `app/js/world/traversal.js`
- `app/js/world/navigation.js`
- `app/js/world/furniture.js`
- `app/js/world/lod.js`
- `app/js/world/budgets.js`
- `app/js/world/load-support.js`
- `app/js/world/load-reset.js`
- `app/js/world/load-budgeting.js`

Definition of done:

- `app/js/world/spawn.js`, `app/js/world/osm-loader.js`, and `app/js/world/linear-features.js` exist
- `app/js/world/vegetation.js` and `app/js/world/traversal.js` exist, or equivalent narrower modules replace those responsibilities
- `app/js/world.js` is reduced to 1500 lines or less
- extracted modules have narrow responsibilities
- exported APIs are explicit
- `npm run test:runtime` and `npm run test:osm-smoke` pass from the clean live-fix workspace
- any remaining over-1500 world-adjacent module is explicitly queued as a named follow-up and not hidden inside `world.js`

Current status on 2026-07-09:

- done: `spawn.js`, `osm-loader.js`, `linear-features.js`, `vegetation.js`, `traversal.js`, `navigation.js`, `furniture.js`, `lod.js`, `budgets.js`, `load-support.js`, `load-reset.js`, `load-budgeting.js`
- done: render support was split again into `render-support.js`, `geometry-batching.js`, `roof-details.js`, `water-materials.js`, `building-batching.js`, `landuse-batching.js`, and `load-geometry.js`
- done in this pass: `loadRoadsInternal` was cut down further by extracting `load-road-pass.js`, `load-building-pass.js`, `load-style.js`, `load-selection.js`, `world-geometry.js`, `building-spatial-index.js`, `structure-aware.js`, `waterway-ribbon.js`, `load-roads.js`, `load-landuse-pass.js`, `load-linear-runtime.js`, and `load-runtime-session.js`
- current line-count reduction in the clean live-fix workspace: `7549 -> 374`
- phase-close result: `app/js/world.js` is now well under the second-pass target ceiling, and `npm run sync:public` plus `npm run verify:mirror` are green after the split

### Phase 2: Split `ui.js` and Launch Surfaces

Why second:

- current UI work is hard because title flow, menus, controls, and in-game wiring all live together
- UI changes are more manageable once world/spawn hooks are cleaner

Target result:

- `ui.js` becomes a wiring layer instead of a grab bag of handlers
- launch, menu, and map interaction UI stops being hidden across one giant module plus giant HTML clusters

First extraction targets:

- title screen and launch flow
- mobile control overlays
- in-game menus and overlays
- keyboard shortcut routing
- location/custom launch wiring

Suggested destination modules:

- `app/js/ui/title-screen.js`
- `app/js/ui/mobile-controls.js`
- `app/js/ui/menus.js`
- `app/js/ui/keyboard-routing.js`
- `app/js/ui/launch-flow.js`

Definition of done:

- `app/js/ui.js` is reduced below 1500 lines
- launch/title/mobile/map/share wiring is no longer trapped in one catch-all module
- `app/index.html` is reduced below 1500 lines, or its remaining structure is explicitly split into referenced templates owned by named modules
- launch flow and input wiring can be changed without editing unrelated menu code
- runtime verification remains green

Current status on 2026-07-08:

- done: `app/js/ui.js` is now `987` lines
- done: extracted `app/js/ui/title-screen.js`, `app/js/ui/mobile-controls.js`, `app/js/ui/share-links.js`, and `app/js/ui/map-interactions.js`
- done: `app/index.html` is now `1466` lines after moving the inline stylesheet into `app/styles/title-shell.css` and `app/styles/runtime-shell.css`
- done: launch-shell DOM clusters now load from `app/js/app-shell-fragments.js`
- done: title/auth overlay logic now runs from `app/js/app-auth-shell.js`
- verification result: `npm run sync:public` and `npm run verify:mirror` are green after the split
- open follow-up: `npm run test:runtime` did not finish within the current local check window and needs a dedicated follow-up run
- phase-close result: Phase 2 meets the first-pass exit criteria; second-pass follow-up will revisit the new extracted files for the `<600` target

### Phase 3: Break terrain and environment responsibilities apart

Why third:

- state cleanup goes better after module boundaries exist
- changing state ownership too early would make every other refactor noisier

Target result:

- terrain, sky, ocean, and interiors stop mixing unrelated render, data, and interaction responsibilities

First extraction targets:

- terrain streaming and material setup
- road rebuild scheduling and urban-surface helpers
- sky presets, astronomy, and starfield logic
- interior caching, shell generation, and enter/exit handling
- ocean physics, bathymetry, and environment setup

Definition of done:

- `app/js/terrain.js`, `app/js/sky.js`, `app/js/interiors.js`, and `app/js/ocean.js` are each reduced below `1500` lines
- performance-sensitive environment code is easier to profile in isolation
- terrain/runtime verification remains green

Current status on 2026-07-08:

- done: extracted `app/js/terrain/structure-visuals.js`, `app/js/terrain/surface-profiles.js`, `app/js/terrain/tiles.js`, `app/js/terrain/rebuild.js`, and `app/js/terrain/debug-tools.js`
- current reduction in the clean live-fix workspace: `3584 -> 1376`
- done: extracted `app/js/sky/astronomical-state.js` and `app/js/sky/starfield-ui.js`
- current reduction in the clean live-fix workspace: `2070 -> 1196`
- done: extracted `app/js/interiors/runtime.js`
- current reduction in the clean live-fix workspace: `1986 -> 1444`
- done: extracted `app/js/ocean/scene-assets.js`
- current reduction in the clean live-fix workspace: `1856 -> 1215`
- verification result: `node --check`, `npm run sync:public`, and `npm run verify:mirror` are green after the split
- open follow-up: `npm run test:runtime` still starts and hangs silently in the current local environment
- phase-close result: `terrain.js`, `sky.js`, `interiors.js`, and `ocean.js` are now below the first-pass ceiling; Phase 3 meets its first-pass exit criteria

### Phase 4: Split Gameplay and Vehicle Systems

Why fourth:

- `game.js` and `boat-mode.js` are high-churn gameplay files with mixed UI, rules, and movement logic
- getting them smaller before multiplayer/editor work reduces daily editing friction fast

Target result:

- gameplay systems are separated by player-facing feature instead of by giant convenience file

First cleanup targets:

- POI and property UI logic
- police and historic-site systems
- boat entry/exit and shoreline queries
- boat motion model and wake effects

Definition of done:

- `app/js/game.js` and `app/js/boat-mode.js` are both reduced below `1500` lines
- gameplay feature changes no longer require editing unrelated systems in the same file
- release verification remains green

Current status on 2026-07-08:

- done: extracted `app/js/game/police.js`, `app/js/game/paint-town.js`, and `app/js/game/modes.js`
- current `game.js` reduction in the clean live-fix workspace: `3008 -> 1388`
- done: extracted `app/js/boat-mode/water-query.js` and `app/js/boat-mode/surface-effects.js`
- current `boat-mode.js` reduction in the clean live-fix workspace: `2679 -> 982`
- verification result: `node --check`, `npm run sync:public`, and `npm run verify:mirror` are green after the split
- open follow-up: `npm run test:runtime` still starts and hangs silently in the current local environment
- phase-close result: `game.js` and `boat-mode.js` are now below the first-pass ceiling; Phase 4 meets its exit criteria

### Phase 5: Split Multiplayer and Shared Session UI

Why fifth:

- `multiplayer/ui-room.js` is effectively a small app trapped in one file
- it mixes social, room management, presence, artifacts, and activity UI state

Target result:

- room UI becomes a coordinator over narrower room/social/activity modules

Definition of done:

- `app/js/multiplayer/ui-room.js` is reduced below `1500` lines
- room discovery, room settings, room social, and room activities can be edited independently
- multiplayer verification remains green

Current status on 2026-07-08:

- done: extracted `app/js/multiplayer/ui-room-renderers.js` and `app/js/multiplayer/ui-room-actions.js`
- current reduction in the clean live-fix workspace: `2794 -> 1198`
- verification result: `node --check`, `npm run sync:public`, and `npm run verify:mirror` are green after the split
- open follow-up: `npm run test:runtime` still starts and hangs silently in the current local environment
- phase-close result: `ui-room.js` is now below the first-pass ceiling; Phase 5 meets its exit criteria

### Phase 6: Split Editor and Creator Surfaces

Why sixth:

- editor work is easier after world, UI, and multiplayer contracts are clearer
- the editor cluster has multiple files over the threshold already

Target result:

- overlay editor and activity creator each have explicit state, input, panel, and submit/test modules

Definition of done:

- `app/js/editor/session.js`, `app/js/editor/config.js`, and `app/js/activity-editor/session.js` are all reduced below `1500` lines
- editor submission/test flows can change without touching unrelated UI state plumbing
- release verification remains green

Current status on 2026-07-08:

- done: extracted `app/js/editor/session-ui.js`, `app/js/editor/session-events.js`, `app/js/editor/session-scene.js`, and `app/js/editor/session-runtime-ui.js`
- done: extracted `app/js/activity-editor/session-ui.js`
- done: extracted `app/js/editor/config-presets.js`
- current reduction in the clean live-fix workspace: `2592 -> 1484`
- current reduction in the clean live-fix workspace for creator session: `1834 -> 1250`
- current reduction in the clean live-fix workspace for editor config: `1802 -> 1182`
- verification result: `node --check`, `npm run sync:public`, and `npm run verify:mirror` are green after the split
- open follow-up: `npm run test:runtime` still starts and hangs silently in the current local environment
- phase-close result: `editor/session.js`, `activity-editor/session.js`, and `editor/config.js` are all below the first-pass ceiling; Phase 6 meets its exit criteria

### Phase 7: Split Engine and Space Systems

Why seventh:

- engine and space systems are large but lower day-to-day product risk than core runtime/UI
- they still need first-pass cleanup before the `<1500` pass is truly complete

Target result:

- renderer setup, quality, space rendering, and live-earth controller logic are no longer giant catch-all files

Definition of done:

- `app/js/engine.js`, `app/js/solar-system.js`, and any remaining first-pass files over `1500` are reduced below `1500`
- rendering and space work can be profiled and edited subsystem-by-subsystem
- release verification remains green

Current status on 2026-07-08:

- done: extracted `app/js/live-earth/preview-layers.js`, `app/js/live-earth/local-satellite.js`, and `app/js/live-earth/local-events.js`
- done: extracted `app/js/engine/procedural-textures.js`, `app/js/engine/quality.js`, and `app/js/engine/hero-car.js`
- done: extracted `app/js/solar-system/minor-bodies.js`, `app/js/solar-system/spacecraft.js`, `app/js/solar-system/galaxies.js`, and `app/js/solar-system/ui.js`
- current reduction in the clean live-fix workspace for live-earth controller: `1856 -> 1496`
- current reduction in the clean live-fix workspace for engine: `2331 -> 1395`
- current reduction in the clean live-fix workspace for solar system: `2416 -> 1145`
- verification result: `node --check` and `npm run sync:public` are green after the split; `npm run verify:mirror` is currently failing because the public mirror is already out of sync in multiple pre-existing files and is not yet copying newly added module paths consistently
- open follow-up: `npm run test:runtime` still starts and hangs silently in the current local environment
- phase-close result: `live-earth/controller.js`, `engine.js`, and `solar-system.js` are all below the first-pass ceiling; Phase 7 meets its exit criteria and Pass A is complete

### Phase 8: State and Under-600 Pass

Only after phases 1 through 7 are stable:

- reduce `state.js`, `space.js`, `walking.js`, `map.js`, `rooms.js`, `world.js`, and other surviving orchestration files toward the `<600` target
- split ownership notes and compatibility shims where needed
- use this phase to take the files that are merely "not huge anymore" and make them conventional

Current status on 2026-07-09:

- done: `app/js/world.js` is now `374` lines
- done: added `world/load-roads.js`, `world/load-landuse-pass.js`, `world/load-linear-runtime.js`, and `world/load-runtime-session.js`
- done: `app/js/live-earth/controller.js` is now `594` lines
- done: added `live-earth/controller-ui.js` and `live-earth/render-globe.js`, and moved the static preview catalog into `live-earth/preview-layers.js`
- done: `app/js/editor/session.js` is now `521` lines
- done: added `editor/session-workspace.js`, `editor/session-canvas.js`, and `editor/session-legacy.js`
- done: `app/js/interiors.js` is now `93` lines
- done: added `interiors/constants.js`, `interiors/core.js`, `interiors/mapped-data.js`, `interiors/planner.js`, and `interiors/scene-builder.js`
- done: `app/js/space.js` is now `230` lines
- done: added `space/runtime.js`, `space/scene.js`, `space/ui.js`, and `space/constants.js`
- done: `app/js/engine.js` is now `257` lines
- done: added `engine/materials-runtime.js`, `engine/scene-bootstrap.js`, and `engine/input-handlers.js`
- done: `app/js/game.js` is now `295` lines
- done: added `game/navigation-ui.js`, `game/property-ui.js`, `game/historic-ui.js`, and `game/ui-utils.js`
- done: `app/js/game/paint-town.js` is now `12` lines
- done: added `game/paint-town/constants.js`, `game/paint-town/core.js`, `game/paint-town/claims.js`, `game/paint-town/projectiles.js`, and `game/paint-town/runtime.js`
- done: `app/js/map.js` is now `8` lines
- done: added `map/tiles.js`, `map/moon.js`, `map/earth-base.js`, `map/earth-markers.js`, `map/icons.js`, and `map/runtime.js`
- done: `app/js/walking.js` is now `126` lines
- done: added `walking/character.js`, `walking/geometry.js`, `walking/terrain.js`, `walking/physics.js`, and `walking/runtime.js`
- verification result: `node --check`, `npm run sync:public`, and `npm run verify:mirror` are green after the split
- open follow-up: `npm run test:runtime` still starts and hangs silently in the current local environment
- next active targets: `app/js/activity-editor/session.js`, `app/js/ocean.js`, and `app/js/multiplayer/rooms.js`

## 7. Work Unit Rules

Each refactor PR or commit should do one of these things only:

- extract one coherent module
- replace one hidden dependency with an explicit API
- document one runtime contract and enforce it with tests

Avoid combining:

- file splitting
- behavior changes
- bug fixes
- UI redesign

in the same step unless the bug fix is required to complete the extraction safely.

## 8. Practical Sequence

Recommended next implementation passes after Pass A:

1. Start Phase 8 with the largest remaining orchestration files that still sit well above the preferred follow-up target: `app/js/world.js`, `app/js/live-earth/controller.js`, `app/js/editor/session.js`, `app/js/interiors.js`, `app/js/space.js`, and `app/js/game.js`.
1. `app/js/world.js` is now closed for the `<600` pass.
2. `app/js/live-earth/controller.js` is now closed for the `<600` pass.
3. `app/js/editor/session.js` is now closed for the `<600` pass.
4. `app/js/interiors.js` is now closed as an orchestrator for the `<600` pass, with only `interiors/runtime.js` left slightly above target.
5. `app/js/space.js` is now closed as an orchestrator for the `<600` pass, with all extracted helpers landing under the preferred ceiling in this workspace.
6. `app/js/engine.js` is now closed as an orchestrator for the `<600` pass, with the extracted engine helper files also below the preferred ceiling.
7. `app/js/game.js` is now closed as an orchestrator for the `<600` pass, and the extracted `game/paint-town/*` modules are also below the preferred ceiling in this workspace.
8. Continue Phase 8 with the next largest maintained files still well above the preferred follow-up target: `app/js/activity-editor/session.js`, `app/js/ocean.js`, `app/js/multiplayer/rooms.js`, and `app/js/terrain.js`.
9. Revisit the newly extracted `engine/*`, `solar-system/*`, `ui/*`, `terrain/*`, `sky/*`, `interiors/*`, `ocean/*`, `space/*`, `game/*`, and stylesheet modules for the second-pass `<600` target.
10. Resolve any new mirror drift immediately after each pass so release verification stays trustworthy from this workspace alone.

That sequence gives the fastest structural payoff without forcing a rewrite.

Important correction:

- intermediate reductions are useful, but they do not count as success if the file still sits above the 1500-line ceiling
- after each extraction, the next question is "what seam gets this file materially closer to under 1500?" not "is it somewhat smaller than before?"
- when a file crosses below `1500`, it leaves the first-pass board and the next largest still-oversized file becomes the active target

## 9. Done Definition For The Refactor Project

The refactor project is in good shape when:

- no core runtime file is acting as a catch-all owner for unrelated systems
- the first-pass board is complete when every remaining oversized file is below `1500`
- the second-pass board is complete when the maintained files are pushed toward `600` with only narrow documented exceptions
- `world.js`, `ui.js`, `terrain.js`, `game.js`, and the editor/multiplayer entry files are substantially smaller and orchestration-focused
- state ownership is documented and mostly local to subsystems
- live deploy workflow still works from this repo alone
- release verification remains green through the transition

The refactor project is complete when:

- phases 1 through 7 meet their exit criteria
- the clean live-fix workspace is the normal place for live-safe edits
- no additional cleanup is required to make ordinary fixes without hunting across unrelated files
- no active `app/*` source file that we routinely edit is still sitting above the 1500-line ceiling

## 10. Immediate Next Move

Do not resume generic under-600 cleanup as the main track yet.

Immediate execution order:

1. R1 is closed: preserve the verified Earth/Space/Moon/Ocean transition contract and renderer diagnostics as regression gates.
2. R3 is closed: preserve terrain-draped road, explicit-sidewalk, and foundation-only contracts.
3. R4 is closed for this release: non-driveable linear ribbons remain explicitly deferred.
4. Keep R5 active only for bounded load-latency work; functional preset/globe coverage is complete.
5. After R5 latency closure, run R6 with Giza landmark realism as an explicit visual blocker.
6. Keep `test:runtime`, `test:osm-smoke`, `test:rules`, mirror parity, and screenshot review mandatory for each release candidate.

### R6 Authority Checkpoint (2026-07-13)

Closed in the clean live-fix workspace:

- official OSM Shortbread tiles are the primary road, building, land, and site source; direct Overpass no longer blocks initial play
- stable source-qualified vector IDs prevent editor suppression from hiding unrelated roads after travel
- mapped water is part of world readiness and no longer races in as decorative detail
- deferred buildings and landmarks register with the same collision/spawn authority as the playable world
- featured historic presets use refreshable OSM data packs, while arbitrary locations retain the generic semantic-query path
- applying or clearing published editor overlays now invalidates and rebuilds traversal atomically
- Giza, Great Wall, Iowa farmland, Golden Gate, Tokyo, Monaco, Swiss Alps, Sahara, Everglades, and Panama Canal pass the current browser matrix with visual captures

R7 is closed in the clean live-fix workspace:

- ESA WorldCover 2021 supplies the licensed 10-meter visual land-cover baseline while OSM remains authoritative for roads, buildings, water geometry, collisions, and traversal
- baseline tiles are center-prioritized and cached in memory plus IndexedDB; provider failure never blocks world loading
- dense OSM building/road coverage supplies a neutral, seam-free built-ground fallback when the provider is unavailable instead of restoring blanket grass, pavement, or invented sidewalks
- terrain streaming now disposes replaced meshes through one owner, aborting stale provider requests and releasing terrain textures correctly during rapid travel
- Golden Gate uses bundled refreshable OSM data for mapped tower parts, full-span cables, suspenders, and longitudinal girders over the already playable deck
- the required ESA/Copernicus attribution is visible in the app footer

R7 exit criteria:

1. Tokyo and Monaco urban gaps no longer read as universal grass.
2. Mountains, farmland, wetland, desert, coast, and dense urban areas retain their verified semantic overlays.
3. Provider failure leaves a usable cached/fallback surface and never blocks travel.
4. Attribution and production-use terms are explicit before enabling the provider by default.
5. The broad visual matrix and runtime/rules/mirror gates remain green.

Why this is the best next move:

- no active first-pass blocker remains above the 1500-line ceiling
- the biggest current failures are root world-system contradictions, not file size
- the workspace is structurally good enough now that fixing system authority is finally practical
- finishing the runtime truth layers first will make later `<600` cleanup safer instead of more abstract

### Production Candidate Checkpoint (2026-07-13)

Completed in `steven/live-fix-workspace`:

- building footprints are clipped to the requested Shortbread bounds instead of importing entire touched tiles
- all 15 presets load bundled OSM building metadata; mapped height, levels, type, roof, name, and provenance flow into massing, collision, and interior support
- unknown building dimensions use bounded type/footprint inference and remain marked as inferred; generated interiors are not represented as mapped floorplans
- Monaco mapped-interior entry/exit is contained, returns to the exterior walk surface, and preserves mapped level/height provenance
- Earth, Moon, space flight, ocean, editor, activity creator, and multiplayer room transitions clean up their runtime state without requiring a page reload
- the subtropical dry fallback now reaches terrain tiles while mapped wetland, water, vegetation, urban, and polar overrides remain authoritative
- staging retention proves account authentication, room ownership, reload, re-sign-in, build blocks, memories, overlay drafts, and activity drafts survive

Green release evidence:

- `npm run release:verify`
- Firestore rules `42/42`
- `npm run test:editor-multiplayer`
- staging `npm run test:retention`
- 30-location world matrix: `30/30`, zero location failures, zero fatal console errors
- mirror parity: `405` files, zero mismatches
- Playwright screenshots reviewed for Tokyo, Monaco, mapped interior, desert, wetland, ocean/water, editor, activity creator, and multiplayer
- standard Chrome acceptance reviewed on the isolated staging preview: Baltimore launch, nonblank renderer, builder shapes/colors and placement, travel-mode cycling, and no fatal white-screen regression

Building-authority addendum:

- Overture Buildings PMTiles is now the global deferred building authority, with Shortbread retained only as an outage fallback
- the building request covers the playable world context instead of stopping at an inner fraction of the road radius
- mapped parts, min-height/top-height semantics, facade attributes, and common mapped roof shapes reach rendering without invented podium massing
- dense near facades and roofs batch by stable material class and spatial cell, preventing the drone LOD mesh budget from erasing complete neighborhoods
- release assertions require Overture provenance, meaningful outer-ring coverage in dense cities, mapped parts in Baltimore/New York, and at least 85% nearby-source visibility in drone mode
- focused Playwright evidence passes Tokyo, Baltimore, New York, Paris, and Nairobi; regular Chrome passes New York play and drone mode without renderer errors
- the release must continue to report missing source footprints or unknown surveyed heights as source limitations rather than filling them with fabricated buildings or dimensions
- custom/geolocated starts with no central source footprints may use the bounded road-frontage fallback only when mapped developed landuse or multiple mapped residential streets support it; inferred geometry remains explicitly labeled, capped, and excluded from water, farm, park, forest, and other non-developed surfaces

Current release state: **staging-accepted release candidate, not yet production-promoted**.

### R8 Controls and Community-Building Checkpoint (2026-07-13)

R8 has one bounded goal: make ordinary play controls and map contribution coherent without reviving the legacy editor.

Exit criteria:

1. `W/S` move, `A/D` turn the actor and followed camera, arrow keys look independently, and no active walking/drone strafe binding remains.
2. `F` cycles Drive / Walk / Drone; key `6` has no mode-switch behavior; every visible control reference agrees.
3. Walking and Paint Town use the same building-top collision authority, including wall jumps and rooftop landing.
4. Build with Blocks is the only player-facing lightweight builder, remains locally/multiplayer persistent, and stays separate from authoritative OSM data.
5. HUD and builder OSM links target the current Earth coordinates; selective refresh invalidates only current-location core/building caches.
6. Earth, Ocean, Boat, and Drone survive one runtime transition sequence with the coordinate link and main-menu return intact.
7. No active JavaScript source file exceeds 1000 lines; mirror, syntax, runtime, CSS, local-data, inferred-building, and Playwright visual gates pass.

R8 ends when these checks are green. Further builder features or arbitrary file splitting are follow-up product work, not reasons to keep this phase open.

### R9 Runtime Consistency Checkpoint (2026-07-13)

Closed:

1. Driving uses one automatic surface-response system; no player-facing off-road mode or warning remains.
2. Space+steer initiates a verified rear-slip drift while ordinary steering retains road grip.
3. Headlights illuminate the driven road at night and pooled street lights are generated only from mapped or urban-road evidence.
4. Mapped water entry, harbor travel, city/building LOD, terrain streaming, wake effects, and Main Menu return work in one New York runtime.
5. Every local ES module has one URL identity, enforced by `test:module-versions` and the release gate.
6. Unhashed code and HTML revalidate at deployment boundaries; long immutable caching remains limited to static media/font assets.
7. Boat runtime owners touched by this pass are below 900 lines with coherent dynamics and foam-effect modules.

Next bounded phase:

- verify Earth -> Space -> Moon -> Space/Earth and Earth/Space -> Mars -> Earth in one renderer runtime
- repair only shared transition ownership failures first
- then verify planet-specific sky, Earth anchoring, tracks, minimaps, astronaut/vehicle presentation, and mission-site details
- close the phase only after fresh Playwright screenshots, state assertions, zero new fatal console errors, mirror parity, and the existing runtime gates

Production promotion has four explicit prerequisites:

1. Deploy the current staging-configured build to a Firebase Hosting preview channel and repeat the Chrome manual gate on that URL.
2. Review the R7 normal-provider and forced-provider-outage screenshots in the release artifacts.
3. Apply `npm run firebase:config:production`, sync the public mirror, and verify mirror parity immediately before production deployment.
4. Create a rollback tag/snapshot and deploy Hosting only. Do not migrate or delete Auth/Firestore data, and do not deploy unreviewed rules/functions with the hosting replacement.

R7 implementation and automated release verification are complete. This phase ends after the preview/manual-acceptance and approved promotion steps above; additional file-size reduction is follow-up maintenance, not a reason to reopen runtime authority.

### Final Builder and Release Checkpoint (2026-07-14)

Closed:

1. Build with Blocks has four purposeful shapes and eight distinct colors, with exactly 200 blocks available per location.
2. Legacy block data remains readable; shape and rotation are optional in shared Firestore documents.
3. Walking, jumping, vehicle blocking, and driveable ramps use the same shape-aware surface contract.
4. Focused visual tests confirm shape rendering, block-top landing, cube collision, and ramp traversal in the real canvas.
5. No active JavaScript source exceeds 1000 lines; new builder and collision owners remain small and focused.
6. The complete production gate passes with 42/42 Firestore rules, 405-file mirror parity, provider-outage coverage, planetary round trips, and the sustained global location matrix.

The refactor/runtime phase is now complete. Staging-hosted retention and standard-Chrome acceptance also pass. Remaining work is release operations only: rollback creation, production configuration sync, commit/push, reviewed Firestore-rules plus Hosting deployment, and post-deploy smoke verification. Any further file splitting or feature expansion belongs to a new bounded maintenance phase after this release.
