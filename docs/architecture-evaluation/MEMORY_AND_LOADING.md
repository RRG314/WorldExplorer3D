# World loading and memory — September 27, 2026

The later whole-process investigation is recorded in [RESOURCE_BUDGET.md](RESOURCE_BUDGET.md). The measurements below describe the earlier `5e88a56b` work and must not be mistaken for total browser memory.

## Scope and method

Local changes on `steven/architecture-evaluation`; production is unchanged. Compare the existing staged-loading runtime `8b5c0161` with the memory work ending at `5e88a56b`. Each browser uses the same Baltimore location, 1440×900 viewport, real M1 Chrome and staging services. Heavy runs are sequential. Ordinary Chrome remains open.

Allocation runs sample JavaScript allocations and collect garbage before measuring entry, completed road refinement and Main Menu. `Runtime.getHeapUsage` reports JavaScript heap and backing storage separately. Scene geometry counts unique attribute/index ArrayBuffers. These are not total process RSS or total GPU memory; geometry is part of backing storage and must not be counted twice. Chrome documents the distinction in its [memory investigation guide](https://developer.chrome.com/docs/devtools/memory-problems).

A separate unprofiled journey measures initial loading and actual walking/driving/flight. Live provider, weather and host variation make individual runs directional evidence, not a statistical benchmark. Profiling times are not acceptance times.

## Repairs

- Street-furniture placement releases its temporary roadside spatial index after publication, including failure paths.
- Traversal graphs use contiguous typed adjacency storage. Edge ordering, one-way restrictions and double-precision weights are retained. Source-interval lookup uses cumulative distances and binary search instead of rescanning a path for every edge.
- Vegetation cells share immutable normalized model geometry. Each cell retains independent instance transforms, materials, LOD distances and aggregate frustum bounds. This handles Three r128's geometry-based instance culling without overwriting shared bounds. Per-cell instance GPU buffers are disposed on removal; bounded model templates remain cached for reuse.
- World exit clears derived transport models, walking-ground references (including the character’s last supporting road), road-search and minimap indexes, mapped-ground lookup state, street-lamp fixtures and traffic-control placements. Permanent living-world and urban vehicle/equipment callbacks resolve the active runtime outside per-world closure scopes, including account reconnect callbacks. The next world rebuilds those indexes from its own data.

All changes preserve mapped roads/buildings, source geometry, vegetation placements and established detail distances. This work does not lower the source-data budget or hide available world content.

## Evidence

Final runtime candidate: `5.3.0+5e88a56b9f21.caccc30c0e584177.staging`. Local reports are under `output/architecture-evaluation/loading-memory-*`; they are verification artifacts, not shipped assets.

## Loading and movement

The unprofiled `61f638dc` journey entered Baltimore in **55.545 seconds**, compared with **56.339 seconds** for the prior `8b5c0161` staged-loading journey. This difference is too small to establish a material loading improvement from the memory work. Later commits change exit ownership and action dispatch rather than the transport compiler or rendering path; their allocation-profiled load times must not replace this benchmark.

All 555 road regions completed at approximately 70.59 seconds. The journey retained 18,759 roads and 25,507 detailed buildings, had no browser errors or failed local resources, and completed actual walk/drive/flight inputs and Main Menu exit. Average FPS was 42.5 stationary walking, 44.1 moving walking, 41.5 stationary driving, 41.9 moving driving and 36.9 flight. These short samples do not close the existing frame-time release gates.

The initial transport publication still costs roughly 23 seconds: 5.57 s structure profiles, 4.62 s terrain grading, 2.56 s structure ribbons and 6.61 s initial carriageway preparation, plus assembly/contact/marking work. Provider acquisition remains variable, including the roughly nine-second optional Overpass wait. Those are the remaining substantial loading costs; memory cleanup is not evidence that they are solved.

Screenshots of the physical journey and a diagnostic tree camera were inspected. The near tree view and the view after turning away and back preserve the same foliage and trunk. Geometry sharing does not change placement rules or repair pre-existing scenery/placement issues.

## Final memory measurements

| Measurement (MiB, after GC) | Starting runtime `8b5c0161` | Final first visit | Final second visit |
|---|---:|---:|---:|
| Settled JavaScript heap | 454.80 | 420.89 | 415.19 |
| Settled backing storage | 617.25 | 558.52 | 568.62 |
| Unique scene geometry buffers (subset of backing storage) | 364.52 | 302.75 | 301.59 |
| Main Menu JavaScript heap | 162.29 | 41.58 | 43.20 |
| Main Menu backing storage | 85.02 | 68.43 | 79.92 |

The first settled visit saves about 34 MiB of heap and 59 MiB of backing storage. Geometry falls about 17%; vegetation geometry specifically falls from 62.42 MiB to 0.66 MiB by sharing templates. The memory figures overlap where stated and do not imply an equivalent total-process or GPU reduction.

The second visit uses the same tab without reloading the document. Both visits complete all road regions and retain 18,759 roads. The provider returns 25,507 buildings on the first and 25,511 on the second. The coverage assertion permits added buildings; it does not require live provider responses to be byte-identical. The actual Backpack menu opens/closes in both visits. No browser errors or failed local resources were recorded. The first world's road is held only through a WeakRef in the probe and is confirmed collected after exit. Two cycles establish this bounded result, not an unlimited-session memory guarantee; the second menu's backing storage is about 11.5 MiB higher and remains a metric to monitor.

Evidence: `output/architecture-evaluation/loading-memory-verified/report.json`. Intermediate `loading-memory-cleanup` and `loading-memory-release` receipts are not acceptance: they exposed a retained supporting-road reference and an overly strict live-building equality check. A desktop UI check initially selected the hidden mobile-only backpack toggle; it was corrected to the real desktop Backpack menu before the passing run.

The full component run passed 1,443 tests. Nine focused memory/ownership tests subsequently passed, including the added current-world action-dispatch test and final walker cleanup assertion. Earlier VM extraction harness failures were corrected and rerun; they are not counted as runtime failures or silently discarded.

Heap snapshots stayed outside the repository with owner-only permissions. Only filtered ownership paths are retained in the local evidence folder. A whole-file JSON parser exceeded its analysis heap limit; a streaming typed-array reader completed the same analysis. This was an analysis-tool failure, not a game crash.

This work is local only. It improves live allocations and world-exit cleanup substantially, while the roughly 55-second dense-city entry remains a significant loading limitation. It does not certify every location, physical-phone performance, the full release matrix or production readiness.

The prescribed packaged Moon client passed on the final candidate, including movement, pause/resume and title authentication UI. Its gameplay screenshot was inspected. Receipt: `output/verification/game-client-smoke/report.json`. This is separate from the Earth memory and movement checks.
