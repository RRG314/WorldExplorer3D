# Performance repair evidence

This is an implementation investigation, not release acceptance. The source and tests are protected by local Git checkpoints; production, the current dist artifact and saved candidates are preserved. Package 4 is still open.

## What is measured

Normal measurements use the physical M1 8 GiB Mac mini and installed hardware Chrome. They do not impose a test heap cap or force collection during timed gameplay. Frame intervals and real keyboard travel are retained. Average FPS and p99 remain useful regression checks, but clustered or severe pauses are evaluated independently. The existing 43.65 FPS floor and the 250 ms / one-over-100-ms-per-minute / 10-second-separation hitch criteria have not been relaxed.

CPU/allocation sampling, collector tracing, heap snapshots and forced post-teardown collections are diagnostics. They are not normal timing evidence. A source fixture, headless hardware run, phone viewport, packaged journey, ordinary hosted user and physical phone remain distinct evidence classes.

## Verified bounded changes

- Water motion profiles reuse an immutable per-body result only while every dependent scalar still matches. In-place weather/body changes invalidate the result.
- Collision candidates use nested-call-safe leased buffers, weak duplicate stamps and finally-cleared object slots. Default public queries still return independent arrays. Exact prior/current comparisons cover 18,000 cases.
- Shoreline distance calculation rejects segments whose axis lower bound cannot improve the result. The nearest distance and collision/water boundary remain exact across 25,000 comparison cases.
- Vegetation refresh retains only nodes for the selected tree rows. It keeps exact node references and leaves compilation inputs intact. The live diagnostic released the previous 121,387-node table and reduced retained heap by approximately 16.5 MiB; seeded placement and later refresh match.
- Exterior selection rejects distant buildings before radial evaluation. A 25,000-building comparison across 192 radius/limit/viewpoint settings preserves selected identities, ordering and exact distances.

The following storage change passes exact numerical parity, independent-write checks, the full 1,829-contract PR chain, actual four-city traffic/contact checks and prescribed driving: all nine published transport-profile fields use one backing buffer per road rather than five. Float64 station coordinates and Float32 profile fields retain their precision. Disjoint ranges preserve independent writes. Only exclusively owned temporary compilation buffers are retired. This is a storage change; no road sampling, grade limit, collision, population or visual-density budget changes.

## Results retained locally

All directories below are under `output/verification/architecture-polish/`.

| Receipt | Result and scope |
| --- | --- |
| `performance-baseline/` | Previous source checkpoint: 50.6 s first playable, 48.24 walk / 47.64 drive / 57.59 flight FPS; 233.3 ms worst flight frame. Two reloads only. |
| `flight-profile-before/`, `flight-profile-water-cache/`, `flight-profile-collision-cache/` | Sampled cumulative temporary allocation: 2,916.8 → 2,753.0 → 2,633.5 MiB per 90-second diagnostic flight. These figures are not resident memory or normal performance acceptance. |
| `performance-water-cache-sustained/` | Failed full 630-second moving route and 12 reloads. Later routes passed, but earlier hitch clusters failed. Renderer release counts remained constant; final retained heap jumped from 126.9 to 194.2 MiB. That jump remains unexplained. |
| `performance-collision-water/` | Failed normal run: moving walk 42.86 FPS and paired flight pauses including 433.3 ms. Two settled reloads pass; no long-cycle claim. |
| `performance-exterior-node/` | Failed normal run: stationary drive 40.73 FPS; flight has two 183.3 ms frames 467 ms apart. Other average-FPS windows and resource/error/coverage checks pass. Two settled heaps 117.5/119.3 MiB. |
| `flight-gc-exterior-node/` | Diagnostic confirms a major collection associated with the paired flight pauses. Enabling V8 collector statistics added a 2.97-second statistics dump and distorted the measured worst frame to 3.28 seconds. This is not a new normal-gameplay regression or an acceptance measurement. The statistics category was removed from subsequent tracing. |
| `performance-road-buffer/` | Failed normal run: all average FPS, p99, resource, coverage and storage checks pass; flight has 249.9/200 ms pauses 500 ms apart, exceeding the existing hitch-rate/separation criteria. First playable 46.5 s; two settled heaps 114.2/117.2 MiB. |
| `road-buffer-pr.log`, `road-buffer-actors/`, `road-buffer-actions/` | All 1,829 contracts and PR checks, actual Baltimore/London/Monaco/Tokyo actor/contact checks, and prescribed driving pass; final driving image inspected. Actor tests use controlled timing and a test heap cap, so they do not certify normal FPS. |
| `flight-gc-road-buffer/` | Diagnostic without collector-statistics dumps: main incremental start 137.6 ms and final major collection 139.5 ms align with 183.3/166.7 ms frames. Worker collection was 11.6 ms at a different time; transport generation finished by 15 s while pavement overview progressed 497→4,287 of 4,380 cells. The 100k-event capture limit truncated later events; it is not an exhaustive trace. |
| `exterior-node-pr.log` | All 1,829 contracts plus source, ownership, types, inventory and mutation-sensitivity checks pass. |
| `exterior-node-actions/` | Prescribed actual driving client passed; final image inspected. Optional loopback naming degradation is explicit and does not certify location search. |

Collector events identify main-thread incremental-start and compaction work, not just ordinary per-frame gameplay cost. V8 describes the tradeoff between retained heap, memory reduction and collection work in its [memory-consumption explanation](https://v8.dev/blog/optimizing-v8-memory) and [concurrent-marking description](https://v8.dev/blog/concurrent-marking). Those sources explain the mechanism; the application traces provide the local evidence. They do not justify changing browser flags or forcing GC in the game.

## Heap privacy and interpretation

Raw snapshots remain in an owner-private temporary directory outside the repository. They may include disposable authentication material and must not be published. `active-heap-node-retirement/` contains aggregates only. The compacted typed-buffer analysis avoids parsing a multi-GB JSON string. Structural reachability sizes overlap and are not exclusive retained sizes or dominator measurements. Earlier diagnostic results that skipped frozen-array slots remain preserved; corrected results follow those slots.

The corrected snapshot contained 159,498 ArrayBuffer objects and 196,819 Float32Array views. This motivates reducing native buffer ownership where fields share a lifetime. It does not imply that every buffer is unnecessary or that deleting render data is safe.

## Closure still required

Run the repaired normal routes and sustained mixed traversal with at least two 90-second samples for each affected movement mode. Complete twelve reloads with immediate and settled post-GC ownership measurements (two warmups followed by ten plateau samples). Keep transfer budgets scoped to the original two-load total and separate additional-load receipts; retain cumulative totals as well.

The 25-second desktop loading target remains proposed and missed (approximately 46–51 seconds in the recent source runs). The existing 120-second safety ceiling is not evidence that this product target is achieved. The final retained-heap jump, intermittent ground FPS failure and flight hitch clusters must remain visible until resolved. No old green artifact certifies these newer runtime changes.

## Latest equipment and sustained-run checkpoint

The equipped-tool hot path now reads the existing direct Backpack lookup instead of rebuilding and sorting the full inventory every frame. A 6,000-read regression proves no full snapshot is requested; the full PR chain passes 1,831 tests, and the prescribed driving client passes with its final image inspected.

`performance-equipment-direct-sustained/` completed all moving routes and twelve reloads, exiting 1. All average-FPS, p99, coverage, transfer, storage and runtime/local-resource checks pass. Straight flight still has 266.7/316.7 ms frames 649.9 ms apart. One of seven 90-second mixed-route segments has 166.7/100.1 ms frames 233.4 ms apart; the other six satisfy the hitch gate. First playable is 47.0 seconds. These are unresolved failures, not a stutter-fix claim.

Settled retained heap is 115.6–121.7 MiB through reload 11, then 185.7 MiB at reload 12. The two-second wait does not remove the jump. Renderer release counts remain 135 geometries/41 textures, world collections are empty, and lifecycle/provider counts are stable. This repeats the earlier late jump and requires private retained-heap investigation. No release acceptance or production change follows from this checkpoint.
