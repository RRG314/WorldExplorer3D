# Architecture & Runtime Audit — `steven/continuous-world-full-rnd`

**Auditor:** External read-only review
**Date:** 2026-03-23
**Files reviewed:** world.js, terrain.js, ground.js, physics.js, structure-semantics.js,
road-render.js, continuous-world-runtime.js, continuous-world-region-manager.js,
continuous-world-feature-manager.js, continuous-world-diagnostics.js, config.js,
main.js, perf.js; all specified docs; all five Playwright output reports.

---

## Executive Summary

This codebase is running two load engines at once and neither is fully in charge. The legacy system (centered on a fixed geographic point called `LOC`) still does all the real work. The new continuous-world layer tracks what *should* happen but does not yet execute it. The result is a system that is correct enough to pass most tests but still shows the cracks you are experiencing: terrain before roads, road flicker on turns, slow startup, and high memory.

The fundamental gap is this: the rebase has never been implemented. The runtime correctly detects when the player has drifted too far from the world origin, but it only sets a flag and does nothing else. Everything else flows from that missing step.

The "playable core" direction is sound but incomplete. The performance numbers in the actual test report (62 ms frame time, 22 s first controllable, 110 ms surface sync) are all outside the target band. The tuning done on 2026-03-22 and 2026-03-23 moved things from "failing hard" to "failing softly at warn level," which is progress, but the underlying architecture has not changed.

---

## Part 1 — Plain-English Architecture Explanation

Think of this game as a city built on a giant piece of paper. The paper is anchored at one corner — that corner is called `LOC`, and it is always the lat/lon of whichever city you loaded (Baltimore by default). Every road, building, and terrain tile is measured in distance from that corner.

On top of that paper city, someone has started building a second system — a smart moving spotlight that is supposed to follow you around and keep only the content near you alive. That spotlight knows where you are and can name which "regions" you are in. But right now the spotlight does not have the power to turn off content that is far away or to load new content in a truly autonomous way. It still depends on the original paper city being loaded first, and it adds new roads and buildings around you by making extra requests to the same Overpass mapping API, then stapling the results onto the paper.

The terrain is the best-behaved part. It loads tiles in rings around you and can swap them in and out as you move. The roads are the worst-behaved part — they are loaded as a big batch at startup and then added to incrementally. They are never truly unloaded. The surface sync (the process of making roads match the terrain elevation) is the most expensive operation and currently takes about 110 ms per pass, which is almost twice the frame budget.

---

## Part 2 — Top Findings Ordered by Severity

---

### FINDING 1 — CRITICAL: The Rebase Is a Dead Flag

**File:** `app/js/continuous-world-runtime.js`, lines 229–231
**Severity:** Critical

The runtime correctly detects when the player has drifted more than 800 world units (~880 meters) from the world origin and sets `state.rebase.recommended = true` with `reason: 'distance_from_origin'`. That is the complete extent of the rebase system. Nothing in the codebase reads `state.rebase.recommended` and acts on it. The flag is emitted into the void.

Why this matters: every world-space coordinate in the game derives from the flat-earth projection anchored to `LOC`:
```
x = (lon - LOC.lon) × SCALE × cos(LOC.lat)
z = -(lat - LOC.lat) × SCALE
```
At SCALE = 100,000, one degree of latitude = 100,000 world units. A player driving 5 km away from `LOC` is 4,500 world units from origin. Three.js floating-point precision starts to degrade noticeably past a few thousand world units. Roads and buildings loaded far from origin will visually jitter and have incorrect surface sampling.

The architecture document describes the rebase as a planned feature ("rebasing must shift local transforms without reloading"). It has not been built yet. No test exercises it.

**This is architectural, not tuning.**

---

### FINDING 2 — CRITICAL: Frame Pacing Is Failing in the Test Environment

**File:** `output/playwright/performance-stability/report.json`
**Severity:** Critical

The most recent performance test reports:
- First controllable world: **22.28 s** (target 12 s, warn 20 s, fail 60 s — this is at the warn boundary)
- Average frame time: **62.61 ms** (target 22 ms, warn 33 ms, fail 55 ms — **this is failing**)
- Last terrain/road sync: **~110 ms** (target 35 ms, warn 60 ms, fail 120 ms — near the fail threshold)
- Overall test result: `ok: false`

The auto-quality system has already kicked in and degraded to "performance" tier with `budgetScale: 0.82`, meaning the game is already throttling itself. The reason reported is `fps_down`.

The progress notes from 2026-03-23 say the best measured result was "8.3 s first controllable." The test environment is producing 22 s. This gap — nearly 3× — suggests caching state, Overpass response time, or system load differences between the measured result and the CI/test run. The test is measuring real behavior, and the real behavior is failing.

**This is part tuning, part architecture (surface sync breadth).**

---

### FINDING 3 — HIGH: Terrain Shows Before the World Is Usable

**File:** `app/js/world.js`, function `promoteRoadsReadyWorld` (~line 5449)
**Severity:** High

The loading screen is hidden and `worldLoading` is set to `false` as soon as `playableCore.ready = true`. The playable core is considered ready when: `terrainReady AND roadMeshCount > 0`. The `roadMeshCount` threshold is one road mesh in the playable core bounds.

The problem is the order in which things complete:
1. Terrain tiles arrive from AWS Terrarium (S3, fast, parallel).
2. Overpass road data arrives from external APIs (slower, serial retry logic, may stagger across multiple endpoints).
3. Road geometry is built in batches of 48 per frame continuation pass.

Terrain tile loads are faster and more reliable than Overpass. So the terrain mesh is fully visible before road geometry is built. The loading screen hides the moment one road mesh appears — but then the road network builds progressively in front of the player, which looks like the world "waking up" while you watch.

The staged road rebuild batching (added 2026-03-22) makes this worse in the sense that it deliberately spreads road mesh creation across many frames. That is the right call for frame pacing, but it means the gap between "loading screen gone" and "full road set visible" is longer.

**This is part architectural (readiness gate logic), part unavoidable given external API latency.**

---

### FINDING 4 — HIGH: Road Visibility Has Two Authority Paths That Can Disagree

**File:** `app/js/world.js`, function `updateWorldLod` (~line 10285, lines 10363, 10371)
**Severity:** High

Road mesh visibility is computed as:
```
mesh.visible = withinRoadFeatureRegions(mesh) OR withinPlayableRoadCore(mesh)
```

These are two independent checks:

- `withinPlayableRoadCore` is a bounding-box check against a 1800-world-unit radius circle around the actor. This is stable.
- `withinRoadFeatureRegions` is a check against `continuousWorldInteractiveRoadRetainRegionKeys`, which aggregates region keys from the actor's current region rings PLUS the history of recent interactive stream coverage (`_continuousWorldInteractiveStreamState.coverage`).

The problem: when the actor moves into a new region cell, the retained region key set transitions. During that transition, roads that were loaded in a previous interactive stream chunk may temporarily have region keys that no longer appear in either the current retained set or the playable core bounds — a gap of one LOD update cycle.

Additionally, `updateWorldLod` has a **movement threshold gate** (lines 10322–10326):
```js
if (moved < minMoveForLodUpdate) return;
```
For drive mode, this is 8 world units. During a camera turn with no movement, `updateWorldLod` **does not run**. So if a road was hidden before the turn, it stays hidden. If a streaming load completes during the turn and adds roads with new region keys, those roads will not become visible until the player moves again.

This explains the symptom of roads disappearing while turning the camera.

**This is architectural — the LOD update is gated on movement, but streaming and region transitions are not.**

---

### FINDING 5 — HIGH: Dual Road Contact Ownership in physics.js and ground.js

**Files:** `app/js/physics.js` (~line 37, `retainCurrentRoadContact`), `app/js/ground.js` (~line 39, `_retainedRoadSurface`)
**Severity:** High

Both `physics.js` and `ground.js` independently implement road surface retention logic. Both project the player position onto the current road feature, check lateral and vertical thresholds, and return a `y` value. They use the same helper functions from `structure-semantics.js` but with different parameter values:

- `physics.js` uses `extraVerticalAllowance: 1.45`
- `ground.js` uses `extraLateralPadding: 0.95`

The car physics uses `physics.js`. The road diagnostic snapshot (in `continuous-world-diagnostics.js`) uses `ground.js` (`GroundHeight.driveSurfaceY`). They can return different `y` values for the same position. There is no single authority.

This is the root cause of behavior where the diagnostic says "on road" but the physics behavior does not match, and why bridges and ramps can feel inconsistent.

**This is architectural — one file should own road contact, the other should call it.**

---

### FINDING 6 — HIGH: `roadCountChanged` Triggers Surface Sync Full-Reset on Every Interactive Stream Load

**File:** `app/js/terrain.js`, line 3663
**Severity:** High

```js
const roadCountChanged = appCtx.roads.length !== terrain._lastRoadCount;
```

Every time `kickContinuousWorldInteractiveStreaming` fires and adds new roads (which happens every 260 ms when moving), `appCtx.roads.length` changes. This triggers `roadCountChanged = true`, which in turn causes a full or staged surface sync reset.

The fix from 2026-03-23 (`primeRoadSurfaceSyncState`) is called at two specific points (roads-ready startup and additive stream load complete). But between those two explicit priming calls, terrain still detects `roadCountChanged` and escalates sync mode. Specifically, if a streaming load completes outside those two explicit priming points, the sync escalates again.

The result is that the sync never fully settles during active driving in a new area. The surface sync last sample is always near the 110 ms boundary because each streaming load resets the state.

**This is part architectural (wrong ownership of road count state), part tuning.**

---

### FINDING 7 — MEDIUM: Startup World Load Is Still LOC-Centered

**File:** `app/js/world.js`, line 5094; `app/js/config.js`, line 25
**Severity:** Medium

At every location change, `LOC` is reset:
```js
appCtx.LOC = { lat, lon };
```
And then the entire world build reads from `appCtx.LOC.*` for all Overpass query bounds (lines 5924–5930). Every building, road, and feature query is centered on `LOC`. This is the old model. The continuous-world runtime calls `resetContinuousWorldSession(loadLocation, 'location_load')` here to re-anchor the region system, but the actual world queries still use `LOC` as the center.

When the player travels far and the interactive streaming loads new chunks, those chunks are loaded centered on the actor's geo position, not on `LOC`. But the initial world envelope — which sets the baseline for what features exist — is still `LOC`-centered.

This means: if the player travels outside the initial `LOC` bubble and the initial world was loaded at drive-mode radius (roughly 0.025 degrees ≈ 2.5 km), content beyond that bubble only appears via additive streaming. That streaming is capped at `CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE = 10` chunks. After 10 stream loads, no more new content is added until an existing coverage entry is evicted.

**This is the core of the "not a full continuous world yet" problem. It is architectural.**

---

### FINDING 8 — MEDIUM: Mode-Specific Loading Is Wasteful and Inconsistent

**Files:** `app/js/world.js` (playable core config, ~line 186), `app/js/main.js` (ocean skip, ~line 104)
**Severity:** Medium

**Drone mode:** Loads the full city world at startup. Uses `droneRadius = 2400` for playable core and includes the `far` ring in region keys. This means drone mode tries to keep more content alive than drive mode. The concern is that high-altitude drone flight does not need road-level geometry but still triggers road surface syncs. There is a `_deferredDroneSurfaceSync` flag in `terrain.js` but it only defers, not suppresses.

**Boat mode:** Uses `boatRadius = 1700` and a `boatLodScale` applied to LOD thresholds. But the initial world load is the same city load as drive mode. Boat mode does not suppress building colliders, POI meshes, or landuse that are irrelevant over water. There is a `boatSuppressed` flag on some meshes but it is not systematically applied to all city content when in boat mode.

**Ocean mode:** `main.js` skips the entire render loop (lines 104–111) including `kickContinuousWorldInteractiveStreaming`. This means ocean mode gets zero streaming updates while the player moves. If the player enters ocean mode and moves to a new area, no new content is loaded. The ocean mode has its own renderer but relies on the base world having been loaded already.

**Editor/Creator/Admin:** The editor session is correctly isolated (`editorSessionIsolated: true` in runtime invariants). However, the editor still runs on top of the full world load. Opening the editor while driving does not reduce the world rendering burden. The editor workspace should suppress most 3D rendering but currently does not have a documented render suppression path.

**This is mostly architectural — each mode should declare what world content it needs and suppress the rest.**

---

### FINDING 9 — MEDIUM: The Diagnostics Measure the Right Things But Miss Three Key Gaps

**Files:** `app/js/continuous-world-diagnostics.js`, test scripts
**Severity:** Medium

What the diagnostics measure well:
- Terrain tile health, center tile loaded, prefetch state
- Road contact (`onRoad`, surface delta, round-trip coordinate error)
- Region lifecycle and feature ownership
- Frame spikes and perf milestones

What the diagnostics miss:

**Gap 1 — No rebase measurement.** There is no test or diagnostic that verifies the world behaves correctly when `localOffset.distanceFromOrigin` exceeds 800. The rebase flag is set but never exercised. No test teleports the player 1+ km, holds there, and checks coordinate accuracy.

**Gap 2 — No camera-turn road flicker test.** The playable-core road residency test drives in a straight line and turns the camera, but the `updateWorldLod` movement gate means turns without movement do not retrigger visibility updates. The test never catches road flicker during a pure camera rotation without forward movement.

**Gap 3 — No cold-cache vs warm-cache performance split.** The performance test runs against whatever the browser's IndexedDB Overpass cache contains. The reported 22 s first controllable vs the progress note's 8.3 s suggests cold vs warm cache behavior. Tests should declare cache state.

---

### FINDING 10 — MEDIUM: Building Shell and Texture Readiness Is Not Gated

**File:** `app/js/road-render.js`, lines 1–80; `app/js/world.js` building load
**Severity:** Medium

Road surface materials use a gray fallback when the asphalt texture is not yet loaded. The texture load is asynchronous. The loading screen can clear (when `playableCore.ready = true`) before textures have arrived. Players see gray roads that then become textured — visually inconsistent.

Building meshes have a similar issue. The LOD promotion (`updateWorldLod`) sets `mesh.visible = true` based on region and proximity, but does not check whether the mesh's materials are texture-ready. Near-zone buildings can appear before their roof textures load.

**This is tuning, not architecture.**

---

### FINDING 11 — LOW: The Playable Core Residency Center Does Not Reposition Often Enough

**File:** `app/js/world.js`, `updatePlayableCoreResidency` (~line 1919)
**Severity:** Low

The playable core only recenters when the actor moves more than `recenterRatio × radius` (= 34% × 1800 = 612 world units) from the core center. Until that threshold is crossed, the core bounds do not move. This means a player driving slowly in a small area keeps a core centered on where they started, which may exclude recently loaded roads near the edge of the core.

The `minRecenterDistance = 180` world units provides a floor, but the recenter check is only called inside `updateWorldLod` (when the movement gate passes) and inside `kickContinuousWorldInteractiveStreaming`. If the player teleports, the core may not update until the next LOD cycle.

---

## Part 3 — What Is Architectural vs What Is Tuning

### Architectural (Must Be Redesigned)

1. **Rebase not implemented** — the floating origin plan exists on paper only; the local frame is never shifted.
2. **Two independent road contact authorities** (physics.js + ground.js) — must become one.
3. **LOC-centered initial load** — the base world load must eventually become actor-centered, not origin-centered.
4. **Interactive stream coverage cap** — 10 chunks is not sufficient for long continuous travel; the eviction strategy is not intelligent.
5. **Ocean mode stops streaming** — the main render loop skip also kills streaming; ocean needs its own streaming tick.
6. **LOD update is gated on movement, not on region change or streaming completion** — roads can be hidden until the player moves again after a streaming load.
7. **Mode-specific loading has no content suppression** — drone/boat load full city content then ignore most of it.

### Tuning (Can Be Fixed Without Redesign)

1. **Surface sync frequency** — `roadCountChanged` fires too broadly; the priming fix helps but is incomplete.
2. **Loading screen readiness gate** — the bar for `playableCore.ready` (1 road mesh) is too low; a minimum road count threshold would help.
3. **Texture readiness before loading screen clears** — add a texture-load-complete check to the readiness gate.
4. **LOD update movement threshold** — reducing from 8 to 4 world units for the trigger would reduce flicker; alternatively, always run LOD update when a streaming load completes.
5. **Playable core recenter threshold** — 34% of radius is large; 20% would be more responsive.
6. **Boat mode landuse/collider suppression** — `boatSuppressed` flag is underused.

---

## Part 4 — Concrete 3-Pass Recommendation Plan

### Pass 1 — Highest-Confidence, Low-Risk Fixes

These can be implemented without changing architecture. Do these first. Run the full test suite after each one.

1. **Lower the playable-core readiness bar.** Change `playableCore.ready = terrainReady && roadMeshCount > 0` to require a minimum road count (suggest: 12 road meshes). This prevents the loading screen from clearing when only one road mesh has been built. File: `app/js/world.js`, `_playableCoreResidencyState.ready` assignment (~line 1994).

2. **Remove the movement gate from LOD updates when a streaming load completes.** At the end of `loadContinuousWorldInteractiveChunk` in `world.js`, add a forced `updateWorldLod(true)` call. This closes the gap where streaming completes during a camera turn but roads stay hidden. File: `app/js/world.js`, inside the interactive stream load completion path (~line 8344).

3. **Fix `roadCountChanged` breadth in surface sync.** The current fix (`primeRoadSurfaceSyncState`) is called at two explicit handoff points. Add the call inside the interactive stream completion path specifically when new roads were actually added (`totalAddedRoads > 0`). File: `app/js/world.js`, inside `loadContinuousWorldInteractiveChunk` after additive road merge (~line 8316).

4. **Add texture-load guard to the loading screen.** Before `promoteRoadsReadyWorld` calls `hideLoad()`, check that the road material textures (asphalt map, normal map, roughness map) are either not being loaded or have completed loading. If they are pending, defer `hideLoad()` by up to 2 s. File: `app/js/world.js`, `promoteRoadsReadyWorld` (~line 5473).

5. **Reduce the playable core recenter threshold from 34% to 20%.** This makes the core follow the player more tightly. File: `app/js/world.js`, `PLAYABLE_CORE_RESIDENCY_CONFIG.recenterRatio` (line 194).

6. **Reduce the minimum LOD movement threshold for drive mode from 8 to 4 world units.** This makes visibility updates more responsive during slow driving without adding significant CPU cost. File: `app/js/world.js`, `updateWorldLod` (~line 10324).

7. **Add a `forceSurfaceSync` call to the terrain-settled path when drone mode is active.** The `_deferredDroneSurfaceSync` flag defers sync but does not schedule a retry when terrain settles. File: `app/js/terrain.js`, `maybeFlushDeferredStructureVisualRebuild` (~line 274).

---

### Pass 2 — Architecture Corrections

These require careful changes to the ownership model. Do these after Pass 1. Do NOT do them simultaneously.

1. **Implement the rebase.** When `state.rebase.recommended === true`, shift the world origin: recalculate `LOC` to match the actor's current geo position, translate all loaded mesh positions by the offset, and reset the local coordinate origin. This is the single most important architectural change. The architecture doc already describes the plan. Files primarily: `app/js/continuous-world-runtime.js`, `app/js/world.js`, `app/js/config.js`.

2. **Unify road contact authority.** `ground.js` should call `physics.js`'s `retainCurrentRoadContact` (or vice versa) rather than duplicating the logic. Pick one file as the owner; the other calls it. Files: `app/js/ground.js`, `app/js/physics.js`.

3. **Give ocean mode its own streaming tick.** The main render loop correctly skips earth rendering during ocean mode, but it should still call `kickContinuousWorldInteractiveStreaming` with a reduced interval (suggest every 2 s). File: `app/js/main.js`, inside the ocean-mode early-return block (~line 104).

4. **Make the interactive stream eviction strategy smarter.** The current cap of 10 coverage chunks with a simple retain-count is too blunt. Evict chunks based on distance from the actor's current heading, not just FIFO. File: `app/js/world.js`, `continuousWorldInteractiveSelectPrefetchTarget` and eviction logic.

5. **Add a mode-aware content suppression path.** When boat or drone mode is active, suppress building colliders, indoor POI meshes, and ground-level landuse from being added to the scene. This reduces draw calls without changing the world load. Files: `app/js/world.js` (LOD visibility gate), `app/js/terrain.js` (surface sync scope).

---

### Pass 3 — Validation and Performance Hardening

Do these after Pass 2 is stable.

1. **Add a rebase test.** Teleport the player 1.5 km from origin, confirm `rebase.recommended` fires, perform the rebase, confirm coordinate round-trip error stays below 0.5 world units. File: new `scripts/test-floating-origin-rebase.mjs`.

2. **Add a camera-turn road flicker test.** After reaching a road, rotate the camera 360° without forward movement, sample road visibility at 8 angles. Confirm visible road count does not drop below 80% of the baseline. File: new test.

3. **Add a cold-cache performance test.** Run the performance test with IndexedDB cleared before boot. Record first controllable world time as the "cold" baseline. This is the number players actually see on first visit.

4. **Tighten the surface sync fail threshold.** The current fail threshold is 120 ms. After the sync fix from Pass 1, the target should be achievable (<60 ms). Reduce the warn threshold to 45 ms to catch regressions earlier. File: `docs/performance-stabilization-budget.md`.

5. **Instrument rebase events in perf milestones.** When a rebase occurs, record it as a `perf:milestone:rebase` event with the offset magnitude. This lets you measure rebase cost in production.

---

## Part 5 — Do Not Touch Yet

The following are real issues but have high regression risk and should wait until Passes 1 and 2 are complete and validated:

- **The LOC-centered initial world load.** Changing the initial load to be actor-centered rather than `LOC`-centered requires re-anchoring the entire coordinate system at load time. Do not attempt this until the rebase is working.
- **Road mesh disposal / true unload.** Currently roads are never removed from `appCtx.roads` or the scene once loaded. Adding disposal changes the `roadCountChanged` logic, the surface sync target set, and the interactive stream eviction strategy all at once.
- **The Overpass query strategy.** The multi-endpoint stagger (`OVERPASS_STAGGER_MS = 220`), persistent IndexedDB cache, and memory cache all interact. Do not change the query strategy until the surface sync and LOD path are stable.
- **The RDT mode system.** `perf.js` distinguishes `rdt` and `baseline` modes with different load profiles and LOD thresholds. This is currently well-understood and tested. Do not refactor the mode system during an architecture correction pass.
- **Multiplayer and live-earth.** These systems are tested and passing (`liveEarthApiReady: true`). They are not involved in the road/terrain symptoms. Leave them alone.

---

## Part 6 — Biggest Regression Risks

1. **Changing `promoteRoadsReadyWorld`'s readiness bar.** If you raise the road count threshold too high, the loading screen never clears in low-road areas (water starts, mountain locations). Test against Monaco (boat start), Nürburgring, and a custom ocean location.

2. **Forcing `updateWorldLod(true)` after streaming completes.** If there is a streaming load in flight when the page first loads, this forced update could show unfinished content. Guard it with `!appCtx.worldLoading`.

3. **The `primeRoadSurfaceSyncState` call placement.** If added too aggressively (e.g., on every road array length change), it will suppress the sync mode tracking that the tests rely on. Only call it when an explicit, intentional road ownership handoff has occurred.

4. **Rebase implementation.** The moment you shift mesh positions, any held reference to a mesh's `position.x/z` from the previous frame is wrong. Physics state (car position, road contact cache, terrain cache) must all be shifted atomically. If any system caches world positions without being rebased, you get invisible walls and phantom collisions.

5. **Adding ocean mode streaming.** Ocean mode has its own renderer. Adding a streaming call in the early-return block of `main.js` means streaming can fire while the ocean renderer is active. The streaming function must not add road meshes to the Earth scene while ocean mode is suppressing it.

---

## Part 7 — RDT / Spatial Indexing Assessment

**Based on:** `docs/rdt-continuous-world-evaluation.md`, `app/js/perf.js` (RDT mode), `app/js/world.js` (RDT budgeting)

The existing assessment in `docs/rdt-continuous-world-evaluation.md` is correct and I agree with it entirely.

**Where RDT / a spatial index would actually help right now:**

- `findNearestRoad(x, z, ...)` is called every frame from physics (via the `_rdtPhysFrame` throttle in `physics.js`) and from diagnostics. It currently iterates `appCtx.roads` linearly. With 5,848–9,037 roads loaded, a spatial grid or quadtree would reduce this from O(n) to O(log n) per query.
- The `withinPlayableRoadCore` and `withinRoadFeatureRegions` checks in `updateWorldLod` iterate every road mesh. A spatial hash on road mesh bounds would make LOD updates faster.
- The `buildingSpatialIndex` (`BUILDING_INDEX_CELL_SIZE = 120`) already exists in `world.js`. The same pattern should be applied to road meshes.

**Where it would not help:**

- Startup load time — dominated by Overpass HTTP latency and geometry generation, not by query time.
- Surface sync — this is a rebuild operation, not a query.
- Terrain tile management — already keyed by tile coordinates; no index needed.
- The rebase problem — no index solves a missing coordinate frame shift.

**Recommendation:** Build the road mesh spatial hash after Pass 1. It is a low-risk, high-impact fix that does not change any architecture.

---

## Part 8 — Summary Table

| Finding | Severity | Type | Pass |
|---|---|---|---|
| Rebase is a dead flag | Critical | Architectural | Pass 2 |
| Frame pacing failing (62 ms) | Critical | Both | Pass 1+2 |
| Terrain before roads (readiness gate too low) | High | Tuning | Pass 1 |
| Road flicker on camera turns (LOD movement gate) | High | Tuning | Pass 1 |
| Dual road contact authority (physics + ground) | High | Architectural | Pass 2 |
| `roadCountChanged` triggers full sync on every stream | High | Both | Pass 1 |
| LOC-centered initial load | Medium | Architectural | Do not touch yet |
| Mode-specific loading wasteful | Medium | Architectural | Pass 2 |
| Diagnostic blind spots (rebase, turn flicker, cold cache) | Medium | Tuning | Pass 3 |
| Building/texture readiness not gated | Medium | Tuning | Pass 1 |
| Playable core recenter threshold too large | Low | Tuning | Pass 1 |

---

## Part 9 — Plain-English Summary for a Non-Developer

Imagine you are running a restaurant. The kitchen (world.js) was originally designed to serve one table at a time. When the table finishes eating, everything is cleared and reset for the next group. Someone has added a smart delivery system (the continuous-world layer) that tries to keep appetizers warm for nearby tables before they sit down. But the delivery system does not actually control the kitchen yet — it just watches and makes suggestions.

**The "terrain before roads" problem** is like the table being set with plates and candles before the food is ready. The plates (terrain) arrive first because they come from a fast pantry. The food (roads) comes from a slower kitchen and takes longer to cook. The host (loading screen) tells guests to sit down the moment the first dish arrives, even if only one small appetizer is on the table.

**The "roads disappear on a turn" problem** is like a waiter who only checks which tables need refills when someone walks past. If you are sitting still and just turning your head, the waiter does not notice you and your glass stays empty. The fix is to check the table when new dishes arrive, not just when someone walks by.

**The "rebase is missing" problem** is the most important one. Think of the entire restaurant map being drawn on graph paper anchored at the front door. The farther you sit from the front door, the harder it is to describe where the bathroom is accurately. A rebase would move the anchor point to wherever most guests are sitting. Without it, directions get fuzzy the farther guests travel from the front door. Nobody has implemented the "move the anchor" step yet.

**The memory and performance problem** is that the kitchen never throws food away. Every road that was ever loaded is still on a shelf somewhere, even if the guest left three hours ago. The kitchen also rebuilds its prep station (surface sync) every time a new dish is added, even if the new dish is just a breadstick. Both problems have partial fixes in progress but neither is completely solved.

---

*This audit is based on a read-only review of the source code as of 2026-03-23. No files were modified.*
