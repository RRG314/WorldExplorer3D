# Refactor Plan

Last reviewed: 2026-07-08

Working plan for turning the live deployment baseline into a maintainable single-workspace repo without changing user-facing behavior by accident.

## 1. Goal

Refactor the live deployment codebase so that:

- one repo is the source of truth for live fixes
- large files are split by responsibility
- runtime behavior stays stable while code structure improves
- tests and release checks catch regressions before deploy

This plan is intentionally conservative. It is a professional cleanup path, not a rewrite.

## 2. Current Baseline

Current high-risk files in the live baseline:

- `app/js/world.js`: 7549 lines
- `app/js/terrain.js`: 3584 lines
- `app/index.html`: 3442 lines
- `app/js/game.js`: 3008 lines
- `app/js/ui.js`: 2915 lines
- `app/js/multiplayer/ui-room.js`: 2794 lines
- `app/js/state.js`: 978 lines

Current live-baseline branch:

- `steven/live-deployed-firebase-20260320`

Current structural risks:

- runtime logic is spread across giant files with mixed responsibilities
- the hosted build still relies on a mirrored `app/* -> public/*` workflow
- global mutable state in `state.js` makes ownership and side effects hard to trace
- `world.js` mixes data loading, spawn safety, traversal, rendering, classification, and scene mutation
- `ui.js` mixes DOM querying, event binding, mode switching, mobile controls, and menu orchestration

## 3. Ground Rules

- Canonical source stays in `app/*`, `index.html`, and `account/*`
- `public/*` remains a generated mirror for hosting until the repo is ready for a different deploy model
- no behavior changes are accepted without a matching reason and verification
- each refactor step must leave runtime checks green before the next step begins
- avoid wide rewrites across unrelated systems in the same commit

## 4. Non-Goals

This plan does not start with:

- a framework migration
- TypeScript conversion
- bundler replacement
- Firebase-to-other-platform migration
- visual redesign
- multiplayer/data-model rewrites

Those can happen later, but doing them first would mix architecture work with platform risk.

## 5. Validation Gate

Every phase should keep these green:

```bash
npm run sync:public
npm run verify:mirror
npm run test:runtime
npm run test:rules
npm run test:osm-smoke
```

For smaller internal refactors, `test:rules` can be skipped when no backend-facing files changed, but `verify:mirror` and `test:runtime` should stay mandatory for app runtime work.

## 6. Refactor Order

### Phase 1: Establish module boundaries around `world.js`

Why first:

- it is the largest file
- it owns too many critical runtime paths
- other modules depend on its behavior, so clearer boundaries here reduce later risk

Target result:

- `world.js` becomes an orchestrator instead of a giant owner of everything

First extraction targets:

- spawn and safe placement helpers
- OSM fetch/query building
- world-surface classification coordination
- linear feature handling
- vegetation staging/build helpers
- traversal graph invalidation/build hooks

Suggested destination modules:

- `app/js/world/spawn.js`
- `app/js/world/osm-loader.js`
- `app/js/world/linear-features.js`
- `app/js/world/vegetation.js`
- `app/js/world/traversal.js`

Definition of done:

- `world.js` is materially smaller
- extracted modules have narrow responsibilities
- exported APIs are explicit
- no direct behavior regressions in runtime or OSM smoke tests

### Phase 2: Split `ui.js` into UI domains

Why second:

- current UI work is hard because title flow, menus, controls, and in-game wiring all live together
- UI changes are more manageable once world/spawn hooks are cleaner

Target result:

- `ui.js` becomes a wiring layer instead of a grab bag of handlers

First extraction targets:

- title screen and launch flow
- mobile control overlays
- in-game menus and overlays
- keyboard shortcut routing
- location/custom launch wiring

Suggested destination modules:

- `app/js/ui/title-screen.js`
- `app/js/ui/mobile-controls.js`
- `app/js/ui/menus.js`
- `app/js/ui/keyboard-routing.js`
- `app/js/ui/launch-flow.js`

Definition of done:

- DOM ownership is clearer
- keyboard and mobile control logic are isolated
- new UI fixes can be made without reading the entire file

### Phase 3: Reduce global mutable state pressure

Why third:

- state cleanup goes better after module boundaries exist
- changing state ownership too early would make every other refactor noisier

Target result:

- `state.js` keeps shared primitives only
- feature state lives closer to the module that owns it

First cleanup targets:

- separate configuration constants from live mutable runtime state
- group state by subsystem ownership
- stop exporting unrelated writeable blobs when a getter/setter or helper is enough
- document which modules own which `appCtx` fields

Suggested outputs:

- `app/js/state/config.js`
- `app/js/state/runtime.js`
- `app/js/state/space.js`
- `app/js/state/input-state.js`

Definition of done:

- fewer cross-module hidden writes
- easier tracing of state mutations
- reduced risk of one feature breaking another through shared globals

### Phase 4: Break terrain responsibilities apart

Why fourth:

- `terrain.js` is large, performance-sensitive, and tightly coupled to world state
- it is safer after world/state boundaries are clearer

Target result:

- terrain streaming, terrain materials, road reprojection, and structure visuals stop living in one file

First extraction targets:

- surface visual profile and terrain material setup
- terrain tile loading/sampling
- road rebuild scheduling and reprojection
- structure visual mesh building

Suggested destination modules:

- `app/js/terrain/materials.js`
- `app/js/terrain/tiles.js`
- `app/js/terrain/rebuild.js`
- `app/js/terrain/structure-visuals.js`

Definition of done:

- performance-sensitive code is easier to profile
- terrain bugs can be fixed without touching unrelated rendering code

### Phase 5: HTML and boot cleanup

Why fifth:

- HTML and boot cleanup is easier once runtime/UI boundaries are more stable

Target result:

- `app/index.html` carries markup, not hidden application architecture
- boot flow is explicit and documented

First cleanup targets:

- move inline control/help blocks into clearer sections
- reduce giant HTML clusters where possible
- tighten `app-entry.js` boot order contracts
- document required startup sequence

Definition of done:

- startup is easier to reason about
- UI markup and runtime code are less entangled

### Phase 6: Secondary subsystems

Only after phases 1 through 5 are stable:

- `game.js`
- `multiplayer/ui-room.js`
- optional account-side frontend modules

These are important, but they should not come before the main runtime, UI, and state cleanup.

## 7. Work Unit Rules

Each refactor PR or commit should do one of these things only:

- extract one coherent module
- replace one hidden dependency with an explicit API
- document one runtime contract and enforce it with tests

Avoid combining:

- file splitting
- behavior changes
- bug fixes
- UI redesign

in the same step unless the bug fix is required to complete the extraction safely.

## 8. Practical Sequence

Recommended first four implementation passes:

1. Extract `world` spawn helpers and custom-location launch helpers.
2. Extract `world` OSM query/fetch/build preparation helpers.
3. Extract `ui` keyboard routing and mobile controls.
4. Split `state.js` into config constants versus mutable runtime state.

That sequence gives the fastest structural payoff without forcing a rewrite.

## 9. Done Definition For The Refactor Project

The refactor project is in good shape when:

- no core runtime file is acting as a catch-all owner for unrelated systems
- `world.js`, `ui.js`, and `terrain.js` are substantially smaller and orchestration-focused
- state ownership is documented and mostly local to subsystems
- live deploy workflow still works from this repo alone
- release verification remains green through the transition

## 10. Immediate Next Move

Start with Phase 1 and extract spawn-related logic from `app/js/world.js` first.

Why this is the best first cut:

- it is high value
- it touches real runtime pain points
- it already has verification coverage through `test:runtime`
- it creates cleaner seams for later UI and traversal work
