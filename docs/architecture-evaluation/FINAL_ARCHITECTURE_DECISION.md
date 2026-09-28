# Browser-first architecture decision

**Current decision: refactor in place. Do not rewrite World Explorer or move it out of the browser.** Keep Three.js and Firebase while strengthening the existing data/domain boundaries. This is the decision supported by the work so far; the exhaustive investigation is **not complete**. Remaining coverage is listed below so this document cannot be mistaken for full certification.

## Local implementation update

The owner subsequently authorized local implementation. The [implementation ledger](LOCAL_REFACTOR_PLAN.md) is now the current source for promoted changes: compiler-owned sorted profile sampling, allocation-reduced decal clipping, explicit geographic selection, strict boundary checks and renderer ownership diagnostics. Visual testing also exposed and repaired stale Earth overlays on environment departure. These changes remain local. The broader investigation limits below still apply; neither a complete rewrite nor a general FPS gain is claimed.

## What the measurements say

A physical Apple M1 run loaded Baltimore in roughly 88 seconds. Compiled transport publication consumed about 45 seconds elapsed. An earlier same-compiler run already identifies carriageway integration (~18.85 s), terrain corridors (~8.03 s) and structure profiles (~5.61 s) as its largest nested phases. These include cooperative scheduling; CPU/allocation attribution still matters. A follow-up collected-allocation sample and long-task observer corroborate heavy temporary work and multi-second main-thread tasks during the larger journey. A renderer rewrite does not follow from these timings.

The isolated transport-height experiment used 18,758 actual road profiles and 187,580 replay queries. Median times were 7.7 ms for current JS, 4.7 ms for binary-search JS, 5.5 ms for scalar Wasm, and 2.6 ms for resident batched Wasm. Every result matched exactly. Wasm's batch advantage does not fit the current synchronous per-contact API automatically. The experiment includes initialization, copies, memory and Worker round trips; it is not an FPS gain.

Space, Moon and Mars entry scenes held approximately 60 FPS in short stationary hardware samples, with no page errors. Their screenshots were inspected. These results do not cover all destinations, travel or phones. A rural mountain night sample also held near 60 FPS walking and 58 FPS driving. Earth’s dense urban compilation remains the stronger current performance concern. The complete existing Capture index is already substantially faster than scanning; preserve it. Three equal urban teardown cycles cleared world owners and kept renderer resource counts stable, with a small post-GC heap increase requiring longer observation before any leak claim.

A real-location projection contains 139 building identities, 59 roads, 102 entrances and 29 POIs with existing provenance and a sampled terrain grid. The current Three renderer can consume it in a diagnostic preview. This establishes a useful data boundary without creating another world authority; full gameplay visual parity is not claimed.

## Technology decisions

- **Rewrite? No.** Partially refactor expensive compiler and inappropriate semantic/presentation boundaries. Preserve working normalization, provenance, session ownership, layout, backend transactions and existing typed-array Worker outputs.
- **TypeScript? Boundary-only first, then progressively where useful.** The pilot catches nullable-request, immutable-coordinate, coordinate-frame and provenance-shape mistakes. Keep runtime validation. Do not convert hundreds of files to meet a percentage.
- **Rust? Not in the runtime yet.** The measured scalar kernel loses to optimized JS. Retain the isolated prototype; reconsider only for a profiled bulk workload with a clear native/Wasm ownership contract.
- **WebAssembly? Experimental bulk computation only at present.** Initialization and copied memory matter. No production Wasm dependency was introduced.
- **More Workers? Potentially for numeric compiler stages, after a measured boundary trial.** Keep immediate collision/wheel contact queries synchronous. Preserve existing Worker result/cancellation contracts.
- **WebGPU? Later, through a bounded renderer experiment.** No measured benefit currently justifies migrating Three r128 and all custom materials. Maintain browser fallbacks and visual parity.
- **What stays JavaScript?** Current orchestration, controllers, domain implementations and pure numerical code that already performs adequately. Types can describe boundaries without replacing working code.
- **What stays Three-specific?** Scene ownership, meshes/materials/shaders, camera, animation, asset rendering, batching and presentation-only transforms.
- **What becomes neutral?** Existing world definitions, stable identities/provenance, explicit coordinate frames, numeric query inputs/results, interior layouts, player/resource/activity/vehicle records and authority commands.
- **What stays Firebase/backend-specific?** Authentication adapters, SDK/listener/storage plumbing and authoritative economy/property/shared Expedition mutations. Future clients call the same authority.

## Future Godot and Unity reuse

Both can reuse neutral records, source artifacts, schemas, assets subject to their licenses, backend contracts, rules and test vectors. JS algorithms generally require a port or selected native library binding. Renderer, shaders, UI, controls and physics integration need engine-specific implementation. No native client is being built, and no source-line reuse percentage is promised.

Make migration easier now by exposing the existing compiler's canonical records and typing commands/queries. Do not build a second compiler or copy server authority into each client. JSON semantic records plus explicit typed-array buffers and GLB assets are adequate until measurements justify another format.

## Repairs and limitations

The evaluation branch contains the previously proven stale-service generation guard and a small selected-place-card/menu overlap correction. Production has not changed. The menu fix passes both the focused actual-CSS fixture and the full Earth selected-building → Travel → Space normal pointer path; screenshots were inspected. A measured frontage bounds-rejection change preserves replay outputs and reduces its component time by about 28%, with a successful full-world smoke check. Rust, Workers and portable preview code are isolated experiments.

The coupling report lists all 166 context consumers and 191 lexical THREE matches. Two are comment-only; 189 have executable member access. The access inventory is syntax-aware, but most classifications are still triage, **not completed transitive function/lifecycle review**. They are not 166/191 defects or leaks.

Outstanding before calling the requested investigation complete: matched sustained ground routes and alternating locations; daytime vegetation and live Capture panel profiling; finer stage-level allocation/task attribution and matched whole-load optimization results; full transitive coupling review; production-quality interchange validation beyond the bounded preview; and physical Safari/mobile comparisons where conclusions depend on those platforms.

First: finish bounded correctness checks, then target the measured transport compilation stages and type their existing boundaries. See [implementation priorities](IMPLEMENTATION_PRIORITY.md), [hotspots](HOTSPOT_PROFILE.md), [benchmarks](RUST_WASM_BENCHMARKS.md) and [decision matrix](ARCHITECTURE_DECISION_MATRIX.md).
