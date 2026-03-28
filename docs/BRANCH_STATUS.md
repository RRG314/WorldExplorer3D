# Continuous World Branch Status

Last updated: 2026-03-28
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

The numbers below were refreshed on this branch on 2026-03-28 from clean local reruns.

| Check | Status | Current result |
| --- | --- | --- |
| `npm run test:performance-stability` | Pass | Boot: `firstControllableMs 5097`, `worldLoadMs 7893`, `frameMs 28.95`, `drawCalls 1316`, `surfaceSyncLastMs 7.0`; warm reload: `firstControllableMs 7093`, `worldLoadMs 6103`, `frameMs 17.01`, `drawCalls 1221`, `surfaceSyncLastMs 11.4` |
| `npm run test:drive-camera-smoothness` | Pass | `North Calvert Street`; `onRoadRatio 1`, `maxSpeed 45.84`, `chaseDistance 10.00 .. 10.0249`, `loadCoupledStutterRatio 0.05` |
| `npm run test:city-reload-cycle` | Mixed | Settled Baltimore -> menu -> New York path passes cleanly; quick reload path can still land in `partial_world_ready` after Overpass `502` / timeout recovery |
| `npm run test:continuous-world-building-continuity` | Fail | `drive far-region roads too thin: 0` |
| `npm run test:boat-smoke` | Pass | `5/5` water cases passed: Baltimore Inner Harbor, Chicago Lakefront, Chicago Harbor, Monaco Coast, Miami Offshore |

### Performance detail

The current performance report is materially stronger than the earlier branch snapshot:

- boot: `firstControllableMs 5097`, `worldLoadMs 7893`, `frameMs 28.95`
- warm reload: `firstControllableMs 7093`, `worldLoadMs 6103`, `frameMs 17.01`
- both cases stayed within draw-call, texture, geometry, heap, and surface-sync budgets

The branch is still sensitive to Overpass availability during quick reload and long-distance continuity, but the normal startup and warm-reload performance gate is currently green.

## 4. Current Read Of The Branch

What is better than `main`:

- the branch has much stronger diagnostics and targeted regression tests
- normal Earth startup and warm-reload runtime performance are materially better than the earlier branch state
- fullscreen loader ownership is better controlled than the regressed earlier passes
- drive camera behavior is simpler and more stable than the earlier over-reactive chase setup
- normal on-road driving and boat entry are both passing their primary harnesses on this snapshot

What is not ready:

- long-distance road continuity still collapses in the far-drive continuity check
- quick location reload is still too dependent on Overpass recovery and can fall back to a partial world
- public Overpass dependence still makes branch behavior too fragile for release confidence
- manual dense-city traversal reports still describe periodic hitching that is not fully captured by the normal-drive probe

## 5. Release Readiness

This branch is not release-ready yet.

The release blockers are:

1. `test:continuous-world-building-continuity`
2. quick-reload degradation inside `test:city-reload-cycle`
3. manual dense-area traversal hitch still reported by gameplay testing
4. continued reliance on live Overpass availability during branch-critical Earth loading

## 6. Where To Look Next

If you are contributing on this branch, start with:

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [TECHNICAL_DOCS.md](../TECHNICAL_DOCS.md)
- [TESTING.md](../TESTING.md)
- [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)
