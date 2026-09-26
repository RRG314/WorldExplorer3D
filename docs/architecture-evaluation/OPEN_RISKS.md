# Open risks and completion conditions

**The investigation is not complete.** The architecture recommendation is deliberately narrower than the requested performance certification.

| Open item | Why it matters | Required completion evidence |
| --- | --- | --- |
| A–T normal-player profiles | Dominant CPU, GPU, memory and transition costs remain unmeasured | Stable hardware, one visible normal-clock browser workload, phase-specific samples and actual movement |
| Sustained teardown/retention | Disposal callsites and scope counts cannot prove complete resource release | Repeated equal cycles, settled heap/GPU/DOM/worker counts and retaining-owner diagnosis |
| Registry full-app smoke | Node and browser-component tests prove the race but not all app integration | Current source browser boot and lazy service activation/reset handling; no stale unhandled errors |
| Full source ownership inventory | Current inventory maps major chains; lexical import scan is not exhaustive semantic dependency analysis | Trace remaining callsites, dynamic imports, shared-context writes, raw timers/listeners and hidden UI |
| Portable real-location proof | Current WorldSnapshot is a summary, not a complete interchange representation | Reuse existing canonical records; real geographic input, current Three adapter, identities/frames/heights/entrances/POIs/provenance and visual equivalence |
| Shader/asset migration inventory | r128 → current Three/WebGPU is not drop-in | List custom shaders/hooks/postprocessing/loader formats, representative visual baselines and fallback support |
| Firebase normal-player activity | Endpoint/network counts are not billable document reads | Isolated authorized account, listener lifetimes, server metrics and command/receipt trace without private records |
| Physical Safari/phone performance | Desktop/software CI is not phone GPU responsiveness | Real-device profile and UI walkthrough across touched features |
| Alternative benchmark | No evidence another engine is faster/lighter for this app | Equivalent geographic vertical slice, same assets/data, startup/CPU/GPU/memory/teardown and parity |
| Rust/native ABI | Portability does not erase data-copy/toolchain costs | Only after a measured kernel: bulk ABI, deterministic golden outputs, browser/native builds and boundary timings |
| Module cleanup semantics | Some lazy services return module namespaces rather than disposable handles | Explicit service-owner disposal contracts before using global reset as a complete app shutdown |

The Mac repeatedly reported memory pressure level 2. The user's ordinary Chrome session must stay open. No full local world load, emulator or whole release matrix was started for this investigation under that warning. An asynchronous request asked whether unrelated heavy work can be paused; absence of an answer is not permission to close it.

Existing remote release checks remain tied to the frozen baseline. Their credential cleanup is handled by the pre-existing completion watcher; it must be verified when those runs finish. They are not architecture performance measurements. No new production action is allowed.

Historical capture/performance/release documents remain preserved. Conflicting dates/status claims must be resolved against current source and actual service evidence, not copied as current defects. The number of tests/files is not a measure of readiness.

Completion requires updating CURRENT_RUNTIME_PROFILE with real samples, identifying and remeasuring any demonstrated hot-path/lifetime repairs, completing remaining source traces, and revisiting the decision based on those results. Until then do not label this a completed comprehensive audit or the release production-ready.
