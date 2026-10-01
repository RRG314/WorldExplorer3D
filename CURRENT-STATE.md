# Current release state

Updated September 30, 2026.

## Production

World Explorer 3D 5.4 is deployed at https://worldexplorer3d.io.
Live build: `5.4.0+711fe93aa54e.8d08d47f2ff10556.production`.
Runtime source: `711fe93aa54e23eddea31b2e5c6437e15c0996cd`.
Tested staging: `5.4.0+711fe93aa54e.0a0efe516f4b3921.staging`.
The production promotion changed only three generated Firebase configuration
assets. The owner approved the exact current release capture before promotion.
Previous 5.3 is retained in Firebase channel `rollback-53-711fe93`; the older
rollback channel is also preserved. No backend code, rules or indexes changed
in this deployment.

## Verification and limits

All 57 candidate gates and 13 isolated backend stages passed for runtime source
711fe93. Two authenticated clients also passed the current Chicago weekly-room
journey. Driving, low flight, camera changes, dry-ground return, Earth/space/ship
transitions and cleanup were exercised. Physical-phone acceptance is unverified.

Chase-camera cadence jitter is repaired. The matched 150-second driving check
reduced the worst pause from 1,333 to 317 ms; another repaired run still recorded
967 ms. Occasional GC pauses remain. Average FPS is acceptable to the owner;
world coverage, graphics quality and performance budgets were not reduced.
See `docs/visual-quality/MOVEMENT-EVIDENCE.md` for measurements and limitations.

GitHub's PR inventory additionally identified 14 existing component tests missing
from its executable suite. They are now registered; the complete PR check passes with 1,574 component tests,
no unowned tests and the sensitivity check. This follow-up and release
status documentation do not change the deployed runtime or its artifact.

## Workspace and evidence authority

Work on branch `steven/visual-quality` in the architecture-evaluation worktree,
not the older Documents checkout. Keep ordinary Chrome open, run heavy checks
sequentially and preserve source/history, user data and saved candidates.
Never print raw credentials or cloud configuration.

Deployment records are in `output/release-deploy-20260930/`. Exact-runtime gate
receipts, approval and configuration-promotion receipt are in
`output/release-evidence/current/`; their source identity remains 711fe93 and is
not relabeled as evidence for subsequent test-registration/documentation commits.
Dated notes are historical leads, not current production authority.

## Local sandbox usability work

The owner authorized beginning the September 30 game-design repair plan.
Current unpromoted source changes improve First Journey completion, field result
and save feedback, and Build & Home navigation. Production and the saved release
artifact remain on 711fe93. See `docs/design/SANDBOX-IMPLEMENTATION.md` for scope,
current verification and remaining work; the 5.4 release receipts above do not
certify these subsequent changes.

### September 30 — sandbox walkthrough continuation (local source)

The active architecture-evaluation worktree now includes persistent Explore/Build/Together walkthroughs; matching earned-result/Journal review; clearer building controls and acknowledged room-save feedback; shared-room and nearby/property entry; and Flower Sprint completion/Journal integration. Fresh runtime checks found and fixed an undefined Flower coordinate helper, leaderboard-delayed success HUD, a phone room-close obstruction, a stale shared-Undo save indicator, and duplicate result publication.

Final source checks and 1,578 component checks passed. The expanded Earth journey, actual block placement/Undo/reload, phone-size navigation, full authenticated shared-room emulator journey (including late join/recovery/permissions), final Flower feedback check, and prescribed current-source gameplay smoke passed. Screenshots were inspected. These are mutable-source checks, not an immutable release candidate or physical-phone/uncoached acceptance. Full evidence and remaining product boundaries are in `docs/design/SANDBOX-IMPLEMENTATION.md`. GitHub/production and `dist` were not updated by this walkthrough pass. All owned verification processes and temporary emulator configuration were cleaned up.

### September 30 — ship traversal and observation repair (local source)

Repaired lift/control focus stalls, furnished-room route clearance, pod-bay and briefing-room obstruction, door collision timing/occupancy, and local ship floor/collision isolation from retained Earth geometry. The observation gallery now offers 31 live selectable feeds: six exterior directions and all 25 ship rooms, with Previous/Next and phone-size controls.

Verified keyboard traversal through all 25 rooms across three decks, actual Earth boarding with retained world geometry, all 31 feeds, door occupancy/blocking/reopening, launch cancellation, and ship exit cleanup. The prescribed gameplay action client and inspected screenshots passed. Current source checks and 1,584 contract checks passed; the final focused ship rerun passed all 10 checks. Evidence and limits: `docs/design/SHIP-TRAVERSAL-REPAIR-2026-09-30.md`. These remain local source changes; GitHub, production and the preserved `dist` release were not updated. No immutable release candidate or physical-device acceptance is claimed.
