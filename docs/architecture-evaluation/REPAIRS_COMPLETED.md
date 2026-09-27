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

The prescribed web-game browser client passed a bounded 2D lifecycle fixture using the actual registry module. Its screenshot was visually inspected: replacement active, one stale disposal, AbortError. No page/console errors were recorded. Evidence is in `evidence/service-browser/`; reproduce with `node scripts/architecture-evaluation/check-service-browser.mjs`. This is browser-component evidence, not full-app integration or a normal-player performance run. The reset race has not been demonstrated in ordinary gameplay; hardware world profiling now exists separately. The targeted test is included in the existing current-contract inventory so it will not become an unrun orphan test. No unrelated passing suite has been rerun merely to increase test counts.

## Investigation tooling

Added a read-only source-inventory script under `scripts/architecture-evaluation/`. It records literal import edges, source sizes and coupling indicators with its limitations stated in the output. This changes no runtime behavior. Documentation distinguishes summary snapshots from portable world data and measured results from hypotheses.

No engine/library versions, persisted schemas, backend rules, assets or production deployments changed. The active release checkout remains untouched; this work is isolated on `steven/architecture-evaluation`.


## Selection card intercepting Travel menu

A normal-clock Earth → Ocean → Earth → Space journey stopped because the persistent `worldSelectionNotice` intercepted the pointer over `fSpaceRocket`. The actual browser timeout identifies the overlapping card and action button. This was not a renderer timeout.

The evaluation branch now hides the selected-place notice while `.floatMenu.open` is present, following the existing policy for other ambient prompts. Closing the menu restores the selection and its action; it is not deleted. A focused browser fixture using the actual stylesheet confirms a normal pointer click reaches the underlying menu item and the notice returns afterward. Screenshot inspected: [state](evidence/notice-menu/state-0.json), [image](evidence/notice-menu/shot-0.png). The full-world follow-up passed the same selected-building → Travel → Space normal pointer path, with no page errors. Both [Travel](evidence/notice-menu/full-world-travel.png) and [Space](evidence/notice-menu/full-world-space.png) screenshots were inspected; [run evidence](evidence/compiler-and-menu-repair.json). Production was not updated.

## Evidence and prototypes completed

Babel source-access inventory covers all established 166/191 indicators, including alias paths, calls and explicit uncertainty. This is not claimed as completed transitive review. A real-location neutral projection was rendered and inspected. JS/Worker/Rust transport-profile replay preserves all 187,580 outputs and records boundary/memory/cold costs. TypeScript boundary pilot compiles with six checked negative cases. These experiments are outside production imports; neither Rust nor a new Worker was integrated into runtime.

## Frontage candidate rejection

The sampled compiler profile justified rejecting disjoint precomputed edge bounds before exact point/segment projections. Exact distance tolerance and result ordering remain unchanged, with a conservative coordinate-scaled roundoff margin. Contact, tolerance, bucket-boundary, translated-coordinate, 9,000 randomized-query and street-section/disposal checks pass. Captured Baltimore replay has zero ordered-result mismatches across 10,409 queries; median query batch time falls from 23.6 to 16.9 ms. This is a bounded component improvement; whole-world integration is checked separately and no game FPS improvement is claimed. Reproduce with `frontage-query.test.mjs` and `benchmark-frontage.mjs` under `scripts/architecture-evaluation/`.

The frontage integration run completed Earth loading and a normal menu-to-Space transition without page errors; the Earth screenshot was inspected. Its 72,908 ms first load is an unpaired live-provider observation, not a measured reduction. All 39 related frontage, visibility and terrain-sampling tests pass. One added test initially assumed the legacy bucket search included an epsilon outside the zero cell boundary; source/reference checks showed that behavior was already excluded before this change. The regression fixture now tests the exact-distance tolerance within a shared bucket. That pre-existing sub-1e-8 boundary discrepancy is documented here and was not silently folded into the performance change.

The prescribed web-game client also passed the frontage interaction preview: moving the query selected 23 edges with identical ordered baseline/candidate results. Its screenshot was inspected. The standalone proof uses the real captured footprints and the actual runtime query; it complements the full-world smoke check.

Runtime repair commits: `601fcfa1` (frontage bounds rejection) and `a688d550` (selected-place/menu visibility). These remain on the isolated architecture branch. Earlier hardware receipts identify their exact runtime diff against `ee1bca65`; committing the same files does not change those measured inputs. Source-preview screenshots can show the development `SOURCE` banner; they are not screenshots of the deployed production package.
