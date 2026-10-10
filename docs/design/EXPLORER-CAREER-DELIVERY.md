# Explorer career delivery ledger

Baseline `eb18b9c7`, October 9, 2026. Production remains released 5.5.0.

| Step | State | Evidence |
| --- | --- | --- |
| 0 — design and authority review | Specified | Direct source review; full mission, reward, GPS, property and release specification in `EXPLORER-CAREER-PLAN.md` |
| 1 — First Bearings | Implemented and verified locally | Explicit start, actual field procedure, exact Journal review, one badge/receipt, history recovery and reload; evidence below |
| 2 — Pilot / Explorer / Maker | In progress | Harbor Run delivery loop implemented and verified locally; acceptance below. Photography, useful arrangement and the additional cosmetic/mastery rewards are still open. |
| 3–12 | Planned | Specific deliverables and exit checks in the plan; no gameplay completion claim |

The first delivery is local and does not deploy or replace retained builds. Later
career jobs, the vessel/fleet asset work, full campaign and final video package
remain outstanding. Test results will be recorded here after execution.

## First Bearings acceptance — October 9

- Full `npm run verify:pr`: **2,218 tests passed**, zero failed, followed by
  dependency/module ownership, boundary types, inventory and sensitivity checks.
- Fifteen focused chapter/entry cases pass. Existing tools and character rewards
  remain intact; repeated chapter completion adds no points or currency.
- Fifteen actual Chromium IndexedDB cases pass. Injected record/index failures
  roll back; two concurrent completion calls grant one receipt; backup restores
  the earned badge. These are storage checks, not a world-playthrough claim.
- Final controlled source-world journey passes **13 checks**, with zero captured
  page errors and zero failed local resources. Actual fieldwork, result review,
  badge display, reload, building undo, property entry and activity results ran
  against explicit staging environmental services. Actor placement and 105 newer
  history rows were bounded test setup, not uncoached player behavior.
- Screenshots were inspected at desktop and 390-pixel width. A first capture
  exposed a narrow Journal grid column; the corrected completion button spans
  the card and satisfies the touch/layout assertion. View your badge now expands
  and scrolls to the actual earned badge.
- Prescribed Develop Web Game keyboard client reached walking and captured its
  first burst, but exited on the existing external Overpass CORS error. This is
  degraded provider evidence, not a clean live-provider release pass.

Private receipts/screenshots are under ignored `output/campaign-review-20261009/`.
The final world receipt is `acceptance/report.json`; earlier runs remain separate.
No full production matrix, physical-phone test or uncoached new-player study was
performed for this local chapter. Source inspection and model/storage/browser
evidence must not be conflated. Production, dist and four retained release
packages are unchanged. No promotional posts, paid service or deployment occurred.

## Next bounded delivery

Step 2 implements H02–H04: Harbor Run, A Place in Three Views, and Make a Useful
Place. Each needs its actual actions, meaningful choice, durable outcome and
route/target admission checks before it appears as a playable mission. The
research vessel/fleet art, later ocean/space campaign and media dependencies
remain listed in the full plan. There are no placeholder mission buttons for them.


## October 9 continued — Harbor Run and realism foundation

The Harbor Run delivery loop is implemented locally in the existing Today and
Profile panels: choose between physically checked local routes, stop beside a
licensed field case, load it, drive the ordered road route, stop and unload,
then retain one delivery record and Harbor Driver badge. There is no countdown,
deposit or added currency/XP. Existing vehicle finishes and free travel remain
available. The full Step 2 is **not complete**: H03/H04 and H02's proposed new
cosmetic finish/optional handling challenge still need implementation and art
acceptance. No locked or placeholder buttons advertise those rewards.

Road routing, physical support, roadside clearance, building collision, model
leases and Journal storage use their existing owners. Cargo geometry has its own
bounded instance/collider lifecycle. Saved positions use Earth coordinates;
teleports require returning to the last confirmed route point. Live GPS play
pauses this virtual driving job. Writes use profile revisions, reject stale
writers and pause automatic retry after a storage failure. No change to road,
bridge, tunnel, sidewalk or terrain geometry is made by the job.

Final Harbor Run acceptance:

- The final `curb-acceptance` delivery/chapter world run passed all 16
  controlled checks, including saved completion after reload and existing field,
  building/undo, room, property and Flower Sprint behavior. It used keyboard
  driving for initial progress, followed by explicit actor-stepping to exercise
  the whole admitted route. This is not a complete manual drive or new-player test.
- Eight actual DOM/GLTF component checks pass for case/collider placement ownership,
  late refresh versus deliberate backup restore, failed-write pause, explicit
  retry, failed background reads, teleport refusal and complete
  scene/collider/model-lease release.
- Nineteen actual IndexedDB cases pass in the final rerun, including injected cargo/acceptance/reward
  failures, concurrent unload and backup restore. No reward or currency duplication.
- Earlier failed receipts remain: the new router import initially selected an
  uninitialized module; a later image showed case/pole overlap; a subsequent run
  exposed the late-profile-refresh race. These were not accepted as final evidence.
  A later stop probe exposed tapered junction width; the final run uses the
  actual physical road support and passes. Case/marker, route choice, delivery
  and earned-badge images were inspected on desktop and phone-width layouts.

- The prescribed world keyboard client reached walking and captured its first
  burst, then stopped on the external Overpass CORS failure. Its image was
  inspected; this remains degraded provider evidence, not a clean release pass.
- The final backup-restore refinement follows that world run; the eight-case
  runtime component rerun verifies the refined hydration and presentation path.
- Final gameplay retains 49,023 mapped buildings and 18,952 roads. No page errors
  or failed local resources were captured in the controlled mission journey.

`WORLD-REALISM-ARCHITECTURE.md` specifies five finite visual delivery gates based
on actual renderer/material/streaming owners and current primary-source research.
A loaded-world resource snapshot establishes a starting point without equating
texture file sizes with GPU memory or interpreting startup frames as steady-state
performance. No renderer swap, global texture increase or paid data source was added.

Production, dist, player data and the four retained packages remain unchanged.


## October 10 — common display policy, local

The renderer audit found missing sRGB output on the separate space renderer and
an ineffective modern-only AR setting in this r128 application. A shared policy
now handles the legacy and modern APIs explicitly. Earth, Ocean, globe selection,
space, AR and reconstruction previews reach that owner. Existing scene tone
mapping, exposure, physical lighting and the composer's single final output pass
are preserved. This is a rendering correctness repair, not a new asset-quality claim.

- Seven focused policy/atmosphere tests pass. Four new policy tests cover legacy
  and modern APIs, retained exposure/light settings, unsupported runtimes and
  renderer-constructor integration.
- Actual WebGL calibration passes 28 direct/auxiliary comparisons (within two
  byte values, with exact transfer-function expectations for untonemapped output)
  and 24 direct/composer comparisons (maximum difference four byte values).
- Actual space scene renders its 700 catalog stars, bundled Earth/Moon textures
  and spacecraft with sRGB output and unchanged tone mapping/exposure. Paired
  images were inspected. The first verifier incorrectly expected more than 700
  stars; its failure remains separate from the corrected, passing check.
- Day, night and storm-night player-asset fixtures pass without captured errors.
  The prescribed action client completes both fixture movement bursts without
  browser errors. Screenshots and movement state were inspected.

The full R0 scene/weather matrix and R1 materials, projection, texture residency
and art work remain open. The shared output policy does not complete those gates.
Production identity was checked October 10: released d877 build matches local
`dist`, and the explicit production project still has 80 deployed Functions.
Private evidence: `output/harbor-realism-20261009/`. No deployment occurred.

Final checkpoint source validation: `npm run verify:pr` passes **2,234 tests**,
zero failed, followed by dependency, module ownership, boundary type, inventory
and sensitivity checks. The exact final source run is `verify-pr-recovery.log`;
the post-review runtime receipt is `runtime-recovery/report.json`. These local
passes do not replace the full release matrix or physical-device acceptance.
