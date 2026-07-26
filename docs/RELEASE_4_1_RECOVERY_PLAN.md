# World Explorer 3D 4.1 Recovery Plan

> Superseded for implementation sequencing by
> [`RELEASE_4_1_REBASE_PLAN.md`](RELEASE_4_1_REBASE_PLAN.md) after production
> was restored to the exact 3.1.0 artifact on 2026-07-26. This document remains
> architecture and recovery evidence; it is not the branch or release plan.

## Authority

This is the governing implementation plan for 4.1. `ROADMAP.md` describes the
longer product direction; this document controls the order of 4.1 work.
The fixed ship criteria and current pass/fail status are recorded in
[`RELEASE_4_1_ACCEPTANCE.md`](RELEASE_4_1_ACCEPTANCE.md).

The current worktree is an integration prototype, not a release candidate. No
deployment or merge is permitted from that state. Work advances through the
phases below in order. A failed exit condition keeps the project in that phase.
A passing numeric report cannot override a broken gameplay screenshot.

## Architecture decision

Use a staged runtime-owner replacement behind explicit contracts.

The code-level ownership audit and mandatory migration/deletion sequence are
recorded in
[`WORLD_RUNTIME_AUTHORITY_AUDIT.md`](WORLD_RUNTIME_AUTHORITY_AUDIT.md). Locations
are validation fixtures only; implementation work is owned by the compiler,
store, surface, scene, and traveler contracts in that audit.

This is neither continued patching of the shared runtime nor an all-at-once
product rewrite:

- preserve the product shell, licensed assets, user-facing capabilities,
  persistence schemas, and proven algorithms;
- replace lifecycle and world-composition owners one vertical slice at a time;
- delete the losing owner in the same phase that certifies its replacement;
- do not copy the experimental core-rebuild implementation. Its small runtime
  graph and explicit ownership model are evidence; its unfinished provider,
  terrain, and parity implementation are not migration inputs.

The 4.1 runtime ownership model is:

```text
AppRuntime
  -> DestinationSession
       -> EarthSession
            -> WorldLoadTransaction
            -> EarthSourceAdapters
            -> WorldCompiler
            -> WorldStore
            -> WorldSurfaceQuery
            -> WorldScene
            -> Traveler
  -> ProductShell
  -> PersistencePorts
  -> MultiplayerPorts
```

### Mandatory contracts

1. `AppRuntime` owns application state and destination transitions.
2. One `DestinationSession` owns one frame scheduler and resource scope.
3. `EarthSession` owns one generation of Earth loading and travel.
4. `WorldLoadTransaction` owns one selected-location load and cancellation.
5. `WorldCompiler` publishes one immutable canonical location transaction.
6. `WorldSurfaceQuery` is the only authority for terrain, corridors,
   structures, foundations, water, collision, navigation, spawn, and placement.
7. `SpatialOccupancy` applies the same rules to every selected location.
8. `WorldScene` alone creates, attaches, retires, and disposes world objects.
9. `Traveler` owns travel-mode state; controllers query and do not mutate the
   world.
10. Source, renderer, input, Firebase, DOM, and network code are adapters.

### Dependency rules

- New domain code may not import or mutate `shared-context.js`.
- No side-effect registration at import time.
- No source-embedded cache-version query strings in the replacement graph.
- Runtime dependencies are pinned and served locally.
- One active destination means one frame owner.
- Every asynchronous load carries a session generation and abort signal.
- A stale generation cannot publish records, scene objects, or cache entries.
- OSM is the 4.1 authority for ordinary Earth vector geometry. Overture is not
  a live fallback; future use requires a field-specific source decision.
- Optional providers enrich one tile transaction or degrade explicitly. They
  never start a second geometry pipeline.
- File length is not an architecture boundary. CI measures dependency
  direction, shared writers, lifecycle ownership, complexity, and testability.

## Measured baseline

- 416 application JavaScript modules;
- 411 modules reachable from the normal entry;
- 155 modules importing shared context;
- 453 shared-context fields assigned in application code;
- 166 fields assigned from multiple modules;
- 19 `requestAnimationFrame` call sites across 14 files;
- 861 source-embedded module version imports;
- 63 modules over 500 lines and 10 over 700 lines;
- no static ES-module cycles;
- 90 modified/deleted files plus 12 untracked runtime/test modules in the
  current integration worktree;
- the experimental rewrite entry reaches 37 modules, explaining its lower
  runtime overhead, but it is incomplete.

These are ratchets, not vanity targets. Each phase must reduce the applicable
shared owners and may not add a second implementation.

## Phase 0 — Recover a trustworthy baseline

### Work

1. Freeze both dirty worktrees.
2. Record manifests, diffs, heads, and evidence outside the release branch.
3. Preserve the integration prototype on a non-release checkpoint branch. It
   will not be merged wholesale.
4. Preserve the experimental rewrite separately as read-only evidence.
5. Create `steven/4.1-runtime-recovery` from reviewed `main`.
6. Mark PR #41 as superseded; do not merge its current payload.
7. Classify every change as preserve, reimplement, obsolete, or evidence only.
8. Capture last-known-good journeys and current regressions, including the
   road/building overlap.
9. Classify tests as contract, browser journey, visual, operations, or obsolete.

### Exit

- both prototypes are recoverable;
- the recovery branch is clean;
- no production or user data changed;
- no unclassified change or test remains;
- local work is limited to one preview server and one heavy browser session.

## Phase 1 — Runtime kernel and dependencies

### Work

1. Implement application, destination, and session state machines.
2. Introduce one frame scheduler and resource scope per destination.
3. Add command, query, and event ports for shell, input, persistence, and MMO.
4. Move Three.js, DOM, Firebase, storage, and network access behind adapters.
5. Pin and locally serve runtime dependencies; remove CDN runtime boot.
6. Reject new shared-context imports, domain-to-adapter imports, import-time
   registration, and multiple frame owners in CI.

### Exit

- lifecycle and cancellation fixtures are deterministic;
- stale work cannot publish;
- destination enter/return retains no frame loop or resources;
- hidden tabs own no destination animation work;
- the replacement entry has no CDN runtime dependency.

## Phase 2 — One Earth tile transaction

### 4.1 sequencing decision

The selected-location OSM experience is the 4.1 release baseline. Its load
time, frame pacing, roads, terrain, structures, occupancy, camera, and visual
quality are the only Earth-world certification path. The unfinished
continuous-world runtime and its settings surface were removed; its preserved
branch history is reference material only and is not part of release 4.1.

### Work

1. Approve source authority and provenance for terrain, roads, paths,
   buildings, structures, water, land cover, vegetation, and POIs.
2. Implement one OSM Shortbread adapter and one terrain adapter.
3. Use one `WorldLoadTransaction` owner for cold start and location changes.
4. Compile immutable canonical records in local metres.
5. Commit render, collision, navigation, labels, and map products atomically.
6. Implement bounded work, abort, retry, cache identity, replacement, and
   disposal in the transaction owner.
7. Delete each losing location-load owner when its replacement passes.

### Exit

- initial load and location changes use the same compiler;
- feature counts and identities reconcile from source through rendering;
- OSM is the only ordinary vector authority;
- active tiles, requests, memory, geometries, textures, and disposal remain
  within recorded budgets after repeated travel.

## Phase 3 — Surface composition and occupancy

Composition order:

```text
terrain -> confidence/seams -> transport corridors -> structures
        -> hydrology/water -> occupied floors/foundations -> occupancy
        -> vegetation/props -> collision/navigation/spawn/camera
```

Required invariants:

- A solid at-grade building cannot intersect an at-grade road core.
- An elevated building may overlap a road only with explicit usable clearance.
- Elevated/pass-through buildings have no foundation or collision below their
  occupied floor.
- Every consumer queries the same selected surface.
- Grade separation uses structure semantics, not plan-view overlap alone.
- Trees, grass, and props cannot occupy water, buildings, transport, tunnels,
  or camera-clearance volumes.
- Cross-cell features reconcile before rendering.
- Unsupported geometry is reported with provenance, not hidden.

### Exit

- zero unexplained road/building intersections in recorded global fixtures;
- no floating trees, submerged ordinary buildings, disappearing near-field
  grass, terrain-consumed paths, or unowned surface layers;
- invariants pass before and after crossing cell boundaries;
- every rejection reports source identity and owning contract.

## Phase 4 — Rendering, LOD, and resources

1. Make `WorldScene` the only world-object owner.
2. Use one reference-counted material/texture registry.
3. Use stable near/mid/far replacement identities instead of cell popping.
4. Time-slice compilation and GPU publication without splitting transactions.
5. Implement stable shadows and camera-relative precision.
6. Render facades, roofs, foundations, terrain, roads, vegetation, and water
   from canonical semantics.
7. Remove replaced renderers, material owners, and disposal queues.

### Exit

- no duplicate render owner;
- no resource growth after repeated travel and destination cycles;
- LOD transitions expose no empty cells or missing near-field content;
- roads remain legible and buildings retain believable scale;
- production-hardware screenshots pass human review.

## Phase 5 — Traveler, camera, and interaction

1. Bind all travel modes to `Traveler` and world queries.
2. Use one spawn service with mode-specific constraints.
3. Use one stateful camera-clearance solver per travel family.
4. Preserve explicit bridge, tunnel, interior, water, and destination contracts.
5. Use one input vocabulary for desktop, touch, and gamepad.

### Exit

- cameras do not flip, penetrate, or oscillate;
- mode switching does not place actors in invalid surfaces;
- every travel mode completes a sustained journey and transition cycle;
- desktop and mobile controls remain reachable and consistent.

## Phase 6 — Product parity and data safety

1. Adapt the existing shell, maps, navigation, saved places, activities,
   editors, interiors, destinations, multiplayer, and accounts through ports.
2. Inventory Firebase schemas and test compatibility with emulators.
3. Keep Earth, Ocean, planetary, space, MMO, and saved-location coordinate
   regimes explicit.
4. Label incomplete or illustrative capabilities honestly.
5. Delete a legacy owner only after its parity row is visually reviewed.

### Exit

- every retained 4.1 journey is contract-, browser-, and visually tested;
- existing user data remains readable;
- migrations are reversible, emulator-tested, and separately approved;
- no legacy lifecycle owner is reachable from production.

## Phase 7 — Performance and release

Initial reference-Mac targets, fixed after controlled baseline measurement:

- warmed gameplay: median FPS at least 58, 1% low at least 45, no sustained
  sequence over 33 ms;
- dense city: at most 20 seconds cold and 12 seconds warm to playable;
- ordinary city: at most 12 seconds cold and 8 seconds warm;
- three repeated seam/destination cycles: zero pending disposal and no more
  than 10% retained-heap growth over the warm plateau;
- hidden-tab destination rendering stops;
- tile, draw-call, triangle, geometry, and texture budgets are recorded per
  quality tier.

Required geography: ordinary city, dense city, Los Angeles-scale area, rural,
mountain, coast, river/lake, below sea level, high latitude, and cell seam.
Shinjuku is not a special implementation target; it may remain a documented
red fixture until the shared terrain contract supports it.

Required journeys: title to Earth, sustained travel modes, water transition,
Earth/Ocean return, Earth/Moon/Mars/Space return, mobile layouts, provider
degradation, cancellation, preview, smoke, and rollback.

### Exit

- focused, nightly, and release gates agree;
- screenshots pass human review;
- the exact clean commit produces the immutable artifact;
- staging, observability, rollback, security, attribution, and data safety pass;
- package, changelog, notes, known issues, and manifest identify 4.1.

## Git and GitHub model

GitHub is updated at phase milestones, not after every edit.

- `main` is always releasable.
- Work uses `steven/4.1-<phase>-<owner>` from current `main`.
- One PR owns one vertical or governance change.
- Draft PRs collect CI evidence; ready PRs require their phase exit.
- Use signed-off commits, squash merge, and automatic branch deletion.
- PR #41 is not merged; it is superseded after its state is preserved.

Replace the disabled repository-wide ruleset with an active `main` ruleset:

- block deletion and force pushes;
- require a PR, linear history, signed commits, resolved conversations, and an
  up-to-date branch;
- require the real architecture, runtime, secret-scan, DCO, and artifact checks;
- allow squash merge only;
- use zero mandatory approvals while there is one maintainer, then require one
  CODEOWNER approval when a second maintainer is active;
- allow no general bypass.

The disabled rule must not simply be enabled: it targets all branches, requires
an obsolete check, and would deadlock the sole maintainer.

Create a 4.1 milestone and phase issues from this plan. Use Discussions for
support and design proposals; issues track accepted work. Keep existing
templates and governance files unless a real gap is found. Protect production
deployment with explicit approval and immutable-artifact promotion.

## Test model

1. Contract tests run on every PR.
2. One affected browser journey and screenshots run before a phase PR is ready.
3. Geography and sustained-runtime suites run nightly or at a phase gate.
4. The complete matrix runs once on the clean candidate.
5. A failed screenshot reopens the owning contract; it never creates a
   location-specific patch.
6. Tests protecting deleted implementation are deleted with it.

## Immediate next action

Stop renderer- and coordinate-level stabilization. Implement Steps A and B of
the world runtime authority audit: immutable `DistrictSource` records and one
seam-stable `DistrictGroundField` compiled before roads, buildings, or land-use
geometry. Migrate critical builders to that field, then delete their raw-height
fallbacks. Do not remove the legacy post-load road/building rebuild until the
replacement field renders and queries correctly, and remove that losing owner
in the same phase that certifies the replacement.
