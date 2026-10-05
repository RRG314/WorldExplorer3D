# Current development and release state

Updated October 5, 2026. Continue from the actual source and immutable artifact, not historical acceptance claims. The owner requests a complete test build and production-blocker repairs, with **free public data and no paid weather/ocean subscription**. Detailed current evidence: [FREE-ENVIRONMENT-DATA.md](docs/release-review/2026-10-05/FREE-ENVIRONMENT-DATA.md). Visual work: [REFERENCE-BLOCK.md](docs/visual-quality/REFERENCE-BLOCK.md). Preserved architecture results: [LOCAL-RESULT.md](docs/system-review/2026-10-04/LOCAL-RESULT.md).

## Workspace and authorization

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`. Do not edit older Documents/Developer checkouts. Local repairs, commits and a staging test preview plus supporting staging backend are authorized. No GitHub push or production promotion is part of this request.

Physical Apple M1 Mac mini, 8 GiB RAM. Run heavy work sequentially, keep ordinary Chrome open, and close owned verification processes. Preserve player data, four saved candidates and retained artifacts. Private diagnostic credentials stay outside the repository and reports.

## Current implementation and verification

Commit a1043116 replaces Open-Meteo with a bounded App Check protected gateway: MET Norway hourly weather, PacIOOS/NOAA waves and HYCOM/FNMOC currents/temperature. Shared cache, provider rate controls, validation, unavailable/partial states, attribution and independent model timestamps/grids are implemented. Existing NOAA tides retain their authority. No paid data key is needed; existing Firebase infrastructure remains in use.

All 1,926 current PR contracts plus dependency/source/ownership/type/inventory/sensitivity checks pass. Actual Firestore transactions/security and Functions HTTP model retrieval pass. Staging `getEnvironmentalData` and cache TTL/index settings are deployed. Real browser weather/ocean panels pass through registered staging debug App Check; this does not certify ordinary attestation or physical phones. The prescribed browser client and missing-data/location-race UI checks pass.

The prior visual pass implements shared facade depth/glass/trim, asphalt/paving detail and Calvert Street furniture/planting under existing owners. Commerce spatial-index reuse fixes a reproduced stall. Bounded walking/driving and entry/exit/day/night/weather checks pass; full new immutable acceptance is still in progress.

Packaging found and fixed an empty emitted chunk excluded from the manifest's runtime file count. The corrected fallback builds and verifies all 603 files. Final visual candidate packaging, complete candidate/backend matrix and packaged save roundtrip remain in progress; old receipts must not be relabeled as current.

## Test preview and preservation

Initial test preview: https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app . Its faf24c3a frontend predates the public-data replacement and must be updated and its remote manifest checked before claiming that replacement is available there.

All prior dist artifacts were moved intact to `output/preserved-artifacts/`, including faf24c3a and e7fd1f59; their hashes were verified. Four `.local-candidates` remain untouched. No player database was removed or downgraded.

New free-data-compatible fallback: `output/preserved-artifacts/5.4.0+0e4c8d429c8a.36242ad81a1d4ccb.staging`, source branch `steven/free-data-fallback`. It retains all public-data/backend/save/control repairs and commerce performance work, using earlier street visuals. Twelve exact reviewed visual runtime differences are pinned in `scripts/verification/rollback-runtime-review.json`; the actual packaged save roundtrip is still required. Old 5d772a9c fallback is preserved as historical evidence but restores the superseded provider integration and is not the intended new rollback.

## Release boundary

Production was verified October 5 as `5.4.0+1532bdfbb5c1.319d215f60318297.production` at https://worldexplorer3d.io/build-manifest.json . This work has not changed production. Production lacks `getPlaceLookup`; that function and the new environmental gateway must be included in a coordinated future release.

Prior e7fd1f59 acceptance (90 candidate gates, 3 backend groups, 1,905 contracts, sustained performance and save roundtrip) certifies only its preserved artifact. Current candidate must have matching fresh execution evidence. Public-use rights can satisfy the historical weather-entitlement class; no subscription is required. Ordinary hosted sign-in/shared-voyage/save journeys, named physical iOS/Android and uncoached fresh-player observations cannot be inferred from automation or debug App Check.

The bounded P01–P19 product sequence is documented in [DELIVERY-PLAN.md](docs/product-audit/2026-10-01/DELIVERY-PLAN.md). Existing content includes research ship/submarine, ordered planetary research, street district activities, shared anchored marine voyage and a two-region still-camera slice. It does not claim worldwide live video or No Man's Sky scale. Do not reopen completed feature phases or add new systems without a new task or reproduced problem.
