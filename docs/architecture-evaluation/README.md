# World Explorer architecture evaluation

The measured runtime improvements from this investigation shipped September 28,
2026, at source commit `2839df5d6bbed9f8dfa4b89e379ba2e026cab438`.
Earlier documents describe the local investigation at their stated dates;
their no-deployment notes are historical. See the current
[release status](../RELEASE_INTEGRATION_STATUS.md) for shipped scope and limits.


**Local implementation:** start with [the implementation plan and checks](LOCAL_REFACTOR_PLAN.md). For the broader investigation, see [the current decision](FINAL_ARCHITECTURE_DECISION.md), which states both measured conclusions and remaining work. It is not an exhaustive-audit completion certificate.

- [Measured hotspots and coverage](HOTSPOT_PROFILE.md)
- [All context/Three source-access classifications](COUPLING_CLASSIFICATION.md)
- [Portable core map](PORTABLE_CORE_MAP.md) and [real-location proof](PORTABLE_WORLD_SCHEMA.md)
- [Rust evaluation](RUST_WASM_EVALUATION.md) and [actual benchmarks](RUST_WASM_BENCHMARKS.md)
- [TypeScript pilot](TYPESCRIPT_EVALUATION.md), [Workers](WORKER_EVALUATION.md), [WebGPU](WEBGPU_EVALUATION.md)
- [Godot/Unity reuse](GODOT_UNITY_PORTABILITY.md), [system matrix](ARCHITECTURE_DECISION_MATRIX.md), [implementation priorities](IMPLEMENTATION_PRIORITY.md)
- [Repairs](REPAIRS_COMPLETED.md), [primary-source research](TECHNOLOGY_RESEARCH.md), [measurement method](CURRENT_RUNTIME_PROFILE.md)

Earlier architecture/comparison/migration reports remain background. Current measured results supersede earlier memory-pressure deferrals. Ordinary Chrome remains open and local heavyweight work is serialized. Component tests, source evidence, normal-clock hardware samples and live deployment acceptance remain distinct evidence levels.
