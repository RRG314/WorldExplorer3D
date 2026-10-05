# Current development and release state

Updated October 4, 2026. This summary supersedes the chronological status notes retained in Git history.

## Workspace and authorization

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`. Do not edit the older Documents or Developer checkouts named in historical notes. The owner authorized finishing the product-plan phases sequentially with actual verification, preserving existing gameplay and work. The original investigation explicitly excludes production deployment.

Observed host: physical Apple M1 Mac mini, 8 GiB RAM; approximately 8 GiB disk free after verified compression of generated private diagnostics. Run heavy workloads sequentially, close only owned test processes, keep ordinary Chrome open, preserve dist, all four saved candidates and player data. Never print credentials. Current observation overrides stale hardware assumptions.

## Local architecture polish — current owner request

The owner now requests fixes and verification locally, preserving progress; no GitHub push or deployment. The fresh review and repair ledger is [IMPLEMENTATION.md](docs/system-review/2026-10-04/IMPLEMENTATION.md), with [ACCEPTANCE.md](docs/system-review/2026-10-04/ACCEPTANCE.md) defining evidence. Earlier phase/deployment summaries below are historical and do not approve this changed source.

Synchronization, state ownership, clocks, persistence/history, provider handling, dependency provenance and support/resource diagnostics have verified local checkpoints. The a6cbf53f immutable matrix completed 84/90 candidate gates; six failed and backend groups remain pending. A compatible packaged save round trip passed for that artifact only. Backpack focused-button Escape and space launch retarget pause defects have source repairs with focused behavior/browser evidence; their full acceptance remains pending. Swimming/support-report/equipment fixtures are being corrected without weakening their assertions. P4 remains open: the sustained run records active-play stalls up to 1,133 ms and some average-FPS failures, while twelve-cycle retention and ownership checks pass. Preserve all failure evidence, four saved candidates, current dist, production artifact and player data. No GitHub push or production deployment.

## Production — unchanged

Freshly read October 3 from https://worldexplorer3d.io/build-manifest.json:
`5.4.0+1532bdfbb5c1.319d215f60318297.production`.
Source `1532bdfbb5c11e002d278b058d1ebdba88384f60`.

No production deployment occurred. During full release revalidation, getPlaceLookup and mutateSharedExpedition plus Firestore rules/indexes were deployed explicitly to staging (we3d-staging-20260712), with existing hosted parameter values preserved. Hosted App Check lookup and rejection without a token passed in the first immutable matrix. Hosted shared-voyage HTTP authority/security-rules checks also pass with three disposable accounts and successful fixture cleanup. All staging Functions were redeployed from clean 87011a84 with the patched dependency lock and all 11 existing parameters preserved. Local emulators and disposable staging App Check identities are also used; their success is not a production receipt.

## Full release revalidation — owner follow-up

The owner now explicitly requires phase 0 onward and all added work checked for production readiness. The earlier development closeout below is not final release acceptance. A fresh staging artifact was built; the previous production dist was moved intact (not copied or deleted) to `output/preserved-artifacts/5.4.0+1532bdfbb5c1.319d215f60318297.production`. All four saved candidates remain intact. New work fixes packaged-check imports, adds missing phase journeys to the release matrix, uses actual SDK shared-voyage transport, and repairs ocean entry when place-name lookup fails. The complete first matrix ran all 81 candidate gates against d643c222: 66 passed and 15 failed. The failures are being repaired, with a final matching candidate/backend acceptance still required. The original report is retained at output/verification/product-plan/first-candidate-d643c222.json; do not claim readiness from partial reruns.

## October 4 complete acceptance and measured flight follow-up

Clean `01d181c9f6f3fc4728872b462adec1993bb2fc6c` completed **82/82 candidate gates and all three backend groups** against staging artifact `5.4.0+01d181c9f6f3.a6a388d7e2c2b056.staging`. Immutable copies are `output/verification/product-plan/final-candidate-01d181c9.json` and `final-backend-01d181c9.json`. These supersede the earlier failed-run checkpoints below, which remain retained as diagnostic history.

The supported-hardware performance gate passed its existing budgets, but flight included one 600 ms frame. Follow-up CPU/heap traces found garbage-collection pauses and repeated temporary allocations, with zero flight shader links. A bounded repair removes transient wheel-contact records, skips full wheel solves in three X/Z-only traffic decisions, and allocates storefront candidate records only inside the existing radius. Geometry, traffic density, contact accuracy, sample count and visual selection are unchanged. Old/new contact outputs match exactly across 12,000 generated cases; nested solver calls and X/Z decision parity have focused coverage. A 90-second diagnostic comparison sampled 3,767 MiB before versus 2,867 MiB after (about 24% less cumulative temporary allocation, not retained heap). The comparison is instrumented packaged-versus-source evidence, not final FPS acceptance or a guarantee against every stall.

The four-city actual traffic journey, actual street journey, prescribed movement client with inspected desktop/phone images, source checks and all 1,796 contracts pass. The new runtime changes require their own clean build and complete matching matrix. Do not use the green 01d181c9 artifact to approve later source. Physical phones, uncoached-player review and commercial weather entitlement remain external release gates. Production is unchanged.

## October 4 full-run checkpoint

Clean staging candidate `5.4.0+87011a841a71.a6a388d7e2c2b056.staging` completed all 82 candidate gates: **79 passed, three failed**. Hardware performance/retention passed without budget changes: desktop moving drive 45.45 FPS, p99/worst 33.4 ms; flight 57.87 FPS, p99 33.4 ms, worst 83.3 ms. All loading, activation, world coverage, resource/heap retention, storage, transfers and error checks passed, as did the phone-viewport regression proxy. This is not physical-phone evidence. Exact reports: `output/verification/product-plan/candidate-87011a84.json` and `performance-87011a84.json`.

The two Ocean-related failures are test mismatches: the current HUD truthfully says SIM DEPTH and optional protected place-naming 502/429 responses were classified as missing packaged assets. Gameplay/renderer ownership passed. Narrow harness corrections retain provider degradation in reports and continue failing auth, asset, runtime and movement errors. A third gate recorded 14-second live parcel-provider timeouts in Howard and St. Mary's counties (22/24 passed); no timeout or coverage waiver is being applied. Focused packaged player-blocker and environment reruns pass. The newly reached fish check also exposed a stale Explore-menu selector; it now uses the visible Travel control and passes actual fish motion (24 moving fish), Earth return and teardown. The bounded parcel rerun passed all 24 jurisdictions with unchanged provider timeouts and no source changes; original transient failures are retained. Final matching candidate/backend evidence remains required. All source/runtime changes in this checkpoint passed 1,795 contracts. No production deployment.

## Current release repairs — October 3 evening

Actual runtime repairs preserve activity-browser controls/focus across catalog refreshes, enforce 44 px activity touch targets, publish the committed Flower result receipt without a duplicate card, and prevent asynchronous tool selection from resetting a newly started field session. Controlled delayed selection, newer selection and post-equipment Journal-refresh failure all pass in the actual Tokyo source world. The complete actual source first-session journey also passes, including one saved Flower receipt and bounded browser cleanup. The mobile driving camera now resolves body clearance before smoothing and preserves touch-look direction when a chase view is obstructed; its full actual source control journey passes. A measured Mars texture diagnosis removed duplicate height-map bump shading while retaining DEM terrain geometry; all three planetary presentation/collision/teardown journeys pass, with images inspected.

Harness repairs distinguish packaged gameplay from isolated source fixtures, exercise Ocean entry at valid water coordinates while retaining land-rejection gates, and verify exact exterior obstacle restoration on interior exit. The packaged planetary mission, marine habitat, weather fixture and captured-home entry fixture pass focused reruns against the first artifact where applicable. These are diagnostic reruns, not acceptance of changed runtime files in the old artifact.

A CPU trace identified repeated road-publication geometry scans during streaming; incremental counts replace those scans and require an independent actual-geometry comparison. A proposed static-transform cache was benchmarked, found slower and removed. The first repaired clean artifact (5ecf2076) passed moving-drive p99 at 33.4 ms and about 45 FPS, flight and all retention/coverage checks. Stationary ground FPS remains below the existing threshold. A further trace found storefront sign shaders recompiling during movement; material retention now passes the actual source street journey, lifecycle contracts and prescribed movement client; an instrumented trace records zero shader links during moving drive. Mars metallic equipment now receives an owned local reflection map; actual three-world travel verifies restoration and one-time disposal. Budgets have not been relaxed.

The first backend matrix passed the actual two-client marine journey (nine cases plus three rules checks), geocoder authority and all broader backend stages except the multiplayer fixture assertion. The mobile client correctly used primary Shortbread during optional Overpass cooldown; the harness now verifies that explicit fallback while retaining all synchronization/vehicle authority checks. A diagnostic rerun completed all gameplay assertions, but failed an obsolete final summary predicate; that predicate is corrected and the final clean backend matrix remains required. A separate hosted marine gate is now registered, bringing the candidate matrix to 82 gates.

## Earlier development closeout

The finite implementation sequence P01–P19 is closed within the boundaries in [DELIVERY-PLAN.md](docs/product-audit/2026-10-01/DELIVERY-PLAN.md). P20 automated development acceptance passes; P20/C05 release acceptance remains explicitly pending. Do not reopen completed phases for unrelated worldwide visual/content expansion.

| Area | Current state and evidence |
|---|---|
| Foundation, saves, water and swimming | P01–P08 complete in development; entry/depth authority, capability guidance, coherent objectives, atomic save/receipt/backup handling, shared water authority, automatic swimming/scuba and recovery. See SAVE-CONTRACT.md, WATER-AUTHORITY.md and SWIMMING.md in the product-audit directory |
| Personal marine journey | P09–P12 complete for the first Coral Shelf ship/deck/submarine/habitat/research loop, persistent vessel identity, partial recovery/reload and useful research upgrade. Eighteen actual local Ocean regression cases pass |
| Space navigation and field worlds | P13–P15 complete for the documented navigation/research/three-world presentation contract; not No Man’s Sky scale or visual parity |
| Earth district, street reference and games | P16/P17 plus the bounded reference follow-up complete. Actual district walking, day/night/phone, mapped storefront signs, nearby furniture/NPC coverage, interior collision restoration, transport continuity and game/save/retry journeys pass. See EARTH-DISTRICT.md, STREET-QUALITY-REFERENCE.md and GAME-LIFECYCLE.md |
| Shared marine P18 | Complete first anchored crew voyage: exclusive helm/pilot leases, server motion/manifest, reconnect/takeover/rescue/report, original personal-voyage restoration. Nine two-client cases and three authenticated rules/subscription cases pass. See SHARED-MARINE.md |
| Public cameras C01–C04 | Complete two-region still-image slice: Finland and Caltrans districts 3/4, bounded four-view wall, persisted favorites, no-reward Journal references, failure/retry/teardown. Actual imagery and IndexedDB reload tested. No live video/worldwide claim. See LIVE-EARTH-CAMERAS.md |
| Operations P19 | Shared App-Check-protected geocoder authority/cache/cooldown/daily cap/TTL; bounded provider bodies/requests/cancellation; current reviewed Overture pin; actual marine asset hashes. Seven geocoder integration cases pass. Open-Meteo commercial entitlement is unverified. See OPERATIONS.md |
| P20 development checks | Desktop 14 and phone-viewport 8 accessibility assertions pass in the actual assembled app, with inspected images, no page errors or failed local resources. New journeys are registered in the release matrix. See RELEASE-ACCEPTANCE.md |

The previous clean candidate passed **1,792 registered contracts** and source checks; the repair adds a camera-orbit contract. Fresh source/contracts and immutable acceptance are tracked separately. Actual provider checks retrieved current weather, marine and earthquake data, decoded Overture September patched tiles for Baltimore/London and converted building geometry. Six marine GLB files match their CC0 manifest hashes and 1,373,484-byte total. Overture public-retention gate reports 49 days remaining on October 3.

## Remaining work is a finite release gate

[RELEASE-ACCEPTANCE.md](docs/product-audit/2026-10-01/RELEASE-ACCEPTANCE.md) is the next action list:

1. Resolve the pending owner question about an existing paid Open-Meteo plan; free endpoints are not certified for commercial launch. Do not request keys in chat or purchase a plan without authorization.
2. Coordinate staging backend/rules/index/TTL and actual App Check verification, then build and test one matching immutable frontend artifact. Current release readiness correctly rejects the older candidate/backend evidence.
3. Obtain physical iOS/Android and uncoached-player acceptance, and match supported-hardware performance/retention plus rollback evidence to that artifact.
4. Only then consider production promotion under the user's deployment instruction and existing release governance.

No missing physical device or user feedback is marked as a code/test pass. Source, component tests, actual controlled-provider browser journeys, live service reads, emulator authority checks and production evidence remain distinct. Historical plan documents retain the original diagnosis; their dated open-state paragraphs do not override this closeout.
