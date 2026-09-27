# Browser performance budget

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

These are proposed starting ceilings for the contained slice, not performance results or final product limits.

| Work | Desktop slice | Mobile slice | Behavior at budget |
|---|---:|---:|---|
| Detailed humanoid mixers | 8 | 4 | Distance/importance-ranked animation LOD; preserve interacting actors |
| Mid-distance update | 10 Hz | 5 Hz | Interpolate visual pose; no loss of authoritative simulation |
| Far population | Aggregate | Aggregate | No full skeletons merely to represent population |
| Room simulation | 20 Hz | Server-owned | Bounded catch-up, measure drift |
| Network snapshots | 10–20 Hz | Same state semantics | Coalesce superseded poses, never silently drop durable events |
| Projectiles per room | 64 | Same authority | Reject attempts beyond server budget without consumption |
| Effect instances | 32 | 12 | Pool; prefer impacts relevant to local player |
| Simultaneous audio voices | 12 | 6 | Prioritize nearby confirmed events |
| Client queues | Explicit bounded size | Explicit bounded size | Resnapshot/backpressure, no unbounded backlog |

Existing local two-character lab: 33 draw calls with characters alone, 41 with two held sidearms. This is a count, not an FPS benchmark. The existing player GLBs have 15/17 mesh primitives respectively, so naïvely loading 32 detailed players would be costly even with modest triangles. Consolidate compatible materials offline and author LODs before increasing crowds. Skinned characters do not become ordinary instanced static meshes without a skinning strategy.

Measure matched baseline/candidate normal-clock runs: same location/data, camera route, device, graphics tier, actors and action rate; record frame-time p50/p95/p99, long tasks, animation/physics time, draw calls, upload/receive bytes, GC/heap and renderer counts after repeated teardown. Do not use virtual-time browser steps as FPS evidence.

The earlier refactor's measured numeric-query improvements do not establish multiplayer frame-rate improvement. Workers/Wasm require profiles showing a transferable bottleneck and transfer cost; no WebGPU rewrite is justified by these component results. Sustained new-action performance and memory retention remain unrun.
