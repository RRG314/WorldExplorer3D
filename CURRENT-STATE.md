# Current development and release state

Updated October 3, 2026.

## Production

Freshly read from https://worldexplorer3d.io/build-manifest.json:
`5.4.0+1532bdfbb5c1.319d215f60318297.production`.
The preserved `dist` and production release are not being replaced by current plan work. No backend changes have been deployed; pending receipt-handler source changes require a coordinated release. Older 711fe93 status and unpromoted ship notes in this file's Git history are superseded by the deployed identity above.

## Latest phase status

P08–P15 are development-complete within their documented boundaries. Marine swimming/deck/voyage/regional habitat/research and space navigation/planetary mission progression are implemented and verified. P14 adds partial survey recovery, save-safe lab completion, a persistent useful equipment improvement and a readable report. P15 now improves Moon/Mars/Copper Dawn presentation, equipment and obstacle ownership. All 1,729 registered tests, source checks and the actual mission and three-site art/collision browser journeys pass; desktop/phone and prescribed-client images are inspected. P16 is active: public camera C01–C03 regional still imagery and the first waterfront route/vessel/phone slice are implemented and tested (1,741 tests). Broader district art, night readability and interior/transport acceptance remain; see EARTH-DISTRICT.md. Production is unchanged. Older chronological entries below are historical, not current phase status.

## Active work

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`. Do not edit the older Documents checkout. The owner authorized implementing the product plan sequentially, verifying each item before the next.

P01–P03 are committed locally: `1191407a`, `e8348dce`, `0cb6e8fe`. They repair ocean entry, missing depth/coverage and seabed navigation. Their completed checks include 1,600 component tests, seven controlled-provider browser cases and inspected visuals; these are not a new release certificate.

P04 adds a source-backed capability inventory and searchable Quick Start guide. Its focused component, source and desktop/phone UI checks pass. P05 now aligns current-world objectives, mission actions, Solar System courses and Wayfinder, with stable dismissals. All 1,613 registered component tests and focused source/browser checks pass. P06 local preference writes now preserve concurrent rewards; all 1,616 component tests pass and two-tab IndexedDB reload/backup/migration checks pass. P06 now includes atomic UID-owned receipt queues, bounded retries, paginated restoration and receipt identity checks. All 1,628 component tests and controlled browser save/queue/501-receipt reload checks pass. The extended continuation adds atomic companion field credit, Backpack quota recovery/reconciliation, actual receipt-status wording, strict backup validation, full consistent exports and undoable restores. Real Auth/Firestore emulator integration passed with two accounts and 501 receipts per independent local profile; staged/deployed and full in-game restore walkthrough acceptance remain. The older “CLI unavailable” note was stale: Firebase is installed and Homebrew Java 21 runs the cached emulators. See SAVE-CONTRACT.md.

Latest acceptance: **1,684 registered component tests pass**, with source checks, authenticated emulator receipt integration, real IndexedDB recovery/status tests, prescribed shader/save clients and the actual eleven-case Ocean/surface/dive journey and actual Earth backup/restore/Undo UI walkthrough. These are development checks; production is unchanged.

P07 has now started with tested repairs: CPU/GLSL wave equation agreement, one active-boat wave profile, local water-body resolution/normals, stale marine response suppression, direct Ocean-to-boat dependency fixes, and a validated geographic origin retained through the return dive. Actual-source browser testing found and verified these transition fixes. The continuation unifies body-owned profiles, wake contact, wave phase, the standalone Ocean surface/depth boundary and qualified volume/current samples, with denser near-contact geometry. It also repairs a buffered-footprint startup regression found in the actual Earth walkthrough. P08/P09 character/deck integration and release acceptance remain explicit in WATER-AUTHORITY.md. Public live/still Earth camera coverage inspired by WorldCam is added to LIVE-EARTH-CAMERAS.md and marked Planned in Quick Start; no camera viewer is implemented yet. P08 now includes a tested Earth swimming controller, automatic scuba, rig animation, touch controls, recovery and local surface resume. See SWIMMING.md for its boundaries. Research-ship, asset and full expedition expansions remain unfinished.

P08 continuation: controlled full walking physics crosses a graded bank through wading/swimming and back to land; the actual Earth browser swims/dives at a loaded Baltimore water body. Mapped broad-water gameplay beds now support immersion without claiming geographic bathymetry. Render-scoped underwater presentation restores weather after drawing, terrain rebuilds cannot pull a swimmer onto the bed, and companions remain safe during swimming. The full 1,674-test suite, source checks and documented browser journeys pass. Surface-ship/ladder entry, fitted wetsuit/fins and physical-device acceptance remain; P08 is not marked complete. No new production deployment.

P08 Ocean continuation: the player can leave a stopped submarine at a supported dive depth, swim with automatic scuba, return within boarding range or Recover aboard. The same sub stays parked, navigation follows the explorer, hull camera clearance avoids both hull and avatar clipping, and pausing preserves air. Eight actual-source diver cases, eleven prior Ocean transition cases, inspected prescribed-client visuals and 1,678 component tests pass. Phone controls no longer overlap the map or boat notices. Ocean dives are session-only; persistent deployment/cargo remains P10. No deployment.

See [implementation evidence](docs/product-audit/2026-10-01/IMPLEMENTATION.md), [delivery plan](docs/product-audit/2026-10-01/DELIVERY-PLAN.md), and [capability ownership](docs/product-audit/2026-10-01/CAPABILITIES.md). Audit documents retain their original baseline and are not current release receipts.

## Working rules

Keep ordinary Chrome open. Run heavy checks sequentially, own/close test browsers and servers, preserve player data and the four saved candidates, and never print credentials. Source/component checks, controlled provider fixtures, real browser journeys, authenticated service checks, physical-device acceptance and production evidence are distinct. Follow AGENTS.md and its September 30 correction using observed resources.


## P08 closed for development

October 2 continuation finishes stopped surface-vessel ladder entry/boarding/recovery, reversible suit/fins on both explorer rigs and vessel air resupply. The actual-world ladder test also fixed the obsolete positive hull-clearance offset: vessel-sized water-plane fitting now keeps the authored waterline at the water surface. Full 1,684-test suite, source checks, actual Baltimore ladder/swim journey, eleven Ocean transition cases and inspected rig clients pass. See SWIMMING.md closeout. P08 is development-complete within mapped-water eligibility; physical-device and broader geographic release acceptance stay in P20. P09 research deck/stations is the next active implementation phase. Vessel/sub persistence remains P10; marine art/content remains P11. No production change.

## P09 development closeout

Research deck/bridge collision, moving-ship character attachment, helm/mooring, chart, persistent Journal lab review and mapped-water ladder swim are implemented. Six controlled deck browser cases and thirteen actual-app Ocean journey cases pass, including the real map open/close. See docs/product-audit/2026-10-01/RESEARCH-DECK.md. P10 owns persistent parent ship/sub deployment and recovery; P11 owns regional art. Production is unchanged.

## P10 development closeout

The local ship/sub journey now retains vessel IDs, condition, parent anchor, wave phase and continuation state. The research deck has a submarine cradle and deployment station; the parent remains visible/marked underwater. Explicit recovery, underwater reload, aboard reload and redeployment preserve the same ship/sub. Eight focused contracts, eighteen actual-app Ocean cases and six deck browser cases pass, with inspected desktop/phone screenshots and the prescribed game client. All **1,696 registered tests pass**. See docs/product-audit/2026-10-01/MARINE-VOYAGE.md for local-only scope and failure rules. P11 regional ocean content/art is next; shared expeditions remain P18. Production unchanged.

## P11 development closeout

The first authored Coral Shelf pack replaces generic coral primitives with six bounded Smithsonian CC0 near/far assets, deterministic regional placement, seagrass, named map landmarks, corrected fish shapes, region-qualified fish selection and session-owned optional sound. Habitat collision, failed assets and disposal are verified. All 1,702 registered tests, seven habitat browser cases and eighteen existing Ocean/ship cases pass; source checks and prescribed-client screenshots are inspected. See MARINE-HABITAT.md for measured budgets and provenance. P12 first research outing/earned upgrade is next; P11 does not remain open for worldwide art expansion. Production unchanged.


## P14 development closeout — October 3

The existing Proxima b field mission now closes through partial recovery/redeployment, three saved instrument procedures, actual ship-lab analysis, a readable completed report and Field Link II used at 24 m on the next fictional world. Failed saves remain retryable; duplicate submission cannot duplicate the completion reward. All 1,719 registered tests and source checks pass. The assembled-app browser verifies the journey, an injected field-save failure, desktop/phone report, next-world use and real reload. Prescribed-client state and images are inspected. See PLANETARY-RESEARCH.md for fixture and local-save boundaries. P15 planetary visuals is next. Production unchanged.


## P15 development closeout — October 3

Three-site planetary presentation is complete for Moon, Mars and Copper Dawn: local geology, terrain-map raster, readable owned lighting, spacesuit/rover selection, collision and phone return control. Existing measured terrain and real/modeled/fictional labels remain authoritative. All 1,729 registered tests, source checks, actual three-site browser collision/exit checks and inspected prescribed-client visuals pass. See PLANETARY-ART.md for scope, short rendering samples and limitations. P16 Earth district/cameras is next; production unchanged.


## P16 camera C01–C03 closeout — October 3

Regional public camera stills are implemented and verified: Fintraffic Finland catalogue (809 admitted sites at test time), clustered map/search/pages, real timestamped images, view/camera switching, source attribution, failure/retry, phone layout and Explore here coordinate handoff. Closing/hiding cancels work. All 1,736 registered tests, source checks, actual-provider browser and inspected prescribed-client evidence pass. See LIVE-EARTH-CAMERAS.md for boundaries: no global/live-video parity, no remote visit reward, no Finland world-load claim. P16 Earth district remains active; C04 breadth/multi-view and C05 release remain open. Production unchanged.


## P16 waterfront slice — October 3

Fresh Baltimore inspection led to context-qualified generated vessels, corrected berthed waterlines, an original bounded rig on the reviewed Constellation hull, and a three-stop promenade walk in the existing Activities system. The actual browser walks both legs with keyboard controls and records one local completion; the route camera line and unreachable phone details/result were found and fixed. Full 1,741 registered tests and source checks pass; full-world desktop/phone and prescribed rig-client images/state are inspected. See EARTH-DISTRICT.md. This completes the waterfront slice, not all P16: street/promenade art, night readability and interior/transport acceptance remain. P17–P20 and camera C04/C05 remain open. Production unchanged.
