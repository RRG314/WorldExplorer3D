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

## Remaining architectural work

This removes competing interpretations in the named consumer paths; it does not yet remove all direct actor writers. The next migration must classify and move actual activation, spawn and world-return commands into the existing transport/session owners, retaining their domain-specific admission rules. Do not replace aircraft, maritime and walking entry rules with an unrestricted generic position setter.

Regional scenery, detailed roads, structures, entrances and POIs still have distinct publication lifetimes. The next world-residency package must bind their identities and retirement explicitly, prove bridge/tunnel and landing continuity across neighboring cells, preserve edits and the location-based option, and measure retention on a repeat route. The road release repair here is a prerequisite, not completion of that package.

The model/presentation boundary, common near/far visual policy and first Godot consumer remain later packages. No global rewrite, copied Open-Planet implementation or native-only renderer dependency was introduced.
