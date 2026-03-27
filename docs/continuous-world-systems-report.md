# Continuous-World Systems Report

Branch: `steven/continuous-world-full-rnd`

Date: `2026-03-22`

## System Overview

The branch currently has a layered continuous-world model rather than a full ownership replacement. The old location-based world model still exists, but a branch-only continuous-world runtime now observes, partitions, validates, and increasingly extends the world around the active actor.

## System Ownership

### 1. Global Session / Actor Tracking

Owned by:

- [continuous-world-runtime.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-runtime.js)

Responsibilities:

- session epoch
- current branch origin
- actor global geo snapshot
- local offset from origin
- near/mid/far region ring snapshots
- rebase recommendation state

This is currently observational plus branch control state. It does not yet own the production loader.

### 2. Region Lifecycle

Owned by:

- [continuous-world-region-manager.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-region-manager.js)

Responsibilities:

- tracked region keys
- active vs prefetch region state
- entered/retired/promoted/demoted region transitions
- session reset handling

This is the branch’s region lifecycle spine. It gives the runtime a stable notion of what regions should matter around the actor.

### 3. Feature Ownership

Owned by:

- [continuous-world-feature-manager.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-feature-manager.js)
- [continuous-world-feature-ownership.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-feature-ownership.js)

Responsibilities:

- assign region keys to buildings, structures, water, roads, and keyed visual batches
- summarize which feature families exist in which regions
- validate active-region relevance for the actor’s current surface family

This is the bridge between region theory and real runtime content.

### 4. Runtime Diagnostics / Validation Snapshot

Owned by:

- [continuous-world-diagnostics.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-diagnostics.js)

Responsibilities:

- expose current actor state
- expose continuous-world runtime snapshot
- expose interactive-streaming state
- expose terrain-streaming state
- expose road/surface attachment state
- expose feature ownership / feature regions
- expose water and perf state

This file is the central validation interface used by almost every branch browser test.

### 5. Legacy World Load + Additive Streaming

Owned by:

- [world.js](/Users/stevenreid/Documents/New%20project/app/js/world.js)

Responsibilities:

- old location-bound load still exists here
- visible continuous-world expansion loads a much larger initial world envelope
- additive continuous-world interactive streaming merges roads, buildings, landuse, water, and waterways outside the original center
- region-prefetch now adds surrounding region coverage around the moved actor

This is the current visible continuous-world system, but it still rides on top of the old base world loader.

### 6. Terrain Streaming and Surface Sync

Owned by:

- [terrain.js](/Users/stevenreid/Documents/New%20project/app/js/terrain.js)

Responsibilities:

- local terrain tile streaming
- terrain focus/prefetch descriptors
- surface sync requests
- seam diagnostics
- terrain continuity metrics consumed by the branch harness

Terrain is the most advanced “streaming-shaped” system in the legacy runtime and is the natural foundation for deeper continuous-world chunk ownership later.

### 7. Main Loop Integration

Owned by:

- [main.js](/Users/stevenreid/Documents/New%20project/app/js/main.js)

Responsibilities:

- update the continuous-world runtime every frame
- kick interactive streaming every frame
- keep diagnostics current during real movement

This is the runtime heartbeat that makes the branch behavior visible while driving.

## How Systems Interact

### Runtime Loop Flow

1. [main.js](/Users/stevenreid/Documents/New%20project/app/js/main.js) updates the branch continuous-world runtime.
2. [continuous-world-runtime.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-runtime.js) derives actor geo and region rings.
3. [continuous-world-region-manager.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-region-manager.js) updates tracked region lifecycle.
4. [continuous-world-feature-manager.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-feature-manager.js) updates region ownership summaries from loaded features.
5. [main.js](/Users/stevenreid/Documents/New%20project/app/js/main.js) kicks [world.js](/Users/stevenreid/Documents/New%20project/app/js/world.js) interactive streaming.
6. [world.js](/Users/stevenreid/Documents/New%20project/app/js/world.js) decides whether to load:
   - actor-centered off-center content
   - nearby uncovered region-prefetch content
7. [terrain.js](/Users/stevenreid/Documents/New%20project/app/js/terrain.js) handles local terrain updates and surface sync.
8. [continuous-world-diagnostics.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-diagnostics.js) snapshots the result for tests.

### Validation Flow

1. Browser tests boot a real runtime.
2. The test script drives/teleports/switches mode.
3. It reads `appCtx.getContinuousWorldValidationSnapshot()`.
4. It compares:
   - world counts
   - region counts
   - terrain tile health
   - road contact
   - map drift
   - feature ownership relevance
   - water/perf continuity
5. It writes a report artifact and screenshot.

## What Is Working as a System

- region/session tracking is coherent
- feature-region ownership is coherent
- region-gated activation exists for keyed features and road batches
- visible off-center additive world loading exists
- movement-triggered additive region-prefetch exists
- map/editor/overlay/live-earth coordinate consumers are aligned with the branch runtime snapshot

## What Is Still Weak

- the base loader is still location-bound
- true unload/retire chunk ownership is not yet the main runtime authority
- additive streaming is not yet a complete replacement for the old world bubble
- elevated/tunnel continuity still needs more work than at-grade continuous loading
- full water travel continuity is still guarded more by validation than by a fully replaced loader architecture

## Immediate System Priority

The next real system transition should be:

1. make branch streaming load ahead of the player’s heading more intelligently
2. continue replacing “single location center” assumptions inside [world.js](/Users/stevenreid/Documents/New%20project/app/js/world.js)
3. move from additive extension to true region-owned loader behavior
