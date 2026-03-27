# Continuous-World Testing And Interactions Report

Branch: `steven/continuous-world-full-rnd`

Date: `2026-03-22`

## Purpose

This report explains how the continuous-world systems are currently tested, how those tests interact with the runtime, and what they prove versus what they still do not prove.

## Central Validation Interface

Most branch browser tests interact with one shared runtime snapshot:

- [continuous-world-diagnostics.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-diagnostics.js)

Main snapshot entrypoint:

- `appCtx.getContinuousWorldValidationSnapshot()`

That snapshot combines:

- actor state
- coordinate drift state
- continuous-world runtime state
- interactive stream state
- terrain stream state
- road/surface attachment state
- feature ownership and feature regions
- water state
- perf state

This is the main reason the branch tests are coherent with each other instead of each test inventing its own private runtime inspection model.

## Test Families And What They Exercise

### Foundation / Region Lifecycle

- [test-continuous-world-foundation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-foundation.mjs)
- [test-continuous-world-region-manager.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-region-manager.mjs)

They validate:

- session reset behavior
- origin tracking
- region ring evolution
- rebase recommendation state

### Terrain / Road Continuity

- [test-continuous-world-terrain-road.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-terrain-road.mjs)
- [test-terrain-seam-regression.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-terrain-seam-regression.mjs)

They validate:

- active center terrain stays loaded
- no duplicate or missing active terrain meshes
- terrain remains coherent near travel corridors
- road continuity does not collapse during terrain updates

### Feature Ownership / Activation

- [test-continuous-world-feature-ownership.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-feature-ownership.mjs)
- [test-continuous-world-feature-regions.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-feature-regions.mjs)
- [test-continuous-world-feature-activation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-feature-activation.mjs)
- [test-continuous-world-road-activation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-road-activation.mjs)

They validate:

- loaded content gets region ownership
- active-region relevance is computed correctly
- off-region keyed content can deactivate
- roads and dense content share the same region activation logic

### Visible Streaming

- [test-continuous-world-visible-expansion.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-visible-expansion.mjs)
- [test-continuous-world-interactive-streaming.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-interactive-streaming.mjs)

They validate:

- the world envelope is visibly larger than the old tight city bubble
- off-center content can load after movement
- streamed content includes roads, buildings, landuse, and water
- region-prefetch around the moved actor is happening

### Compatibility

- [test-continuous-world-map-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-map-compatibility.mjs)
- [test-continuous-world-editor-overlay-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-editor-overlay-compatibility.mjs)
- [test-continuous-world-activity-multiplayer-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-activity-multiplayer-compatibility.mjs)

They validate:

- coordinate consumers stay aligned with branch runtime coordinates
- editor capture logic still works
- overlay compatibility still works
- activity/multiplayer checks still work against the branch runtime

### Scenario Harness

- [test-continuous-world-scenarios.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-scenarios.mjs)
- [continuous-world-scenarios.mjs](/Users/stevenreid/Documents/New%20project/scripts/continuous-world-scenarios.mjs)

They validate:

- long drive corridors
- urban entry
- elevated structure travel
- tunnel travel
- boat continuity routes

This is the closest thing to a true branch behavior harness.

## How The Tests Interact With Each Other

The tests are intentionally layered:

1. Foundation tests prove session/region behavior exists.
2. Terrain/road tests prove the streamed ground remains stable enough to use.
3. Ownership/activation tests prove content can be partitioned and gated.
4. Visible streaming tests prove the user can actually see more world after movement.
5. Compatibility tests prove map/editor/activity systems still understand the same coordinate world.
6. Scenario tests prove all of that still behaves across longer runtime paths.

That ordering matters. The branch would be much harder to trust if visible streaming existed without the ownership/diagnostic checks under it.

## Current Latest Direct Validation State

Latest direct checks run during the current branch work:

- `npm run test:continuous-world-interactive-streaming` passed
- `npm run sync:public` passed
- `npm run verify:mirror` passed
- `npm run test:runtime` passed

Latest visible interactive-streaming measured result:

- roads `6708 -> 9037`
- buildings `24200 -> 29291`
- nearby streamed target content: `41` roads, `34` buildings, `32` landuse meshes
- covered streamed region keys now include:
  - `2040:-3698`
  - `2040:-3697`
  - `2040:-3699`
  - `2041:-3698`

Artifacts:

- [interactive-streaming report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-interactive-streaming/report.json)
- [runtime invariants report](/Users/stevenreid/Documents/New%20project/output/playwright/runtime-invariants/report.json)

## Current Known Testing Caveats

- [continuous-world-suite report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-suite/report.json) is a useful aggregate, but it can lag behind the very latest targeted branch fixes if it has not been rerun after each narrow pass.
- advisory geometry checks still exist outside the main branch-blocking path:
  - elevated driving surfaces
  - legacy boat smoke
  - world matrix sidewalk/urban-surface expectations
- some tests are intentionally stricter than the currently visible runtime because they are protecting the eventual production target rather than only the current visible branch behavior

## What The Tests Prove Today

They prove that:

- the branch has a coherent runtime model for continuous-world state
- additive streaming is real, not fake
- more world content can appear after movement
- core coordinate consumers are not drifting away from that branch runtime

They do **not** yet prove that:

- the old location reset loader has been removed
- all traversal modes are fully whole-Earth continuous
- all elevated/tunnel/water continuity problems are solved
