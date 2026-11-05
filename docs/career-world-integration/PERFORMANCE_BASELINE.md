# Performance baseline and bounded design

Numbers here are observations with environment/scope, not a 60fps certification or a claim that the proposed architecture is already optimized. One heavyweight local job at a time on the observed 8 GiB Mac; ordinary Chrome preserved. No new candidate copy/build or bulk data download.

## Evidence available now

| Evidence / environment | Observed measurement | Limits |
| --- | --- | --- |
| Accepted earlier steady-city source sample, `coherence-whole-ui-20261103/city-clock-1793756172111/steady-8s.json` | 347 frames, median16.7 / p95 33.4 / max50 ms; 139.72 m; zero discarded accepted time, input shortening, road/contact mismatch or damage | One continuous ArrowUp, no screenshots/surface queries during sample; preparation outside measurement. Reused unchanged evidence, not rerun. Not all hardware/modes or new architecture. |
| Same accepted sample, final kernel owner timings | Engine0.7ms, world0.1ms, Discovery0.8ms, camera0.1ms, renderer11ms | Single final CPU-side owner wall-duration snapshots, not mean CPU utilization or GPU completion time; no new benchmark claim. |
| Fresh desktop staging onboarding | First playable observation67.68 s; navigation DCL2.79 s, load duration4.01 s; Chromium reported usedJSHeap1,939,524,507 B at ready | Single cold developer automation sample. World readiness differs from document load. Heap is not retained-memory attribution, native RSS or GPU usage. |
| Fresh phone staging viewport/touch emulation | Playable69.94 s; DCL2.63 s/load4.30 s; reported heap2,693,505,648 B | Not physical-phone RAM, CPU or battery measurement. Browser/provider/cache effects unseparated. |
| Local source phone hint repair | Playable57.61 s; DCL1.13 s/load2.24 s; reported heap1,803,267,947 B | Different hosting/source environment. Do not claim a load-time/memory improvement from a visibility-only repair. |
| Resource guard | Roughly8.6 GiB disk available; about4.72 GiB existing swap at repair start | Host-wide swap is not app retained memory. Original resources/ordinary browser remain protected. |
| Native isolated prototypes | Per-group elapsed milliseconds in `native-prototypes.json` | Small disposable contract timing; not frame, network, render or whole-app CPU benchmark. |

Fresh CPU attribution, GPU memory, full multi-mode frame distributions, repeated-device load medians and a new retained-heap slope were **not measured** in this R&D pass. Previous accepted performance/lifetime evidence is retained; open claims are not silently promoted to passes. There is no implemented focus runtime to benchmark against the baseline yet. A trustworthy post-approval comparison must use the same workload/environment, not another cold world trip merely to obtain more numbers.

## Existing architecture to preserve

Single accepted-time kernel/render path, mode-specific owners, active research plugin only, lifecycle scopes/AbortSignal/generation guards, original provider registry and bounded Journal pages. Character prepared capabilities exclude history and have bounded caches; existing contracts verify that history is not read on capability hot paths. Original research tools can update within the active plugin; they are not twenty global loops.

The new preview imports source definitions and runs only when deliberately opened. Its Run native prototypes action uses disposable memory and no live service. Runtime repair adds one consent attribute at prompt presentation and CSS, no timer, subscription or frame scanner.

## Post-approval performance stop

On the same representative Earth walk/steady drive, Ocean deck/sub, Space/planetary and paused/hidden transitions: measure accepted/raw frame p50/p95/max and hitch counts; task-projection CPU duration/call counts; provider requests; active listeners/leases/timers; representative heap/RSS trend with controlled collection caveats; cold/warm readiness; two-room/client overhead. Compare inactive focus, one focus and actual task. Record hardware, viewport, source hash, provider state and measurement interference.

Acceptance: inactive guidance creates zero new update loops/provider fetches; at most the original bounded refresh on movement/session/task changes; one active course lifetime; no monotonic retained resources across repeated focus/world/menu transitions; no hitch-budget regression under existing thresholds. Do not relax thresholds or discard failed runs to declare success. CPU/GPU and real-device gates must stay separate from test counts and JS heap snapshots.
