# Current runtime profile

Baseline `bbe6502228e369fe2a15dc6a177f5d83948584c3`; September 26, 2026. **Normal-player profiling is incomplete.** No Chrome process RSS is reported as application JS memory.

## Measurements obtained

- Local machine: 8 GiB Apple Silicon Mac; `kern.memorystatus_vm_pressure_level` repeatedly returned `2` (warning). Disk check: 32 GiB available. A full world workload was not launched under that pressure.
- Static browser-source scan: 803 JS files, 8,618,396 bytes after the small registry repair. Estimated literal static entry closure: 232 modules / 2,200,091 source bytes. Includes neither network compression nor all computed imports/vendor scripts. See `evidence/source-inventory.json` and the reproducible script.
- Diagnostics source: 68,414 bytes / 1,436 lines, statically imported at entry. Inspection found large snapshots are invoked on request; no automatic caller elsewhere in app/js was found. This is download/parse surface, not evidence that snapshots run every frame.
- Component reproduction: a pending service reset left one stale ready value and zero disposal calls. After repair: zero stale publication and one disposal. Five lifecycle tests pass, including retry and late failure. This is a deterministic resource-ownership result, not a GPU or gameplay benchmark. A bounded browser-component fixture also passed and its screenshot was inspected; it uses no world or backend.

## Required scenario ledger

All rows below require a normal, unmodified simulation clock, a visible foreground tab, no repeated large diagnostic snapshots, fixed quality for matched comparisons, recorded viewport/DPR/driver/browser/build, and no overlapping workload.

| Scenario | Intended observation | Current evidence |
| --- | --- | --- |
| A title/startup | Cold/warm transfer, parse/init, globe GPU, idle tasks | Source inspected; normal-player metrics pending |
| B first Earth load | Provider wait vs compiler vs uploads; first usable frame | Pending |
| C walking | Actual displacement; frame distribution | Pending |
| D sustained walking | At least 120 s; GC and streaming/resource growth | Pending |
| E driving | Actual driven distance; collision and camera | Pending |
| F sustained driving | At least 120 s; sustained allocations | Pending |
| G flight | Aircraft load, physics, large visible area | Pending |
| H dense city | Same coordinates and source hashes before/after | Pending |
| I rural | Distinguish low object count from provider delay | Pending |
| J vegetation-heavy | Instancing, draw calls, retained vegetation | Pending |
| K building-heavy | Facade materials, batches, shader compilation | Pending |
| L Ocean | Separate renderer/frame ownership, teardown | Pending |
| M planetary | Terrain assets/track state and return | Pending |
| N Space | Destination and ship renderer ownership | Pending |
| O interior | Entry/exit, imported assets, collision state | Pending |
| P Reality Capture | Local empty draft/editor only; no private photos | Pending |
| Q return menu | Immediate and settled resource deltas | Pending |
| R Earth → other → Earth | Correct state and retained resources | Pending |
| S repeated locations | Three bounded switches, steady-state vs growth | Pending |
| T repeated environments | Three cycles, settled heap/GPU/listeners | Pending |

Previous backend and software-rendered CI journeys establish functional coverage only. They cannot fill these hardware-performance rows.

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

Do not change acceptance thresholds to complete a run. Abort under resource guard and preserve partial data with its termination reason. The next measurement session must start with normal memory pressure; leave the user's ordinary Chrome session open.
