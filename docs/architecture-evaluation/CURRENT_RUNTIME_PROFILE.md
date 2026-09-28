# Current runtime profile

Baseline `bbe6502228e369fe2a15dc6a177f5d83948584c3`; September 26, 2026. **Normal-player profiling is incomplete.** No Chrome process RSS is reported as application JS memory.

## Measurements obtained

The owner authorized physical hardware profiling. Earlier resource-pressure deferral is historical and no longer a prerequisite. Chrome remains open; owned test browsers run one at a time and close afterward.

Two headed Chrome/M1 urban pilots completed on normal RAF at fixed medium quality, 1280×800/DPR1. First playable was approximately 88 seconds. The captured world contains 18,758 road profiles and 25,507 building collider records. Captured road inputs now support the isolated JS/Worker/Rust comparison. Screenshots confirm actual walking/driving scenes; short walking displacement terminates near a building, so these are not sustained traversal benchmarks.

[Hotspot profile](HOTSPOT_PROFILE.md) records actual load phases, sampled CPU, coverage gaps and interpretation limits. [Rust/Wasm benchmark](RUST_WASM_BENCHMARKS.md) records component timing and exact output comparisons. [Evidence summaries](evidence/transport-input-capture-summary.json) retain per-window frame times, counters and provenance.

The Ocean/return session reached both environments, then encountered a real selected-place card that intercepted the Space menu click. The original failed journey remains recorded; a bounded CSS correction subsequently passed the same full-world normal pointer path and both screenshots were inspected. Legacy `renderer` diagnostics refer to the Earth renderer even in auxiliary environments; those counters are not Ocean rendering evidence. Dedicated environment profiling reads each actual renderer owner.

The service reset fix still has no proven normal-player FPS benefit. Likewise, no before/after whole-world performance improvement is yet established by the numeric prototype. Rural night profiling, full Capture selector replay, three equal urban cycles and a sampled live-allocation window are now captured, along with compile allocation traffic, journey long tasks and a 90-second daylight flight. Sustained routes, alternating locations, daytime vegetation and matched compile-stage improvements remain outstanding; see the scenario ledger in HOTSPOT_PROFILE.md.

## Measurement design

Collect cheap renderer.info counters and CDP Performance/Memory domain summaries at phase boundaries, not per-frame scene traversals. Frame sampling uses requestAnimationFrame deltas in an in-page bounded array. CPU profiles should be separate sampled runs because profiling changes timings. Record first-contentful-paint/navigation/resource entries separately from first usable world.

| Category | Method | Interpretation |
| --- | --- | --- |
| JS heap | CDP JSHeapUsedSize/TotalSize at boundaries; optional isolated post-GC diagnostic run | Managed heap, not total browser memory; forced-GC runs are not normal timings |
| DOM/listeners | CDP DOMCounters plus owned lifecycle counters | Counts, not bytes; registry omits untracked listeners |
| CPU | Performance.getMetrics deltas, separate sampled profiler | JS/task/layout time; not GPU duration |
| GPU | renderer.info geometry/texture/program/draw counts; optional GPU timer query if supported | Counts do not equal GPU bytes; disjoint timing samples rejected |
| Geometry/typed arrays | One explicit diagnostic traversal with object-identity deduplication | Estimate retained CPU buffer bytes, label shared backing buffers |
| Textures/materials | Deduplicate texture/image identities; dimensions/mips/formats | Estimate, do not invent driver allocation sizes |
| Workers | Creation/termination events; input/output byte lengths; transfer lists | Separate copies and transferred/detached ownership |
| Network | CDP encoded transfer by resource and provider, errors, cache provenance | Response body size differs from network transfer |
| Storage | Storage.estimate, IDB database/store counts, localStorage sizes only | Do not capture private record contents |
| Firebase | Endpoint/listener counts and lifetime; isolated test account | Network counts do not prove billable document reads |
| Browser/test overhead | Owned process samples separately; no emulators concurrent | Never add RSS to heap or call CI SwiftShader results player performance |

After each teardown sample immediately, after 5 seconds, and after 30 seconds idle. Determine which references intentionally remain (ES modules, shared GLB templates, bounded caches) and which should be released (world buffers, renderer context, subscriptions). A retained module namespace is not by itself a leak. Require growth across repeated equal cycles before claiming a leak.

Do not change acceptance thresholds to complete a run. Abort under resource guard and preserve partial data with its termination reason. Leave the user's ordinary Chrome session open. Record host conditions, run one owned workload at a time and avoid attributing OS/browser contention to application heap.
