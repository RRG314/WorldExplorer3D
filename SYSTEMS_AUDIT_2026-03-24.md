# Full Systems Audit — Architecture, Memory, Performance, Startup, Boundaries
**Date:** 2026-03-24 | **Branch:** steven/continuous-world-full-rnd | **Build:** v=190
**Type:** Discovery and diagnosis only — no refactor, no deletions, no guessing

---

## How to Read This Document

This is a system diagnosis, not a fix list. Each phase builds on the previous one. Read Phase 1 first — the system map sets up the vocabulary every later phase uses. The deliverables at the end consolidate everything into ranked lists.

Think of this like a doctor's report before surgery. The goal is to understand exactly what is wrong before touching anything.

---

# PHASE 1: SYSTEM MAP

## 1.1 Terrain System

**What it owns:**
- Terrain tile cache (`appCtx.terrainTileCache`, soft max 54, hard max 84 tiles per `terrain.js`)
- Per-tile Terrarium elevation meshes (geometry + satellite texture)
- Road surface heights (`surfaceDistances`, `surfaceHeights` Float32Arrays on each road feature)
- Surface sync state machine (`terrain._surfaceSyncMode`, batch rebuild pipeline)
- Urban surface meshes (sidewalks, aprons) in `appCtx.urbanSurfaceMeshes`
- Structure visual meshes (bridge supports, portals) in `appCtx.structureVisualMeshes`
- Shared road materials (asphalt texture, skirt material, cap material)

**What it depends on:**
- AWS S3 Terrarium tile endpoint for elevation data
- `appCtx.roads` array (owned by world.js) to build road surface profiles
- `structure-semantics.js` for road classification
- Three.js geometry/material lifecycle

**What loads it:**
- `app-entry.js` imports `terrain.js` synchronously at module load time
- `appCtx.updateTerrainAround(x, z)` called from physics.js and main.js when drone moves

**What keeps it alive:**
- Tile cache entries stay until evicted by the hard-cap LRU system
- Road surface height arrays stay on the road data object forever
- Shared road materials are cached by texture hash key — never disposed unless the texture set changes

**Primary files:** `terrain.js` (3000+ lines), `road-render.js`

**Likely conflicts with:**
- Roads (surface sync timing, roadsNeedRebuild flag)
- Structures (deferred structure visual rebuild gated on terrain tile ratios)
- Memory (terrain tiles carry both geometry and texture — each tile is expensive)

---

## 1.2 Road System

**What it owns:**
- `appCtx.roads` array — raw road data (pts, width, type, structureSemantics, surfaceHeights)
- `appCtx.roadMeshes` array — Three.js BufferGeometry ribbon meshes
- Road spatial index (dirty flag `appCtx.markRoadMeshSpatialIndexDirty`)
- LOD visibility per road mesh (`.visible` flag)
- Overpass API query layer (2-tier cache: 6-entry in-memory/6min TTL, 18-entry IndexedDB/24hr TTL)

**What it depends on:**
- Terrain system for surface height sampling
- `structure-semantics.js` for bridge/tunnel/ramp classification
- `ground.js` / `GroundHeight.resolveDriveRoadContact` for vehicle contact
- Overpass API (3 endpoint rotation with 220ms stagger)

**What loads it:**
- `world.js` `loadRoadsInternal()` at startup
- `kickContinuousWorldInteractiveStreaming()` for additive streaming adds
- Startup playable-core road preload (scoped separately as `startup_playable_core`)

**What keeps it alive:**
- Base-world roads (`appCtx.roads`) are NEVER evicted during a session. Startup roads stay alive until a full city reload.
- Base-world building meshes are hidden but NOT disposed when the player moves away — geometries and textures remain in GPU memory indefinitely.

**Primary files:** `world.js` (~11,000 lines), `terrain.js` (mesh building), `road-render.js`

**Likely conflicts with:**
- Terrain (surface sync must run after terrain tiles load, but streaming adds reset it)
- Continuous world (base road array grows without eviction; streaming roads have eviction; this creates a two-class road set)
- Memory (base roads never release)

---

## 1.3 Structure System

**What it owns:**
- `structureSemantics` per linear feature (bridge/tunnel/ramp/at-grade classification)
- `structureTransitionAnchors` per feature (blend points for ramp transitions)
- `structureStations` per feature (elevation targets at crossing points)
- `surfaceDistances` / `surfaceHeights` Float32Arrays (road geometry)
- Structure visual meshes (support columns, portal arches)

**What it depends on:**
- Road data (pts, crossing features)
- Terrain tile heights
- `structure-semantics.js` (owns the classification and profile pipeline)

**What loads it:**
- world.js after road data arrives — `buildFeatureStations`, `buildFeatureTransitionAnchors`, `updateFeatureSurfaceProfile`, `buildFeatureRibbonEdges` all run during road mesh construction

**What keeps it alive:**
- `appCtx.structureVisualMeshes` array — only cleared on city reload
- Transition anchors live on the road feature object itself — they persist as long as the road does

**Primary files:** `structure-semantics.js` (~1200 lines), `world.js`

**Likely conflicts with:**
- `applyBuildingContextSemanticsToFeature` can RETROACTIVELY change an elevated feature to at-grade after anchors have already been computed (if the road is found to be inside a building polygon). Anchors computed for elevated mode may then be wrong.

---

## 1.4 Water System

**What it owns:**
- Wave physics: `water-dynamics.js` — 3 sea states (calm/moderate/rough), 5 water kind configs (harbor/channel/lake/coastal/open_ocean), 5 wave components with direction/frequency/speed
- Boat physics: `boat-mode.js` — buoyancy, pitch, roll, drift
- Ocean mode: `ocean.js` — deep-ocean environment
- Water area meshes: OSM-derived polygon meshes with wave material

**What it depends on:**
- `main.js` for wave visual update timing
- `world.js` for water area geometry from OSM
- water vector tiles (zoom 13, 8s fetch timeout)

**What loads it:**
- `initBoatMode()` called **synchronously** in `bootApp()` — boat mode initializes at boot regardless of whether the player ever uses it
- Water visual updates throttled: every frame in boat/ocean mode, every 0.2s otherwise

**What keeps it alive:**
- Wave component arrays are module-level constants (always in memory)
- Boat rig state on `appCtx.camera.userData.boatrig` persists once created

**Primary files:** `water-dynamics.js`, `boat-mode.js`, `ocean.js`

**Likely conflicts with:**
- Terrain: water surface mesh Y position is fixed, not terrain-sampled. Where terrain has variable elevation (river in a valley), the water plane floats independently.
- Main render loop: `refreshBoatAvailability(false)` runs every 0.18s even during drive mode — querying boat availability while the player is in a car.

---

## 1.5 Traversal / Physics System

**What it owns:**
- Car state (`appCtx.car` — position, velocity, road contact, yaw)
- Drone state (`appCtx.drone`)
- Walk state (`appCtx.Walk`)
- Road contact resolution (now unified through `GroundHeight.resolveDriveRoadContact`)
- Building collision (polygon + AABB)

**What it depends on:**
- `ground.js` (`GroundHeight` object) for all surface height decisions
- `structure-semantics.js` (shared `retainRoadSurfaceContact`, `shouldLockRetainedRoadContact`)
- `appCtx.roads` for road proximity
- `appCtx.buildings` for collision geometry

**What loads it:**
- `physics.js` imported synchronously
- `walking.js` imported synchronously

**Primary files:** `physics.js`, `ground.js`, `walking.js`, `structure-semantics.js`

**Likely conflicts with:**
- Walk mode vs interiors: `updateInteriorInteraction()` is called every frame in physics.js but the `interiors.js` module is loaded lazily only during walk mode. Before the module loads, every frame checks `shouldLoadInteriorsModule()`.
- Building collision uses `appCtx.buildings` (base-world load); ground height uses `appCtx.linearFeatures`. These are different collections that may disagree about the same position.

---

## 1.6 Streaming / Continuous World System

**What it owns:**
- Actor geo position and velocity tracking (`continuous-world-runtime.js`)
- Region ring computation (near=1, mid=2, far=4 cells at 0.02-degree grid)
- Interactive stream state (`_continuousWorldInteractiveStreamState` in `world.js`)
- Coverage cap: **hard-wired at 10 entries** (`CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE = 10`)
- Region-key ownership stamps on mesh userData

**What it depends on:**
- Overpass API (multi-endpoint)
- world.js for appending/evicting roads, buildings, landuse
- terrain.js for scoped surface sync on streaming adds

**What loads it:**
- `kickContinuousWorldInteractiveStreaming('main_loop')` called from main.js **every frame**
- Internally throttled to 260–900ms intervals

**What keeps it alive:**
- Covered region key set (up to 10 entries) — old entries are evicted when new ones arrive
- Interactive streaming roads/buildings: EVICTED when region is no longer in coverage
- Base-world roads/buildings: NOT evicted

**Primary files:** `continuous-world-runtime.js`, `continuous-world-region-manager.js`, `continuous-world-feature-manager.js`, `world.js`

**Likely conflicts with:**
- The 10-entry coverage cap is the direct cause of far-travel building failures. A fast drive covers more area than 10 regions can track simultaneously at 0.02-degree resolution.
- Interactive streaming road evictions trigger `roadCountChanged` mutation tracking — but base-world roads changing also affects the sync state.

---

## 1.7 UI / HUD / Map System

**What it owns:**
- HUD DOM updates (speed, coordinates, heading)
- Camera rigs (`carrig`, `boatrig` on `appCtx.camera.userData`)
- Minimap canvas draw
- Large map canvas draw
- Overlay positioning

**What loads it:**
- `hud.js`, `map.js`, `ui.js` imported synchronously in app-entry.js

**What keeps it alive:**
- Always resident once loaded
- Minimap timer, large-map timer, HUD timer all run as persistent `_timer` accumulators in `main.js`

**Likely conflicts with:**
- Minimap performance: `drawMinimap()` runs every 100–420ms depending on frame pressure. The interval adapts, but the function itself is not profiled beyond the `map` runtime section.
- Large map: runs every 180–650ms when `appCtx.showLargeMap` is true — additional canvas draw on top of the minimap.

---

## 1.8 Editor System

**What it owns:**
- Workspace snapshot (area the editor captures from current world load)
- Draft features (roads, POIs, buildings being edited)
- Overlay runtime layer (published editor contributions visible in-game)
- Separate arrays: `overlayRuntimeRoads`, `overlayRuntimeLinearFeatures`, `overlayRuntimePois`, `overlayRuntimeBuildingColliders`

**What loads it:**
- Editor session module: **lazy** — only imports `editor/session.js` when user opens editor
- Editor warmup: `scheduleEditorSessionWarmup(900ms)` called from `captureEditorHereTarget` stub — means the editor module starts loading 900ms after ANY call to capture a target, not only when the user explicitly opens the editor.
- Overlay public layer: lazy, loads only when `_overlayRuntimeRequested` is true

**What keeps it alive:**
- `_editorSessionModule` reference keeps the module alive once loaded
- Overlay runtime arrays live on `appCtx` indefinitely once the overlay is loaded

**Primary files:** `editor/session.js`, `editor/public-layer.js`, `editor/store.js`, `editor/schema.js`, etc. (~18 files)

**Likely conflicts with:**
- Editor overlay features share coordinate space with base-world roads but live in different arrays. Contact resolution queries base world roads first; overlay roads may be missed or resolve incorrectly.
- Editor uses same `appCtx.scene` as the game. Draft geometry is added to the scene directly. If the editor is opened and closed without a full dispose pass, draft geometry may linger.

---

## 1.9 Multiplayer System

**What it owns:**
- Room state, presence, ghost avatars, room activities

**What loads it:**
- Fully lazy — `import('./multiplayer/ui-room.js')` only when player requests multiplayer
- Auth observer (`observeAuth`) starts at **boot** however — Firebase auth subscription begins before the game world loads

**Primary files:** 11 files in `multiplayer/` folder

**Likely conflicts with:**
- Auth observer fires on every auth state change. If Firebase re-authenticates during world load (token refresh), the auth callback fires and calls `_multiplayerApi.setAuthUser` — but at that point `_multiplayerApi` may not yet exist. The guard is there but it means auth state changes mid-session are handled inconsistently.

---

## 1.10 Live Earth System

**What it owns:**
- Satellite imagery layers, earthquake data, real-time transport
- Managed through `appCtx.liveEarth` proxy object

**What loads it:**
- Position in deferred boot queue: `key: 'live-earth'`, `timeout: 1450ms`
- Loads ~1.5s after the player first takes control

**What keeps it alive:**
- Once loaded: `liveEarth.updateFrame(dt)` runs **every 0.2s** in `main.js` even when the live-earth panel is closed
- `liveEarth.updateSelectorFrame()` runs every 4s
- The module reference is never cleared

**Primary files:** `live-earth/controller.js`, `live-earth/satellites.js`, `live-earth/earthquakes.js`, `live-earth/transport.js`, `live-earth/registry.js`

**Likely conflicts with:**
- Runs its update tick during normal driving. Most players never use live-earth. It runs ~300 times per minute regardless.
- The live-earth controller was the reason the performance test showed `deferred:live-earth:ready at 62391ms` — it is the last deferred feature to complete and its boot time directly extends the observed "loading" window in tests.

---

## 1.11 RDT / Perf System

**What it owns:**
- Complexity indexing for procedural content (depth 0–6+)
- Adaptive quality tier (performance/balanced/quality)
- Spike tracking (1800-frame rolling window)
- `_rdtNoiseCellCache` Map (up to 220,000 entries)

**What loads it:**
- `rdt.js` is the **first import** in `app-entry.js` — before config, before context, before everything

**What keeps it alive:**
- `_rdtNoiseCellCache` grows with every new cell coordinate queried. Max 220K entries. On a long city drive this fills with cells from every location visited and is never partially evicted — it just caps at 220K.
- `perfStats` object with 1800-frame spike window stays alive always

**Primary files:** `rdt.js`, `perf.js`

**Likely conflicts with:**
- Auto-quality degradation fires at 50fps / 23ms frame time (degrade) or 57fps / 18.2ms (recover), with a 12s cooldown. If the game drops briefly during a streaming load, the quality tier degrades and stays degraded for at least 12 seconds. The stale performance report showed the game launched already in "performance" (degraded) tier.

---

# PHASE 2: STARTUP AUDIT

## 2.1 Synchronous Module Load Chain (Every Boot, No Exceptions)

The following modules are imported synchronously in `app-entry.js` before any async work or user interaction. They all execute their module-level code at import time:

```
rdt.js         → initializes _rdtNoiseCellCache (Map), starts perf constants
config.js      → defines LOCS, LOC, SCALE, geoToWorld
shared-context.js → creates appCtx object
state.js       → initializes all appCtx state fields
perf.js        → starts _perfFrameSpikeWindow Float32Array(1800), quality tracking
continuous-world-diagnostics.js  → sets up snapshot functions
continuous-world-runtime.js      → initializes region state
env.js         → sets environment flags
real-estate.js → real-estate system
ground.js      → creates GroundHeight object with retained-road state
terrain.js     → sets up tile cache, surface sync state
world.js       → sets up Overpass cache, streaming state, all world constants
engine.js      → Three.js renderer creation (GPU allocation happens here)
physics.js     → sets up car/drone state
walking.js     → sets up walk state
travel-mode.js → sets up travel mode tracking
boat-mode.js   → sets up boat physics constants
sky.js         → sets up astronomical sky system
weather.js     → sets up weather system
solar-system.js→ sets up solar system positioning
space.js       → sets up space flight mode
ocean.js       → sets up ocean mode
game.js        → sets up challenge/game mode state
input.js       → sets up key/touch input listeners (DOM events added at import)
hud.js         → sets up camera rigs
map.js         → sets up minimap canvas
main.js        → sets up render loop constants
ui.js          → sets up all UI event listeners (DOM events added at import)
```

**Observation:** 30 modules execute synchronously before the render loop starts. Several of these (sky.js, weather.js, solar-system.js, space.js, ocean.js) are optional systems that most players never use. They add to parse time, memory initialization, and DOM event listener count at every boot.

---

## 2.2 Critical Path Items That Should Not Be There

**1. `continuous-world-diagnostics.js` on critical path**
This file sets up snapshot functions and validation tracking. It does not need to be synchronous. It is queried by tests but not required for gameplay. Moving it to lazy would save ~300ms of parse/init time at boot.

**2. `continuous-world-runtime.js` on critical path**
Region ring computation starts at import. But the player's position is not known at import time — the first useful update only happens after `gameStarted`. The module initializes state that cannot be used until several seconds later.

**3. `solar-system.js`, `space.js`, `ocean.js` on critical path**
These are modes the player must explicitly navigate to. None of them affect the initial drive experience. All three execute module-level code at import.

**4. `real-estate.js` on critical path**
The real-estate / land ownership system initializes at boot. Its module-level code runs before the player has loaded a world.

**5. `boat-mode.js` initialized in `bootApp()`**
`initBoatMode()` is called synchronously during `bootApp()` — before the render loop starts. Boat physics constants, camera rig setup, and state initialization all happen before the player sees the loading screen.

---

## 2.3 Lazy Systems That Leak Into Startup

**1. Editor warmup at 900ms**
`scheduleEditorSessionWarmup(900ms)` is called from the `captureEditorHereTarget` stub. This stub is called any time the game tries to capture an "editor here" target — which can happen automatically during startup world-build snapshots. If any world-building code calls the editor target capture during startup, the editor module starts loading 900ms into gameplay, competing with terrain tile downloads and road mesh builds.

**2. Analytics at 2800ms**
`scheduleAnalyticsWarmup(2800ms)` fires while the game may still be streaming terrain tiles and building road meshes. Analytics starts tracking at roughly the same time as the player is first controlling the car. Every analytics event fired during this window adds to main-thread pressure.

**3. Live Earth at 1450ms**
Live Earth loads 1.45s after the player takes control. Most players never open it. It then runs `updateFrame` every 200ms for the entire session.

**4. Memory module at 500ms, Blocks at 850ms, Flower Challenge at 1150ms**
The deferred feature boot queue fires starting 500ms after game start. These are minor but each is an idle-scheduled import that adds to the post-boot parse pressure.

**5. Multiplayer auth observer starts at `bootApp()`**
`startMultiplayerAfterAuthReady()` is called synchronously. This starts a Firebase auth subscription before the world loads. Auth token refresh cycles can fire at any point and trigger the auth callback during world loading.

---

## 2.4 Boot Sequence Timeline (As Currently Coded)

```
T=0ms      Module imports execute (30 synchronous modules)
T=0ms      bootApp() called: engine init, UI setup, boat init, tutorial schedule
T=~0ms     renderLoop() starts
T=~0ms     world.loadRoadsInternal() fires (startup OSM query)
T=+500ms   Deferred: memory.js imports
T=+850ms   Deferred: blocks.js imports
T=+900ms   Potential: editor session warmup if captureEditorHereTarget called
T=+1150ms  Deferred: flower-challenge.js imports
T=+1280ms  Deferred: interiors.js imports (walk mode only)
T=+1450ms  Deferred: live-earth/controller.js imports
T=+2200ms  Deferred: tutorial/tutorial.js imports
T=+2800ms  Deferred: analytics.js imports
T=~13-20s  firstControllable milestone (world loaded, terrain ready)
T=ongoing  Live Earth updateFrame every 200ms for full session
```

**Gap:** The space between T=0 and T=~13s is filled with Overpass API queries, terrain tile downloads, road mesh construction, surface sync passes, and simultaneously: 7 deferred module imports. These compete for network bandwidth and main-thread time.

---

# PHASE 3: MEMORY AUDIT

## 3.1 What Holds the Most Memory

**Tier 1 — Large and permanent (never released during a session):**

| Object | Estimated size | Never released? |
|---|---|---|
| Base-world building meshes (hidden) | 100–400 MB GPU | ✅ Never disposed |
| Base-world road meshes (appCtx.roadMeshes) | 40–120 MB GPU | ✅ Never disposed |
| Base-world road data (appCtx.roads pts/heights) | 30–80 MB JS heap | ✅ Never released |
| Terrain tile cache (84 tiles × geometry + texture) | 150–400 MB GPU | LRU eviction |
| appCtx.buildings polygon data | 20–60 MB JS heap | ✅ Never released |

**Tier 2 — Growing with gameplay:**

| Object | Notes |
|---|---|
| `_rdtNoiseCellCache` (up to 220K Map entries) | Grows with every new cell visited. No partial eviction. |
| Interactive streaming road/building meshes | Evicted per-region, but eviction is region-keyed and may miss orphans |
| `surfaceHeights` / `surfaceDistances` Float32Arrays | Rebuilt on sync — old arrays GC'd only when road object is replaced |
| Overpass JSON responses (memory cache 6 entries) | Each raw JSON can be 50–200KB; 6 × 200KB = 1.2MB in-memory |

**Tier 3 — Module references that never clear:**
- `_liveEarthModule`, `_editorSessionModule`, `_multiplayerApi`, `_analyticsModule` — all held by `app-entry.js` module-scope variables. Once loaded, these modules are never released.

---

## 3.2 Confirmed Root Causes of High Memory

**Root Cause A — Base-world buildings hidden, not disposed**
This is confirmed in the codebase and acknowledged in the progress log. The eviction paths `evictContinuousWorldBaseContent` and `evictContinuousWorldInteractiveContent` exist but base-world content (loaded at startup, not via streaming) is explicitly excluded from eviction. Buildings from the original startup load occupy GPU memory indefinitely regardless of distance from the player.

Specifically: `disposeMeshForContinuousWorldEviction` exists in `world.js` and disposes geometry and material correctly. But it is only called on INTERACTIVE streaming content (content added via `kickContinuousWorldInteractiveStreaming`). The base-world mesh arrays (`appCtx.roadMeshes`, `appCtx.buildingMeshes`) that were populated by the initial `loadRoadsInternal()` call are never passed through this eviction path.

**Root Cause B — No eviction for base-world road surface data**
Every road in `appCtx.roads` carries `surfaceDistances` and `surfaceHeights` Float32Arrays. These are rebuilt on every surface sync pass. During each rebuild, the old Float32Arrays are replaced with new ones. The old ones become unreferenced and eligible for GC, but the road object itself persists forever. On a city with 3,000+ roads, that is 3,000 Float32Arrays minimum, growing larger as interactive streaming adds more.

**Root Cause C — RDT noise cell cache grows without partial eviction**
`_rdtNoiseCellCache` in `rdt.js` has a size cap of 220,000 entries, but no partial eviction — it just stops adding new entries when full. This means after a long drive, 220,000 cell lookup results fill the Map (each entry is a small object with numeric values — roughly 2–5 MB total at 220K entries, but the Map's hash table overhead can be 2–3x that). The cache never shrinks unless the page is refreshed.

**Root Cause D — Deferred module references accumulate**
`app-entry.js` holds module-scope references to every lazy module once loaded (`_liveEarthModule`, `_editorSessionModule`, `_analyticsModule`, `_multiplayerApi`, etc.). These are never cleared. A player who opens the editor, then closes it, then plays for an hour still holds the entire editor module tree in memory.

**Root Cause E — Live Earth module loaded unconditionally after 1450ms**
The deferred boot queue has `shouldRun: () => true` for live-earth. Every player loads the live-earth controller module whether or not they ever open it. The module and its satellite/earthquake/transport sub-modules add to heap permanently.

---

## 3.3 Geometry and Material Ownership Hazards

The terrain and road systems use shared materials (asphalt texture, skirt material). These are cached in `terrain._roadMaterials` and disposed only when the texture hash changes. This is correct and efficient.

However, there is a hazard: `pruneMeshesForRebuildScope` in `terrain.js` (lines 569–594) disposes individual mesh materials IF `mesh.userData.sharedRoadMaterial` is falsy. If this flag is not consistently stamped on every mesh, materials that SHOULD be shared get individually disposed and re-created, causing texture churn.

---

# PHASE 4: PER-FRAME AUDIT

## 4.1 What Runs Every Single Frame

From `main.js` `renderLoop()`, every frame without throttling:

| Call | Cost |
|---|---|
| `recordPerfFrame(dt)` | Cheap: array write |
| `tutorialUpdate(dt)` | Unknown: runs even after tutorial is done |
| `renderer.info.reset()` | Cheap |
| `updateContinuousWorldRuntime(dt)` | **Medium:** worldToLatLon + region ring recompute + rebase check (dead stub that still evaluates) |
| `kickContinuousWorldInteractiveStreaming('main_loop')` | **Medium:** evaluates streaming conditions, actor state, heading prediction — every frame even when not streaming |
| `appCtx.update(dt)` | **Heavy:** car physics, road contact, building collision — full physics pass |
| `refreshAstronomicalSky(false)` | **Medium:** sun/moon position recalculation every frame |
| `updateCamera()` | Medium: camera rig lerp |
| `updateActivityCreator(dt, t)` | **Unknown:** runs every frame once loaded — no throttle in main.js |
| `updateActivityDiscovery(dt, t)` | **Unknown:** runs every frame once loaded — no throttle in main.js |
| Render call (`composer.render()` or `renderer.render()`) | **Heavy** |

---

## 4.2 Throttled Calls and Their Intervals

| Call | Interval | Notes |
|---|---|---|
| `updateWaterWaveVisuals()` | 0 (every frame) in boat/ocean, 200ms otherwise | Runs 200ms even in drive mode |
| `refreshBoatAvailability()` | 850ms in boat mode, **180ms in drive mode** | Boat query while driving |
| `liveEarth.updateFrame(dt)` | 0 (every frame) if panel open, **200ms otherwise** | Runs for every player 5x/sec |
| `liveEarth.updateSelectorFrame()` | 4000ms | Less concern |
| `refreshLiveWeather()` | 5000ms | Acceptable |
| HUD update | 66ms (~15fps) | Acceptable |
| Minimap draw | 100–420ms (pressure-adaptive) | OK, adapts well |
| LOD update | 60–200ms | OK but movement-gated (turn bug) |
| Debug overlay | 66ms if `_debugMode` | Calls `findNearestRoad` every 66ms — linear scan |
| perf panel | 200ms | Acceptable |

---

## 4.3 Biggest Per-Frame Performance Risks

**Risk 1 — `updateActivityCreator` and `updateActivityDiscovery` unthrottled**
Both modules' update functions are called every frame once the modules load. There is no throttle in `main.js`. If these functions do any DOM query, spatial lookup, or state comparison, they run at 60fps with no brake.

**Risk 2 — `refreshBoatAvailability` every 180ms in drive mode**
Boat availability is checked while the player is driving a car. This is querying waterway proximity while the player is on a road. The query runs ~333 times per minute of drive gameplay.

**Risk 3 — `kickContinuousWorldInteractiveStreaming` called every frame**
The function internally throttles, but the conditions evaluation (actor mode, actor state, coverage state, heading) runs every frame. Over 60fps, this is 3,600 condition evaluations per minute that mostly result in "not yet."

**Risk 4 — `updateContinuousWorldRuntime` called every frame with dead rebase path**
`updateContinuousWorldRuntime` runs `worldToLatLon`, updates all region rings, and calls `applyDesiredRegions` — every frame. The rebase detection (sets `state.rebase.recommended = true`) runs its distance check every frame. The recommended flag is set on most far-travel frames. Nothing consumes it. The check itself is cheap but it compounds with everything else.

**Risk 5 — `refreshAstronomicalSky(false)` every frame**
Sun/moon positioning recalculates every frame. For a game locked to a real-world location, the sun does not meaningfully move between frames. This could run at 1-second intervals without any visible difference.

**Risk 6 — LOD update movement gate**
`updateWorldLod` has an 8-world-unit movement gate. A stationary player rotating the camera never triggers an LOD update. Roads hidden before the turn stay hidden. This is a visibility correctness issue that masquerades as a performance optimization.

**Risk 7 — Debug overlay calls `findNearestRoad` every 66ms**
When `_debugMode` is true, a linear road scan happens at 15fps. This is not a shipping risk (debug mode off in production) but it will affect any developer testing session where debug mode is active.

---

# PHASE 5: STREAMING / WORLD RETENTION AUDIT

## 5.1 What Unloads vs What Never Unloads

**What DOES unload (correctly):**
- Interactive streaming roads and buildings: evicted when their region key leaves the active coverage set via `evictContinuousWorldInteractiveContent`
- Terrain tiles: LRU eviction at 84-tile hard cap
- Overpass memory cache: TTL-based (6 minutes)

**What NEVER unloads:**
- Base-world roads (`appCtx.roads` from `loadRoadsInternal`)
- Base-world building meshes (`appCtx.buildingMeshes` — set `.visible = false` when far, never disposed)
- Base-world urban surface meshes (`appCtx.urbanSurfaceMeshes`)
- Structure visual meshes (`appCtx.structureVisualMeshes`)
- Surface heights / surface distances on every base-world road
- Module references for live-earth, editor, analytics, multiplayer (once loaded)
- RDT noise cell cache (grows to 220K, then freezes)

---

## 5.2 Region Ownership vs Reality

Features in the interactive streaming layer are stamped with `continuousWorldRegionKeys` arrays via `assignContinuousWorldRegionKeysToTarget`. When a region is evicted, its associated meshes are disposed.

**Problem:** Base-world roads and buildings do NOT have `continuousWorldRegionKeys` stamps from interactive streaming — they were loaded before the streaming system assigned keys. The `rebuildScopeIncludesRoad` function falls back to bounds-based matching when `continuousWorldRegionKeys` is absent. This means:
- Base-world roads are always included in rebuild scope checks (broad bounds match)
- Their surface sync runs on every rebuild
- They can never be correctly evicted because their region ownership is ambiguous

---

## 5.3 Hidden Content Still Costs GPU Memory

When `updateWorldLod` sets `mesh.visible = false`, the mesh stays in the Three.js scene graph. Three.js does not render it, but:
- The geometry stays in GPU buffer memory (WebGL `gl.bufferData` allocation is not released)
- The material's textures stay in GPU texture memory
- The mesh stays in the scene's internal object list (traversal cost)
- The material's shader program may stay compiled

For a base-world load of ~3,000 roads and ~5,000 buildings (confirmed in test reports), this means several hundred hidden meshes are consuming GPU memory at all times.

---

## 5.4 The Coverage Cap Hard Wall

`CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE = 10`

At 0.02-degree region size, one coverage entry covers roughly 2km × 2km. Ten entries covers ~20 km² total. A car driving at 60 mph (city express) covers ~1.5km per minute. After 15 minutes of straight driving, the player is 22km from spawn — well outside the 10-entry coverage budget.

The eviction logic pushes out old coverage entries as new ones are added. But during the replacement period, the old-area meshes are evicted before the new-area meshes arrive. This is the confirmed mechanism producing the `building continuity` test failure of "drive far-region roads too thin: 0."

---

# PHASE 6: CONFLICT AUDIT

## 6.1 Terrain vs Roads

**Conflict:** `roadsNeedRebuild: true` at every sample point across 3 cities

Surface sync is supposed to reconcile road vertex heights against terrain tile heights. The scoped mutation tracking (added recently) reduced sync request count from 199 → 19-20. But `roadsNeedRebuild` is still set at every sample. This means either:
- The sync completes but immediately re-flags as needing rebuild (some other trigger), OR
- The sync timer fires but the rebuild itself is deferred and the flag is checked before the deferred work lands

The terrain tile load triggers sync. The road streaming add triggers sync. If both fire in the same 260ms window, the flag is set twice before either completes. The scoped mutation tracking coalesces requests but may not prevent the double-flagging.

---

## 6.2 Roads vs Structures

**Conflict:** `applyBuildingContextSemanticsToFeature` retroactively changes structure classification

This function runs after `buildFeatureTransitionAnchors`. It can change a feature from `terrainMode = "elevated"` to `terrainMode = "at_grade"` if building containment stats exceed a threshold. But by the time this function runs, `buildFeatureTransitionAnchors` has already computed anchors for the elevated version, and `updateFeatureSurfaceProfile` has built surface heights for elevated mode.

When the reclassification happens, the anchors and surface heights computed for elevated mode are now attached to a feature that thinks it is at-grade. The result: an at-grade road with leftover elevated anchors, producing surface heights that blend into the air rather than following terrain.

---

## 6.3 Water vs Terrain

**Conflict:** Water surface Y is not terrain-sampled

`water-dynamics.js` positions wave meshes at a fixed Y offset. Terrain tiles store actual elevation data. In cities with significant terrain variation near water (harbors below sea level, rivers in valleys), the water mesh floats independently of terrain. A player could drive off a pier and the water mesh is visually at a different height than where terrain ends.

There is no reconciliation pass between water area mesh Y and terrain tile height at that XZ position.

---

## 6.4 Editor vs Runtime

**Conflict:** Editor overlay content uses separate arrays from base world

`overlayRuntimeRoads`, `overlayRuntimeLinearFeatures`, `overlayRuntimePois`, `overlayRuntimeBuildingColliders` exist separately from `appCtx.roads`, `appCtx.linearFeatures`, `appCtx.pois`, `appCtx.buildings`. Road contact resolution queries `appCtx.roads` first. If an editor contribution road overlaps a base-world road, the contact resolution will almost always prefer the base-world road because it appears first in the query order. Editor-contributed roads can effectively be invisible to the physics system.

---

## 6.5 Old LOC-Based Logic vs Continuous World

**Conflict:** LOC anchor is fixed; rebase is a dead stub

`geoToWorld = (lat, lon) => ({x: (lon - LOC.lon) * SCALE * cos(LOC.lat), z: -(lat - LOC.lat) * SCALE})`

`LOC` is set at boot and never changes. `SCALE = 100000`. At 1 degree of longitude (~111km real world), this maps to 100,000 world units. A player who drives 5km from spawn is 5,000 world units from origin. The rebase threshold is 800 world units. After 800 world units (~880m), the rebase flag is set but never executed.

The longer the player drives without a rebase, the more the LOC-anchored coordinate system drifts relative to the actual geo position. Geo-to-world conversions become less accurate the further the player is from the original LOC. After 5km (5,000 world units, 6× the rebase threshold), the coordinate projection error compounds.

All Overpass API queries use the LOC-anchored world coordinate. Terrain tiles are fetched by world coordinate converted back to geo. If this conversion is off by more than one tile's worth (~1km at zoom 13), the wrong tiles may be fetched, causing terrain tiles that don't match the actual road geometry to load.

---

## 6.6 Collision vs Rendering Surface Truth

**Conflict:** `appCtx.buildings` (collision) vs `appCtx.linearFeatures` (ground height)

`checkBuildingCollision` in `physics.js` uses `appCtx.buildings` — the polygon-based building collision array. `GroundHeight.walkSurfaceInfo` uses `appCtx.linearFeatures` — the linear feature set. These are built from the same OSM data but processed differently.

In walk mode, the player's Y position comes from `walkSurfaceInfo` which queries `linearFeatures`. Their collision avoidance comes from `checkBuildingCollision` which queries `buildings`. If a building polygon has a different bounding box in `buildings` vs its representation in `linearFeatures`, the player can clip through the building edge at the corner where the two systems disagree.

---

## 6.7 Auto-Quality Degradation Persistence

**Conflict:** Quality tier degrades under load and stays degraded too long

Auto-quality degrades at 50fps / 23ms frame (degrade streak: 3 evals), recovers at 57fps / 18.2ms (recover streak: 6 evals), with a 12s cooldown. During a streaming load — which inevitably spikes the frame time — the game degrades to "performance" tier and then takes up to 12+ seconds to recover.

The stale performance test showed the game launched in "performance" tier. If the startup road preload causes a frame spike (which it does, given the 46.5ms sync times in drive-surface-stability), the quality degrades at first frame and the player starts the game in reduced quality. They may never see quality tier restored during a short session.

---

# PHASE 7: VALIDATION GAP AUDIT

## 7.1 What Is Well Tested

| Test | State | Freshness |
|---|---|---|
| `drive-camera-smoothness` | ✅ Pass | Current (v=190) |
| `playable-core-road-residency` | ✅ Pass | Current (v=190) |
| `continuous-world-terrain-road` | ✅ Pass | March 23 v=127 |
| `drive-surface-stability` (ramp probe) | ✅ 0 ramp failures | March 23 v=170 |
| `runtime-invariants` | ✅ Pass | March 23 |
| `editor-runtime-isolation` | ✅ Pass | Earlier |

## 7.2 What Is Not Tested Enough

| Gap | Risk |
|---|---|
| `performance-stability` | STALE (v=170, current v=190). True startup time and frame budget unknown. |
| `ramp-contact-audit` | STALE (March 20, v=86). Dual authority fix outcome unknown. |
| `elevated-driving-surfaces-global` | Not re-run since dual authority fix. |
| `continuous-world-building-continuity` | FAILING (far-region 0 roads). Coverage cap confirmed cause. |
| Session-length memory growth | NO TEST EXISTS. No automated check for heap growth over 20-minute session. |
| LOD on camera rotation (not movement) | NO TEST. Camera-only turn roads disappear — no test catches it. |
| Rebase / LOC drift accuracy | NO TEST. After 1km+ travel, coordinate accuracy degrades. No validation. |
| Walk mode camera smoothness | Only drive mode tested. |
| Drone mode streaming coverage | Not in current test suite. |
| Boat / water surface height accuracy | Boat smoke was advisory fail. No surface height accuracy test. |
| Editor overlay contact resolution | NO TEST. Overlay roads may be invisible to physics. |
| Base-world eviction on far travel | NO TEST. Whether hidden base-world buildings eventually release is untested. |
| Auto-quality tier state at first frame | NO TEST. Game may launch in degraded quality tier with no validation. |

## 7.3 Where Regressions Hide

- Far-travel building coverage: the test only checks one drive destination. A different direction or speed may produce different coverage gap behavior.
- Surface sync: `roadsNeedRebuild: true` is always set. Any change to sync timing can silently change whether roads settle before the player drives over the seam.
- Road contact retention: changes to `retainRoadSurfaceContact` thresholds affect all roads globally. A parameter change that fixes bridges may break at-grade road-following elsewhere.
- Auto-quality degradation: startup changes that spike frame time can permanently change the quality tier for the session. This is not validated.
- Deferred module timing: if a deferred module (e.g., live-earth) takes longer to load than expected, its `updateFrame` callback never registers, but no error is surfaced and the gap is invisible to tests.

---

# DELIVERABLES

## D1. Full System Map

| System | Primary Files | Owns | Never Releases |
|---|---|---|---|
| Terrain | terrain.js, road-render.js | Tile cache, surface heights, road meshes | Surface heights per-road; shared materials |
| Roads | world.js, terrain.js | roads[], roadMeshes[], LOD visibility | Base-world roads forever |
| Structures | structure-semantics.js, world.js | structureSemantics, anchors, visuals | Structure visual meshes until city reload |
| Water | water-dynamics.js, boat-mode.js | Wave physics, boat rig | Wave component arrays (module-level) |
| Physics | physics.js, ground.js | Car/drone/walk state, road contact | Car state always alive |
| Streaming | world.js, continuous-world-*.js | Coverage entries, region keys | Base content excluded from eviction |
| UI/HUD | hud.js, map.js, ui.js | Camera rigs, minimap, DOM timers | Always resident |
| Editor | editor/session.js, public-layer.js | Drafts, overlay arrays | Module ref never cleared |
| Multiplayer | multiplayer/ui-room.js etc. | Room state, presence, ghosts | Module ref never cleared |
| Live Earth | live-earth/controller.js etc. | Satellite/quake/transport feeds | Module ref never cleared; runs 5x/sec |
| RDT/Perf | rdt.js, perf.js | Complexity index, quality tier | Cell cache grows to 220K entries |

---

## D2. Biggest Architecture Flaws

1. **Rebase is a dead stub.** `state.rebase.recommended` is set after 800 world units but nothing executes the coordinate frame shift. After ~880m of driving, all geo conversions drift increasingly inaccurate. This is the fundamental blocking issue for a true continuous-world architecture.

2. **Two-class road system.** Base-world roads (from startup) and streaming roads (from interactive streaming) have different eviction rules, different region ownership stamps, and different surface sync behavior. The system treats them differently in almost every path, creating a hidden class of "permanent" world content.

3. **Coverage cap at 10 is too small.** With a 0.02-degree region grid and any meaningful travel speed, 10 coverage entries cannot keep up with the player. This is the direct cause of the building-continuity test failure and the most visible gameplay bug.

4. **Live Earth runs a 5fps update loop for all players.** Every player, whether or not they ever open live-earth, runs 300 update ticks per minute via `liveEarth.updateFrame`. The module loads unconditionally after 1450ms.

5. **Building-semantics retroactive reclassification corrupts structure anchors.** `applyBuildingContextSemanticsToFeature` runs after `buildFeatureTransitionAnchors` and can flip a feature from elevated to at-grade, leaving elevated anchors attached to an at-grade road.

---

## D3. Biggest Memory Risks

1. Base-world buildings hidden but not disposed (confirmed, dominant risk)
2. Base-world roads never evicted (persistent heap growth per location visited)
3. `_rdtNoiseCellCache` fills to 220K and freezes (can't help new cells, still occupies memory)
4. All lazy modules hold their module reference forever once loaded (editor, live-earth, analytics, multiplayer)
5. Float32Arrays on road features rebuilt on sync but old ones not immediately GC'd (3,000+ arrays growing)
6. Terrain tile textures stay in GPU memory even for distant tiles until LRU kicks in

---

## D4. Biggest Performance Risks

1. Auto-quality degrades at startup due to road preload frame spike and takes 12+ seconds to recover
2. `updateActivityCreator` and `updateActivityDiscovery` run every frame unthrottled once loaded
3. `refreshBoatAvailability` every 180ms in drive mode (unnecessary background query)
4. `kickContinuousWorldInteractiveStreaming` condition evaluation every frame (3,600 times/minute returning "not yet")
5. `refreshAstronomicalSky` every frame (sun position does not meaningfully change frame-to-frame)
6. LOD movement gate prevents visibility correction during camera turns (hidden roads never recover without moving)

---

## D5. Biggest Startup Problems

1. 30 synchronous module imports before render loop starts (including space.js, ocean.js, solar-system.js — modes the player may never use)
2. Analytics warmup at 2800ms competes with terrain tile downloads and road mesh construction
3. Live Earth loads at 1450ms for every player
4. Editor session warmup can trigger at 900ms if `captureEditorHereTarget` is called during startup world-build
5. Boat mode initialized synchronously at boot before the game world loads
6. Auto-quality may degrade at first frame due to startup spike, starting every session in reduced visual quality

---

## D6. Biggest Cross-System Conflicts

1. **Roads vs terrain:** Surface sync timing mismatch — `roadsNeedRebuild: true` at every sample across all cities
2. **Structures vs buildings:** `applyBuildingContextSemanticsToFeature` runs after structure anchors are computed — can corrupt them retroactively
3. **Water vs terrain:** Water surface mesh Y is fixed, not terrain-sampled — visual disconnect at harbors and rivers
4. **Editor overlay vs base world:** Overlay roads live in separate arrays, likely invisible to physics road contact queries
5. **Old LOC vs continuous world:** Rebase never executes — coordinate accuracy degrades with distance from LOC
6. **Auto-quality vs startup:** Frame spike during road preload degrades quality tier for the session
7. **Boat availability vs drive mode:** Boat proximity query fires every 180ms while driving

---

## D7. What Should Be Fixed First

**Tier 1 — Must fix, blocks core gameplay:**
1. Coverage cap: raise `CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE` from 10 to 16–20
2. Base-world building eviction: implement a distance-gated eviction path for base-world buildings (dispose when > 2× playable-core radius from actor)
3. Rebase execution: implement the coordinate frame shift when `state.rebase.recommended` is true — this is the foundation of the continuous-world system

**Tier 2 — Fix soon, hurts daily gameplay:**
4. Live Earth: change `shouldRun: () => true` to `shouldRun: () => appCtx.liveEarthEnabled === true` (or whatever flag guards user consent)
5. `refreshBoatAvailability` interval: gate to boat/ocean mode only
6. Activity creator/discovery update: add throttle (200ms) in `main.js`
7. Auto-quality startup spike: defer road preload frame budget to avoid the initial spike that degrades quality tier

**Tier 3 — Fix when Tier 1 and 2 are done:**
8. LOD on camera rotation: remove movement gate, add camera heading change gate
9. Structure reclassification order: run `applyBuildingContextSemanticsToFeature` BEFORE `buildFeatureTransitionAnchors`, not after
10. `refreshAstronomicalSky`: throttle to 1-second interval

---

## D8. What Should Not Be Touched Yet

1. **Rebase coordinate math** — Do not change `geoToWorld` or `SCALE`. These affect every coordinate in the game. Change only the execution path, not the formula.
2. **`classifyStructureSemantics`** — OSM tag reading is correct and comprehensive. Do not touch.
3. **`updateFeatureSurfaceProfile` profile math** — The smoothstep easing and anchor blending are correct. Changing parameters here affects roads globally.
4. **`buildFeatureStations`** — Station detection at crossings is working. Fragile code; leave it.
5. **Terrain tile LRU cache** — The 54/84 tile soft/hard cap is correctly tuned for the tile size. Do not change limits without memory profiling.
6. **`resolveDriveRoadContact`** — Recently unified from the dual authority fix. Leave it to settle. Re-run ramp-contact-audit before touching again.
7. **Overpass cache TTLs** — 6min memory, 24hr persistent is appropriate for OSM data change frequency.

---

## D9. Recommended Phase Order for Fixes

**Phase 0 — Re-run stale tests (1 hour)**
Run: `performance-stability`, `ramp-contact-audit`, `elevated-driving-surfaces-global`. Get real baseline numbers before planning anything else.

**Phase 1 — Memory ceiling fix (1–2 days)**
- Implement base-world building eviction (distance-gated dispose)
- Move building hide/show to a dispose/reload pattern for distant content
- Validate with session-length memory growth test

**Phase 2 — Streaming reach fix (1 day)**
- Raise coverage cap to 16–20
- Add a leading prefetch slot in drive mode (load the region ahead of the car, not just the current region)
- Re-run building-continuity test

**Phase 3 — Startup and frame budget (1 day)**
- Move `space.js`, `ocean.js`, `solar-system.js`, `continuous-world-diagnostics.js` to lazy imports
- Gate Live Earth to user-opt-in only
- Throttle activity creator/discovery updates
- Remove boat availability query from drive mode
- Re-run performance-stability test

**Phase 4 — Rebase execution (2–3 days)**
- Implement the coordinate frame shift when `state.rebase.recommended` is true
- This requires shifting all world-space positions (car, camera, existing meshes) by the rebase delta
- This is the highest-risk change in the codebase — it touches every world-space coordinate

**Phase 5 — Structure and surface correctness (1–2 days)**
- Fix `applyBuildingContextSemanticsToFeature` ordering (run before anchors, not after)
- Add camera-rotation LOD trigger
- Fix water surface Y to sample terrain at water area centroid

**Phase 6 — Validation hardening (ongoing)**
- Add session-length memory growth test
- Add LOD rotation test
- Add rebase accuracy test
- Add auto-quality tier state validation at first frame

---

*End of Systems Audit — 2026-03-24*
