# Current development and release state

Updated October 2, 2026.

## Production

Freshly read from https://worldexplorer3d.io/build-manifest.json:
`5.4.0+1532bdfbb5c1.319d215f60318297.production`.
The preserved `dist` and production release are not being replaced by current plan work. No backend changes have been deployed; pending receipt-handler source changes require a coordinated release. Older 711fe93 status and unpromoted ship notes in this file's Git history are superseded by the deployed identity above.

## Active work

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`. Do not edit the older Documents checkout. The owner authorized implementing the product plan sequentially, verifying each item before the next.

P01–P03 are committed locally: `1191407a`, `e8348dce`, `0cb6e8fe`. They repair ocean entry, missing depth/coverage and seabed navigation. Their completed checks include 1,600 component tests, seven controlled-provider browser cases and inspected visuals; these are not a new release certificate.

P04 adds a source-backed capability inventory and searchable Quick Start guide. Its focused component, source and desktop/phone UI checks pass. P05 now aligns current-world objectives, mission actions, Solar System courses and Wayfinder, with stable dismissals. All 1,613 registered component tests and focused source/browser checks pass. P06 local preference writes now preserve concurrent rewards; all 1,616 component tests pass and two-tab IndexedDB reload/backup/migration checks pass. P06 now includes atomic UID-owned receipt queues, bounded retries, paginated restoration and receipt identity checks. All 1,628 component tests and controlled browser save/queue/501-receipt reload checks pass. The extended continuation adds atomic companion field credit, Backpack quota recovery/reconciliation, actual receipt-status wording, strict backup validation, full consistent exports and undoable restores. Real Auth/Firestore emulator integration passed with two accounts and 501 receipts per independent local profile; staged/deployed and full in-game restore walkthrough acceptance remain. The older “CLI unavailable” note was stale: Firebase is installed and Homebrew Java 21 runs the cached emulators. See SAVE-CONTRACT.md.

Latest acceptance: **1,678 registered component tests pass**, with source checks, authenticated emulator receipt integration, real IndexedDB recovery/status tests, prescribed shader/save clients and the actual eleven-case Ocean/surface/dive journey and actual Earth backup/restore/Undo UI walkthrough. These are development checks; production is unchanged.

P07 has now started with tested repairs: CPU/GLSL wave equation agreement, one active-boat wave profile, local water-body resolution/normals, stale marine response suppression, direct Ocean-to-boat dependency fixes, and a validated geographic origin retained through the return dive. Actual-source browser testing found and verified these transition fixes. The continuation unifies body-owned profiles, wake contact, wave phase, the standalone Ocean surface/depth boundary and qualified volume/current samples, with denser near-contact geometry. It also repairs a buffered-footprint startup regression found in the actual Earth walkthrough. P08/P09 character/deck integration and release acceptance remain explicit in WATER-AUTHORITY.md. Public live/still Earth camera coverage inspired by WorldCam is added to LIVE-EARTH-CAMERAS.md and marked Planned in Quick Start; no camera viewer is implemented yet. P08 now includes a tested Earth swimming controller, automatic scuba, rig animation, touch controls, recovery and local surface resume. See SWIMMING.md for its boundaries. Research-ship, asset and full expedition expansions remain unfinished.

P08 continuation: controlled full walking physics crosses a graded bank through wading/swimming and back to land; the actual Earth browser swims/dives at a loaded Baltimore water body. Mapped broad-water gameplay beds now support immersion without claiming geographic bathymetry. Render-scoped underwater presentation restores weather after drawing, terrain rebuilds cannot pull a swimmer onto the bed, and companions remain safe during swimming. The full 1,674-test suite, source checks and documented browser journeys pass. Surface-ship/ladder entry, fitted wetsuit/fins and physical-device acceptance remain; P08 is not marked complete. No new production deployment.

P08 Ocean continuation: the player can leave a stopped submarine at a supported dive depth, swim with automatic scuba, return within boarding range or Recover aboard. The same sub stays parked, navigation follows the explorer, hull camera clearance avoids both hull and avatar clipping, and pausing preserves air. Eight actual-source diver cases, eleven prior Ocean transition cases, inspected prescribed-client visuals and 1,678 component tests pass. Phone controls no longer overlap the map or boat notices. Ocean dives are session-only; persistent deployment/cargo remains P10. No deployment.

See [implementation evidence](docs/product-audit/2026-10-01/IMPLEMENTATION.md), [delivery plan](docs/product-audit/2026-10-01/DELIVERY-PLAN.md), and [capability ownership](docs/product-audit/2026-10-01/CAPABILITIES.md). Audit documents retain their original baseline and are not current release receipts.

## Working rules

Keep ordinary Chrome open. Run heavy checks sequentially, own/close test browsers and servers, preserve player data and the four saved candidates, and never print credentials. Source/component checks, controlled provider fixtures, real browser journeys, authenticated service checks, physical-device acceptance and production evidence are distinct. Follow AGENTS.md and its September 30 correction using observed resources.
