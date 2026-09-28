# World loading and memory — September 27, 2026

## Scope and method

Local changes on `steven/architecture-evaluation`; production is unchanged. Compare the existing staged-loading runtime `8b5c0161` with the memory work ending at `4ad5692a`. Each browser uses the same Baltimore location, 1440×900 viewport, real M1 Chrome and staging services. Heavy runs are sequential. Ordinary Chrome remains open.

Allocation runs sample JavaScript allocations and collect garbage before measuring entry, completed road refinement and Main Menu. `Runtime.getHeapUsage` reports JavaScript heap and backing storage separately. Scene geometry counts unique attribute/index ArrayBuffers. These are not total process RSS or total GPU memory; geometry is part of backing storage and must not be counted twice. Chrome documents the distinction in its [memory investigation guide](https://developer.chrome.com/docs/devtools/memory-problems).

A separate unprofiled journey measures initial loading and actual walking/driving/flight. Live provider, weather and host variation make individual runs directional evidence, not a statistical benchmark. Profiling times are not acceptance times.

## Repairs

- Street-furniture placement releases its temporary roadside spatial index after publication, including failure paths.
- Traversal graphs use contiguous typed adjacency storage. Edge ordering, one-way restrictions and double-precision weights are retained. Source-interval lookup uses cumulative distances and binary search instead of rescanning a path for every edge.
- Vegetation cells share immutable normalized model geometry. Each cell retains independent instance transforms, materials, LOD distances and aggregate frustum bounds. This handles Three r128's geometry-based instance culling without overwriting shared bounds. Per-cell instance GPU buffers are disposed on removal; bounded model templates remain cached for reuse.
- World exit clears derived transport models, walking-ground references, road-search and minimap indexes, mapped-ground lookup state, street-lamp fixtures and traffic-control placements. Permanent living-world and urban vehicle/equipment callbacks resolve the active runtime outside per-world closure scopes, including account reconnect callbacks. The next world rebuilds those indexes from its own data.

All changes preserve mapped roads/buildings, source geometry, vegetation placements and established detail distances. This work does not lower the source-data budget or hide available world content.

## Evidence

Final measurements and verification are recorded below after the browser checks finish. Local raw reports are under `output/architecture-evaluation/loading-memory-*`; they are verification artifacts, not shipped assets.
