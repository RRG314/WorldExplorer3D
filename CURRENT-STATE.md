# Current development and release state

Updated October 3, 2026. This summary supersedes the chronological status notes retained in Git history.

## Workspace and authorization

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`. Do not edit the older Documents or Developer checkouts named in historical notes. The owner authorized finishing the product-plan phases sequentially with actual verification, preserving existing gameplay and work. The original investigation explicitly excludes production deployment.

Observed host: physical Apple M1 Mac mini, 8 GiB RAM; approximately 18 GiB disk free at the final check. Run heavy workloads sequentially, close only owned test processes, keep ordinary Chrome open, preserve dist, all four saved candidates and player data. Never print credentials. Current observation overrides stale hardware assumptions.

## Production — unchanged

Freshly read October 3 from https://worldexplorer3d.io/build-manifest.json:
`5.4.0+1532bdfbb5c1.319d215f60318297.production`.
Source `1532bdfbb5c11e002d278b058d1ebdba88384f60`.

No new frontend, backend, rules or index deployment occurred in this continuation. Local Functions/Auth/Firestore emulators and disposable staging App Check identities were used for verification. Source checks and emulator success are not production receipts.

## Development closeout

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

All **1,792 registered contracts** and source checks pass. Actual provider checks retrieved current weather, marine and earthquake data, decoded Overture September patched tiles for Baltimore/London and converted building geometry. Six marine GLB files match their CC0 manifest hashes and 1,373,484-byte total. Overture public-retention gate reports 49 days remaining on October 3.

## Remaining work is a finite release gate

[RELEASE-ACCEPTANCE.md](docs/product-audit/2026-10-01/RELEASE-ACCEPTANCE.md) is the next action list:

1. Resolve the pending owner question about an existing paid Open-Meteo plan; free endpoints are not certified for commercial launch. Do not request keys in chat or purchase a plan without authorization.
2. Coordinate staging backend/rules/index/TTL and actual App Check verification, then build and test one matching immutable frontend artifact. Current release readiness correctly rejects the older candidate/backend evidence.
3. Obtain physical iOS/Android and uncoached-player acceptance, and match supported-hardware performance/retention plus rollback evidence to that artifact.
4. Only then consider production promotion under the user's deployment instruction and existing release governance.

No missing physical device or user feedback is marked as a code/test pass. Source, component tests, actual controlled-provider browser journeys, live service reads, emulator authority checks and production evidence remain distinct. Historical plan documents retain the original diagnosis; their dated open-state paragraphs do not override this closeout.
