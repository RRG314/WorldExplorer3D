# Architecture & Runtime Audit — `steven/continuous-world-root-repair`
**Date:** 2026-03-26
**Branch:** `steven/continuous-world-root-repair`
**Auditor:** Claude (requested by Steven, no code changes made)

---

## Summary Verdict

This codebase has working fundamentals that are being undermined by layered architectural problems. The driving feels bad for four independent reasons that compound each other. The loading feels wrong because streaming is structurally coupled to the render thread. The tests are largely theater — they pass in controlled conditions while missing all the real-gameplay failure modes. Several patches introduced by AI-assisted refactoring have created contradictory logic that needs to be removed, not worked around.

---

## FINDINGS — Ordered by Severity

---

### Finding 1 — CRITICAL: Camera lerp in drive mode is framerate-dependent, not dt-based

**File:** `app/js/hud.js`, lines 389–399
**Root cause:** The car chase camera uses a raw per-call alpha `CHASE_CAMERA_SMOOTH_FACTOR = 0.7` with no dt scaling.

```js
const smoothFactor = CHASE_CAMERA_SMOOTH_FACTOR; // 0.7
appCtx.camera.position.x += (targetX - appCtx.camera.position.x) * smoothFactor;
appCtx.camera.position.y += (targetY - appCtx.camera.position.y) * smoothFactor;
appCtx.camera.position.z += (targetZ - appCtx.camera.position.z) * smoothFactor;
```

`updateCamera()` is called once per render frame from `renderLoop()`. This means the blending speed is entirely dependent on how fast the browser renders frames. At 60fps you get one behavior; at 30fps (during a streaming spike) the camera crawls. At 20fps it barely moves. Because frame rate varies constantly due to terrain sync and streaming, the camera visually stutters and lags in a way that is directly perceptible.

By contrast, the boat camera uses proper dt-based exponential blending via `expBlend(dt, rate)`. The car camera was never upgraded to match.

**Why it matters:** This is probably the single largest contributor to the subjective "jittery/laggy camera" complaint. The physics car position is updated at a stable fixed step (60Hz), but the camera moves at the variable render rate with a frame-count-dependent alpha. When streaming fires and FPS dips, the camera visibly lags behind the car.

**Resolution:** Replace the raw alpha with dt-based exponential blending, matching the boat camera pattern. This is a one-function fix with immediate noticeable improvement.

---

### Finding 2 — CRITICAL: Car Y update has four stacked smoothing layers

**File:** `app/js/physics.js`, lines 1113–1166
**Root cause:** The car's vertical position update applies four independent smoothing stages sequentially.

Layer 1: `GroundHeight.driveSurfaceY()` internally interpolates from retained/locked road contact.
Layer 2: `surfaceBlend = expPhysBlend(dt, 8.5 + speedNorm * 5.5, 0.08, 0.34)` blends raw surface delta.
Layer 3: `lerpRate = dt * (baseLerp + speedBoost + surfaceCatchup)` blends `diff` between current car Y and smoothedTargetY.
Layer 4: `maxVerticalStep = 0.11 + speedStepAllowance` clamps the per-step movement.

Each layer introduces latency. When a new terrain tile loads and the surface Y changes, this pipeline takes multiple frames to converge. The clamp in Layer 4 (`maxVerticalStep = 0.11` per step at 60Hz = 6.6 units/sec maximum vertical rate) means that after a road rebuild or terrain tile swap, the car slides up or down for a visible duration. This is perceived as the car "floating" or "sinking" after loading events.

The compound effect of all four layers: the car takes ~0.3–0.5 seconds to settle onto a new surface after a streaming event. Every terrain sync, every new streaming region, every Overpass load produces a visible car Y drift.

**Resolution:** Collapse Layers 2 and 3 into a single dt-based exponential blend with tuned rate. Remove Layer 4 clamping or make it a one-shot teleport guard only. The result should be one blend from `currentY` to `surfaceY + 1.2` with a rate that feels planted.

---

### Finding 3 — CRITICAL: Rebase is still a dead stub — geo drift accumulates beyond 800m from spawn

**File:** `app/js/continuous-world-runtime.js`, line 229
**Root cause:** `state.rebase.recommended` is set correctly when the actor is 800+ meters from origin, but nothing in the codebase acts on this flag. `appCtx.LOC` is set once at session start and never updated.

```js
state.rebase.recommended = dist >= state.rebase.threshold; // threshold = 800
```

`LOC` is used in the flat-earth projection: `x = (lon - LOC.lon) * SCALE * cos(LOC.lat * π/180)` and `z = -(lat - LOC.lat) * SCALE`. When you drive more than ~1km from the spawn point, the cosine correction in the x-projection accumulates error of roughly 0.2–1.5% per km depending on latitude. At 2km from spawn at mid-latitudes, OSM road geometry and terrain tile elevation data are visibly offset from each other. Road meshes appear to float or sink because the terrain sampling is at wrong world coordinates.

This is why jitter and misalignment get progressively worse as you drive farther from the original loaded area. It is not a physics bug and will not be fixed by tweaking lerp rates.

**Resolution:** The rebase `recommended` flag needs to trigger an actual coordinate frame shift. When fired, `LOC` should be updated to the actor's current geo position, all world-space coordinates of existing meshes and features recomputed, and the simulation origin reset. This is the single most impactful fix for "gets worse the farther you drive."

---

### Finding 4 — CRITICAL: Surface sync and mesh rebuild run synchronously on the main thread

**Files:** `app/js/terrain.js`, `app/js/world.js`
**Root cause:** When a streaming load completes (`kickContinuousWorldInteractiveStreaming` resolves), the road mesh rebuild (`rebuildStructureVisualMeshes`) and surface sync (`_activeSurfaceSyncTask`) execute synchronously inside JavaScript microtasks on the render/physics thread. There is no Web Worker offloading.

The road mesh rebuild involves:
- Iterating all `appCtx.roads` (potentially 1000+ entries)
- Building `BufferGeometry` vertex and index arrays per road
- Calling `scene.add()` for new meshes
- Calling `scene.remove()` for evicted meshes

This work happens on the same thread as `requestAnimationFrame`. When it fires, frame time spikes. The physics accumulator (`stepGameplaySimulation`) reduces substeps to compensate, but the car still perceives a stall. The camera, which is framerate-coupled (Finding 1), then visibly lurches.

The streaming interval in main.js (`streamKickInterval = 0.07` during active streaming) means this can fire every 70ms. At that rate, you get mesh rebuild work competing with physics and rendering continuously while moving.

**Why it matters:** This is the root cause of "loading/streaming does not feel like a clean game runtime." In professional open-world engines, geometry building happens on a separate thread and results are uploaded to the GPU in small batches each frame. Here, all geometry work happens synchronously inside a single event loop tick.

**Resolution (medium-term):** Move geometry building to a Web Worker. On completion, queue the Three.js `scene.add()` calls as a small-batch operation amortized over multiple frames.

---

### Finding 5 — SERIOUS: `getSimulationStepBudget()` is over-engineered patch-on-patch and reduces physics fidelity during streaming

**File:** `app/js/main.js`, lines 137–232
**Root cause:** This function has 15+ branches and returns different `maxSubsteps` (2–8) depending on frame time, streaming state, movement state, and speed. It was clearly grown incrementally.

The critical problem: when `streamingPending` is true OR `pendingSurfaceSyncRoads > 0`, the idle-capped mode returns `maxSubsteps: 2`. At 30fps during a streaming spike, with 2 substeps, the simulation effectively runs at 60Hz instead of the intended 360Hz. At 20fps it drops to 40Hz. Lateral velocity, yaw damping, and surface contact resolution all become coarser. This is perceived as the car "skipping" or feeling less responsive during loading events.

The `streamingPending` check itself calls `getContinuousWorldInteractiveStreamSnapshot()` every frame, which iterates `managerState.trackedRegions` (a Map) and allocates a new snapshot object. This is a GC pressure source on the hot render path.

**Resolution:** Simplify to 3 cases: loading passthrough, normal 60Hz fixed step, and recovery (max substeps). Remove the streaming-state coupling from the physics budget. Physics should be insulated from streaming state.

---

### Finding 6 — SERIOUS: `findNearestRoad` is called 2–3 times per physics step due to uncleared ownership between physics.js and ground.js

**Files:** `app/js/physics.js` lines 533–547, `app/js/ground.js` `resolveDriveRoadContact`
**Root cause:** In `physics.js`, the car update calls:
1. `getNearestRoadThrottled(x, z, ...)` → calls `appCtx.findNearestRoad()`
2. Passes result as `nearestRoad` to `GroundHeight.resolveDriveRoadContact(x, z, ..., { nearestRoad })`

Inside `resolveDriveRoadContact` in `ground.js`, if `nearestRoad` is provided via options it is used. But then `roadMeshY()` is called inside `driveSurfaceY()` which internally calls `resolveDriveRoadContact` again without the `nearestRoad` hint, triggering a fresh `findNearestRoad` call.

So per physics step, `findNearestRoad` can fire 2 times for the car Y update plus once in `checkBuildingCollision` for collision detection. `findNearestRoad` iterates `appCtx.roads` (potentially 1000+ features) with spatial hashing. At 8 substeps × 3 calls = 24 road lookups per rendered frame.

**Resolution:** Compute road contact once per physics step, store it as `car._currentFrameRoadState`, and pass it explicitly through the call chain. Do not let ground.js re-query inside driveSurfaceY.

---

### Finding 7 — SERIOUS: `CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE = 10` is not enough and has no directional prefetch

**File:** `app/js/world.js`, line 106
**Root cause:** Coverage slots are limited to 10. With 0.02-degree regions (~2.2km × 1.6km at mid-latitudes), 10 regions cover approximately a 4×4 grid around spawn. When driving linearly, old regions behind you stay loaded and new regions ahead aren't loaded until you enter them.

There is no look-ahead prefetch based on heading. The kick function selects "nearest unloaded region" based on current position, not predicted future position. At highway speed (80+ in-game units ≈ ~60mph equivalent), you move through a region in about 30–60 seconds. With a 900ms minimum streaming interval and multiple retries for Overpass failures, by the time the ahead region is fetched and built you're already in it. This causes the "blank ahead" experience.

The `test-continuous-world-building-continuity.mjs` test is **currently failing** ("drive far-region roads too thin: 0") which directly confirms this problem.

**Resolution:** Increase `MAX_COVERAGE` to 16–20. Add heading-based prefetch: if the actor is moving, prioritize regions in the arc ±45° of heading direction.

---

### Finding 8 — SERIOUS: `worldLoading → false` transition causes physics accumulator discontinuity

**File:** `app/js/main.js`, lines 236–253
**Root cause:** While `appCtx.worldLoading` is true, `stepGameplaySimulation` runs in passthrough mode (`_simulationAccumulator = 0` each frame). The moment `worldLoading` becomes false, fixed-step mode activates with a fresh accumulator.

However, the transition does not synchronize car state with the physics accumulator. If the loading phase left the car at a surface Y that doesn't match the new road data, the first fixed-step frame after loading clears can produce a large diff that bypasses the `maxVerticalStep` guard (which only applies on-road). The `diff > 20` guard teleports the car but `diff < 20` runs the lerp which can produce a noticeable lurch.

Additionally, `worldLoading` is set to false in 5 different locations across `world.js` (lines 7624, 7987, 8718, 11295, 11319). Some of these are recovery paths. The moment of transition is non-deterministic.

---

### Finding 9 — MODERATE: Dead code — water visual update timer is permanently disabled

**File:** `app/js/main.js`, line 437
```js
const waterVisualInterval = Number.POSITIVE_INFINITY;
if (Number.isFinite(waterVisualInterval) && _waterVisualTimer > waterVisualInterval) {
```
`Number.isFinite(Infinity)` is always `false`. The `updateWaterWaveVisuals()` call **never fires**. This is a feature that was disabled by setting the interval to Infinity, but the surrounding guard and timer logic were left in place, adding dead overhead every frame.

---

### Finding 10 — MODERATE: `canRebuildStructureVisualsNow()` thresholds are too aggressive and block road mesh updates during normal streaming

**File:** `app/js/terrain.js`, lines 250–273
During non-drone mode, the rebuild is blocked if `nearRatio < 0.68` (less than 68% of near terrain tiles loaded). Near tiles change constantly while driving — new tiles load, old ones evict. This threshold keeps `rebuildInFlight` deferring more often than not, leaving stale road meshes visible until a brief window when 68% of tiles happen to be present. Under a streaming spike, road meshes can remain stale for multiple seconds.

---

### Finding 11 — MODERATE: `surfaceSyncSourceIsActorLocal` is a 17-string comparison executed multiple times per frame

**File:** `app/js/terrain.js`, lines 609–631
```js
return (
  value === 'terrain_tiles_pending' ||
  value === 'terrain_tiles_changed' ||
  value === 'terrain_near_tile_loaded' ||
  // ... 14 more conditions
);
```
This function is called from `getActiveSurfaceSyncBounds`, `shouldDeferStructureVisualsAfterSurfaceSync`, and `surfaceSyncCriticalRoadRecoveryStillNeeded` — all of which can fire multiple times per terrain sync cycle. The string matching is not a hot-path bottleneck alone, but it represents the kind of incremental complexity that signals the system has been patched rather than designed.

---

### Finding 12 — MODERATE: `worldBuildStage` has 9 states spread across 20+ call sites with no state machine

**File:** `app/js/world.js`
States: `'idle'`, `'seed'`, `'playable_core_loading'`, `'playable_core_ready'`, `'suppressed'`, `'partial_world_ready'`, `'full_world_ready'`, plus implied empty-string default. This flag is read at 20+ call sites to gate streaming, eviction, LOD, and feature loading. There is no canonical state machine — transitions happen via direct assignment at 5+ distinct locations.

This is how AI-patched code grows: each fix adds a new branch for a specific case rather than extending a coherent state model. The result is that recovery paths and error paths can leave `worldBuildStage` in states that block normal streaming indefinitely. For example, `'suppressed'` (line 8863) prevents streaming but the conditions for exiting this state are unclear.

---

## What Is Actually Making Driving Feel Bad

In priority order:

**1. The camera lags at framerate-dependent speed.** At 60fps the chase camera converges near-instantly (0.7 per frame = 70% closure). At 30fps during a streaming spike it moves half as fast. This makes the camera visibly "swim" after every loading event. This is the most perceptible issue. Fix is one constant.

**2. The car Y update has too much latency.** Four smoothing layers mean every road rebuild, every new terrain tile, every streaming region produces a slow drift in the car's vertical position. The car appears to sink or float for 0.3–0.5 seconds after any background update.

**3. Geo drift accumulates beyond 800m.** The rebase stub means LOC never updates. Road geometries and terrain tiles become increasingly misaligned the farther you drive from spawn. What feels like "terrain sync jitter" at distance is actually coordinate drift.

**4. Streaming work fires on the physics/render thread.** Road mesh rebuilds and Overpass fetches compete directly with the physics accumulator and requestAnimationFrame. During these bursts, the simulation runs at reduced fidelity and the camera lurches.

---

## What Is Actually Making Loading Feel Wrong

**1. The game has no clean "streaming background" phase.** In real open-world games, the world streams continuously without a loading screen and without interrupting gameplay. Here, each new Overpass region triggers: HTTP fetch → JSON parse → feature processing → mesh build → surface sync → road rebuild. All synchronous, all on the main thread. The player can feel each one.

**2. `worldLoading` is used as both a startup gate and a streaming gate.** It prevents physics simulation from running at fixed step, throttles streaming kicks, and gates map rendering. The transition from `worldLoading=true` to `false` is a hard step function, not a smooth handoff.

**3. Recovery timers create perceptible "recovery pulses."** The codebase has `hardRecoveryTimerId`, `recoveryTimerId`, and `recoveryShellTimerId` in `_continuousWorldInteractiveStreamState`. These fire at intervals of 900ms, 260ms, and unclear delays. When Overpass is slow or unavailable, recovery logic re-kicks streaming at these intervals, producing rhythmic loading pulses that the player perceives as intermittent hitches.

**4. Road rebuild is deferred until 68% of terrain tiles load.** So new streaming content sits in a "processed but not rendered" state while waiting for tile load thresholds. This is why new regions feel "empty" even after the Overpass fetch completes.

---

## Which Tests Can Be Trusted

### Trustworthy
- **`test-drive-surface-stability.mjs`** — Tests seam height continuity at specific hardcoded Baltimore points. Reliable regression test for that exact scenario. If it passes, those seams are smooth.
- **`test-structure-semantics.mjs`** — Pure logic test, no browser. Reliable for classifyStructureSemantics correctness.
- **`test-road-render-contract.mjs`** — Tests mesh output format, not behavior. Reliable for API regression.
- **`test-building-semantics.mjs`** — Same, pure logic test.

### Partially Trustworthy (pass conditions are too weak)
- **`test-drive-camera-smoothness.mjs`** — Tests `maxCarYStep` and `maxCamYStep` at spawn, static. Does not move the car, does not test behavior at distance, does not test during streaming spikes. Can pass while the camera is framerate-dependent and jittery under load.
- **`test-playable-core-road-residency.mjs`** — Tests road count at startup. Does not test road coverage after 5 minutes of driving.
- **`test-performance-stability.mjs`** — Tests `firstControllableMs`. Does not test steady-state FPS variance or frame budget during continuous streaming. Can pass with a 57-second startup and still report "ok."
- **`test-load-spawn-settle.mjs`** — Tests initial settle. No long-drive scenario.

### Currently Failing or Unreliable
- **`test-continuous-world-building-continuity.mjs`** — **Currently FAILING** ("drive far-region roads too thin: 0"). This is a real failure caused by the coverage cap. Do not ignore this.
- **`test-ramp-contact-retention.mjs`** — Last run from March 20, pre-patch. Stale, not trustworthy until re-run on current build.
- **`test-elevated-driving-surfaces-global.mjs`** — Stale from March 23. Has known missing anchors on Lincoln Tunnel approaches.

### Missing Entirely — These Scenarios Are Not Tested
- Long drive (5–10 minutes, 3+ km from spawn)
- FPS variance under continuous streaming
- Camera smoothness during streaming spikes
- Streaming coverage gap (blank roads ahead)
- Driving at high speed past region boundaries
- Any city other than Baltimore/NY/LA for camera or surface tests
- Mode switching while streaming is active (drive → walk → drive)

---

## Which Code Should Be Deleted

The following code should be removed, not patched:

**1. `app/js/main.js` lines 436–443 — dead water visual update block**
```js
const waterVisualInterval = Number.POSITIVE_INFINITY;
if (Number.isFinite(waterVisualInterval) && ...) { ... }
```
This never executes. Delete the entire if-block and the timer variable.

**2. `_boatTimer` refresh in drive mode**
`refreshBoatAvailability` at 0.45-second interval when in drive mode (lines 451–467) runs even when no boat is possible. If there's no water nearby, this check is pure waste. Should be gated on whether water features exist in the current region.

**3. `getSimulationStepBudget()` — all branches except 3 core cases**
The 15-branch budget function should be replaced with 3 clean cases: `loading_passthrough`, `normal_fixed_step`, `recovery`. Remove the streaming-state coupling entirely. Physics should not know about streaming.

**4. `_continuousWorldInteractiveStreamState.hardRecovery*` logic** — the hard recovery path in world.js fires after a configurable timeout and re-initializes streaming state. This recovery creates the perceptible "loading pulse" during Overpass outages. It should be replaced with a cleaner exponential backoff that doesn't produce visible hitches.

**5. The `surfaceSyncSourceIsActorLocal` / `surfaceSyncSourceIsCriticalRoadRecovery` string-comparison pair** — replace with a source type enum or bitmask. The 17-string switch pattern will continue growing and is already too complex to reason about.

---

## Recommended Architecture Changes in Priority Order

### Priority 1 — Immediate (fix gameplay feel, no architectural risk)

1. **Fix car camera lerp** — replace `CHASE_CAMERA_SMOOTH_FACTOR = 0.7` with dt-based exponential blend using the same `expBlend(dt, rate)` pattern already used for boat camera. Suggested rate: 8–12 for normal driving, 4 at high speed.

2. **Collapse car Y smoothing to one blend** — eliminate layers 2 and 3 in physics.js Y update. Keep one dt-based exponential blend from `currentY` to `surfaceY + 1.2`. Keep the `diff > 20` teleport guard. Delete the step clamp (`maxVerticalStep`).

3. **Delete the dead water visual timer block** — 3-line removal, zero risk.

4. **Add `findNearestRoad` single-call-per-step** — compute once, store on `car._frameRoadResult`, pass to ground.js explicitly. Prevents 2–3x redundant road lookups per physics step.

### Priority 2 — Medium (streaming and loading improvement)

5. **Execute the rebase** — when `state.rebase.recommended` becomes true, shift `LOC` to current geo, recompute all world-space coordinates of loaded features, reset the streaming session. This is the fix for distance-based drift. It is the highest-impact improvement for long drives.

6. **Increase `MAX_COVERAGE` to 16–20** — with directional prefetch (load regions in ±45° of current heading first).

7. **Simplify `getSimulationStepBudget`** to 3 cases. Decouple physics from streaming state.

8. **Reduce `canRebuildStructureVisualsNow()` near-ratio threshold** from 0.68 to 0.5. Road meshes are more important than a high terrain tile load ratio.

### Priority 3 — Major architectural changes (required for production)

9. **Move mesh building to a Web Worker** — the geometry construction (vertex array, index array, Three.js BufferGeometry) should happen off the main thread. Post a task, receive a transferable buffer, do the `scene.add()` in small batches. This eliminates the synchronous frame spikes entirely.

10. **Replace Overpass as a live game data provider** — Overpass is not designed for real-time game use. It has rate limits, variable latency (1–30s), and no SLA. The correct pattern for production is: fetch at startup (and when rebase fires), cache aggressively in IndexedDB, serve from cache during gameplay, do background refresh only. Never hold a streaming request that blocks road visibility.

11. **Establish a true state machine for `worldBuildStage`** — 4 states maximum: `idle`, `loading`, `streaming`, `ready`. Replace the current 9-state string flag with a typed state machine that has explicit transitions and guards.

---

## Remediation Plan

### Immediate (under 1 day, high confidence, visible improvement)

| Fix | File | Impact |
|-----|------|--------|
| Replace camera lerp with dt-based expBlend | `hud.js:389–399` | Camera stops swimming with FPS |
| Collapse car Y to single blend | `physics.js:1120–1165` | Car stops floating after loading events |
| Delete dead water visual block | `main.js:436–443` | Minor cleanup |
| Single `findNearestRoad` per step | `physics.js:533, ground.js` | Reduce per-frame road query load |
| Simplify `getSimulationStepBudget` | `main.js:137–232` | Physics stable under streaming pressure |

### Medium Refactors (1–3 days, moderate risk)

| Fix | File | Impact |
|-----|------|--------|
| Execute rebase at 800m threshold | `continuous-world-runtime.js`, `world.js`, coordinate system | Eliminates distance-based drift |
| Increase MAX_COVERAGE + directional prefetch | `world.js:106` | No more blank roads ahead |
| Reduce rebuild threshold from 0.68 to 0.50 | `terrain.js:270` | Road meshes appear faster after streaming |
| Replace `worldBuildStage` string flag | all files | Cleaner load state management |
| Replace `surfaceSyncSourceIsActorLocal` strings | `terrain.js:609–644` | Maintainability |

### Major Architectural Replacements (3–14 days, high impact, production requirement)

| Fix | Scope | Impact |
|-----|-------|--------|
| Move geometry build to Web Worker | `terrain.js`, `world.js` | Eliminates frame spikes during streaming |
| Replace Overpass runtime dependency with cached-first serving | `world.js` entire Overpass layer | Eliminates rate-limit hitches, latency variance |
| Replace multi-recovery-timer streaming with exponential backoff | `world.js` streaming state | Eliminates perceptible recovery pulses |
| True state machine for load lifecycle | `world.js`, `main.js` | Makes load/stream/ready lifecycle predictable |

---

## Research Comparison

For context on why this architecture struggles, here is how comparable systems handle it:

**Unreal Engine 5 (Nanite + World Partition):** Content is baked at build time. Streaming loads binary cooked assets, not dynamically-queried OSM data. Streaming work happens on a dedicated async I/O thread. The game thread receives completed results. No geometry building on the main thread.

**GTA V / Red Dead 2:** Streaming is entirely predictive. A look-ahead system prefetches cells based on velocity and heading, not just current position. Cells are fully pre-authored. No HTTP calls during gameplay.

**The structural problem here:** Overpass is a general-purpose research query interface, not a game data backend. It has no SLA, rate-limits to 429 errors during sustained use, and has query latency from 300ms to 30s+ depending on server load. Using it as a real-time data provider during active gameplay is the equivalent of calling a REST API inside requestAnimationFrame and expecting smooth gameplay. The game will always feel like it's "waiting on loading" because it literally is — waiting for an external HTTP request to return and build geometry on the main thread.

The codebase has done real work to mitigate this (IndexedDB caching, seeded signatures, endpoint rotation, stagger). But no amount of mitigation makes an external data API fast enough to be invisible to gameplay. The production path is: fully local cache serving from IndexedDB, background refresh only, streaming kicks that never wait on network.

---

## Conclusion

The most impactful immediate changes are the camera lerp fix and the car Y collapse. Both are small, low-risk, and will produce immediately noticeable improvement. The rebase execution is the most impactful medium-term fix. The geometry-on-main-thread problem is the most impactful structural issue but also the largest engineering effort.

Do not ship without fixing the camera lerp. It is the most obviously broken thing a new player will notice, and it costs one function rewrite.

Do not trust the test suite as evidence of gameplay quality. The tests pass by measuring internal state, not by simulating real play. The `test-continuous-world-building-continuity` failure is the only test that currently reflects a real gameplay problem, and it should be treated as the canary for the streaming system.
