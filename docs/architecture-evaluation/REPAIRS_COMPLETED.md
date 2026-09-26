# Repairs completed

## Lazy-service reset race

Changed `app/js/platform/service-registry.js` and added `tests/platform-service-lifecycle-current.test.mjs`, registered in `scripts/verification/current-contract-list.mjs`.

A pending load previously survived reset/unregister and could publish stale state or overwrite a new service. The new generation check invalidates old publication and failure paths; late values are disposed through the registered disposer or their own dispose method. A value already adopted by the newer generation is not disposed again.

| Controlled observation | Before | After |
| --- | --- | --- |
| Reset while load pending | Old service became ready | Remains idle; pending caller gets AbortError |
| Stale result retained after reset | 1 value | 0 values |
| Disposal of that late result | 0 calls | 1 call |
| New generation after stale completion | Could be overwritten | Preserved |
| New generation after stale rejection | Could be marked failed | Preserved |
| Five targeted lifecycle cases | 1 passed / 4 failed | 5 passed / 0 failed |

Evidence: `evidence/service-before.tap`, `evidence/service-after.tap`. Initial durations were ~55 ms and ~48 ms for the whole Node test process; these timings are **not a performance comparison**. The meaningful before/after quantities are state publication and disposal counts. No gameplay FPS, heap-byte reduction or normal-player leak fix is claimed.

Source inspection found no ordinary app callsite currently resetting this registry. This is a proven latent lifecycle defect relevant to future ownership refactors, not an established explanation for today's frame-rate complaints. Services that return module namespaces without disposal still need explicit owner adapters; the registry cannot cancel side effects inside arbitrary dynamic imports.

The prescribed web-game browser client passed a bounded 2D lifecycle fixture using the actual registry module. Its screenshot was visually inspected: replacement active, one stale disposal, AbortError. No page/console errors were recorded. Evidence is in `evidence/service-browser/`; reproduce with `node scripts/architecture-evaluation/check-service-browser.mjs`. This is browser-component evidence, not full-app integration or a normal-player performance run. Full-app integration remains pending under the resource constraint. The targeted test is included in the existing current-contract inventory so it will not become an unrun orphan test. No unrelated passing suite has been rerun merely to increase test counts.

## Investigation tooling

Added a read-only source-inventory script under `scripts/architecture-evaluation/`. It records literal import edges, source sizes and coupling indicators with its limitations stated in the output. This changes no runtime behavior. Documentation distinguishes summary snapshots from portable world data and measured results from hypotheses.

No engine/library versions, persisted schemas, backend rules, assets or production deployments changed. The active release checkout remains untouched; this work is isolated on `steven/architecture-evaluation`.
