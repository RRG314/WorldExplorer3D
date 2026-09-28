# Implementation priorities

Current local implementation and acceptance results: [Local refactor plan](LOCAL_REFACTOR_PLAN.md). The matrix below records investigation priorities; unpromoted experiments remain future work, not prerequisites for testing the local candidate.

Effort/risk are qualitative engineering estimates. Measured results are limited to their named experiment; no expected full-game FPS percentage is promised.

| Priority | Problem / evidence | Proposed work | Expected benefit | Measured prototype | Portability | Cost / risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Transport publication 40–45 s elapsed; historical nested data: carriageways 18.85 s, corridors 8.03 s, structure profiles 5.61 s | CPU/allocation and long tasks captured; next replay fixed-input meshing and reduce temporary work, then trial numeric Worker ownership | First-load responsiveness and potentially latency | Frontage bounds rejection: 23.6 → 16.9 ms replay, exact results; larger carriageway stage remains unoptimized | High for numeric compiler boundary | Medium–high / high geometry parity risk |
| 2 | Existing contracts lack static caller checks | Add boundary-only TS at request/provenance/worker/publication interfaces | Earlier detection and easier adapters | Eight negative boundary cases checked; promoted strict boundary check, no runtime conversion | High | Low–medium / low if validators retained |
| 3 | Sampled transport height lookup uses linear scan | Evaluate sorted lookup only for compiler-owned sorted data | Less synchronous numeric work | Promoted implementation: 8.1 → 5.3 ms median, exact parity; no FPS claim | Already neutral | Low / medium invalid-input contract risk |
| 4 | Light-count changes create shader variants | Validate stable pool in matched moving night scene | Fewer compilation stalls | 9 → 1 programs in isolated WebGL fixture; real-world tradeoff pending | Low | Low / medium GPU work tradeoff |
| 5 | Place notice intercepts Travel menu | Hide notice while hotbar open; restore afterward | Accessible menu action | Actual journey failed before; focused fixture and full-world normal pointer path pass after | Low | Low / low; full journey checked |
| 6 | Pending service reset publishes stale resource | Generation guard and disposal | Correct future lifecycle ownership | Five cases pass, browser fixture inspected | Medium | Completed on evaluation branch; latent normal-play impact unproven |
| 7 | Semantic records sometimes read from mesh metadata | Extend existing building/claim/query boundary with canonical identity | Testability and future engine adapters | 139-building real-location projection rendered | High | Medium / high across batching and multiplayer |
| 8 | Renderer counters describe Earth during auxiliary modes | Owner-aware measurement schema; preserve compatibility | Accurate diagnoses | Promoted owner-aware runtime diagnostics; transition and shared-identity checks | Medium | Low–medium / low |
| 9 | Shared-context role inventory not fully reviewed transitively | Complete call/lifecycle review of every triage row | Safer targeted extractions | All 166/191 listed with AST evidence; review incomplete | High | High review effort / no reason for global rewrite |

## First implementation phase

1. Keep the live 5.3 package unchanged.
2. Retain the completed menu-conflict and frontage repairs separately; both have full-world smoke evidence.
3. Build a matched replay of the larger carriageway/terrain integration stages using the captured phase/CPU evidence. Do not rerun unrelated passing release gates.
4. Promote a JS/Worker change only if output geometry, identity/provenance, cancellation and main-thread behavior remain equivalent and total cost improves.
5. Introduce type checks at those same boundaries; keep experiments, Rust toolchains and large captures outside production dependencies.
6. Recheck one representative Earth/Ocean/Space/planet transition set for changed ownership. Report remaining physical mobile limits explicitly.

No new renderer or language migration is a prerequisite for this phase.
