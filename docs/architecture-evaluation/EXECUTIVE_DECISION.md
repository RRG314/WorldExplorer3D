# Engineering decision

**Primary path: REFACTOR IN PLACE.** This is the current architecture decision, conditional on completing the normal-player performance study. The evidence does not justify a full engine rewrite, immediate Rust conversion, or a production WebGPU migration.

Keep the browser product, Three.js/WebGL presentation, HTML controls/accessibility, existing Firebase authorities, mapped identities, and working game rules. Tighten ownership and make selected data/domain boundaries explicit. Use incremental TypeScript checking at those boundaries, not a repository-wide conversion. Continue the existing worker pipeline before introducing a second implementation in another language.

## Why this application

The inspected candidate already separates several difficult parts: transport-source normalization, building provenance, world-load request/session records, shared interior layout, authoritative expedition mutations, wallet/property transactions, and typed-array worker results. Replacing these would add parity risk without a measured benefit. Conversely, source inspection found 166 modules importing the shared context and 191 containing direct `THREE.` references across 803 browser JS files. Those are lexical coupling indicators, not 166 independent systems or evidence of a memory leak.

The current snapshot is primarily a publication summary. Its layer products contain counts and compiler metadata; it cannot reconstruct a complete world in another engine. Buildings retain many semantic fields on meshes. The urgent portability work is to expose the existing canonical records, units, identities and relationships independently of meshes, not introduce a second world loader.

A deterministic service-reset race was reproduced and corrected in this branch. It demonstrates an ownership defect that no language change would automatically fix. No normal-player speedup is claimed for that repair.

## What changes now for a future Godot or Unity client

| Decision | Scope |
| --- | --- |
| Keep unchanged | Existing Firebase data authority, stable source IDs, authorization rules, financial/cargo receipts, current public browser delivery and game capabilities |
| Refactor | Explicit owners and disposal for asynchronous services; narrow shared-context dependencies; separate building definitions from mesh lookup; distinguish publication summaries from full world records |
| Make engine-neutral | Provider-normalized records, building/entrance identity, road topology, coordinate frames, interior layout, vehicle specifications, expedition/resource rules and authority commands/results |
| Introduce TypeScript selectively | Checked schemas and authority/worker interfaces first; retain runtime validation for network and saved data |
| Keep JavaScript | Stable pure algorithms and presentation code until touched for a concrete reason; types do not themselves improve frame rate |
| Keep Three-specific | Mesh/material creation, shader implementation, LOD presentation, camera/render targets and GPU disposal |
| Workerize selectively | Extend measured geometry/topology jobs using existing workers and transferables; preserve cancellation and fallback |
| Rust/Wasm | No module selected yet. Require same-input timing including marshaling, startup, memory and fallback before selection |
| WebGPU | Separate future renderer experiment after current Three upgrade/shader inventory; preserve a browser-compatible fallback |
| Premature | Three native/browser game implementations, wholesale TS conversion, full ECS rewrite, replacing Firebase, binary serialization everywhere |

Godot and Unity would consume the same versioned world/domain contracts and backend commands. Their renderer, UI, input integration and physics adapters would still be new implementations. They must not independently infer OSM identities or reimplement financial authority.

## Decision limits

The A–T normal-player profile is incomplete because the local 8 GiB Mac is under memory pressure. No candidate engine has an equivalent-world benchmark. Expected benefits in the comparison are hypotheses, not measured percentages. Revisit the decision only when a representative alternative slice demonstrates better performance and full difficult-feature parity on equivalent data/hardware. Production deployment is explicitly excluded.
