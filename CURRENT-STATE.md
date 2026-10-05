# Current development and release state

Updated October 5, 2026. This file supersedes historical status paragraphs. The latest local visual work is [REFERENCE-BLOCK.md](docs/visual-quality/REFERENCE-BLOCK.md). The earlier architecture closeout is [LOCAL-RESULT.md](docs/system-review/2026-10-04/LOCAL-RESULT.md); detailed failed and successful checkpoints remain in [IMPLEMENTATION.md](docs/system-review/2026-10-04/IMPLEMENTATION.md) and Git history.

## Workspace and authorization

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`. Do not edit the older Documents or Developer checkouts named in historical instructions. The owner authorized completing repairs and verification locally, with local commits and preservation of progress. No GitHub push or production deployment is part of this request.

Observed host: physical Apple M1 Mac mini, 8 GiB RAM. Run heavy work sequentially. Keep ordinary Chrome open, close only owned verification processes, and preserve `dist`, all four saved candidates, previous build artifacts and player data. Current observations supersede stale hardware notes. Private diagnostic captures remain outside the repository; never print credentials.

## Local visual source — reference street block

The shared facade renderer, near-building trim/storefronts, asphalt/paving materials and an authored Calvert Street seating/planting block are implemented. Night windows reuse the existing lighting owner; furniture, trees and three seating lamps reuse existing lifecycle, collision and light-budget owners. A profiled excessive commerce lookup now uses the existing batch spatial index, with exact-association and stale-publication regression coverage.

Local source checks pass all **1,913 PR contracts**, plus the source/dependency/ownership/type checks, actual near/mid shader rendering and the prescribed storefront browser client. The final actual Baltimore journey passes furniture clearance, building entry/exit, day/night/weather and phone-viewport inspection. Its 30-second walking and driving samples measure 46.24 / 43.72 FPS, p99 33.4 ms and worst frame 33.5 ms, with no frames over 100 ms; all 263 driving positions remain on the mapped carriageway. These are bounded checks on this Mac, not a repeat of the entire release/device matrix.

The new source is different from the preserved architecture artifact below. Its previous 90 candidate gates, backend receipts, reload matrix and `automatedReady` status certify that older artifact only. They do not certify the visual source for production. `dist`, saved candidates and player data remain unchanged; no push or deployment occurred. See the visual ledger for images, evidence locations and remaining art scope.

## Preserved architecture artifact — automated acceptance complete

Packages 1–5 are implemented and verified locally: synchronization, state/lifecycle ownership, coherent clocks, measured stall/retention repairs, and persistence/service/dependency boundaries. Package 6's evidence infrastructure and automated acceptance are complete; its genuinely external release observations remain pending.

The clean runtime/test checkpoint is `e7fd1f59d3ea5054f68b0be4113f05caf0895bf4`. Artifact `5.4.0+e7fd1f59d3ea.d9bbc2d4978ce7bd.staging` remains in `dist`, with 602 verified shipped files. It passes **90/90 candidate gates, all 3 backend groups, all 1,905 PR contracts**, and the actual packaged save upgrade/fallback/write/return. No source changed during those runs. Documentation-only closeout changes do not change the accepted runtime/test/config fingerprint or artifact identity.

Sustained performance passes unchanged limits on all seven 90-second routes plus initial samples and twelve reloads. Every measured mode has p99 33.4 ms; maximum active-play frame is 166.6 ms. Average FPS spans 43.69–57.65. Settled retained heap is 46.08 MiB after reload 2 and 51.37 MiB after reload 12, without the earlier large late jump. The phone-viewport proxy passes; physical devices are not inferred. Space launch retarget pause and synchronous Backpack focus/action defects are repaired and pass actual journeys.

`release-scope.mjs` reports `automatedReady: true`, `evidenceCurrent: true`, no evidence mismatch and no incomplete automated checkpoint. `releaseReady: false` correctly reflects the five missing external evidence classes below. Do not restart performance micro-optimization or reopen completed phases without a new reproduction or owner request.

## Preservation and rollback

Local commits preserve the repairs. Prior `942993a1` is retained at `output/preserved-artifacts/5.4.0+942993a13456.5992aad626f5debc.staging`; its 89/90 failure evidence remains intact. Earlier a6cb/919/production artifacts and all four `.local-candidates` remain retained.

Certified local save-compatible fallback: `output/preserved-artifacts/5.4.0+5d772a9c758c.3d0abe2f16a1b4c7.staging`. Its distinct packaged build reads/writes the upgraded v5 Journal/Backpack save and returns safely to e7fd. The exact reviewed runtime hash contract and receipt are documented in LOCAL-RESULT. The older deployed v4 frontend is not presumed save-compatible. Never downgrade or delete player databases for rollback.

## Remaining release requirements

1. Ordinary hosted journeys on the exact artifact with normal attestation and live providers. Staging/debug-attested and emulator results are separate evidence.
2. Physical iOS and physical Android acceptance on named devices.
3. Uncoached fresh-player navigation, exploration and return/resume.
4. Commercial weather-service entitlement and endpoint/attribution confirmation; never request keys in chat or purchase a plan without authorization.

These observations remain pending; the migration/rollback class now passes. No frontend, Functions, rules or indexes were deployed during this local repair closeout. Production promotion is a separate action after the required evidence exists.

## Production and prior product scope

Production was last read October 3 at `https://worldexplorer3d.io/build-manifest.json` as `5.4.0+1532bdfbb5c1.319d215f60318297.production`, source `1532bdfbb5c11e002d278b058d1ebdba88384f60`. This work has not changed production. Earlier staging deployment and phase history remain in Git and the linked ledgers; they do not substitute for this candidate's release observations.

The bounded development sequence P01–P19 remains complete within [DELIVERY-PLAN.md](docs/product-audit/2026-10-01/DELIVERY-PLAN.md). P20 automated development acceptance is now freshly revalidated; external release acceptance remains open. Current content includes the personal research ship/submarine loop, ordered planetary research, tested street district and activities, shared anchored marine voyage and two-region still-image camera slice. It does not claim worldwide live video, unlimited visual realism or No Man's Sky scale. Future visual refinement is a separate focused art pass over the existing scenes.
