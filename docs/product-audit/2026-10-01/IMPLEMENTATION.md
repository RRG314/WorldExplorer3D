# Sequential implementation evidence

Baseline: `1532bdfbb5c11e002d278b058d1ebdba88384f60`, active worktree `architecture-evaluation`, branch `steven/visual-quality`. Production is unchanged. Audit documents describe the baseline, not the repaired state.

## P01 — ocean entry eligibility: implemented and focused checks passed

Selected coordinates now require modeled submerged-elevation evidence before launch. Land, shallow water, unknown/provider failure and polar entry are rejected with a recoverable message. Reverse-geocoded names alone cannot admit water. Entry is pinned to the exact selected coordinates and checked again by the ocean runtime before replacing a session. Existing mapped-water boat entry retains its existing offshore-clearance policy; the curated no-coordinate reef entry remains explicit in the runtime. Shared/title launches also validate coordinates. Asynchronous starts are awaited.

The browser test exposed an additional bug: late lookup rendering erased manual coordinate edits. Dirty edits are now retained, and the pending launch is rejected. Lookup cache keys no longer group nearby coastal coordinates into a rounded cell.

Evidence:
- `node --test --test-concurrency=1 tests/ocean-entry-current.test.mjs tests/maritime-sandbox-current.test.mjs`: 9 passed.
- `node scripts/verification/ocean-entry-current.mjs`: actual source application UI, land rejection, provider outage, edit-during-request, valid coastal entry, submarine movement assertions, unchecked runtime rejection retaining active session; 5 cases passed, zero page exceptions. Provider responses are fixtures, not live-service validation.
- Prescribed develop-web-game client: title/globe screenshot inspected. Local Firebase AppCheck reCAPTCHA errors were recorded in this uncredentialed client; it is not an authenticated-service pass. No page exception reported by the journey runner.
- `npm run verify:source`: passed; 1,225 JavaScript files parsed, no broken module links or duplicate identities.
- Screenshots inspected: stale selection, coastal arrival/movement and prescribed client menu. Evidence under ignored `output/verification/ocean-plan/`.

Limits: GEBCO is a coarse modeled elevation source, not a coastline survey or navigation guarantee. Regional scientific fidelity, swimming, ship launch/recovery transactions, and visual replacement remain later items. This is not production release certification.

## P02 — missing bathymetry and coverage: implemented and focused checks passed

Both local and global interpolation reject null, nonnumeric and nonfinite contributing samples. Exact valid nodes/edges remain usable beside missing cells. Sampling beyond the grid returns unknown instead of stretching the last row/column. Removed the rounded cache that reused a sampled edge outside coverage. A late request cannot publish into a replacement session, even at the same coordinate. Debug text now exposes the actual seabed evidence and procedural fallback.

- Combined entry/bathymetry/maritime component batch: 15 passed, including missing corners, malformed samples, local and global bounds, stale cache, complete interpolation, provider outage and same-coordinate session replacement.
- Source check passed.
- Extended real-source browser journey: all prior P01 cases plus admitted ocean with subsequent GEBCO outage; unknown depth evidence, procedural collision and submarine movement verified; 6 cases, zero page exceptions. Provider failure is deliberately injected.
- Outage gameplay screenshot and rerun prescribed-client menu screenshot inspected. Prescribed client still has the known local uncredentialed AppCheck limitation; no authenticated-service claim.

## P03 — sampled seabed map: implemented and focused checks passed

Removed decorative sine-wave contours. The map now samples the collision seabed and draws 10 m gameplay contours with a north-up heading marker, scale bar and working zoom. Geographic missing-data areas are hatched, and modeled depth/datum are separate from simulated player depth. Submarine depth now uses the same world-unit conversion as its speed. The evidence sampler and collision sampler now use the same blend in both readiness states.

Raster generation is cached and bounded to five updates per second while moving, reusing its canvas; marker movement is continuous. Provider/grid/site/zoom changes invalidate it immediately. Pointer zoom returns keyboard control to the game; keyboard activation retains accessibility focus. Clicking the ocean map gives its instructions instead of opening Earth map/teleport actions. A full-screen ocean chart is still a future capability, not an Earth chart presented as ocean navigation.

Evidence:
- Combined ocean/maritime focused batch: 20 passed.
- Full registered current-contract suite: **1,600 passed; zero failed/skipped/TODO**. Component/source evidence, not full release certification.
- Real-source browser journey: 7 cases passed, zero page exceptions; map zoom, actual turn heading, depth labels, collision/evidence agreement, wrong-Earth-map prevention and outage representation added to P01/P02 regression checks. Provider responses remain controlled fixtures.
- Prescribed develop-web-game client against `tests/fixtures/ocean-navigation-map.html`: real map and seabed modules, partial missing-data grid, movement/turning, screenshot and text state inspected; no client error file. This isolated visual check supplements the actual application journey, not a substitute for it.
- Source check passed after cache identity updates: 1,226 JS files parsed; no missing or duplicate module identities.
- Gameplay map, zoom/heading, outage and isolated mixed-coverage screenshots inspected.

## Next

P04–P05 are now implemented below. P06–P20 remain pending; the research ship, swimming/diving and asset upgrades have not been implemented by these foundation fixes. No production deployment has been performed.

## P04 — capability inventory and player guidance: implemented and focused checks passed

Quick Start now has a searchable capability guide backed by the same 98-entry registry as [CAPABILITIES.md](CAPABILITIES.md) and [capabilities.json](capabilities.json). It covers main worlds/travel, creation/progress/account surfaces and every current route-template, discovery activity/tool and Live Earth layer. Each entry declares scope/status, runtime owner, persistence boundary and acceptance limits; JSON retains 36 owner-source hashes. This is descriptive ownership metadata, not a replacement permission or save authority.

Corrected virtual dive tool/activity and Marine Surveyor descriptions, submarine entry/help copy, and explicit boundaries for swimming, research ship deployment, local versus connected progress and reference ship tracks. Available status does not claim every device or location is certified; source-only evidence is identified rather than upgraded to a test pass.

Validation: 20 focused capability/discovery/character component tests passed; source check passed; actual Quick Start desktop and 390×844 touch-context search/filter/empty-state/layout checks passed with zero page exceptions. Prescribed-client capability presentation fixture passed without client errors. Desktop, phone and fixture screenshots inspected. Evidence: `output/verification/product-plan/`.

Next: P05, objective/navigation coherence. Production remains `5.4.0+1532bdfbb5c1.319d215f60318297.production`, freshly read October 2. No deployment.


## P05 — current objective and navigation coherence: implemented and checked

Current guidance is scoped to the active world, so retained pod/expedition history cannot publish space instructions on Earth or in the ocean. Current Solar System and deep-space courses outrank inactive voyage history; active transit retains priority. Surface fieldwork and returned analysis use the destination mission's actual objective and open that mission. Earth movement onboarding does not suppress space guidance. Activity-owned HUDs keep priority.

Dismissal and brief-notice timing now follow objective identity rather than changing distance text. Reviewing a finding no longer uses a button that implies it saves the finding. Completed reports retain zero scores and never invent a default 100 points. Read-only diagnostics expose the derived objective for verification. Wayfinder now reads the active Solar System travel session rather than contradicting its HUD with “No course set.” Existing Explore/Build/Together and game entry paths remain.

Validation: all **1,613 registered component tests passed**, no failed/skipped/TODO; source verification passed. Actual-source Space launch, Mars/Moon destination changes, dismissal, retained-completion fixture, action opening and Wayfinder course agreement passed with zero page exceptions. Screenshots inspected. Prescribed-client isolated objective fixture passed, screenshot/state inspected and no error artifact. Evidence: `output/verification/product-plan/`. The browser initially exposed a Wayfinder contradiction; it was repaired and the journey rerun successfully.

Limits: no new mission, save authority, landing eligibility or physical-phone certification. P13 retains the deeper travel/landing work. P06 save/reward consistency is next. Production and preserved dist unchanged.


## P06 — local profile consistency repaired; account/reconciliation work remains

Replaced stale whole-profile preference writes with synchronous updates inside the latest profile transaction. This protects earned progression during tool, tutorial and companion updates; companion encounters merge against current storage. Memory-store stable-key validation now matches IndexedDB. See [SAVE-CONTRACT.md](SAVE-CONTRACT.md) for actual persistence boundaries and the remaining ordered gates.

Validation: **1,616 component tests passed**, zero failed/skipped/TODO. Final focused save/starter/character and source checks passed after encounter merging. Two real browser IndexedDB tabs verified duplicate claims, concurrent preference updates, reload, backup replay and idempotent legacy migration with a retained backup (20 records, zero page exceptions). Prescribed-client storage fixture passed and screenshots inspected. Actual-source Space regression rerun passed. These are controlled local records, not authenticated account or cross-device certification.

P06 remains open: durable account-scoped retries, paginated hydration, receipt association and cross-store recovery require implementation/verification. P07–P20 have not been started. No production deployment, backend change or player-data migration.


## October 2 continuation — P06 receipt recovery and Live Earth camera scope

Implemented atomic account-owned pending receipts for new collected discoveries, durable reload/reconnect retries, bounded backoff, disposal cleanup, expected-owner checks and local receipt identity validation. Added stable paginated account restoration beyond 250 items with repeated-cursor/account-change safeguards. Existing saves upgrade to IndexedDB schema 4; blocked old connections produce a reload instruction. Details and release compatibility requirements are in [SAVE-CONTRACT.md](SAVE-CONTRACT.md).

Validation: **1,628 registered component tests passed**; source checks passed. Real browser IndexedDB verified 501-item restoration/retry/reload; pending queue reload, account switching and recovery; schema 3→4 preservation and blocked upgrade handling. Prior two-tab save/backup checks passed. Prescribed-client receipt/outbox fixtures, actual-source desktop/phone capability UI and Space navigation passed; screenshots inspected, zero page exceptions in scripted browser journeys. Service/account replies were controlled; live authenticated acceptance remains pending.

Added [LIVE-EARTH-CAMERAS.md](LIVE-EARTH-CAMERAS.md) to the delivery plan after directly inspecting WorldCam and its coverage/source catalogue. Defines a distinct public imagery layer, map/camera/explore journey, live versus still freshness, multi-view limits, provider rights/coverage/health and C01–C05 acceptance. Windy and Fintraffic primary documentation informs candidate integrations. Quick Start correctly lists the feature as Planned; there is no public-camera viewer or imagery coverage claim yet. Capability inventory now contains 99 entries.

P06 remains open for live account acceptance, cross-store recovery and save-state presentation. P07–P20 implementation has not been advanced. No deployment or production/player-data changes.

Final store-sharing review: discovery now binds account ownership even when another world created the shared Journal store first. The real outbox/reload/upgrade browser check and prescribed client were rerun through that path; 21 focused receipt/save/migration tests and source verification passed afterward. Production build identity was freshly read as unchanged. Live Functions inventory/authenticated acceptance was not verified: neither gcloud nor the workspace Firebase CLI is available in this execution environment.

## October 2 extended run — P06 recovery and P07 water/transition repairs

Continued through several implementation/test cycles rather than stopping after receipt handling:

1. Fixed legacy observation/collection restoration and privilege-changing receipt replays. Authenticated actual receipt handlers passed with local Auth/Firestore emulators, two accounts, five concurrent claims → one award, and 501 restored receipts per independent local profile. Corrected stale tooling notes: Firebase and Homebrew Java 21 are available; live discovery Functions were listed ACTIVE. No deployed handler acceptance is inferred from inventory.
2. Moved companion field rewards into the Journal transaction and other companion XP/training updates onto latest-record transactions. Added truthful pending/blocked/acknowledged/session-only status. Recovered 125 Backpack items after a forced quota failure and removed only obsolete Journal projections during complete reconciliation.
3. Backup exports now use one transaction and include more than 10,000 records. Malformed, duplicate and future-schema backups fail before replacement. Restores retain an atomic pre-import snapshot; Undo last restore survives reload and recovers receipt ownership. Real IndexedDB verified 10,001 exported events, rejected damaged import, and restore/reload/undo.
4. Fixed CPU/GLSL wave disagreement and active-boat shader/physics profile differences. Local queries resolve mapped lakes/rivers and preserve normals; missing coverage remains unqualified. Marine evidence rejects stale location responses and clears old data immediately.
5. Expanded actual-source Ocean browser coverage through surfacing and re-diving. It exposed missing Earth-only terrain/material/conversion dependencies and a map origin still pointing at the previous city. Repaired these boundaries and verified the full geographic round trip. Screenshots inspected; source shader/physics amplitudes, scale and speed agree.

See SAVE-CONTRACT.md and WATER-AUTHORITY.md for exact scopes and unfinished acceptance. These are development fixes, not completion of P06/P07 release gates or the swimming/research-ship/art expansions. The user-requested camera feature remains in the accepted Live Earth plan. No production, account-data or preserved-dist changes.

Final acceptance for this continuation: **1,651 registered component tests passed**, zero failed/skipped/TODO, plus source validation. Actual-source Ocean browser passed ten cases including surface shader/physics agreement and geographic round trip; Space navigation regression passed. Auth/Firestore emulator receipt integration, real IndexedDB backup/reward/Backpack recovery, phone-sized receipt-status checks and prescribed save/water clients passed. Screenshots/state inspected. An older maritime unit fixture initially omitted the now-required accepted origin; it was updated to exercise a real origin without the Earth-only conversion mock, and the complete suite passed on rerun. Failed intermediate browser runs remain as diagnostic history, not acceptance artifacts.

Final extended visual review also caught offshore boat teleporting: an unloaded Earth-only polygon helper reported zero shoreline clearance, repeatedly triggering spawn correction. Canonical water-body boundary distance now handles direct Ocean entry and island holes. The ten-case browser rerun checks stationary continuity and settled camera visibility; screenshot inspected.

## Continued October 2 — P06 actual UI gate and P07 water integration

Actual Earth backup download, malformed/cancelled restore preservation, full reload after restore, and full reload after Undo passed. Phone Data and backup controls were inspected and a narrow header overlap fixed. The journey caught an undefined variable in the previous buffered shoreline edit; repaired it and added the actual mapped-vessel startup regression.

P07 now shares body wave profiles, wake contact displacement, marine origin phase and Ocean surface/depth samples. Near-water tessellation is dense at contact distance without increasing the vertex count. Qualified current/depth/immersion metadata retains unknowns. Marine requests follow active Ocean location; inactive temporary boat water cannot cover Earth; shore fishing no longer requires boat-sized bodies. See WATER-AUTHORITY.md for exact implementation and limits.

Validation: **1,660 component tests pass**, source verification passes, actual eleven-case Ocean journey and actual Earth restore/Undo journey pass, prescribed water client passes. Screenshots/state inspected. No production deployment. Continue with P08 integration; do not describe the new sample contract as an implemented swimmer.


## October 2 — P08 Earth swimming continuation

Implemented real mapped-water traversal under the existing walking owner, swim/tread rig motion, automatically fitted scuba presentation, air/ascent rules, held touch controls, recovery, bounded local surface resume, mode/environment cleanup and underwater render presentation. The actual mapped-water walkthrough identified the prior 0.6 m bed limitation; broad bodies now use graded simulated gameplay relief while depth evidence remains independent. Terrain refinement and companion behavior respect swimming ownership. Quick Start now honestly describes Swimming as Limited.

Evidence: 1,674 registered component tests pass, source checks pass, prescribed man/woman rig and water shader clients visually inspected, seven-case controller/reload browser, controlled full walking shore-entry/exit browser, and actual Earth mapped-water swimming/dive/mode-exit browser. See SWIMMING.md. Research ship, ladder/boat entry, standalone Ocean human travel and final marine art remain open; no phase-completion or production claim.


## October 2 — P08 standalone Ocean diver

Added existing-avatar swim control alongside the parked submarine, safe exit-depth/clearance admission, boarding range, explicit recovery and scene cleanup. Navigation/location/actor authority follows the explorer; the map retains the submarine marker. Surface transfer cannot abandon the diver. Browser/visual checks caught and fixed retained button focus, phone map/notice overlap and near-hull camera squeezing; Ocean pause now preserves motion and air.

Validation: 1,678 registered component tests pass, source checks pass, eight actual Ocean diver cases and eleven existing Ocean entry/surface/re-dive cases pass. Prescribed client screenshots and state inspected. Standalone Ocean dives remain session-only and final suit/fins, surface-boat ladders and device/geographic acceptance remain unfinished. No production changes; P08 is not marked complete.


## October 2 — P08 closed, P09 next

Completed the remaining ladder swim/return, same-vessel identity and position, obstruction/depth admission, hull/camera collision, recovery/resupply and rig-following outfit/fins. Actual Earth and component checks pass; corrected the old hull float offset exposed by the ladder camera. 1,684 full component tests and source checks pass; eleven Ocean transition cases and prescribed visual clients inspected. See SWIMMING.md closeout for the bounded definition and evidence. Device/geographic release coverage is P20; no expansion of P08 scope into research deck (P09), persistent sub/cargo (P10) or biome art (P11).

## P09 research deck closeout

The bounded P09 journey is implemented and verified; see RESEARCH-DECK.md for scope, evidence and distinct P10/P11/P20 responsibilities. No deployment.

## P10 local deployment/recovery closeout

Stable ship/sub IDs, geographic parent anchors, local continuation, cradle launch, visible/marked parent vessel, hull clearance, explicit recovery, surface/underwater reload and failed-transfer safeguards are implemented. 1,696 registered tests, eight focused contracts, eighteen actual-app Ocean journey cases and six deck browser cases pass. See MARINE-VOYAGE.md. Regional art P11 and shared ownership P18 are not included; production is unchanged.

## P11 — first regional marine content pack

Completed locally after P10. See MARINE-HABITAT.md for implementation ownership and bounded completion: real CC0 specimen geometry, regional placement, map landmarks, collision, source distinctions, fish correction, optional sound, loading/disposal and browser budgets. 1,702 contracts and existing eighteen-case marine regression pass. No deployment.


## P12 development closeout — October 3

The first Coral Shelf outing is complete: normal location-entry gate, wet-lab briefing, three stationary scans, partial recovery/reload, saved report and Scanner II used on a subsequent dive. Progress derives from stable existing Journal events, with no new currency or independent upgrade authority. All 1,708 registered tests, eight actual-app research cases, eighteen existing marine cases and source checks pass; desktop/phone and prescribed-client images are inspected. See MARINE-RESEARCH.md for scope and evidence. P13 space navigation consistency is next. No production deployment.


## P13 development closeout — October 3

HUD and landing actions now share selected-target resolution, physical eligibility and explicit compressed-distance presentation. Unknown/mismatched physical targets fail closed; unsupported universe targets cannot land on another world. Local proximity remains independent of course selection. 1,713 registered tests and actual course/manual-takeover/Wayfinder/phone/disposal and six boundary browser checks pass. See SPACE-NAVIGATION.md. P14 field mission/progression is next; planetary art remains P15. Production unchanged.


## P14 development closeout — October 3

The existing Proxima b field mission now closes through partial recovery/redeployment, three saved instrument procedures, actual ship-lab analysis, a readable completed report and Field Link II used at 24 m on the next fictional world. Failed saves remain retryable; duplicate submission cannot duplicate the completion reward. All 1,719 registered tests and source checks pass. The assembled-app browser verifies the journey, an injected field-save failure, desktop/phone report, next-world use and real reload. Prescribed-client state and images are inspected. See PLANETARY-RESEARCH.md for fixture and local-save boundaries. P15 planetary visuals is next. Production unchanged.


## P15 development closeout — October 3

Three-site planetary presentation is complete for Moon, Mars and Copper Dawn: local geology, terrain-map raster, readable owned lighting, spacesuit/rover selection, collision and phone return control. Existing measured terrain and real/modeled/fictional labels remain authoritative. All 1,729 registered tests, source checks, actual three-site browser collision/exit checks and inspected prescribed-client visuals pass. See PLANETARY-ART.md for scope, short rendering samples and limitations. P16 Earth district/cameras is next; production unchanged.


## P16 camera C01–C03 closeout — October 3

Regional public camera stills are implemented and verified: Fintraffic Finland catalogue (809 admitted sites at test time), clustered map/search/pages, real timestamped images, view/camera switching, source attribution, failure/retry, phone layout and Explore here coordinate handoff. Closing/hiding cancels work. All 1,736 registered tests, source checks, actual-provider browser and inspected prescribed-client evidence pass. See LIVE-EARTH-CAMERAS.md for boundaries: no global/live-video parity, no remote visit reward, no Finland world-load claim. P16 Earth district remains active; C04 breadth/multi-view and C05 release remain open. Production unchanged.


## P16 waterfront slice — October 3

Fresh Baltimore inspection led to context-qualified generated vessels, corrected berthed waterlines, an original bounded rig on the reviewed Constellation hull, and a three-stop promenade walk in the existing Activities system. The actual browser walks both legs with keyboard controls and records one local completion; the route camera line and unreachable phone details/result were found and fixed. Full 1,741 registered tests and source checks pass; full-world desktop/phone and prescribed rig-client images/state are inspected. See EARTH-DISTRICT.md. This completes the waterfront slice, not all P16: street/promenade art, night readability and interior/transport acceptance remain. P17–P20 and camera C04/C05 remain open. Production unchanged.
