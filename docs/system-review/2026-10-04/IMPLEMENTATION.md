# Architecture polish implementation ledger

This is local implementation following the fresh system review, not a production release receipt. The owner authorized fixes and testing while retaining existing progress. No GitHub push or deployment is authorized by this local work request.

## Preservation

Starting runtime: `919888ec31984b59f4da16c3a93936e5ded86e1f`. Audit checkpoint: `a7c494cc`. Existing dist, preserved production artifact, four saved candidates, player data and ordinary Chrome are retained. Dated audit reproductions describe the original defect and are not rewritten as passing tests.

## Bounded work packages

| Package | State | Evidence / next closure requirement |
| --- | --- | --- |
| 1. Synchronization | Verified local checkpoint | Serialized durable health commands, account dispatch guard, transactional revision/idempotency handling, bounded submarine motion, monotonic lease clock and acknowledgment reconciliation implemented. Focused behavior tests pass; prescribed browser fixture passed with images inspected. Actual two-client SDK/emulator voyage passed all 12 scenarios and three rules checks, including delay/reconnect; result screens inspected. All 1,806 registered contracts passed. |
| 2. State ownership | Verified local checkpoint | Five owner interfaces documented in OWNERSHIP.md; read-only pause, generation checks, guarded lazy entry, Earth restoration and marine transfer cancellation. Source and focused tests pass. Actual research outing 8/8 and ocean entry/traversal 18/18 pass; ten actual ship/submarine round trips retain identical settled lifecycle/resource/canvas counts. Existing legacy writers are explicitly allowlisted; complete encapsulation is not claimed. |
| 3. Simulation clocks | Verified local checkpoint | Shared accepted time/input-before-simulation, pause/hidden/readiness debt reset and elapsed-time Space camera. Four-city actors/vehicles, actual Space journey, eight diver cases, all-deck ship traversal and prescribed driving capture pass. Source, ownership, boundary types and all 1,817 registered contracts pass; mutation sensitivity rerun passes after repairing its whitespace-dependent injector. See TIMING.md. |
| 4. Stalls and active work | In progress; retention repaired | The latest non-instrumented 630-second/12-reload run passes average FPS, p99, coverage, transfer, storage, renderer and ownership checks. Settled heap after the first cycle stays at 47.2–52.5 MiB; retired feature maps are empty. Active-play hitch acceptance still fails: straight flight and two driving segments contain clustered 133–200 ms pauses. First playable is 47.1 s, below the existing 120 s safety ceiling but above the proposed 25 s product target. Earlier failed runs remain retained below. |
| 5. Persistence/services | In progress | Bounded Journal queries, account/multi-tab semantics, dependency/authority inventory, boundary CI and scene/provider diagnostics. |
| 6. Acceptance | Pending | Exact local artifact acceptance with distinct automated, hosted, physical-device, human and entitlement statuses. Local tests cannot stand in for external evidence. |

## Current verification

- Registered new behavioral regressions: `condition-sync-current.test.mjs`, `shared-marine-link-current.test.mjs`; account dispatch check added to request reliability tests.
- Focused tests exercise latest-intent preservation, lost acknowledgment/reload, revision conflict, account disposal, storage failure, idempotency bounds, ±60-second wall-clock skew, delayed motion and reconnection.
- Source graph/syntax check passed after the synchronization changes.
- Prescribed web-game browser client: `output/verification/architecture-polish/marine-component/`, two bursts, no console-error files. Inspected submarine views; this fixture only verifies presentation/components, not complete world physics or backend authority.
- First emulator launch failed before tests because the system Java shim had no registered runtime. Existing Homebrew Java 21 was located and used with a 512 MB heap. Failure log retained in `output/verification/architecture-polish/marine-java-preflight.log`. No installation or security-policy change.

A package is closed only when its stated checks pass. Missing physical-device, ordinary hosted App Check, fresh-player and commercial weather evidence remains explicitly pending; this local task does not manufacture or replace that evidence.

## Timing verification details

Evidence is under `output/verification/architecture-polish`: `actors-timing-rerun.log`, `space-timing.log`, `diver-timing.log`, `ship-timing.log`, `timing-actions-rerun/`, `package3-pr.log` and `package3-sensitivity-rerun.log`. Space, diver, ship and prescribed driving images were inspected. The first actors/action runs treated the loopback preview’s intentionally absent naming emulator (503) as a gameplay failure; those failures remain retained. Exact optional naming degradation is now reported separately. This does not accept location search, hosted attestation or other failed resources.

The first PR-chain run passed source, ownership, types, 1,817 contracts and inventory, then failed before mutation testing because the injector required obsolete whitespace. Its bounded repair passed all three mutation scenarios; no runtime assertion was relaxed. Real pause browser fixtures now use the named pause owner.

## Performance work checkpoint

`package4-pr-first.log` passes source, ownership, boundary types, all 1,827 contracts, test inventory and mutation sensitivity. Exact prior/current comparisons cover 18,000 collision cases and 25,000 shoreline cases. `diver-water-cache/` passes eight actual Ocean cases with its phone image inspected; `collision-water-actions/` passes the prescribed driving client with an inspected collision approach. Optional loopback naming degradation remains explicit.

`performance-water-cache-sustained/` preserves the failed 630-second active-travel and 12-reload run. Renderer geometry/texture counts stayed at 151/41 after teardown; retained heap increased from 120.8 to 126.9 MiB over eleven releases and then reached 194.2 MiB. Later measurement records both immediate and two-second-settled heap, plus provider/lifecycle owner counts, so an async disposal tail can be distinguished from a persistent reference. The long-cycle outcome is still pending.

The harness retains cumulative transfers and preserves the existing total budget through two reloads. Additional reloads now have individual receipts checked against the same limits. Thirteen loads are not silently evaluated as a two-load transfer scenario. Source preview does not reproduce Hosting cache headers; packaged and hosted behavior remain separate evidence.

`performance-collision-water/` is a failed normal run, retained in full: moving-walk 42.86 FPS versus the 43.65 floor, flight 57.29 FPS with a 433 ms worst frame and two closely spaced pauses. Two reloads passed ownership/resource checks; that is not evidence for the longer retention gate. No performance budget was relaxed and no production build was changed.


The next bounded checkpoint (`exterior-node-pr.log`) passes all 1,829 contracts, source/ownership/types, test inventory and mutation sensitivity. Tree-row publication retains only exact selected node records; the prior live diagnostic released the old map and reduced retained heap by about 16.5 MiB. Seeded tree placement and refresh remain identical. Exterior selection matches the full distance scan for 25,000 buildings across 192 settings with fewer than one tenth of the radial evaluations. `exterior-node-actions/` passed the prescribed driving client; its final scene was inspected.

`performance-exterior-node/` remains a failed normal receipt: walk 47.09, moving walk 45.25, stationary drive 40.73, moving drive 45.85 and flight 57.32 FPS. Flight has two 183.3 ms frames separated by 467 ms. No frame exceeded 250 ms, but clustered hitch and stationary FPS checks fail. Two settled teardown readings are 117.5/119.3 MiB; the extended retention outcome is still open. The earlier 433 ms and 12-cycle failures remain preserved, not overwritten by this run.

Private heap diagnostics are outside the repository with owner-only permissions. Reports under `active-heap-node-retirement/` contain aggregate structural reachability and reviewed code names only; sizes overlap and are not exclusive retained/dominator sizes. The initial analysis excluded internal fixed-array slots and was corrected in `data-owners-arrays.json` / `data-captures.json`. No raw snapshot or raw trace argument is a publishable artifact. Collector-specific tracing is the next diagnostic, not frame-time acceptance.

The one-buffer transport-profile change preserves all nine fields, original precision and independent writes. `road-buffer-pr.log` passes all 1,829 contracts and the complete PR chain; `road-buffer-actors/` passes actual traffic/contact checks in Baltimore, London, Monaco and Tokyo; `road-buffer-actions/` passes prescribed driving with its final image inspected. The normal `performance-road-buffer/` run passes every average-FPS/p99/resource/coverage check but fails the unchanged hitch criterion: two flight pauses (249.9/200 ms) are 500 ms apart. First playable is 46.5 s; two settled heaps are 114.2/117.2 MiB. This is a verified storage repair, not closure of the stutter investigation.

## Latest equipment and sustained-run checkpoint

The equipped-tool hot path now reads the existing direct Backpack lookup instead of rebuilding and sorting the full inventory every frame. A 6,000-read regression proves no full snapshot is requested; the full PR chain passes 1,831 tests, and the prescribed driving client passes with its final image inspected.

`performance-equipment-direct-sustained/` completed all moving routes and twelve reloads, exiting 1. All average-FPS, p99, coverage, transfer, storage and runtime/local-resource checks pass. Straight flight still has 266.7/316.7 ms frames 649.9 ms apart. One of seven 90-second mixed-route segments has 166.7/100.1 ms frames 233.4 ms apart; the other six satisfy the hitch gate. First playable is 47.0 seconds. These are unresolved failures, not a stutter-fix claim.

Settled retained heap is 115.6–121.7 MiB through reload 11, then 185.7 MiB at reload 12. The two-second wait does not remove the jump. Renderer release counts remain 135 geometries/41 textures, world collections are empty, and lifecycle/provider counts are stable. This repeats the earlier late jump and requires private retained-heap investigation. No release acceptance or production change follows from this checkpoint.

## Retired population ownership — diagnosed, repair under browser verification

The private 14-reload diagnostic (`retention-private-12-14/`) completed. It omitted the ten-minute soak and reproduced the jump at reload 10: settled heap 114.1–120.6 MiB through reload 9, then 184.0–185.0 MiB through reload 14. Thus the defect is not specific to exactly twelve reloads. All model-cache entries, leases and estimated resource sizes were identical across the run; browser errors and local resource failures were zero. The final reloaded world image was inspected.

Private heap analysis identifies two retained `trafficCompilation` objects, each with approximately 77.82 MiB of overlapping structural reachability. Strong-root paths go through an urban condition getter retained by property feedback and scene-retained presentation callbacks, into retired urban `state.population`, its surface sampler and the old road feature map. These are root paths and structural sizes, not dominator/exclusive byte measurements. Aggregate evidence is `retained12-traffic-paths.json`; raw snapshots remain private.

The bounded repair isolates the condition accessor in a factory that captures only its condition authority; clears the urban state's borrowed population reference; explicitly retires the living-world sampler and both owned feature maps; empties disposed actor/host collections and rejects late frame callbacks. World reset also releases the stale water-raycast mesh cache (7.45 MiB of overlapping structural data in the capture). No active density, geometry, collision or road sampling was reduced.

Twenty-one focused tests pass. The first full PR run failed one existing VM reset fixture because its import-stripping setup omitted the new cleanup dependency; that failure is preserved. The corrected fixture asserts the cleanup call. Full rerun passes all 1,838 contracts, source, ownership, types, inventory and mutation sensitivity. The three new Backpack history guards are now registered; they verify existing semantics and do not imply P5 implementation. Prescribed actual driving is running. Normal/sustained post-repair memory and hitch acceptance remain pending.


The normal `performance-retired-population-sustained/` run completed all seven 90-second routes and twelve reloads. Retired traffic/pedestrian feature ownership, settled retention, renderer resources, world coverage, transfer/storage and browser/local-resource checks pass. Settled heap after the first release falls from 110.6 MiB to 47.2 MiB and ends at 52.5 MiB; all twelve retired feature maps are empty with no urban population reference. The final world image was inspected. All average FPS/p99 checks pass; the only desktop acceptance failure is active-play hitches: straight flight 166.6/183.3 ms, first sustained drive up to 199.9 ms and second sustained drive up to 133.3 ms include clustered pauses. Other five sustained segments pass. First playable is 47.1 seconds: within the existing 120-second safety ceiling, still above the proposed 25-second product target. P4 remains open; memory repair is verified, stutter closure is not.


Transactional condition repair complete as a local checkpoint: nine focused condition/connected-feed tests, all 1,841 registered contracts and full PR checks pass. Actual eight-case same-origin browser regression passes, including legacy import, no-lock idempotency and quota/denied storage; controlled server mutation transport is explicitly distinct from SDK/hosted evidence. Prescribed actual driving client completed with final image inspected. Existing newer intent survives older-tab disposal; uncertain commands keep their identities; current-account guards cover delayed initialization, confirmations and errors. Source changes are local only. Journal indexing/inventory scaling and other P5/P6 work remain pending; P4 hitch acceptance remains open.


P5 persistence/inventory local checkpoint: all1,844PRcontracts/source/ownership/types/inventory/mutations pass. Assembledjournal-first-session-rerun9631 passes all10checks: Backpack UIequipactions, actualfieldresult+Journal, mobilelayout, buildplace/undo/save/reload, room/propertyentry andsingleFlowerreceipt. Three representativeimagesinspected. Onlyexplicitoptionalpreviewreverse503 reportedasproviderdegradation, notsearchacceptance. Prescribedjournal-backpack-actions45600 passed, shot1inspected. All four new sourcebrowsergates(condition-tabs,journal-history,journal-transactions,backpack-presentation) nowregistered incandidateconfig/package scripts, artifactRequiredfalse correctlyreflectssourcecomponent scope. Newfullartifact86gate+backendacceptanceremainsrequired; past82gaterunsnotcurrentapproval. No push/deploy.

## Renderer dependencies checkpoint

The seventeen renderer runtime scripts now load from reviewed same-origin Three.js 0.128.0 files, with upstream license preserved; no version upgrade. Canonical script URL identity prevents duplicate local/absolute loads. `config/runtime-dependencies.json` and the PR/candidate verifier cover external executable URLs, local vendor integrity, both locks and reproducible shared Expedition generation. See DEPENDENCIES.md for remaining CDN and SDK boundaries.

`vendor-cold/` passes actual cold renderer/capture loading with renderer CDNs blocked, single THREE identity, and a missing-file/retry case. Capture image inspected. `vendor-actions/` passes the prescribed assembled driving client, final image inspected. `vendor-pr.log` passes all 1,847 contracts and the complete PR chain. Both new gates are registered, bringing the candidate matrix to 88; no old artifact result is transferred to these changes. No push or deployment.

## Provider lifecycle checkpoint

Typed provider errors, cross-query rate-limit/outage cooldowns and single recovery probes now preserve useful cache dates and stop retry bursts. Aircraft, imagery and geology bodies are bounded while streaming. Missing/blank/non-scalar coordinates cannot become zero coordinates in weather, marine, aircraft or imagery queries. The marine model and station phases honor consumer cancellation through world transitions/reloads and Live Earth closure; selected observation cache expires and failure remains retryable. The owner-published cancellation command is explicitly reviewed in the context allowlist. Field-level authority boundaries are recorded in AUTHORITY.md; casual leaderboard UI disclosure remains to implement.

`provider-outages-rerun/` passes all five controlled HTTP groups in an actual browser; its image was inspected. The initial harness failure (counting an intentionally cancelled error body as a marine request) and initial PR ownership rejection are retained. `provider-pr-final.log` passes all 1,860 registered contracts and the full PR chain. `provider-diver/` passes all eight actual Ocean/boarding/recovery/exit cases with its phone image inspected. `provider-actions/` passes prescribed driving with its final image inspected. The provider gate is registered; the candidate matrix now has 89 gates. Live-provider commercial entitlement and ordinary-hosted behavior are not inferred from these controlled checks.


## Safe support and scene accounting checkpoint

The assembled diagnostics journey passes desktop copy, phone denial/selection/layout, casual leaderboard disclosure and actual Earth/Space/Ocean/diver context. All four scene/UI screenshots were inspected. A discovered leaderboard refresh race now immediately replaces obsolete rows and rejects superseded replies, including same-board refreshes. Support records are bounded and accept categories only; hostile-value regressions verify the privacy boundary. See DIAGNOSTICS.md for measured scene costs, source-byte limitations and scoped collider coverage. Named resource ceilings pass against the captured browser measurements and are enforced by the new candidate gate (90 total). Prescribed actual driving passed with its final image inspected. Full PR verification passes source, ownership, boundary types, all 1,867 contracts, inventory and mutation sensitivity. P4 active-play hitch acceptance and P6 integrated acceptance remain open.
