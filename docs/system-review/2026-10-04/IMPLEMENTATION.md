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
| 4. Stalls and active work | Pending | Diagnose remaining long flight frame and enforce hitch/retention criteria. Existing average FPS is not sufficient evidence. |
| 5. Persistence/services | Pending | Bounded Journal queries, account/multi-tab semantics, dependency/authority inventory, boundary CI and scene/provider diagnostics. |
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
