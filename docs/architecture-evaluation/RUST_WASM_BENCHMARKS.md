# Rust/Wasm transport-profile experiment

Status: one isolated component experiment complete; no runtime integration or whole-game speedup established. Source baseline `ee1bca65` (deployed `bbe65022` plus the service lifecycle repair). Production is unchanged.

## Inputs and correctness

A normal-clock headed Chrome session on the physical Apple M1 captured the existing Baltimore transport compiler's 18,758 resident profiles: 550,333 samples, median length 14, 95th percentile length 92, maximum 3,024. Location 39.2904, -76.6122. No alternate transport compiler was built.

Replay queries cover ten deterministic distances per road, including endpoints and outside-range clamps: 187,580 queries. This is real compiled data with a synthetic query distribution, not the observed frequency of player wheel contacts. Distances and heights are packed as Float64 values. All seven checked alternatives matched current JS exactly on every replay query (maximum absolute error zero). Separate JS equivalence tests cover duplicate distances, zero-length spans, NaN/Infinity heights, degenerate profiles and 14,000 generated queries. Three Rust tests also pass for clamps/interpolation, duplicate knots/nonfinite heights and valid allocation/batch/release ownership. Malformed raw pointers are outside this trusted experimental ABI; it is not a production input boundary. The prototype accepts only validated profiles.

## Results

Chrome on the physical M1; five warm-up rounds then thirty rounds, rotating execution order. Each result allocates an output array; Wasm batch copies outputs into a JS array. No forced GC during timing. These are elapsed component times, not frame times. Thirty observations are inadequate for a stable p99 claim; maximum is shown instead.

| Implementation | Median ms | Observed p95 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| currentJs | 7.70 | 8.00 | 8.10 |
| optimizedJs | 4.70 | 5.10 | 5.20 |
| wasmScalarResident | 5.50 | 5.70 | 5.70 |
| wasmBatchResident | 2.60 | 2.80 | 2.80 |
| wasmBatchCopyInputs | 2.90 | 3.10 | 3.10 |

Wasm fetch/compile/instantiate/allocate/copy cold setup: **9.60 ms** on localhost. The binary is 16,509 bytes; linear memory is 17,498,112 bytes in addition to retained JS input. JS packing took 45.40 ms. Resident input is 14,807,888 bytes; output is 1,500,640 bytes. These are component observations, not mobile-network estimates or whole-game memory reductions.

| Worker input path | Cold creation + data setup ms | Median request/output round trip ms |
| --- | ---: | ---: |
| js | 140.80 | 4.10 |
| wasm | 135.40 | 2.70 |
| js-packed-transfer | 16.20 | 3.90 |
| wasm-packed-transfer | 20.20 | 2.70 |

The initial cloned-record path includes unused source fields. The packed-transfer paths send only used numeric buffers and count the copies needed to retain the main-thread originals. Changing this data boundary cuts observed setup from roughly 135–141 ms to 16–20 ms without changing the algorithm. Cold observations are single samples, not a latency distribution. All inputs stay resident for subsequent requests; outputs transfer ownership. Round trips include dispatch, computation and reply. No responsiveness-under-render-load or whole-game FPS conclusion follows.

## Decision

Binary-search JS wins against current JS without a language boundary. Scalar Wasm loses to optimized JS. Batched Wasm wins in this constructed large-batch workload, but the current game needs immediate individual surface answers for vehicle/collision simulation. Do not introduce asynchronous frame delays to reproduce a favorable batch benchmark.

Keep Rust experimental. A future compile-time bulk sampling stage could justify another trial if profiling establishes its contribution and a resident typed-array contract. Do not generalize this result to road compilation, pathfinding, terrain or RDT.

Reproduce: capture with `WE3D_CAPTURE_PROFILES=1` using `profile-player.mjs`; build `scripts/architecture-evaluation/rust-profile/Cargo.toml` with Rust 1.98.1 targeting wasm32-unknown-unknown into `output/architecture-evaluation/rust-build`; run `run-profile-benchmark.mjs`. Full timing samples, correctness and input SHA-256: [evidence](evidence/profile-benchmark.json). Captured source data remains a generated local artifact rather than a 40 MB documentation attachment.
