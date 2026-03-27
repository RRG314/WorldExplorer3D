# Continuous-World Feature Report

Branch: `steven/continuous-world-full-rnd`

Date: `2026-03-22`

## What Is User-Visible Now

The branch is no longer just hidden continuous-world plumbing. It now has visible runtime behavior changes.

### 1. Larger Initial World Envelope

Verified by:

- [test-continuous-world-visible-expansion.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-visible-expansion.mjs)
- [visible expansion report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-visible-expansion/report.json)

Behavior:

- roads are retained much farther from the initial city center
- buildings remain visible in farther dense zones
- the loaded world feels materially larger before the old location bubble runs out

### 2. Interactive Off-Center Streaming

Verified by:

- [test-continuous-world-interactive-streaming.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-interactive-streaming.mjs)
- [interactive streaming report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-interactive-streaming/report.json)

Behavior:

- moving away from the original center can pull in new roads
- new buildings can appear off-center
- landuse, water areas, and waterways can also be pulled in off-center
- surrounding region-prefetch now loads more than one region around the moved actor
- branch prefetch now biases toward the player heading while moving, so it can fill ahead of the current drive direction instead of only picking the nearest uncovered cell

Current measured Upper Manhattan result:

- roads `6708 -> 9037`
- buildings `24200 -> 29291`
- nearby streamed target content: `41` roads, `34` buildings, `32` landuse meshes

### 3. Region-Keyed Feature Activation

Verified by:

- [test-continuous-world-feature-activation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-feature-activation.mjs)
- [test-continuous-world-road-activation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-road-activation.mjs)

Behavior:

- buildings can be region-keyed and hidden outside the narrowed tracked window
- structure visuals can be region-keyed and hidden outside the narrowed tracked window
- roads and road-adjacent urban surfaces can be region-keyed and hidden outside the narrowed tracked window

This is real branch-only activation behavior, not just metadata tagging.

### 4. Continuous-World Compatibility

Verified by:

- [test-continuous-world-map-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-map-compatibility.mjs)
- [test-continuous-world-editor-overlay-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-editor-overlay-compatibility.mjs)
- [test-continuous-world-activity-multiplayer-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-activity-multiplayer-compatibility.mjs)

Behavior:

- minimap and large-map references remain aligned with the active actor
- editor overlay capture remains compatible with the branch coordinate path
- activity and multiplayer compatibility checks exist against the branch runtime

## What Exists But Is Mostly Structural

These features are important but not directly user-visible:

- session/origin tracking
- region lifecycle tracking
- feature ownership summaries
- rebase recommendation state
- terrain/road/water/perf continuity diagnostics
- branch suite runner with blocking vs advisory gates

## Current Feature Status by Phase

### Foundation

Status: `implemented`

- branch runtime session/origin model exists
- region manager exists
- diagnostics snapshot exists

### Terrain + Roads

Status: `partially visible`

- terrain continuity guardrails exist
- road continuity guardrails exist
- road batches can be region-owned
- interactive streaming can add more roads beyond the old center

### Buildings + Dense Content

Status: `partially visible`

- region ownership exists
- region activation exists
- interactive streaming can add more buildings beyond the old center

### Water

Status: `partially visible`

- water areas and waterways are included in interactive streaming
- water ownership and compatibility checks exist
- full production continuous water loader replacement is not done yet

### Structures

Status: `guardrailed, not finished`

- structure ownership and activation exist
- structure continuity diagnostics exist
- elevated/tunnel behavior is still not the strongest part of the branch

## What Is Not True Yet

The branch does **not** yet give you:

- a full no-reset global Earth travel path
- complete replacement of the location-based loader
- true whole-world chunk ownership
- final production-quality bridge/tunnel/boat continuity everywhere

## Current Feature Risk

Strongest branch features:

- diagnostics and validation
- region ownership model
- visible off-center additive streaming
- coordinate compatibility

Weakest branch features:

- elevated/tunnel continuity under continuous movement
- full water behavior under a replaced loader
- any runtime still rooted directly in `LOC` assumptions
