# Loading and memory investigation

Date: 15 September 2026. Scope: the local street-system application branch. This is an investigation, not a declaration that performance is repaired. No production or research changes were made.

## Finding

The application constructs and retains too much of a regional world before play. Local sidewalk streaming sits on top of region-wide road geometry, building geometry and contact indexes. Dividing work into smaller scheduled chunks improves responsiveness, but does not by itself reduce total work or the amount retained. This mismatch explains why individual optimizations have not solved loading and memory together.

The evidence establishes an excessive working set and expensive construction. It does **not** establish that every increase in reported browser memory is a leak, or that unnecessary parallel workers are the principal cause.

## Recorded measurements

These are saved browser measurements, re-examined against the current source. No new heavy world was opened for this investigation. MB and GB below are decimal. Different locations are not controlled before/after comparisons.

| Measurement | Latest recorded Monaco | Earlier San Francisco |
| --- | ---: | ---: |
| Time until first play | 71.5 seconds | 182.0 seconds |
| Loaded road records | 12,793 | 15,554 |
| Loaded building records | 9,417 | 23,861 |
| Unique scene geometry buffers | 173.8 MB | 332.9 MB |
| Reported JavaScript heap | 822.0 MB | 1.14 GB |
| Renderer geometry resources | 581 | 1,036 |
| Renderer texture resources | 174 | 284 |

Monaco includes the latest frontage-query pruning. The San Francisco recording predates that optimization; its 182-second load must not be presented as a measurement of the latest code. In that San Francisco session, a later flight snapshot reported 1.94 GB heap while scene geometry decreased to 302.0 MB. That is a reason to investigate retained objects and transient allocation, not proof of a geometry leak.

Evidence: [Monaco startup](audit-2026-09-13/monaco-shared-grid-startup.json), [San Francisco startup](audit-2026-09-13/sf-bounded-support-startup.json), [San Francisco flight](audit-2026-09-13/sf-bounded-support-flight.json).

## Why loading is slow

### 1. Region-wide construction is on the path to first play

The Monaco recording attributes 23.8 seconds to transport publication. Within that interval, carriageway region construction took 11.9 seconds, structure profile refresh 3.5 seconds, and terrain grading 4.3 seconds. These are nested timings: do not add them to the transport total again.

Building road guards took another 2.5 seconds, building geometry 3.4 seconds, and batching 0.3 seconds. The pavement compiler reported 10.7 seconds, including 3.6 seconds of worker work. That worker number does not include all publication, terrain conformance and coordination costs.

Source: `app/js/terrain/rebuild.js`, `app/js/world/load-building-pass.js`, `app/js/world/building-batching.js`, `app/js/world/street-pavement-runtime.js`.

The regional source domain is much larger than the local detailed pavement domain: Monaco has 12,793 loaded roads but 328 roads in the recorded local pavement selection. These counts describe different scopes, not missing roads by themselves. The architectural problem is that the local system does not bound the rest of the world's construction and memory.

### 2. Road construction still performs costly intermediate work

`buildCarriagewayRegions` creates a synchronous pavement terrain partition with far terrain enabled. That partition builds a temporary contact index over the far terrain and copies near-terrain position arrays. Every road tile is then meshed, and typed position/index arrays are converted with `Array.from` into ordinary arrays for another batching stage. Ground markings build a separate temporary road contact index.

These structures have disposal paths; they are not automatically permanent leaks. Nevertheless, they increase peak allocations and garbage collection pressure, and recreate spatial information. Yielding between tiles does not interrupt a particularly expensive individual tile or the synchronous setup before it.

Source: `app/js/terrain/rebuild.js:599`, `app/js/world/pavement-terrain-partition.js:7`.

The recently bounded, cooperative partition constructor is used for local pavement updates. It does not eliminate this initial region-wide road-construction path. This is a concrete remaining gap in the previous optimization.

### 3. Starting gameplay waits for several additional systems

After scene construction, the loader starts Living World, Urban Sandbox, aviation, maritime and Explorer in order, then draws the first frame before dismissing loading. Some ordering is necessary because later systems consume earlier publications.

An older saved local trace attributed 15.6 seconds to Explorer startup. Current source shows geographic context, encounters, activities and wildlife planning before profile bootstrap completes. That measurement is elapsed time, including possible asynchronous storage waits; it does not prove 15.6 seconds of uninterrupted CPU work. The latest exported startup report omits these per-system timings even though the runtime records them. This measurement gap prevents a complete reconciliation of the 71.5-second total.

Source: `app/js/world/load-runtime-session.js:482`, `app/js/discovery/runtime.js:1075`.

Moving work behind the loading screen prevented misleading readiness followed by freezing. It did not make the work cheaper. The next change must narrow required startup dependencies and incrementally prepare distant content, while preserving a genuinely playable spawn area.

### 4. Network waits contribute, but do not explain the whole delay

Monaco recorded regional context and structures phases of 4.3 and 4.2 seconds, plus a ground wait of 7.7 seconds. Some requests may already be in flight when their wait is measured; these numbers are not a clean serial network total. CPU construction is independently substantial. First rendering added about 1.3 seconds. Neither a faster network nor shader warmup alone addresses the dominant architecture problem.

## Why memory is high

### 1. Rendering visibility is not memory residency

The earlier San Francisco breakdown contained 158.1 MB of building buffers, 65.9 MB of road buffers and 42.7 MB of vegetation buffers. Geometry batching reduces draw calls. Hiding a batch or culling it outside the camera does not unload its buffers. Source records, derived geometry, runtime plans and spatial indexes remain distinct retained representations.

These CPU buffer measurements exclude texture storage and GPU overhead. They must not be added to the JavaScript heap as though all were disjoint allocations.

### 2. Region-wide contact indexes are another significant retained representation

Monaco's road contact index held 1,345,008 triangles, 195,023 cells and 2,756,503 cell references. Its reported typed record and bucket storage alone totaled 49.1 MB, excluding Map/object overhead. The earlier San Francisco equivalent was approximately 68.6 MB. A bounded nearby collision domain with coarse distant representations would avoid paying this full detailed cost everywhere at once.

### 3. Rebuilds temporarily hold old and new data

Atomic publication deliberately retains the currently usable surface until its replacement is ready. Worker input copies, geometry staging, terrain partition copies and temporary indexes can coexist with the published world. This is useful for correctness but needs a peak-memory budget. Repeatedly scanning full source collections for a local build also allocates new snapshots.

Source: `app/js/world/street-source-input.js`, `app/js/world/street-pavement-runtime.js`, `app/js/terrain/rebuild.js`.

### 4. Texture ownership still needs a complete budget

Facade image sharing reduced the observed San Francisco texture resource count from 330 to 284 and initial image-upload calls from 223 to 188. This is an actual improvement, not a full memory solution.

Terrain still creates per-mesh texture sets keyed by mode, repeat and source identity. Each set clones color, normal and roughness textures. The terrain lifecycle disposes these sets when the mesh is retired, so their existence is not proof of an unbounded leak. Whether every clone creates distinct GPU storage depends on renderer behavior; count unique underlying allocations and dimensions before claiming a byte saving.

Source: `app/js/terrain/surface-profiles.js:60`, `app/js/terrain/surface-profiles.js:258`, `app/js/terrain/mesh-lifecycle.js:23`.

### 5. Tooling adds separate memory pressure

A read-only process snapshot during this investigation found 19 Chrome processes with approximately 1,200 MiB summed resident memory, 151 Codex tool Node helpers with approximately 393 MiB summed resident memory, and one other Node process at approximately 4 MiB. Summed RSS can count shared pages and is not total memory pressure; compressed or swapped memory is not represented adequately by these figures. Chrome processes were not attributed to particular tabs.

The helper count deserves lifecycle cleanup through the tools that own them. It is not evidence of 151 game workers. No unknown process or user browser was killed. No additional world, test server or test runner was started for this investigation.

## What is running after load

The street overview intentionally compiles distant pavement coverage after first play, one cell per presentation tick, and terminates its worker on completion. Local detailed pavement uses another worker during rebuilds and terminates it on completion or cancellation. They can overlap and temporarily duplicate some source data. Their purpose and lifetime are explicit in `street-overview.js` and `street-pavement-runtime.js`; this is not evidence that obsolete RDT terrain generation is secretly running.

The latest Monaco snapshot had no active deferred startup task and no active detailed pavement build. That does not mean every gameplay system was idle. A general queue snapshot is not a census of all runtime activity.

## Repair order and acceptance evidence

1. **Complete cost attribution first.** Export the already recorded gameplay startup timings, separate CPU construction from storage/network waits, and measure transient versus retained memory. Reconcile the load total without double-counting nested phases. Capture resource ownership and texture byte estimates.
2. **Bound the world that is resident.** Keep complete regional source coverage available, but stream detailed road, building, vegetation and collision cells around travel needs. Retain a cheaper distant skyline and terrain. Remove arbitrary missing-building caps; enforce byte budgets and distance tiers instead. Flying needs a forward prefetch corridor and hysteresis to avoid repeated rebuilding at boundaries.
3. **Use the same spatial ownership across systems.** Share versioned cell products between rendering, contacts and pavement preparation. Cache valid results and invalidate affected cells, rather than repeatedly constructing global indexes. Preserve atomic publication while bounding staging memory. Avoid conversions through large boxed arrays.
4. **Reduce startup dependencies safely.** Complete nearby terrain, roads, collision, required interactions and first draw before play. Prepare distant encounters and optional presentation incrementally, with explicit readiness and frame budgets. Do not merely launch all initialization in parallel or announce readiness prematurely.
5. **Verify lifetimes.** Account for textures, source snapshots, geometry, indexes, workers and timers through world entry, sustained flight, location switching and return to menu. Verify disposal and cancellation on failures as well as success. Clean up abandoned tool sessions separately.

Acceptance needs a repeatable sequence through Baltimore, San Francisco and Monaco: cold and warm load, a sustained route crossing streaming boundaries, repeated location changes, and return to menu. Record first-play timing, frame percentiles and worst stalls, source/building correctness, geometry and texture counts/bytes, worker lifetimes and post-settlement memory. Run one world at a time on this machine. The existing 25-second first-play target is a target, not a result already achieved. Performance changes must retain visual checks for hills, sidewalks and building interfaces.

A leak finding requires retained-object or equivalent lifecycle evidence across repeated cycles; a rising single heap estimate is insufficient. The current evidence is already sufficient to prioritize regional residency and construction costs without waiting for a leak to be proven.

## Limits and changes in this investigation

Read-only source inspection, saved browser evidence analysis and one process snapshot. This report is the only new repository artifact from this investigation. No runtime behavior was changed, no new performance result was claimed, and no tests were rerun for a documentation-only change. Loading, memory and flight performance remain unresolved until the repair and acceptance work above is completed.
