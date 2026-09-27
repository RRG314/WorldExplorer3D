# Measured hotspots and remaining coverage

Status: partial hardware investigation, with one completed numeric prototype. Production remains deployed at `bbe65022`; evaluation work is separate.

## Earth loading

Normal-clock headed Chrome on Apple M1, 1280×800/DPR1, fixed medium quality. Baltimore first playable: **88,306 ms**. The accepted ground artifact is USGS 3DEP, preserved in the evidence with its content hash. Optional Overpass requests failed; fallback providers completed. This is a live-provider observation, not a cached deterministic replay.

Largest elapsed load phases:

| Phase | Elapsed ms |
| --- | ---: |
| publishCompiledTransportMeshes | 45,302 |
| fetchFixedRegionalContext | 9,304 |
| fetchOverpass | 9,009 |
| waitForFixedRegionalGround | 8,801 |
| buildStreetFurniture | 3,261 |
| buildRoadGeometry | 2,588 |
| buildBuildingGeometry | 2,454 |
| featureBudgeting | 2,228 |
| batchBuildingGeometry | 1,123 |
| publishBuildingFacadeEntrances | 701 |
| refreshTerrainSurfaceProfiles | 541 |
| buildBuildingRoadGuards | 516 |

First renderer compilation/render: 1,188 ms, 47 programs. Road compilation yielded 593 times while publishing 18,758 road records. Timings can include scheduling and nested provider work; **45 seconds in transport publication is not proof of 45 seconds of blocking JS**. The subsequent instrumented capture below records its nested phases and CPU samples. Source trace includes structure profiles, terrain corridor application, carriageway union/meshing, contact indexing and structure visuals.

Evidence: [load phases](evidence/earth-load-phases.json). No algorithm or language change has yet been proven to reduce this first-load phase.

## Walking CPU profile

Ten seconds sampled separately from frame timing. Largest named application self samples:

| Function / module | Sampled self ms |
| --- | ---: |
| sampleTransportSurfaceAtDistance · world/compiler/transport-surface-model.js | 143.56 |
| sampleProfileAtDistance · structure-semantics/geometry.js | 129.24 |
| resolveVehicleRoadContactPose · engine/vehicle-road-attitude.js | 55.76 |
| footprint · engine/vehicle-road-attitude.js | 51.65 |
| sampleFeatureSurfaceY · structure-semantics.js | 48.34 |
| agentPose · living-world/population.js | 47.30 |
| getLocalWorldModificationSnapshot · editable-world/runtime.js | 44.05 |
| update · discovery/runtime.js | 42.99 |
| render · discovery/runtime.js | 42.10 |
| normalizeCharacterState · character/model.js | 41.69 |
| getNearbyBuildings · world/building-spatial-index.js | 40.20 |
| evaluateNearestRoadCandidate · world/navigation.js | 34.98 |

Three matrix/scene update and render submission also take substantial samples. Browser-native `(program)` attribution is not a JS function. Sample hits are not function call counts; invocation averages and function-level p95/p99 are unavailable in this capture. Do not fabricate those columns. Runtime kernel update counts are separately available at phase boundaries, but do not establish lower-level call frequency.

## Algorithm-before-language decision chain

| Candidate | First question / action | Evidence and decision |
| --- | --- | --- |
| Transport height interpolation | Replace linear interval search before changing language; reuse compiled sorted coordinates | Optimized JS wins; scalar Wasm loses to it. Preserve arbitrary-profile legacy behavior; integration awaits workload-specific review. |
| Transport mesh publication | Separate numeric compilation, cooperative waiting, renderer creation and diagnostics | 45,302 ms elapsed; nested phase/CPU capture below identifies carriageway construction, terrain sampling, frontage queries and allocation pressure. Keep existing worker outputs and publication authority. |
| Night street lights | Avoid material variants caused by changing visible light count | Controlled WebGL fixture changes 9 programs to 1 with stable pool; extra zero-intensity shader work needs real-world comparison before integration. |
| Building/spatial queries | Keep existing indexes; measure candidate counts, in-place mutation validation and allocations | Building query appears in CPU samples. Capture RDT `matches` remains O(n) by design; do not remove validation without a revision authority. |
| Scene transforms | Determine which static objects are still updated and ownership of transforms | Three matrix work is visible; freezing all matrices could break vehicles, characters, imported assets and moving scenes. No blanket change. |
| UI/backpack/discovery snapshots | Measure frequency and allocation before memoizing | Named CPU samples suggest review; mutation revisions must be reliable before caching. |
| Teardown | Distinguish intentional shared assets from retained worlds | Prior measured two-cycle release run returned roads/buildings/terrain to zero and comparable post-GC heap. No current evidence of a general world leak. |

## Coverage ledger

| Scenario | Evidence available | Still missing |
| --- | --- | --- |
| Title / first Earth compile | Title readiness, provider ledger, load phases, first render | Cold-cache repetitions and precise per-stage long-task attribution |
| Dense urban walk/drive | Two normal RAF pilots, renderer counters, sampled walking CPU, actual displacement | Matched sustained ground routes and repeated frame samples |
| Terrain / roads / intersections / buildings | Real compiler phase elapsed times and captured road profiles | Per-operation call counts/tails; matched alternative replay |
| Collision / spatial / traffic | Walking CPU self samples and existing index inspection | Representative invocation/allocations and correctness-preserving alternative replay |
| Vegetation-heavy/rural | Smoky Mountains physical night scene: walk ~60 FPS, drive ~58 FPS; inspected | Daylight vegetation density/quality, sustained routes and repetitions |
| Reality Capture nearest building | Full validation/query/rebuild replay on 25,507 captured records; exact IDs and mutation rebuilding verified | Live-panel timing and varied location distributions |
| Ocean and return | Normal-clock session reached both and recorded frame distributions | The legacy diagnostic renderer points to Earth; its renderer counters must not be reported as Ocean costs |
| Space / Moon / Mars | Owner-aware hardware samples complete; screenshots inspected | Movement, other destinations, repetitions and physical mobile profiles |
| Repeated locations/environments | Three equal urban load/exit cycles complete; world owners empty, renderer counts stable | Alternating location/environment combinations and longer soak |

Raw JS heap is not total browser memory, a retained-heap measurement or proof of a leak. Increasing DOM counters can include collectable detached nodes. No game FPS improvement is claimed from the component benchmark.

## Auxiliary environment samples

Three fresh browser contexts, fixed medium quality, normal RAF, 15-second stationary windows on Apple M1. Each screenshot was inspected. Space used its own renderer; Moon/Mars used the main renderer. No accelerated simulation. These entry scenes do not certify all space destinations or sustained travel.

| Environment | FPS | p95 ms | p99 ms | Calls | Triangles | Programs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| space | 60.00 | 17.70 | 17.70 | 87 | 40,930 | 12 |
| moon | 60.00 | 17.60 | 17.70 | 123 | 221,132 | 23 |
| mars | 60.00 | 17.60 | 17.70 | 32 | 207,578 | 27 |

No page errors were recorded. Forced-GC menu observations occur after timing and are retention diagnostics only. [Evidence](evidence/environment-profiles.json).

## Existing detailed compiler evidence

A completed earlier hardware run already retained nested transport timings, so another full release run is unnecessary. It used source 2c8e94991622 (a safe-ground UI fix subsequently excluded from production), the same transport compiler, different default quality/viewport and live inputs. Its 40,847 ms total included 18,850 ms carriageway regions, 8,031 ms terrain corridors and 5,608 ms structure profiles. Mesh upload/construction was 372 ms. This corroborates a numeric construction/integration target rather than attributing the whole delay to GPU upload. These elapsed subphases still include cooperative yields. [Extracted evidence](evidence/earlier-transport-publication.json).

## Instrumented compiler follow-up

The current source completed initial Earth loading and the repaired menu transition without page errors. First playable was 80,390 ms **with the sampling profiler enabled**, so it is not a speedup comparison against the uninstrumented 88-second pilot. Transport publication took 42,967 ms elapsed: carriageway regions 20,309 ms, terrain corridors 7,846 ms, structure profiles 5,828 ms, structure ribbons 2,643 ms, markings 2,343 ms, contacts 1,824 ms and mesh upload 411 ms.

Largest sampled self costs include decal projection (~3,980 ms), cached terrain height (~3,534 ms), road-contact indexing (~3,216 ms), frontage query (~2,660 ms), terrain mesh height (~1,955 ms), polygon-result handling (~1,936 ms) and pavement indexing (~1,913 ms). GC accounts for ~4,125 ms of samples. These are sampled self attribution, not exact invocation durations; the source profile is retained locally. [Summary](evidence/compiler-and-menu-repair.json).

The frontage candidate now rejects disjoint edge bounds before exact distance projections. On 10,409 replay queries over 139 captured Baltimore building components, all ordered edge results match. Median component time is 23.6 → 16.9 ms (about 28% lower), p95 24.5 → 17.4 ms across 30 rotated rounds. Synthetic query distribution, bounded district; **no whole-load or FPS reduction is established**. [Replay evidence](evidence/frontage-query.json).

## Rural mountain sample

At 35.611, -83.489, the live-data world loaded in 22,742 ms with 1,960 roads, four building records and 262 terrain tiles. Normal 15-second windows measured 60.00 FPS stationary, 60.01 FPS walking (42.1 world units), and 58.40 FPS driving (546.8 units). No page errors or WebGL error were recorded. Renderer triangles were ~1.66 million during walking and ~1.18 million during driving.

Walking and driving screenshots were inspected. This was a nighttime mountain/forest scene: terrain and tree silhouettes are present, but darkness prevents a meaningful daytime vegetation appearance assessment. It is not comparable to dense Baltimore as a before/after optimization test. [Evidence](evidence/rural-profile.json).

## Complete Capture query path

Using all 25,507 published Baltimore building records, 32 synthetic actor positions sampled from building centers and 10 measured rounds after warm-up: full stable-sort reference 227.0 ms, current bounded heap 38.2 ms, RDT query alone 1.6 ms, its required validation 5.5 ms, and the actual selector including validation 7.2 ms per 32 queries. A single index rebuild measured 2.6 ms. Every ordered ID result matches the reference; mutating an ID in place invalidates the index and forces rebuilding.

The validation scan accounts for most of the selector cost but cannot safely be removed without a reliable mutation revision. The complete current selector averages ~0.225 ms per replay query, not the misleading ~0.05 ms query-only figure. This is not live UI latency, a query-frequency measurement or a new runtime optimization; it supports preserving the existing index. [Evidence](evidence/capture-query.json).

## Three-cycle retention and allocation sample

Each urban reload held 18,758 road and 25,507 building records before teardown. Every Main Menu release returned road/building/terrain counts to zero; renderer resources remained 109 geometries and 38 textures across all three observations. Post-GC heap was 164.41, 166.73 and 167.31 MiB. The small increase does not establish an unbounded leak or prove long-term stability. This is managed JS heap, not total browser/GPU memory. Raw immediate/delayed observations and post-GC values remain separate in [evidence](evidence/urban-retention.json).

A separate ten-second allocation sample retained ~2.47 MB of sampled allocations at stop, mostly Gaia catalog parsing and sky-layer construction. The source caches its catalog promise and guards disposed sky owners; the sample caught background initialization. Default sampling omits collected allocations, so this is **not total allocation traffic or an allocation rate**. The compiler CPU profile independently shows substantial GC time, which warrants a compile-stage allocation study. [Allocation evidence](evidence/walking-allocations.json).

## Sustained flight and blocking/allocation evidence

A normal-input 90-second daytime flight covered 12,584 world units at **57.08 FPS**, p95 18.7 ms and p99 33.4 ms. No page/WebGL errors occurred. The screenshot was inspected: the plane is airborne over coarse regional terrain beyond the detailed city. This is functional/performance evidence, not artwork approval. Fixed medium quality, smaller viewport and daylight differ from the earlier default-quality night flight, so no before/after FPS improvement is claimed.

Across the entire title/load/flight/exit journey, the long-task observer recorded 72 tasks over 50 ms, maximum 3,571 ms, total task duration 27,474 ms and cumulative duration beyond the 50 ms threshold 23,874 ms. None were dropped. These totals include loading and teardown, not solely the timed flight window; they are not a Lighthouse TBT score or GPU duration. [Run evidence](evidence/urban-flight-allocations.json).

The initial compile was separately sampled for allocations at 128 KiB intervals with collected objects included. The profiler estimates ~64.99 GB of cumulative allocation traffic over the loading window; **this is not resident memory, exact byte counting, or a leak**. The estimate includes temporary objects repeatedly allocated and collected, and inlining can attribute work to a caller. Largest aggregated symbols include decal projection (~5.06 GB), mapped water-bed sampling (~3.56 GB), pavement partitioning (~3.22 GB), pavement indexing (~2.29 GB) and district ground sampling (~2.27 GB). These estimates plus sampled GC CPU justify measuring temporary geometry representation and repeated queries before introducing another language. They do not by themselves justify rewriting each named function. [Allocation summary](evidence/compiler-allocations.json).
