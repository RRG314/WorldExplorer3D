# Continuous-World Inventory Report

Branch: `steven/continuous-world-full-rnd`

Date: `2026-03-22`

## Scope

This report inventories the branch-only continuous-world work that currently exists in the World Explorer 3D codebase. It is not a production adoption statement. It is an implementation inventory of what is present, what is validated, and what still remains location-bound.

## Core Runtime Modules

Primary continuous-world modules:

- [continuous-world-runtime.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-runtime.js)
- [continuous-world-region-manager.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-region-manager.js)
- [continuous-world-feature-manager.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-feature-manager.js)
- [continuous-world-feature-ownership.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-feature-ownership.js)
- [continuous-world-diagnostics.js](/Users/stevenreid/Documents/New%20project/app/js/continuous-world-diagnostics.js)

Primary runtime integration points:

- [world.js](/Users/stevenreid/Documents/New%20project/app/js/world.js)
- [terrain.js](/Users/stevenreid/Documents/New%20project/app/js/terrain.js)
- [main.js](/Users/stevenreid/Documents/New%20project/app/js/main.js)
- [map.js](/Users/stevenreid/Documents/New%20project/app/js/map.js)
- [game.js](/Users/stevenreid/Documents/New%20project/app/js/game.js)
- [earth-location.js](/Users/stevenreid/Documents/New%20project/app/js/earth-location.js)
- [editor/session.js](/Users/stevenreid/Documents/New%20project/app/js/editor/session.js)
- [editor/public-layer.js](/Users/stevenreid/Documents/New%20project/app/js/editor/public-layer.js)
- [live-earth/controller.js](/Users/stevenreid/Documents/New%20project/app/js/live-earth/controller.js)

Legacy ownership still in place:

- [config.js](/Users/stevenreid/Documents/New%20project/app/js/config.js)
- [world.js](/Users/stevenreid/Documents/New%20project/app/js/world.js)

Those two files still preserve the old location-based source-of-truth path. The branch currently layers continuous-world ownership, diagnostics, and additive loading around that existing model instead of replacing it fully.

## Continuous-World Test Files

Current continuous-world browser/runtime tests:

- [test-continuous-world-foundation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-foundation.mjs)
- [test-continuous-world-region-manager.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-region-manager.mjs)
- [test-continuous-world-terrain-road.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-terrain-road.mjs)
- [test-continuous-world-feature-ownership.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-feature-ownership.mjs)
- [test-continuous-world-feature-regions.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-feature-regions.mjs)
- [test-continuous-world-feature-activation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-feature-activation.mjs)
- [test-continuous-world-road-activation.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-road-activation.mjs)
- [test-continuous-world-visible-expansion.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-visible-expansion.mjs)
- [test-continuous-world-interactive-streaming.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-interactive-streaming.mjs)
- [test-continuous-world-map-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-map-compatibility.mjs)
- [test-continuous-world-editor-overlay-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-editor-overlay-compatibility.mjs)
- [test-continuous-world-activity-multiplayer-compatibility.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-activity-multiplayer-compatibility.mjs)
- [test-continuous-world-scenarios.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-scenarios.mjs)
- [test-continuous-world-suite.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-continuous-world-suite.mjs)

Supporting non-branch-specific checks that still matter:

- [test-runtime-invariants.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-runtime-invariants.mjs)
- [test-terrain-seam-regression.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-terrain-seam-regression.mjs)
- [test-drive-surface-stability.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-drive-surface-stability.mjs)
- [test-elevated-driving-surfaces-global.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-elevated-driving-surfaces-global.mjs)
- [test-world-matrix.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-world-matrix.mjs)
- [test-boat-smoke.mjs](/Users/stevenreid/Documents/New%20project/scripts/test-boat-smoke.mjs)

## Branch Documentation

Current branch docs:

- [continuous-world-architecture.md](/Users/stevenreid/Documents/New%20project/docs/continuous-world-architecture.md)
- [continuous-world-validation.md](/Users/stevenreid/Documents/New%20project/docs/continuous-world-validation.md)
- [rdt-continuous-world-evaluation.md](/Users/stevenreid/Documents/New%20project/docs/rdt-continuous-world-evaluation.md)
- [progress.md](/Users/stevenreid/Documents/New%20project/progress.md)

## Current Runtime Inventory By Capability

Implemented now on the branch:

- passive global actor/session/origin tracking
- active near/mid/far region ring tracking
- passive feature ownership summaries for buildings, structures, and water
- region-key assignment for buildings, structures, water, roads, sidewalks, and urban surfaces
- branch-only visibility gating for region-keyed features
- visibly larger initial retained world envelope
- additive off-center streaming for roads, buildings, landuse, water areas, and waterways
- interactive additive streaming while moving
- region-prefetch coverage tracking around the moved actor
- map/editor/overlay/live-earth coordinate compatibility guardrails

Not yet fully replaced:

- the single-location hard reset loader
- `LOC` as the canonical world anchor
- true chunk-owned terrain/road/building/water lifecycle
- floating-origin rebase execution
- full production continuous-world travel without the legacy location envelope beneath it

## Current Artifact Inventory

Key current artifact locations:

- [continuous-world-foundation report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-foundation/report.json)
- [continuous-world-region-manager report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-region-manager/report.json)
- [continuous-world-terrain-road report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-terrain-road/report.json)
- [continuous-world-feature-ownership report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-feature-ownership/report.json)
- [continuous-world-feature-regions report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-feature-regions/report.json)
- [continuous-world-feature-activation report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-feature-activation/report.json)
- [continuous-world-road-activation report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-road-activation/report.json)
- [continuous-world-visible-expansion report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-visible-expansion/report.json)
- [continuous-world-interactive-streaming report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-interactive-streaming/report.json)
- [continuous-world-map-compatibility report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-map-compatibility/report.json)
- [continuous-world-editor-overlay-compatibility report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-editor-overlay-compatibility/report.json)
- [continuous-world-activity-multiplayer-compatibility report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-activity-multiplayer-compatibility/report.json)
- [continuous-world-suite report](/Users/stevenreid/Documents/New%20project/output/playwright/continuous-world-suite/report.json)

## Current Inventory Summary

Counts on branch:

- continuous-world runtime modules: `5`
- continuous-world browser/runtime tests: `14`
- core supporting continuous-world docs: `3`
- primary runtime integration points already touched by branch work: `9`

This is enough infrastructure to measure and iterate on continuous-world behavior seriously. It is not yet a completed replacement of the old world loader.
