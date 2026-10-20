# Browser foundation implementation

October 19, 2026. Local changes following the [comparison and cleanup sequence](2026-10-19-BROWSER-FOUNDATION-REVIEW.md), starting from `3353d5f1`. Production remains 5.6.1. This is an implementation ledger, not a whole-application completion or release certificate.

## Decisions implemented

The existing actor contract now reads one engine-independent control policy. That policy distinguishes transport mode, the player's locomotion, the controller responsible for simulation, the camera, occupancy and coordinate frame. It returns immutable profiles; it does not create another mutable gameplay store. Physics dispatch, camera selection, renderer suspension, travel controls, map focus, Earth location, route guidance and activity position now share this interpretation.

A research-deck passenger is a person walking on a vessel; the vessel controller continues to own its deck simulation. A swimmer has water contact and does not wait for outdoor road preparation. A spaceship interior uses its walking controller and main renderer while preserving its separate coordinate frame. Walking inside the ship cannot contribute Earth coordinates to regional streaming. Legacy transport mode names remain available to existing save/vehicle consumers.

The position-only API avoids building damage, bounds, catalog and interaction reports on map/activity updates. Detailed diagnostic snapshots still use the full actor contract. Existing controllers, shaders, saves, the frame queue and session coordinator remain in place.

Boat and plane entry perform admission and initial visual construction before releasing the current controller. A refused vessel exit is checked before constructing the replacement. Invalid mode names leave the current mode unchanged. A denied or synchronously failed preparation leaves the original controller and input state intact. This does not assert transactional recovery from every possible exception after commitment or every later asynchronous model download; those remain separate asset-lifetime concerns.

Departure positions survive controller retirement: walking-to-drone uses the departing person's position, aircraft launch reads the active actor, and leaving a building uses its saved exterior position. Research-deck entry establishes the person's world pose immediately, before the first simulation frame.

Each moving road publication now owns a release lease over its exact geometry and regional contact entry. Retirement always releases those resources, including after a different world takes ownership. Only the current generation may change shared world collections and counts. Materials remain owned by the world pool. The lease retains the contact owner and a primitive region key, not the worker packet. A reproduced cancellation case also exposed a late-commit gap: a publication finishing after disposal was never registered for retirement. The controller now retains that publication's retire callback until adoption and releases it if cancellation or movement makes the result obsolete. This closes a cleanup gap; it does not turn the existing finite transport source into unlimited geographic streaming.

## Scope and evidence

Evidence lives under ignored `output/research/browser-foundation-implementation-2026-10-19/`.

- Focused actor, navigation, activity, diver, deck, session and renderer checks: 45 passed (`final-focused.tap`).
- Final transport ownership, detailed-road lifecycle, boat camera and boat surface checks: 32 passed (`transport-final.tap`). The ownership cases overlap the preceding run; these are not 77 distinct cases.
- Existing context-write guard passed with 221 writer files. Only the two vehicle preparation exports were added to the allowlist. No blanket permission regeneration.
- Actual licensed research-vessel model, deck/swim controllers and actor contract in a controlled-water browser scene: helm → deck → upper deck → dive platform → swim → ladder return passed. The prescribed web-game keyboard client also passed. Screenshots were inspected. This is component integration, not full-ocean or hardware performance evidence.
- Two initial activity checks failed because their fixture changed a private test variable without updating the actual walking state. The fixture now models the real state transition; the original activity assertions were preserved. The failed first run is not recorded as a pass.
- A real Baltimore source-browser run retained all 49,080 building records and 18,951 roads through five controlled positions and a return. It retired 36 detailed road regions; moving residency stayed at 9–12, below the cap of 16; the world generation stayed unchanged and physical road contact was restored. Driving → walking → drone → plane → driving passed, as did held-key ship walking and exit to flight. This is functional coverage and residency evidence, not a frame-pacing benchmark or a global coverage percentage.
- The first full-world driver waited for a nonexistent field; its timeout is retained under `world-attempt-1-harness`. The next run reached ship exit but incorrectly expected Earth rather than the actual Return to Flight action. Its overall receipt remains failed under `world`, with its passed cases retained. The separate space-return run completed Earth readiness and surface-frame assertions, then failed a second incorrect driving-only expectation: a fresh space launch returns as a walker. The loaded Earth/walker screenshot was inspected. These overall failed receipts remain failed; their observed successful behaviors are recorded separately, without another city rerun. The driver now checks valid ground control and matching camera ownership.
- Strengthened asynchronous road cancellation reproduced one retained late publication before the repair (`late-publication-before.tap`). After the fix, all 30 selected ownership, detailed-road and hot-path checks passed (`lifetime-final.tap`, overlapping earlier cases).
- Actual title → Coral Shelf research vessel → deck actor passed on the final source (`marine-start/receipt.json`), without seeding runtime actor state. Screenshot inspected; no JavaScript exceptions or local asset failures. Local preview marine/reverse/weather endpoints returned 503 in these journeys. Their absence was displayed by the app and retained in receipts; live environmental/backend services were not validated.
- The final road worker/contact/WebGL fixture completed three outward/return/release cycles, each retiring 46 regions. GPU geometry returned to the baseline of one terrain geometry and zero textures after every cycle; exact road contact returned at every visit. The moving region cap and single compile job held. Screenshot inspected. This controlled flat-terrain evidence is distinct from global-world or native timing acceptance.
- Across the selected TAP runs, 70 distinct named cases passed; overlapping runs are not added together. `verification-summary.json` lists both executed checks and reviewed observations, including failed receipts.
- An in-memory browser/worker bundling check resolved 1,074 inputs into 206 outputs, with one root context authority and no warnings. Nothing was emitted into `dist`; it is not a new tested hosting package. Context ownership and diff whitespace checks passed.
- Owned browsers, local servers and disposable staging attestation were cleaned up. One failed runner required bounded cleanup after Chrome exited; ordinary Chrome and unrelated attestation records were preserved.

No broad release sweep, production deployment or Godot client is part of this local checkpoint.

## Bounded follow-up: transport publication handoff

Starting from `d9159cc8`, this checkpoint audited the full road rebuild and its
tunnel/support refresh during cancellation and world replacement. It stopped
after reproducing and repairing the ownership gaps, checking their resource
release, and saving a local commit. This is separate from the earlier moving
region retirement repair.

The prepared road worker was assigned to the shared context before mesh/contact
staging succeeded. A staging failure could therefore leave a compiler and
coverage texture owner alive. The commit also yielded after replacing the meshes
and contacts but before recording their summary and attaching regional callbacks.
A replacement world could intervene and have its state overwritten. Finally,
the tunnel/support refresh assigned results after a worker await without checking
the source world's identity.

The road builder now owns preparation until the complete mesh/contact/summary/
controller handoff. Its failure path disposes that preparation whether the worker
promise is still pending or has already resolved. The commit has no asynchronous
boundary. Generation checks reject obsolete work before it can start preparation
or resume publication; explicit cancellation checks throw `AbortError` rather
than returning as a successful empty build. Tunnel/support publication checks
the load sequence, road source, ground release and caller generation before
writing shared facts. Late tunnel results are rejected and the worker is
terminated in its existing `finally`; synchronous message failure also clears
its deadline timer.

Evidence under ignored `output/research/transport-handoff-2026-10-19/`:

- Four original road regressions failed before repair (`before.tap`). A fifth
  reproduced obsolete structure refresh (`structure-before.tap`). Both retained.
- Six new behavioral checks exercise the actual road publisher/compiler/contact
  code with controlled scheduling and message delivery. Together with existing
  transport, surface-failure and tunnel geometry checks, 40 distinct cases passed
  (`focused.tap`). After completing cancellation propagation, the 11 affected
  lifecycle/failure cases passed again (`cancellation-final.tap`); these overlap
  the 40, not 11 additional cases.
- Actual browser worker and full road publisher: initial publication/release,
  cancellation during geometry staging, and replacement publication followed by
  a distant region all passed. Road contact used the replacement terrain height
  (8.1800003), with matching generation and one active worker. After release,
  there were zero road workers, no retained staged geometry, and GPU resources
  returned to one terrain geometry and zero textures. No page or console errors.
- The prescribed web-game client also passed its short input/observation burst.
  Both final screenshots were inspected. The fixture is deliberately controlled
  terrain; it does not claim real-location graphics or frame-pacing acceptance.
- The first passing browser receipt is retained under `browser-initial`; the
  final source receipt is `browser/receipt.json`. Context ownership, syntax and
  diff checks passed. Owned browsers and the temporary local server were closed.

**Stopping point reached.** No full-city rerun, release matrix, backend test,
hosting build, GitHub push or production deployment was performed. Tunnel
worker cancellation rejects an obsolete result at its existing response/deadline
boundary (at most the existing ten-second compilation budget); this does not add
an immediate interrupt for that worker. Coordinated geographic residency,
activation/spawn/return command ownership, visual policy and Godot remain the
separate packages below. Do not reopen this checkpoint's passing checks unless
their inputs change or new evidence identifies a regression.

## Bounded follow-up: drone activation commands

Starting from `cbad386d`, this checkpoint migrates one command group: explicit
drone activation and pose restoration for activity starts, shared links and Earth
session resume. Source inspection also found map teleportation, world/planetary
initialization and other vehicle/interior returns; those remain separate work.

The three migrated callers previously activated a mode and then wrote the drone
pose directly. Shared links and activity starts could bypass launch clearance,
and could alter the inactive drone after a refused transition. Their requested
poses now go through `activateDroneAtWorldPose` in the existing travel owner. The
command validates finite coordinates and optional orientation, returns whether
it actually committed, and shares preparation and commitment with ordinary drone
activation. It does not expose forced admission. Mode-only drone links also
honor vessel-exit admission, without inventing a target position.

Drone preparation resolves the complete pose and existing ground/roof clearance
before retiring controls. A valid higher saved altitude and requested orientation
survive; a lower altitude is raised to the existing launch minimum. Shared-link
missing-altitude and activity height defaults are retained. Ordinary aircraft
handoff preserves altitude and pitch, and an interior departure prepares from
the saved exterior while retaining the interior owner's cleanup. The existing
environment session rejects a world replacement during preparation. Earth resume
retains its own asynchronous cancellation checks. No new store, scheduler or
generic actor position setter was introduced. The three obsolete `drone` write
permissions were removed; only the command export was registered.

Evidence under ignored `output/research/drone-command-ownership-2026-10-19/`:

- `before.tap`: four existing shared-link/activity behavior regressions failed
  against the baseline. Six additional failures assert the then-missing command
  contract; these are not six separately reproduced existing defects.
- Fifteen command checks and eleven affected existing actor, vehicle-admission,
  activity and session checks passed (`focused-final.tap`, 26 distinct cases).
  They cover malformed requests, failed preparation, replacement during staging,
  dedicated environments, blocked vessel exits, interior/aircraft departure,
  actual caller paths, movement and superseded Earth resume.
- The first after-run compared Three.js Euler callback internals rather than
  camera values. The assertion was corrected to compare rotation values; its
  failed receipt remains `first-after.tap`.
- The controlled browser uses the actual travel command, walking retirement,
  world-spawn helpers, share UI, activity runtime, Earth resume, drone physics,
  engine input and HUD camera. All five cases passed (`browser/receipt.json`):
  shared roof clearance, prescribed keyboard movement with matching camera,
  activity start, saved flight restored without reloading the world, and refused
  vessel exit without drone mutation. Screenshots were opened and inspected;
  there were no page or console errors on the passing run.
- `browser-attempt-1` and `browser-attempt-2` retain failed fixture setup:
  missing click/boat-pose defaults, then the HUD marker collection. The first
  four functional cases passed in both attempts, but neither overall receipt
  is accepted as passing. The final fixture supplies the missing defaults.
- Context ownership, touched-module syntax and diff checks passed. Source and
  test hashes are recorded in `verification-summary.json`. Owned browsers and
  the temporary server were closed; ordinary Chrome was preserved.

**Stopping point reached.** This migration is complete locally, with controlled component
integration, not a full-city performance measurement, ordinary full-world
gameplay acceptance or live-service/release verification. No push, deployment,
hosting build or Godot work is included. Exceptions after controller commitment
still have the existing transition semantics; this does not claim general
transactional recovery. The next separate command checkpoint is shared-link
ground, boat and plane restoration through their existing owners.

## October 20 bounded follow-up: shared-link surface restoration

Starting from `946f20de`, this checkpoint removes the remaining actor writes
from shared-link restoration: walking, driving, vessel and aircraft requests.
The share UI now submits commands and consumes an applied/refused result. It no
longer writes walkers, cars, vessels or meshes, calls the low-level vessel start,
or forces an exit. Its four remaining actor/mesh write permissions were removed.
The previous drone command remains in use.

`restoreSurfaceTravelPose` belongs to the existing travel owner and accepts only
the supported surface controllers. Ground requests stage through the existing
safe-spawn resolver, retaining doorway restoration clearance, road identity,
bridge height and the resolver's accepted heading. The existing spawn owner
publishes actors, meshes and contact after controller retirement in the same
synchronous transition. Mode-only/partial-coordinate links retain the current
arrival, heading-only requests go through the owner, and camera-only links do not
restart a vehicle. A refused travel request does not apply the requested camera
mode. Unsupported or dedicated-world requests cannot write parked Earth actors.

Aircraft still prepare their own visual/admission before releasing controls.
Vessel starts use the existing candidate, hull/depth, obstacle and preparation
authorities; active-vessel relocation uses `enterBoatAtWorldPoint`. A shared Y
cannot override the vessel's water contact. Geographic vessel restoration cannot
move a deck passenger or swimmer. Existing session captures now reject world
replacement during vehicle/ground preparation and active-vessel clearance.

Mapped-interior outdoor placement uses the interior cleanup owner. A mode-only
walking link preserves the occupied interior. Authored/contained interiors have
isolated collision queries, so geographic placement is refused until their normal
exit rather than validating an outdoor position against indoor-only obstacles.
This is an explicit admission boundary, not a new generic position setter or
temporary mutation of collision context. No new store or scheduler was added.

Evidence: ignored `output/research/shared-travel-command-2026-10-20/`.

- `before.tap` retains baseline failures including bypassed vessel exit,
  premature boat writes, unchecked boat altitude, retained interior ownership,
  obsolete ground/aircraft publication, preparation exceptions and dedicated-world
  actor writes. Its then-missing command assertion is not an additional existing
  defect. The initial shallow-water fixture also lacked a qualified source ID;
  the subsequent failure in `first-after.tap` was corrected by supplying test
  evidence with a source, preserving the app's unknown-depth policy.
- `contained-interior-before.tap` separately reproduces the authored-interior
  admission gap identified during final source review.
- Forty-seven distinct focused checks passed: 43 in `focused-complete.tap` plus
  four affected existing vehicle-admission cases in `admission-complete.tap`.
  Earlier overlapping runs are retained but not added to this total.
- Seven browser cases passed on final source (`browser/receipt.json`), using
  the actual complete walking controller, safe-spawn helpers, shared UI,
  travel, aircraft and vessel owners, engine input and HUD camera. A bridge
  walker kept height 23.7 through prescribed keyboard movement; the car kept
  height 23.2 and the bridge identity. Aircraft restored at `(40,80,-120)` and
  remained under its flight owner. Vessel start/relocation sampled water rather
  than shared altitude, accepted real throttle input, and refused an offshore
  walking request without changing the vessel, parked actor or camera mode.
- All four final screenshots were opened and inspected; no page or console
  errors. Earlier passing browser snapshots are retained in `browser-initial`
  and `browser-before-contained-guard`. Owned browser cleanup completed, the
  temporary server closed, and ordinary Chrome was not targeted.
- Touched-module syntax, context ownership and diff checks passed. Source,
  verification and evidence identities are recorded in `verification-summary.json`.

**Stopping point reached.** This is controlled component integration, not a
full-city performance result, ordinary full-world gameplay acceptance, backend
or live-service verification. No hosting build, release sweep, push, deployment
or Godot work was performed. Existing safe-spawn fallback rules and exceptions
after controller commitment retain their existing semantics; this does not claim
general transactional rollback. The next separate command checkpoint is the
remaining walking/driving/vessel activity starts.

## October 20 follow-up: activity start commands

The owner has authorized continuing across local checkpoints without stopping
for confirmation. Release, residency, visual and Godot work remain outside this
command-ownership package.

Starting from `5df435ed`, walking, driving and vessel activity starts now submit
`activateSurfaceActivity` to the existing travel owner. The activity runtime no
longer writes ground actors or forces transport admission; its remaining actor
write permissions were removed. Refusal cannot publish activity progress or a
route. Nearby-start guidance remains unchanged.

Fresh ground entry stages through the existing safe-spawn resolver, retains the
accepted bridge/road contact and heading, checks distance from the authored
anchor, and requires verified support for elevated walking. Activities opt into
strict candidate admission: the resolver's emergency fallback cannot represent
a successfully admitted start. Save and arrival fallback behavior is unchanged.
Verified roofs remain walkable; unsupported floating anchors are refused.
Vessel activities require actual mapped water, hull/depth and obstacle admission,
and a same-mode refused relocation cannot count as success. Offshore exits,
dedicated frames, contained interiors and replacement worlds retain their
existing ownership boundaries. No new store, scheduler or generic setter.

Evidence: ignored `output/research/activity-command-ownership-2026-10-20/`.

- `before.tap`: ten failures and one pass reproduced the old activity behavior.
  `first-after.tap` retains the strict-candidate gap found during repair.
- Thirty-nine distinct focused checks passed (`focused.tap`), covering the new
  commands plus affected activity, navigation, shared restoration and walking
  pose checks. Earlier overlapping runs are not added to that total.
- Seven controlled browser cases passed (`browser/receipt.json`) using actual
  activity, travel, spawn, complete walking and vessel owners, input and HUD.
  Bridge walking retained eye height 23.7 under prescribed input; driving kept
  height 23.2. A verified roof retained height 31.7 after walking physics. Floating
  anchors, land vessel starts and offshore walking exits were refused. The real
  vessel responded to throttle. No page or console errors; all three final
  screenshots were opened and inspected.
- `browser-attempt-1` retains a fixture failure: its walking building callbacks
  returned permanently empty arrays despite a roof being added to the scene.
  The fixture now supplies its current building collection to the full walking
  module. No game repair was inferred from that setup failure.
- Context ownership, touched-module syntax and diff checks passed. Source and
  verification identities are recorded in `verification-summary.json`. Owned
  browser and temporary server cleanup completed; ordinary Chrome was preserved.

This is controlled component integration, not full-world gameplay, performance,
live-service or release acceptance. Exceptions after controller commitment retain
existing semantics. Continue with map travel through the active transport owner;
world and interior returns require their own domain-specific review.

## Remaining architectural work

Reader consolidation, explicit drone commands and shared-link surface restoration do not remove all direct actor writers. Map teleportation, world/planetary initialization and other world/interior returns still need bounded migrations into the existing transport/session owners, retaining their domain-specific admission rules. Do not replace aircraft, maritime and walking entry rules with an unrestricted generic position setter.

Regional scenery, detailed roads, structures, entrances and POIs still have distinct publication lifetimes. The next world-residency package must bind their identities and retirement explicitly, prove bridge/tunnel and landing continuity across neighboring cells, preserve edits and the location-based option, and measure retention on a repeat route. The road release repair here is a prerequisite, not completion of that package.

The model/presentation boundary, common near/far visual policy and first Godot consumer remain later packages. No global rewrite, copied Open-Planet implementation or native-only renderer dependency was introduced.
