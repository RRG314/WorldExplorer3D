# Player journey release acceptance — November 5

This delivery continues the accepted cinematic application. Production and GitHub publication remain frozen. The complete test app uses https://we3d-staging-20260712.web.app/app/. Personal-save service v1 and account cleanup v9 are active in that staging project. The temporary trail preview rejects account API origins; use the standard staging address for the complete app. No API permissions were weakened to bypass that restriction.

## Ownership

The original Journal transaction owns character, career, achievement, media and companion progress. The original Backpack commit owns personal inventory, wallet and homes. Original domain stores own voyages, missions, routes and created worlds. The account journey coordinator transports complete versioned snapshots of those owners. It does not create another wallet, quest store, trusted online score, property deed or entitlement.

The private staging API publishes immutable one-MiB chunks only after complete format/owner/checksum checks and a base-revision transaction. Auth, App Check, UID fencing, last-two-save recovery and account cleanup are enforced. Browser restores archive first, use original save owners and keep an interrupted-restore marker until all owners finish. Guest history requires explicit association; account switches preserve separate recovery copies. Same-browser secondary tabs cannot upload without the original possessions writer lock.

The title return lease reuses only the identical current ready Earth publication for 45 seconds. It holds no second city. Home return uses canonical loaded building identity, the original travel/spawn/door controllers and original collision/lifecycle owners. It grants no healing, money or verified competitive result. Generated purchased home rooms use bounded fitted furniture and original colliders; saved workspaces retain their existing furnishings.

## Evidence boundaries

| Boundary | Accepted evidence |
| --- | --- |
| Same-place return | `return-1793906580915`: cold66,749ms, return273ms, same publication, actual walking. No repeat performance test. |
| Personal purchase and persistence | Original atomic purchase receipt plus `home-1793910404428/purchased-home-envelope.json`: actual supported mapped home, exact wallet charge once, precise region and complete save preserved. |
| Other-world home return | `home-1793910571477`: actual Moon→owned Earth interior. Functional admission accepted; rejected nested-house presentation replaced. |
| Canonical collision, room, movement, exit | `home-1793911123006`: original building identity, fitted room, actual keyboard movement and normal exit. Exact candidate `home-1793912078618` rechecks changed entry framing/continuous furniture clearance, canonical identity, keyboard movement and normal exit with no page exceptions. Images reviewed. |
| Career/free-roam reselection | `ui-1793908229187`: repeated real Continue returns Geologist after Racer selections; original records/items/character unchanged. Original introduction and field-method evidence reused. |
| Final native Journey/board/touch controls | `final-ui-1793911675123`: 19 available career projections, all practical stages present, empty lunar slots count0; starter-home entry opens original globe; guest save panel offers correct controls; desktop/phone images reviewed. |
| Interrupted restore | `indexeddb-1793909788961`: actual Chrome IndexedDB/Web Locks/localStorage; controlled quota failure retains gate; finish/rollback preserve full original state; other-account Undo rejected. |
| Two devices/live private backend | `two-device-1793910337361`: preserved anonymous ownership UID on signup, equal complete envelope and earned state on isolated second device, explicit conflict and chosen restore, raw private object403, missing Auth401/App Check401, no page exceptions. Test account deleted. |
| Component/source | Full4,125-case run:4,123pass,2fail. Corrected affected files8/8pass including one added cleanup-failure case, producing4,126 distinct accepted cases by scoped composition. Original full run and failures retained. Dependencies/source/ownership/types/test inventory/sensitivity gates pass at their recorded boundaries. |

All evidence is under `output/verification/player-journey-20261105`. A fixture, source check, actual native player action and live service acceptance are distinct levels. Existing source inventories and original career/racing/world receipts remain the evidence for unchanged features; no old field methods, laps, twelve unavailable venue packs or physical VR/mobile hardware are newly certified.

## Continuing careers

The final native read projects the original owners: Racer5stages; Geologist, Archaeologist, Mining engineer, Palaeontologist, Oceanographer, Marine biologist, Wildlife ecologist, Botanist, Hydrologist, Meteorologist, Cartographer, Planetary scientist and Astronomer5each; Accelerator scientist4; Field engineer3; Documentary explorer5; Explorer12; Companion handler5. These are actual course/journey milestones, with detailed methods and follow-on unlocks still owned by their domain adapters. Earned achievements project original completion receipts. The unavailable aviation career remains Coming soon; older Harbor continuation remains supported through its existing alias.

Personal career milestones live in the existing rankings surface. They are labeled as personal Journal progress and account sync scope; competitive racing/community categories retain their original trusted result rules. No menu action awards XP.

## Publication boundary

The isolated runtime candidate passed exact native home checks and hosted ordinary desktop/phone UI checks (`hosted-standard-1793912592209`); 482 critical runtime/HTML/CSS/Firebase files totaling9,713,989bytes match its verified package. The corrected verification adapter and this acceptance record are sealed into the final package without changing game code; final build identity and byte receipts are indexed by CURRENT-STATE.md. Accepted gameplay is reused at identical runtime/environment boundaries. The previous standard staging build e0ac9c947821 was retained at rollback channel `journey-before-20261105-1602` before updating the standard address. Production activation remains a coordinated separate release: preserve existing production account environment and activate personal-save API plus account-deletion cleanup before promoting the matching frontend. Exact-build human production image review and remote publication checks are not inferred from historical approvals. No production data migration, broad user census, source/history deletion or GitHub mutation is part of this staging delivery.
