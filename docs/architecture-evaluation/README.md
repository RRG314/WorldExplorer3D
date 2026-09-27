# World Explorer architecture evaluation

Production is already live at `bbe6502228e369fe2a15dc6a177f5d83948584c3`. This isolated branch is not deployed. The latest request is browser-first architecture evaluation with future engine portability.

**Investigation in progress.** Start with [the current decision](FINAL_ARCHITECTURE_DECISION.md), which states both measured conclusions and remaining work. It is not an exhaustive-audit completion certificate.

- [Measured hotspots and coverage](HOTSPOT_PROFILE.md)
- [All context/Three source-access classifications](COUPLING_CLASSIFICATION.md)
- [Portable core map](PORTABLE_CORE_MAP.md) and [real-location proof](PORTABLE_WORLD_SCHEMA.md)
- [Rust evaluation](RUST_WASM_EVALUATION.md) and [actual benchmarks](RUST_WASM_BENCHMARKS.md)
- [TypeScript pilot](TYPESCRIPT_EVALUATION.md), [Workers](WORKER_EVALUATION.md), [WebGPU](WEBGPU_EVALUATION.md)
- [Godot/Unity reuse](GODOT_UNITY_PORTABILITY.md), [system matrix](ARCHITECTURE_DECISION_MATRIX.md), [implementation priorities](IMPLEMENTATION_PRIORITY.md)
- [Repairs](REPAIRS_COMPLETED.md), [primary-source research](TECHNOLOGY_RESEARCH.md), [measurement method](CURRENT_RUNTIME_PROFILE.md)

Earlier architecture/comparison/migration reports remain background. Current measured results supersede earlier memory-pressure deferrals. Ordinary Chrome remains open and local heavyweight work is serialized. Component tests, source evidence, normal-clock hardware samples and live deployment acceptance remain distinct evidence levels.
