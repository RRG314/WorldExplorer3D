# Current development and release state

Updated October 5, 2026. The owner requests a test build and production-blocker repairs with **free public data, without paid data subscriptions**. The free-data replacement is implemented and deployed to the test preview. **Production is not cleared: performance still fails.**

Details: [FREE-ENVIRONMENT-DATA.md](docs/release-review/2026-10-05/FREE-ENVIRONMENT-DATA.md). Visual work: [REFERENCE-BLOCK.md](docs/visual-quality/REFERENCE-BLOCK.md). Earlier architecture acceptance: [LOCAL-RESULT.md](docs/system-review/2026-10-04/LOCAL-RESULT.md).

## Workspace and authorization

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`. Do not edit older Documents/Developer checkouts. Local repairs, commits and a staging preview plus supporting staging backend are authorized. No GitHub push or production promotion is part of this request.

Physical Apple M1 Mac mini, 8 GiB RAM. Heavy checks run sequentially. Preserve ordinary user Chrome, player data, four saved candidates and retained artifacts. Close owned verification browsers; an open 3D preview measurably interferes with performance testing. Private credentials stay outside the repository and reports.

## Implemented and deployed

- MET Norway weather; PacIOOS waves with NOAA/NCEP fallback through NSF Unidata; HYCOM/FNMOC surface currents and temperature; existing NOAA tides retained.
- ADSB.lol public ODbL aircraft observations replace OpenSky. Active runtime contains neither Open-Meteo nor OpenSky integration.
- Fixed-source environmental gateway with App Check, shared cache/leases, rate/day limits, bounded requests, cooldowns and stale/malformed-data rejection. Missing values, independent model times/grids and reference-versus-observed labels remain explicit. Catalogs, attribution and privacy updated. No paid data subscription or data API key needed; existing Firebase infrastructure remains separate.
- Submarine HUD weather width repaired; nine actual-markup layout cases and weather-location race pass. Previous facade/pavement/furniture/planting and indexed commerce work remain intact. Manifest counting includes zero-byte emitted files.

Test preview: https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app (expires October 12).

Preview and `dist`: **5.4.0+078250e5e401.c530fbdb9b6a1cb4.staging**, source `078250e5e401c3366c3a6e21b2bb09909bfc3938`, 605 content files. Both hosted manifests byte-match local files. Asset-manifest SHA256: `b448607fa75f78383bf3f9dc0434045117ca73f8f5a3419baafaac75d1aef39a`. Acceptance fingerprint: `922e0d875875ac1766eb72f41a5b715854ab80dfb3288f95d27705a2a0c42347`. Later documentation-only commits do not rebuild this artifact.

Staging Functions verified ACTIVE: environmental gateway v1, aircraft v5, place lookup v2; environmental cache TTL/index settings deployed. Ordinary Chrome without debug attestation displayed MET weather, 80 ADSB observations, NOAA waves and HYCOM currents/temperature. Source/licence links and model timestamps inspected. Only the exact preview hostname was added to staging reCAPTCHA allowed domains; allow-all remains disabled. These observations cover public-data panels, not the full signed-in hosted journey.

## Verification and remaining blocker

**1,931 PR contracts** and dependency/source/ownership/type/inventory/sensitivity checks pass. Frozen candidate ran all 90 gates: **89 pass; performance fails**. All **3 backend groups pass**, including isolated security/multiplayer/economy cases. Packaged save upgrade → fallback read/write → candidate return passes all 3 stages, preserving legacy/new Journal records, equipment/ammo, unknown fields and unrelated pending account data. Images inspected. Current public-data rights and migration receipts match the artifact.

The first complete performance run passed loading, coverage, resources, storage and retention, including seven sustained travel windows and twelve reloads. FPS and clustered hitch limits failed. Its open owned preview consumed graphics resources; after closing that preview, the clean repeat still reproduced flight hitches near 71 seconds (200/133/250 ms) and initial driving around 41 FPS. The repeat was deliberately stopped once failure reproduced by terminating only its verified owned Chrome; the matrix unwound, preserving a failed result. Its unfinished retention portion is not a pass.

A separate bounded CPU/GC/allocation diagnostic captured main-thread incremental-GC start ~139 ms and major collection ~131 ms (~491 MB before / ~375 MB after collection); instrumented frame outliers were 183/167 ms. Allocation paths include aircraft collision sweeps, map drawing, water updates, vegetation work and rendering. This identifies candidates for repair, not a proven minimal fix. No runtime or budget was changed to conceal failure. These measurements occurred at night; historical daytime/older-browser passes are not interchangeable evidence.

Evidence: `output/release-evidence/current/` contains original/repeat candidate manifests, backend manifest, matching acceptance receipts, save roundtrip, hosted preview, public rights and diagnostics. Performance directories under `output/verification/`: `performance-078-initial-with-preview`, `performance-078-clean-repeat-partial`, `performance-078-flight-diagnostic`. Do not print entire runtime snapshots or raw private data.

Next performance work: demonstrate a bounded before/after repair of the captured stall, controlling time/weather/browser conditions, before another full immutable matrix. Prioritize stalls; the owner does not require perfect FPS. Do not relax budgets or trust historical 5.2/5.4 acceptance. Ordinary hosted sign-in/shared-voyage/save-recovery, named physical iOS/Android, and uncoached fresh-player acceptance also remain unverified.

## Preservation and production boundary

Tested fallback: `output/preserved-artifacts/5.4.0+37a12d117111.9496ab31100b61ae.staging`, branch `steven/free-data-fallback`, commit `37a12d117111446a128888384df67ac52445d972`, 603 files. It retains free providers, HUD, save/control/backend and commerce fixes with earlier street visuals. Twelve exact visual-only differences are pinned in `scripts/verification/rollback-runtime-review.json`; packaged save roundtrip passed. All previous builds, four `.local-candidates`, source history and player data remain intact.

Production rechecked October 5 at 23:44 UTC: **5.4.0+1532bdfbb5c1.319d215f60318297.production**. No production frontend or GitHub changes. A future coordinated release needs `getPlaceLookup`, `getEnvironmentalData`, updated `getAircraftStates` and supporting configuration together with accepted frontend bytes. Do not promote with unresolved performance or required external acceptance.

The bounded product sequence remains in [DELIVERY-PLAN.md](docs/product-audit/2026-10-01/DELIVERY-PLAN.md). Existing research ship/submarine, planetary research, district activities, shared marine voyage and regional still-camera slice do not imply worldwide video or No Man's Sky scale. Do not reopen completed feature phases without a new task or reproduced problem.
