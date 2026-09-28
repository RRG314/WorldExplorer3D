# Rust/Wasm evaluation

**Do not adopt Rust in the runtime on current evidence.** One measured candidate supports improving the JS algorithm first. See [the benchmark](RUST_WASM_BENCHMARKS.md).

The transport-height sampler is a credible hypothesis because it appears in an actual CPU profile and already operates on numeric arrays. It has no DOM/Firebase/Three requirement. The prototype preserves captured numeric outputs, includes cold setup, copied linear memory, scalar calls, batches and Worker round trips. Scalar Wasm is slower than optimized JS on the current calling pattern. Bulk Wasm is faster, but requires a different batching opportunity that has not been established in live gameplay.

Road topology, terrain preparation, collision broad phase and pathfinding remain hypotheses, not selected Rust ports. The existing RDT capture selector already has a spatial index and bounded exact fallback. Rewriting it before measuring full `matches` validation plus query costs would be premature.

Rust 1.98.1 and its Wasm target are installed only under ignored evaluation output; application dependencies and shell configuration are untouched. The experimental crate has no external dependencies. Production imports none of it.

The [Rust target documentation](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html) describes the browser-oriented target and unsupported OS facilities. The experiment uses a single-threaded numeric ABI with explicit allocation/release. A future native Godot/Unity consumer would still need safe buffer ownership, errors, cancellation, ABI/version tests, platform builds and an engine adapter. A shared source library does not make physics, renderer or UI code portable automatically.

Limits: one Chrome/M1 component replay, no Safari/iPhone Wasm timing, no native-engine integration, no original-world frame comparison, no production-ready hostile-input ABI. Retain the original JS path throughout investigation.
