# Explorer career delivery ledger

Baseline `eb18b9c7`, October 9, 2026. Production remains released 5.5.0.

| Step | State | Evidence |
| --- | --- | --- |
| 0 — design and authority review | Specified | Direct source review; full mission, reward, GPS, property and release specification in `EXPLORER-CAREER-PLAN.md` |
| 1 — First Bearings | Implemented and verified locally | Explicit start, actual field procedure, exact Journal review, one badge/receipt, history recovery and reload; evidence below |
| 2 — Pilot / Explorer / Maker | In progress | Harbor Run and Three Views are implemented locally; acceptance below. Useful arrangement, starter-home integration and additional cosmetic/mastery rewards remain open. |
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


## October 10 — Three Views and save recovery, local

H03 now offers actual in-game photography or an explicitly labeled observation
record. Players choose a visible mapped subject, move between street, detail and
setting views, review each result and finish one durable record/badge. The camera
copies the normal renderer/composer output after drawing; it does not enable a
persistent drawing buffer or render another scene. Foreground geometry blocks
selection. The view rules require distinct positions and framing, and Live GPS,
interiors and other travel modes cannot satisfy this outdoor job.

Three JPEGs are bounded at 384 KiB each and held in a separate profile-owned
document in the existing IndexedDB v5 store. Ordinary profile saves do not copy
image data. Metadata, image changes and the completion receipt commit together.
Export includes the media; malformed or missing referenced media fails before
replacement. The album has a standalone HTML export, deletion controls and a
personal home display with three bounded 512 × 384 textures. The display is
removed immediately on deletion and disposed on interior/floor changes. The
observation variant has a text record and never generates pretend photographs.

Additional recovery repairs preserve newer campaign progress during character
migration rollback, reject stale campaign writers, refresh different images from
same-revision backup branches, and report failed return-home selection without
changing the previous home. Local housing/Backpack item transfers still use
separate writes; that is an open prerequisite for H05 storage acceptance.

Executed evidence:

- Full `verify:pr`: **2,243 tests passed**, then source identity/dependency,
  ownership, boundary types, inventory and sensitivity checks. An initial source
  failure detected an unversioned world-click import; it now uses the existing
  v3 module identity.
- **24 actual IndexedDB cases** pass, including image quota failures, completion
  races, v5 client access, media export/delete/import/rollback, and atomic
  character-only rollback retaining the newer careers and album.
- **15 controlled city checks** pass with no captured page errors or failed local
  resources. The normal renderer produced three distinct city photographs; DOM
  controls kept/completed/exported/restored them and reload retained the album.
  Foreground occlusion was enabled in the final city run. Camera/actor poses are
  explicit test setup, not an uncoached walk between viewpoints.
- **12 camera/home component checks** pass, covering failed-save recovery,
  actual frame capture, occlusion, bounded home textures, immediate deletion,
  same-revision restore, observation mode, future state and complete disposal.
  The prescribed action client chooses and captures a real frame. Its screenshot
  adapter uses the browser's composed image because the generic client's delayed
  canvas read returned a cleared WebGL buffer. The final headed client image and
  city desktop/phone images were inspected.

Home display placement/cleanup is verified in a controlled scene. It is not yet
an acceptance run through starter-home claim, actual furnished-room placement and
return travel. H04/H05 and the later campaign remain open. The final reticle,
backup-cache and recovery refinements have component/source evidence following
the city run. No release matrix, physical-phone test or retention claim is added.
Production, dist and the four saved packages are unchanged. Private receipts are
under ignored `output/career-continuation-20261010/` (final city: `world-occlusion`,
final camera: `camera-complete`, storage: `journal-final`).

The final album render cache avoids decoding/rebuilding unchanged images on normal
Journal refreshes; the reticle changes its DOM visibility only when necessary.
The twelve-case component/action check passes again after that refinement.

Continue later puts the camera away without abandoning the job. Equal-revision
backup restore replaces the home display as well as the Journal thumbnails; both
behaviors are exercised in the final twelve-case component check.

## October 10 — research entry and possession custody, local

The expanded plan is [Research careers and CERN](RESEARCH-CAREERS-AND-CERN.md).
It includes mining, hydrology, meteorology, palaeontology, astronomy, accelerator
science and the other field careers. Each specifies methods, actual equipment,
locations, progression and useful outcomes. Mining and a traversable CERN
facility remain **unimplemented**; the design and reuse audit do not close them.

First Bearings now offers eligible research introductions through the existing
Today panel. The chosen method is saved with the chapter and receipt. Begin
chapter selects an actual matching lead and equips its existing tool. Wrong-method
records do not complete it; free-roam methods remain available. Observation
researchers can continue surveying without a mandatory collection step. The
obsolete center-screen exploration announcement no longer covers the choices.

Personal home storage now commits the Backpack and home contents in one v3
localStorage record. Failed writes leave both containers unchanged, and a Journal
refresh subtracts quantities already held at home. An empty carried save does not
regrant legacy stored equipment. Equipped tools remain carried; new storage admits
supplies and specimens, while existing stored gear remains withdrawable. One
browser tab owns possession writes using Web Locks. Another tab explains the
read-only state and requires closing the owner and reloading to resume writes.

Migration retains v1/v2 inventory and legacy housing bytes, preserves the latest
v2 ammunition/hotbar supplement, and keeps new controls in their own versioned
key. Corrupt/future saves and unsafe inventory-only rollback cannot overwrite
housing. **Existing released v2 fallback builds do not share new v3 progress.**
They keep their older branch of data; a new release needs a compatible v3 fallback
and an actual candidate/fallback roundtrip before promotion. Home/wallet purchase
and sale atomicity, connected storage, and the complete H05 home journey remain
open. This repair is not approval of the entire property system.

Executed browser evidence:

- Four real localStorage/Web Locks checks pass: quota failure/retry, one durable
  transfer commit, a blocked second tab, and recovery after owner close/reload or
  interruption between commit and presentation. The storage fixture injects an
  economy and does not certify purchase authority or home art.
- The 50,008-item Backpack component passes. Closed renders build no hidden item
  DOM; the visible list stays at 48 rows, control writes stay small, ammunition
  survives reload, focus is released correctly, and the phone layout fits.
- The final research world journey passes **16 checks**, with no captured page
  errors or failed local resources: chosen lead/tool, actual habitat record,
  Journal review beyond the recent-history page, one badge, actual three-view
  photos/export/restore, existing Build/room/property controls, reload restoration
  and Flower Sprint receipt. Positioning/history insertion are explicit test
  setup. This is not a full manually walked route or physical-phone acceptance.
- An earlier full journey timed out on return loading. The isolated launch/return
  probe and the later full journey passed. The timeout remains retained and
  unexplained; it must be considered in the release loading/performance gate.
- Collision Lab's original source passes ten numerical/data/integrity reuse
  checks. A separate disposable browser opens its tunnel, apparatus and detector
  hall without page/geometry errors and checks a phone-width layout. All 18 model
  hashes match. Neither test certifies a realistic connected CERN destination.

The detailed receipts and inspected images are under ignored
`output/production-readiness-20261010/`. No production hosting, cloud configuration,
player data, Collision Lab source/notebooks, dist or retained release package was
changed. The full roadmap, asset integration, manual route and release gates
remain open rather than being inferred from these bounded passes.

Final source chain after the read-only inventory guard: **2,260 tests passed**,
zero failed; dependencies, syntax/module imports, ownership, boundary types, test
inventory and sensitivity also pass. The final guard has an explicit denied-write
state-preservation test. The prescribed Develop Web Game keyboard run reached the
walking world and retained 49,023 buildings/18,952 roads, but stopped after its
first captured burst on external Overpass CORS errors. Its composed image was
inspected; this is not a clean provider or physical-movement acceptance.
