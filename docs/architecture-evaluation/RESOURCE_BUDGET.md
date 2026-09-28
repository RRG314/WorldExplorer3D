# Loading and whole-process memory

September 27–28, 2026. Local investigation; production is unchanged.

## What the large memory number means

The reported high memory use reproduces in a fresh, owned Chrome browser on the physical M1 8 GiB Mac mini. The game renderer accounts for approximately 3.8 GiB after the initial road refinement. The GPU process adds roughly 0.8–1.0 GiB. These figures are much larger than the JavaScript object heap alone.

The probe obtains browser-owned PIDs through CDP `SystemInfo.getProcessInfo` and samples macOS `proc_pid_rusage` every 500 ms. It records resident bytes and physical footprint separately, without imposing the earlier 1,280 MiB V8 heap limit. Ordinary Chrome remains open and is excluded from the sampled process list. Footprints include compressed/swapped allocations; they are not equivalent to currently resident RAM. Summing process charges is useful for comparison, but is not an exact de-duplicated physical RAM or VRAM measurement.

A separate `footprint`/`vmmap` capture attributed about 3.05 GiB to tag 255 (V8 heap pages), 662 MiB to tag 253 (PartitionAlloc), and 118 MiB to untagged VM allocation. Most V8 pages were swapped at that instant. Chromium identifies these tags in its [allocator definitions](https://chromium.googlesource.com/chromium/src/+/f673a07393abb644b28575e8c8cac9052a44183e/base/allocator/partition_allocator/src/partition_alloc/page_allocator.h). This identifies allocator categories, not the individual owners of every native page. It does not prove that all excess memory is a JavaScript leak or harmless browser caching.

Earlier post-GC results remain useful for retained-object ownership, but do not establish a whole-process memory budget. The latest natural-GC runs expose the higher allocation footprint rather than hiding it behind forced collection.

## Changes that preserve content

- Ground grading accumulates owned-road and neighboring-road contributions separately, preserving the original floating-point summation order without allocating a sample object and filtered array for each terrain query.
- Terrain-plane clipping reuses a synchronous support descriptor instead of allocating two support objects and temporary index arrays for every intersected terrain cell. The old/new component replay produces the same Float64 output hash for 800 seeded road triangles.
- Building batches remove only byte-identical vertex records within each original source mesh. Triangle order, all shader attributes, and editable index ranges remain intact. Touching buildings never share newly compacted vertices. The measured batch population falls from 1,348,194 to 826,388 vertices, saving **64,694,416 bytes (61.70 MiB)** of CPU geometry and the corresponding logical GPU vertex storage.
- The pavement overview determines useful cell keys before allocating cell objects and context arrays. It still replays every road/path insertion in its original order into those cells, including roads without sidewalks needed for subtraction and visibility. Baltimore has 91,682 candidate keys but only 4,358 useful cells. The former preparation allocated and populated 87,324 cells it subsequently discarded. Finished cells now release their input/context arrays after their mask is produced.
- Worker terrain-snapshot imports use the existing module version identities, removing three duplicate entry-graph identities found by source verification.

No source coverage, terrain grid resolution, texture resolution, facade detail, road collision coverage, or viewing distance was reduced.

## Observed comparison

These are individual physical-M1 runs at the same Baltimore location and viewport, with ordinary Chrome left open. The milestone is complete road refinement while pavement overview work is still running. They are not statistical performance guarantees.

| Measurement | Previous user build `5e88a56b` | Sparse preparation `5866de78` |
|---|---:|---:|
| First playable world | 58.58 s (`workers`) | 56.13 s (`sparse-journey`) |
| Primary renderer physical footprint | 3,912 MiB | 3,672 MiB |
| Browser-owned process footprint sum | About 5,292 MiB | 4,878 MiB |
| Active pavement-worker used heap | 352 MiB | 167 MiB |
| Unique scene geometry buffers | About 303 MiB | 241 MiB |

The total-process improvement is modest compared with the worker reduction. Loading remains within the previous observed range. The later `8910f7d5` worker releases finished-cell context progressively. Its completed-world run entered in 59.25 seconds, sampled 135.1 MiB of active worker heap, and observed all 4,358 overview cells complete at 208.16 seconds from probe start. The overview's own duration was 142.46 seconds; it runs after entry and is not additional blocking loading time. Source-array identities and counts remained unchanged throughout the logged progression. The worker terminated normally.

At the completed-background milestone, natural main heap was 429.7 MiB with 497.8 MiB backing storage. The last sampled primary-renderer footprint was 3,119 MiB and the browser-owned sum 4,311 MiB (4.21 GiB). This short steady-state sample is not a long-run ceiling. It demonstrates why measurements taken while the overview is active differ, while also confirming that a large native-footprint gap remains.

## A defensible budget calculation

There is no universal correct RAM or loading limit for every Earth location, device and cache state. Budget the actual working set and critical path, then validate the envelope on each supported device. Do not treat the inherited 120-second desktop loading gate or 1 GiB JavaScript-only limit as a measured product target.

For this Baltimore workload:

| Resource | Measured or calculated basis |
|---|---|
| Scene geometry after compaction | Approximately 241 MiB of unique CPU attribute/index buffers; a subset of backing storage, not another amount to add to it |
| Main-thread retained payload | Previous controlled GC measurements: approximately 420 MiB objects plus 558–569 MiB backing storage before this turn's geometry compaction |
| Geometry saving | Subtract 61.70 MiB from the old buffer payload; the first new natural-GC backing measurement is approximately 508 MiB |
| Exposed scene textures | 54,677,504 texels; RGBA8-equivalent base storage is 208.58 MiB, approximately 278.10 MiB with a complete mip chain |
| Render targets | Add `width × height × bytes-per-pixel × samples` per attachment; a 1440×900 RGBA8 attachment alone is 4.94 MiB. Bloom, antialiasing, depth and shadow attachments add to this |
| Pavement worker during refinement | Earlier measured heap 352–362 MiB; sparse preparation sample 167 MiB. Its lifetime ends only when overview construction finishes |
| Browser/driver overhead | Measure separately; do not assume GPU process footprint equals texture bytes, or equate V8 heap capacity with live objects |

For example, the retained CPU payload model after geometry compaction is about `420 + 558.5 − 61.7 = 916.8 MiB`. Geometry plus the RGBA8-equivalent mipmapped textures add approximately `241 + 278.1 = 519.1 MiB` of logical graphics resources. That gives about **1.40 GiB of accounted CPU/graphics payload before render targets, workers, engine allocation capacity, decoded-image/native caches and browser overhead**. This is a lower working-set model, not a promised process-memory ceiling. Some unified-memory or image allocations may be shared; it is not a substitute for process measurements.

The large gap between that payload model and the measured renderer/browser footprint is an optimization and attribution problem, not a reason to silently declare 4–5 GiB normal. A precise safe total-process ceiling cannot yet be justified from one physical desktop, and no physical-phone memory limit has been established. Keep testing natural peaks, completed-background steady state, and repeated transitions separately. [WebGL guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#estimate_a_per-pixel_vram_budget) likewise calls for measured resource accounting and viewport/device budgets; WebGL does not expose a portable maximum VRAM value.

Loading must distinguish document/runtime readiness, first playable world, complete road refinement, and complete pavement overview. In the baseline trace, initial provider acquisition takes about 10 seconds and the subsequent compile/publication interval about 43 seconds. Transport publication alone takes 22–26 seconds: roughly 5.8 seconds for structure profiles, 4.5–5 seconds for terrain grading, 2.3–3 seconds for structure ribbons, 6.5–7.5 seconds for initial carriageway regions, plus contact/assembly/marking work. These are overlapping phase measurements where noted, not numbers to add indiscriminately. The roughly nine-second optional Overpass wait overlaps the regional context request.

A 15-second cold entry would require a materially different compilation/data-delivery path; it cannot be justified by changing a timeout or cutting detail. Conversely, the current 55–60-second dense-city entry is a measured bottleneck, not a recommended experience. The current serial pipeline itself explains most of that time. Further loading work should remove or cache those measured dependencies, with exact world parity, rather than pick an arbitrary stopwatch target.

## Verification scope

The full component/source-contract suite passed 1,447 cases before the sparse-overview follow-up. The follow-up passed 86 pavement/ownership/geometry tests and eight streaming/actual-worker tests, including complete multi-kilometre coverage, an empty motorway plan, and subsequent worker requests after cells are released. Source verification passes. This is not a whole-product production certification.

Local receipts are under `output/architecture-evaluation/native-memory/`. `baseline`, `categories`, and `workers` inspect the old `5e88a56b` candidate; `optimized` and `optimized-journey` inspect geometry/terrain changes; `sparse-journey` inspects sparse preparation. Their `settled` label means **road-detail complete**, not complete pavement overview. It must not be reported as fully idle gameplay. `final-complete` attempted a separate completed-overview milestone but failed its readiness assertion; it is not passing evidence. The follow-up `completed-world/completion-receipt.json` records monotonically increasing cell progress, stable source identities, successful completion and worker shutdown. It does not reproduce a restart. After those measurements, its optional daylight screenshot setup attempted to import an unshipped source module and failed. This is a harness error; that run did not execute its later movement/menu checks and is not labeled a complete journey. The error is preserved in `failure.json`. Earlier `sparse-journey` supplies actual walking, driving, flight and Main Menu evidence. The final packaged Moon smoke passed on `8910f7d5`; its screenshot and the final Earth road-ready screenshot were inspected.

The diagnostic journey applies GC and a browser memory-pressure notification only after the natural measurements and Main Menu return. These are diagnostic probes, not application behavior or evidence of a user-visible fix. Even that probe does not release all native allocation charges. The remaining native allocation ownership is unresolved.


## September 28: scalar ground queries and overlapped publication

The latest runtime is `e6641af4`. Height-only queries now bypass diagnostic sample
objects while preserving the rich provenance API. Exact Float64 coordinates use a
bounded typed cache. Mapped-water sampling first selects conservative geographic
buckets and then applies the original containment/bed calculation. No elevations,
water holes or detail settings are approximated.

Planar road compilation now begins while final terrain is being published. A
readiness barrier prevents elevation snapshots or height probes from observing
provisional terrain. Worker cancellation, serial/preplanned complete geometry
parity and actual worker reuse are covered by the targeted tests. Initial region
publication still waits for the final terrain and contact geometry.

| Baltimore measurement | Previous `8910f7d5` | Latest `e6641af4` |
|---|---:|---:|
| First playable, individual unprofiled run | 59.25 s | 49.99 s |
| Transport publication | Earlier 22–26 s range | 16.96 s |
| Completed background, primary renderer footprint | 3,119 MiB | About 2,684 MiB |
| Completed background, browser-owned footprint sum | 4,311 MiB | About 3,979 MiB |
| Natural completed main heap / backing storage | 429.7 / 497.8 MiB | 403.5 / 503.2 MiB |

The latest run preserved 25,507 buildings, 18,759 roads, 49 terrain tiles and all
4,358 overview cells. All 555 refined road regions completed; 260 height probes
had zero difference. It exercised walking, driving, flight and Main Menu without
browser errors. These are individual runs, not a percentile or a guarantee for
other locations. A separate fresh repeat entered in 49.36 seconds.

Detailed Chromium allocator tracing after background completion attributed about
745 MiB to V8, 795 MiB to PartitionAlloc and 295 MiB to malloc in the main renderer.
After a diagnostic collection on Main Menu, V8 was about 56 MiB, PartitionAlloc
333 MiB and malloc 213 MiB, while the native footprint remained about 1.65 GiB.
The trace includes allocation ownership edges: parent/child and shared categories
must not be added together indiscriminately. See Chromium's
[memory-infra documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/README.md).
This rules out equating the entire process footprint with retained JavaScript
objects; it does not establish that the unexplained remainder is a browser bug.

The earlier performance harness imposed a 1,280 MiB V8 limit and collected garbage
between mode measurements. The harness now uses ordinary allocation behavior for
loading and active-play budgets, with post-GC values explicitly reserved for
retained-object diagnosis. It still does not turn a JavaScript budget into a
whole-process budget.

Evidence: `native-memory/numeric-ground`, `native-memory/overlapped-ground` and
`native-memory/cycles-ground` under the local architecture output directory.
The last directory remains in progress until its report is complete. Short flight
samples in the first two runs were approximately 28 FPS with long-frame spikes;
these do not pass the inherited desktop frame-time gate. Sustained-flight
profiling and repeated natural-memory cycles are the next acceptance checks.
