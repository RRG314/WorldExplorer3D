# Marine and transport test build

Current local artifact: **5.4.0+7101339662ce.1a5695e5aa23c4bf.staging**, branch `steven/visual-quality`. Its 612 files pass artifact verification; the asset-manifest SHA256 is `e15d1d814809362e2d8c1e48ca13679a018277979a698f73544cdb67450e4976`. This is a test candidate, **not a production release**. Hosted preview status is recorded in CURRENT-STATE.md; a local build does not update that preview automatically.

The 71013396 build independently byte-matches all 612 game files of the f182 build exercised by the marine/transport/save receipts below. Only build identity and verification provenance changed. Proof: `output/verification/final-harness-artifact-equivalence-1007.json`.

## Completed in this candidate

- Tunnel cuts publish before road-worker terrain snapshots. Ordinary roads, paths, curbs and crossing paint subtract the same finite excavation from rendering and physical contacts. Upper bridges and engineered approaches retain their own grades. Sparse linear paths now sample intervening terrain while preserving source bends. The remaining rough surrounding road/retaining geometry is not accepted as professional quality.
- Automatic cabin entry no longer changes the radius used to decide whether chase view fits. Roof-clearance framing looks forward along the road.
- Fresh Ocean selection and an aboard saved voyage start directly on the research deck without first allocating an underwater world. The existing surface transaction owns cancellation, rollback, location and save publication. Saved underwater voyages keep their existing path.
- Deck walking, platform jump, swimming, automatic scuba, recovery to the same vessel and submarine deployment are connected. Main Menu preserves the voyage; the visible saved-vessel action restores the same ship and submarine directly on deck.
- The prior Earth-return and ship-interior ownership repairs remain present. Their earlier packaged/source receipts are listed in MARINE-TRANSPORT.md; those historical timings are not new measurements of this artifact.

## Evidence and its limits

| Check | Result and scope |
| --- | --- |
| Full PR chain | 2,091 tests pass, with dependency, source, ownership, type, inventory and sensitivity checks. `/tmp/we3d-final-fingerprint-pr.log`. |
| Packaged marine journey | Seven checks pass with no page errors: fresh and controlled-airborne entry, deck/swim/scuba/recovery, sub launch, menu and saved-aboard resume. Real UI, controllers, rendering and disposable local saves; controlled GEBCO response. `output/verification/marine-connected-packaged-f182/report.json`. |
| Prescribed game client | Three actual deck movement/turn/idle bursts, screenshots opened. `output/verification/marine-prescribed-packaged-f182/`. |
| Packaged Monaco route | Complete 322.17-unit surface approach → bore → exit using keyboard driving; all six checks pass, no airborne frames or captured errors, zero sampled join discontinuities. Images inspected. `output/verification/transport-portal-packaged-f182/report.json`. |
| Save upgrade/fallback/return | All three packaged stages pass, 136 runtime differences reviewed and byte-pinned, legacy/new records and unrelated pending account data preserved. Disposable browser storage, never the owner's player profile. `output/release-evidence/current/migration-rollback/report.json`. |
| Building coverage | Latest prescribed source Baltimore drive retains 48,296 nearby buildings and 95% eligible regional coverage. `output/verification/transport-prescribed-cuts-1007/`. This is a bounded coverage check, not worldwide streaming acceptance. |

The final sustained run completed seven 90-second movement windows and 12 reloads. **The performance gate fails:** driving has a 500 ms worst frame in one window, and another has four frames above 100 ms. One walking window encounters ordinary custody and is retained as a failure, not discarded. Several average-FPS samples also fail their separate target. All three sustained flights pass the hitch limits.

All 12 reloads pass resource/ownership cleanup and preserve exactly 49,023 buildings, 18,952 roads and 49 terrain tiles. Post-unload heap settles to 47.19–52.46 MiB from cycle two onward, within the retention limit. No browser errors or failed local resources are captured. Full result: `output/verification/performance-sustained-7101/report.json`. Passing cleanup does not override failed active-play performance.

The older 237/859 Monaco and 62/677 Baltimore join failures describe superseded builds. Current source bridge verification passes 9/9, and the current packaged Monaco route has zero sampled join discontinuities. Those repairs do not establish that every portal, bridge, surface or location is finished.

## Test the ocean journey

Select an ocean site, then **Ocean**. Arrival should be on the research deck. Choose a station in the deck destination selector and walk to it; actions become available within reach. At the dive platform, **Space** jumps into the water. **W/S** moves, **A/D** turns, **Space/Shift** rises/dives. Scuba equips automatically when required by the swimming controller. **Recover** returns to the same vessel. Walk to the submarine cradle and choose **Deploy submarine**; forward movement takes the sub away from the stern. Recover, choose **Main Menu**, then **Return to saved research vessel**; the same voyage should resume directly on deck.

## Required before production

1. Sustained Earth movement and repeated-load resource acceptance: earlier active-play GC stalls remain unresolved until the current long checks demonstrate otherwise. No frame thresholds or coverage targets have been relaxed.
2. Complete visual/physical acceptance for upper streets, bridge approaches, retaining walls and hill/mountain/water portals. The latest cut fixes remove the suspended asphalt sheet; surrounding geometry remains too rough.
3. The requested licensed RCRV vessel, matching multi-deck navigation/collision, marine wildlife assets, broad ecology and spearfishing remain unimplemented. The downloaded licensed model is preserved; it has not replaced the procedural ship.
4. Optional continuous worldwide and ocean traversal is not certified or represented as complete. The existing location-based game remains preserved.
5. Coordinated backend/frontend release, ordinary hosted authentication/shared-voyage/save recovery, named physical iOS/Android checks and fresh-player acceptance remain open. Local fixtures and desktop viewport emulation do not satisfy those checks.

See [audit, R&D, implementation and evidence ledger](MARINE-TRANSPORT.md). No GitHub push or production deployment has occurred.
