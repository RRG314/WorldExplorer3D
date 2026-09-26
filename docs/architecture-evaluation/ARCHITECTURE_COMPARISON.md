# Architecture comparison

Assessment for the inspected World Explorer candidate, September 26, 2026. **No alternative has been benchmarked against an equivalent world.** Performance/memory/startup expectations below are hypotheses. Risk ratings are qualitative judgments from code coupling and required parity, not synthetic scores.

| Option | Browser performance, memory, startup | CPU/GPU capability | Complexity, migration/parity risk | Fit |
| --- | --- | --- | --- | --- |
| A Current JS/Three + repairs | Can remove measured wasted work without engine payload change; no numeric gain established | Existing WebGL and workers | Lowest incremental risk; ownership defects remain unless repaired | Immediate work |
| B JS + progressive TS | Similar emitted runtime; contract checking catches boundary errors rather than speeding frames | Same as A | Low staged risk; some build/import handling needed | Recommended boundary strategy |
| C TS + Three/WebGL everywhere | Similar runtime to A; conversion itself does not cut heap | Same renderer/worker limits | Broad conversion increases review/churn without equivalent benefit | Do not convert untouched modules |
| D TS + gradual Three WebGPU | Potential draw/compute benefits; shaders/pipeline/startup may cost more | Modern GPU API with appropriate fallback | High shader/color/postprocess migration from r128 | Separate measured experiment later |
| E JS/TS + Workers | Can reduce main-thread stalls; extra heaps and cloning can increase memory/startup | Parallel CPU, unchanged GPU | Existing worker pipeline reusable; bounded cancellation needed | Extend only measured jobs |
| F JS/TS + Rust/Wasm kernels | Numeric workload may improve; marshaling, Wasm startup and memory may negate it | Compiled CPU kernels, worker optional | New toolchain/ABI/ownership/testing | No selected kernel until profile |
| G JS/TS + WebGPU compute | Fits large parallel resident data; readback can erase gains | GPU compute | Two paths needed for fallback; hard debugging/synchronization | Not selected for current workloads |
| H TS + Workers + Rust + WebGPU | Combines opportunities and all overheads | Broadest browser compute options | Highest browser implementation complexity | Optional evolution, not immediate target stack |
| I Babylon migration | No demonstrated runtime advantage for this app | Browser WebGPU/WebGL + engine systems | Rebuild Three adapter, shaders, cameras and interactions; high parity risk | Credible experiment only with measured need |
| J PlayCanvas migration | No demonstrated runtime advantage; engine assets/startup must be measured | Browser WebGL2/WebGPU + engine systems | Rebuild scene/material/input integration; high parity risk | Same condition as I |
| K Godot rewrite | Browser export has Wasm/memory/compatibility constraints | Native renderer/physics; Web export constrained | Very high JS/DOM/gameplay migration and parity burden | Future client, not browser replacement |
| L Unity rewrite | Web build/runtime/heap must be measured; not inherently leaner | Native engine/physics, Web restrictions | Very high C#/UI/controller migration and native tooling burden | Future client, not browser replacement |
| M Native + retained browser | Native can exploit platform facilities; browser still needs fixes | Separate native/browser pipelines | Two products and parity matrix maintained indefinitely | Defer client; prepare contracts now |
| N Portable boundaries in current browser | No immediate engine overhead; avoid cloning whole world for portability | Existing JS/workers, later measured kernel adapters | Incremental, medium boundary complexity | Recommended form of refactor in place |
| O Unreal streaming | Browser decodes streamed video, not local world | Remote GPU per session | Hosting/latency/operations cost; entirely different delivery model | Reject for primary requirement |
| P Bevy rewrite | Rust/Wasm engine; no measured app advantage | ECS/wgpu with target differences | JS domain/UI port and engine version/tooling work | Not justified now |

## Remaining comparison dimensions

| Dimension | Keep/refactor/worker extensions | Alternate browser engine | Godot/Unity/native/Bevy |
| --- | --- | --- | --- |
| Mobile and Safari reach | Preserve current path; feature-detect additions | WebGL2 fallback/device validation required | Version/renderer/export-specific restrictions; separate native mobile testing |
| Geospatial compatibility | Keep existing normalization/datum/identity | Reuse model logic; rewrite presentation | Consume common records; custom terrain/road interpretation cannot be skipped |
| Assets | Existing GLB/material pipeline and licenses | Models often reusable, materials/shaders reworked | Importable assets still need scale/axis/material/LOD validation |
| Backend and multiplayer | Preserve commands/rules/revisions; narrow adapters | Same authorities with presentation changes | Native auth/network adapter; same transaction/custody semantics, no parallel authoritative wallet |
| Accessibility/SEO | Existing DOM public site and controls | Can retain DOM but rewire controls | Engine UI is not equivalent to current HTML; public site remains separate |
| Tests | Existing pure tests and browser journeys mostly retained | Reuse data/domain tests; rewrite engine/UI fixtures | Golden domain vectors + new engine tests; same difficult cross-system journeys |
| Maintenance/longevity | Familiar stack; reduce shared context gradually; supported dependency upgrades | Additional migration knowledge, engine upgrade discipline | Multi-language/toolchain expertise; stronger native tooling does not remove product complexity |
| Hosting/cost | Static files and existing backend; worker/Wasm bytes add transfer | Static deployment remains possible; editor services optional | Native packaging/signing/build distribution; Unreal streaming uniquely adds continuing GPU-session capacity |
| Debug/profiling | Browser tools + owner counters; preserve source maps | Browser + engine inspector | Engine profiler plus browser/native/backend tools; harder cross-boundary attribution |

## Portability acceptance

All serious options must keep one backend/data authority and the same canonical IDs/frames/revisions. TS interfaces improve communication but are not runtime schemas or native implementations. JSON/typed-array records are easier to reuse than Three meshes, DOM elements or Firestore snapshots. Rust may allow actual computational code reuse, but only after a stable bulk ABI and measured benefit justify it.

The winning option is N implemented through A/B/E: refactor the current browser product, use selective type checking, preserve existing workers and make data/authority interfaces portable. WebGPU and Wasm remain evaluated extensions. No full rewrite is accepted without the specified geographic/terrain/roads/buildings/walking/vehicle/collision/camera/teardown/place/persistence/mobile vertical slice and matched measurements.
