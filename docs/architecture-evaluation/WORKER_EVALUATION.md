# Worker evaluation

Workers address main-thread contention; Wasm addresses selected computational throughput. They are separate decisions.

The transport-profile experiment measures optimized JS and Wasm Workers with resident input and transferred outputs. Both produce identical results. Large batches complete in a few milliseconds. Sending only used packed numeric buffers, including copies to retain main-thread originals, reduces observed Worker startup/data preparation from 135–141 ms with full cloned records to 16–20 ms. These cold observations are single samples. The current vehicle surface API remains synchronous. Do not add a round trip to each wheel contact. A worker-owned compiler stage with a bulk output is a better candidate, subject to compilation profiling.

Preserve existing road/tunnel typed-array worker results and their ownership/cancellation contracts. Additional terrain/topology/compiler stages should move only after measuring compute time, input/output bytes, transfer or copy cost, main-thread publication/upload time, stale-generation handling and peak memory. Do not transfer an ArrayBuffer that the renderer still owns: transfer detaches the sender, as documented by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).

The benchmark uses transferred output; no SharedArrayBuffer or global cross-origin isolation headers were added. Shared memory would require a measured repeated-copy bottleneck, COOP/COEP compatibility review for auth/provider assets, synchronization ownership and a fallback. It is not justified by the current scalar workload. Wasm's linear-memory views avoid copies only for data genuinely resident there; constructing them does not make existing JS arrays shared.

Actual render-load responsiveness comparisons and cancellation tests for a new compiler Worker remain outstanding. No new runtime Worker was integrated.
