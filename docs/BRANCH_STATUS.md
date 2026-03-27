# Continuous World Branch Status

Last updated: 2026-03-27
Branch: `steven/continuous-world-root-repair`

This file is the current branch-level status for the continuous-world runtime work. It replaces the dated audit/report files that were previously spread across the repository.

## 1. Purpose Of This Branch

This branch is focused on turning Earth traversal into a stable continuous-world runtime.

The main goals are:

- keep normal gameplay out of blocking fullscreen loads
- make road-first streaming reliable while driving and walking
- reduce terrain and surface-sync spikes
- keep traversal and camera behavior predictable at speed
- make location switching and data retirement behave like a real game runtime

## 2. What Changed Compared With `worldexplorer3d/main`

Compared with `worldexplorer3d/main`, this branch adds or substantially changes:

- continuous-world runtime modules:
  - `app/js/continuous-world-runtime.js`
  - `app/js/continuous-world-region-manager.js`
  - `app/js/continuous-world-feature-manager.js`
  - `app/js/continuous-world-feature-ownership.js`
  - `app/js/continuous-world-diagnostics.js`
- Earth runtime ownership in:
  - `app/js/world.js`
  - `app/js/terrain.js`
  - `app/js/main.js`
  - `app/js/physics.js`
  - `app/js/hud.js`
- road-first streaming and actor-local terrain/surface sync scheduling during active traversal
- runtime rebase support for long-distance continuous-world travel
- a larger Playwright validation harness for performance, driving, location reload, boat mode, terrain seams, ramps, and continuity
- expanded Earth mode systems including live weather, Earth-relative sky state, boat mode, and contributor moderation/editor plumbing that were not part of the older mainline runtime surface

## 3. Current Validation Snapshot

The numbers below were refreshed on this branch on 2026-03-27.

| Check | Status | Current result |
| --- | --- | --- |
| `npm run test:performance-stability` | Pass with warnings | Warm reload: `firstControllableMs 8144`, `worldLoadMs 7211`, `frameMs 26.2`, `drawCalls 1298`, `surfaceSyncLastMs 7.7` |
| `npm run test:drive-camera-smoothness` | Fail | `camera chase distance drifted too much: 10.00 .. 10.6469` on `Water Street`; `onRoadRatio 1`, `maxSpeed 40.24`, `loadCoupledStutterRatio 0.0426` |
| `npm run test:city-reload-cycle` | Fail | First Baltimore load timed out before play; runtime stayed at `roads 0`, `buildings 0`, `gameStarted false` |
| `npm run test:continuous-world-building-continuity` | Fail (infrastructure) | Far-drive run aborted on Overpass `429` |
| `npm run test:boat-smoke` | Fail | `3/5` water cases passed; `Baltimore Inner Harbor` and `Chicago Lakefront` failed auto-entry |

### Performance detail

The current performance report passed overall, but it still showed a cold-boot case that was much worse than warm reload:

- cold boot: `firstControllableMs 40007`, `worldLoadMs 35503`, `frameMs 24.26`, `surfaceSyncLastMs 11.2`
- warm reload: `firstControllableMs 8144`, `worldLoadMs 7211`, `frameMs 26.2`, `surfaceSyncLastMs 7.7`

That report also logged Overpass `429`, `502`, and `504` errors, so the cold-boot result is currently a mix of branch behavior and upstream data-service instability.

## 4. Current Read Of The Branch

What is better than `main`:

- the branch has much stronger diagnostics and targeted regression tests
- warm Earth runtime performance is materially better than the earlier branch state
- fullscreen loader ownership is better controlled than the regressed earlier passes
- drive camera behavior is simpler and more stable than the earlier over-reactive chase setup

What is not ready:

- location switching is not yet reliable enough for release
- normal driving is still failing the chase-distance stability test
- public Overpass dependence still makes far-drive continuity and cold boot too fragile
- boat entry coverage is inconsistent across real-world locations

## 5. Release Readiness

This branch is not release-ready yet.

The release blockers are:

1. `test:drive-camera-smoothness`
2. `test:city-reload-cycle`
3. `test:boat-smoke`
4. infrastructure-sensitive far-drive continuity

## 6. Where To Look Next

If you are contributing on this branch, start with:

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [TECHNICAL_DOCS.md](../TECHNICAL_DOCS.md)
- [TESTING.md](../TESTING.md)
- [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)
