# Local architecture repair result

Completed October 5, 2026. The local implementation and automated verification are complete. Nothing was pushed to GitHub or deployed. Existing player data, the four saved candidates and preserved builds remain intact.

## Verified build

- Source: `e7fd1f59d3ea5054f68b0be4113f05caf0895bf4` on `steven/visual-quality`.
- Packaged artifact: `5.4.0+e7fd1f59d3ea.d9bbc2d4978ce7bd.staging`, retained in `dist`.
- Acceptance fingerprint: `992360779b6893e99b81296b9408f504f276926867a7f1a3e5c4f70a7755851f`.
- **90/90 candidate gates, 3/3 backend groups, and 1,905/1,905 source contracts passed.**
- Packaged existing-save upgrade → preserved fallback read/write → candidate return passed.
- The release validator reports `automatedReady: true`, `evidenceCurrent: true`, no evidence mismatch and no incomplete automated checkpoints.

## Repairs completed

| Area | Result |
| --- | --- |
| Synchronization and saves | Latest condition changes survive failure/retry/account changes; shared submarine motion has bounded work, acknowledgment reconciliation and monotonic lease timing. Actual two-client authority and recovery journeys pass. |
| State and lifecycle | Five reviewed ownership boundaries, session generation/cancellation, named pause ownership and restoration checks prevent obsolete work from taking control. Space launch retargeting no longer strands its pause. Legacy writers are explicitly allowlisted, not claimed fully eliminated. |
| Timing and smoothness | Shared accepted simulation time and elapsed-time camera damping; measured duplicate/allocation work removed; retired world references released; exact spatial queries and numeric road profiles retained with bounded storage. |
| Input | Closing Backpack synchronously releases its own focused control. Immediate Escape→action now reaches gameplay. Closing, deactivation, disposal, unrelated focus and open-panel focus have browser regressions. Engine protection for typing remains intact. |
| Persistence and services | Indexed Journal queries, bounded Backpack presentation, atomic save/receipt behavior, multi-tab isolation, reviewed renderer dependencies, bounded provider retries/bodies/cancellation and private diagnostics. |
| Acceptance | Exact shipped-byte/source/test/config identities, adversarial contracts, sustained hitch/retention checks and separately validated release observations. Failures and earlier checkpoints remain preserved. |

The complete packaged suite covers Earth locations and provider fallbacks, ship floors/doors/boarding and observation views, space travel/research, swimming/diving and marine research, activities/games, urban equipment/recovery, first-session navigation, accessibility, persistence and service boundaries. Backend verification includes real SDK clients with disposable emulator state and the separately declared staging/debug-attested checks; those are not ordinary production-user receipts.

## Measured smoothness and retention

On this Apple M1 / 8 GiB host, all seven 90-second mixed walking/driving/flight routes and the initial samples meet the unchanged budgets. Every measured mode has p99 frame time of 33.4 ms. The largest active-play frame is 166.6 ms; no sampled active-play frame exceeds 250 ms. Average FPS ranges from 43.69 to 57.65 across the named scenarios. This is measured route coverage, not a promise of zero stalls everywhere.

All twelve reload cycles pass ownership, resource, coverage, transfer and storage checks. Settled retained heap is 46.08 MiB after cycle 2 and 51.37 MiB after cycle 12; the earlier large late-cycle jump does not recur. The phone viewport proxy also passes. No physical-phone result is implied. Representative driving, Backpack desktop/phone, ship/gallery, performance and all three save-compatibility images were inspected.

## Preservation and rollback

The prior `942993a1` packaged build was moved intact to `output/preserved-artifacts/5.4.0+942993a13456.5992aad626f5debc.staging` and all 602 shipped files were byte-verified. Prior failed evidence is retained under `output/release-evidence/prior-942993a1` and the architecture-polish evidence directory.

The compatible fallback is `5.4.0+5d772a9c758c.3d0abe2f16a1b4c7.staging`. Eleven reviewed runtime differences are pinned by before/after file hashes and Git modes; save models/storage and remaining backend/protocol inputs are unchanged relative to it. The same-origin packaged test preserves 64 existing items and 64 existing history records, writes through actual owners across all three stages, retains pending account data, and verifies both artifact identities again. No player database was downgraded or deleted. The earlier production build is historical preservation, not the certified v5-save fallback.

## Release observations still required

These are the finite remaining release requirements; no further local repair is currently failing:

1. Ordinary hosted cold/warm start, search, sign-in, shared voyage and save recovery on this exact artifact with ordinary attestation.
2. Physical iOS and Android touch, memory/thermal and resume journeys on named devices.
3. An uncoached fresh-player exploration and return/resume review.
4. Commercial weather-service authorization and endpoint/attribution confirmation.

Accordingly `releaseReady` remains false. The local work does not fabricate these observations or authorize publication. The existing bounded product phases are not being reopened for worldwide visual/content expansion. A subsequent visual pass is separate work.

## Evidence

All paths below are repository-relative:

- `output/verification/architecture-polish/candidate-e7fd1f59-execution-manifest.json`
- `output/verification/architecture-polish/backend-e7fd1f59-execution-manifest.json`
- `output/verification/architecture-polish/performance-e7fd1f59-passed/`
- `output/release-evidence/current/migration-rollback/report.json`
- `output/release-evidence/current/acceptance/migration-rollback.json`
- `output/verification/architecture-polish/release-scope-e7fd1f59.json`
- `output/verification/architecture-polish/backpack-focus-pr.log`

[IMPLEMENTATION.md](IMPLEMENTATION.md) retains the detailed repair sequence, failed experiments, exact limitations and intermediate evidence. [ACCEPTANCE.md](ACCEPTANCE.md) defines freshness and identity requirements. Documentation-only closeout commits retain the artifact's actual source/build identity.
