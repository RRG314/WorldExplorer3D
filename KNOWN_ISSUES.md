# Known Issues

Last reviewed: 2026-03-28

Current risks and follow-up items for this branch.

## High Priority

### 1. Long-Distance Road Continuity Still Breaks

Current failing check:

- `npm run test:continuous-world-building-continuity`

Current issue:

- the current far-drive continuity run still fails with `drive far-region roads too thin: 0`
- the branch can keep a normal local drive stable, but still loses road density farther from the initial loaded area
- this is now the clearest automated release blocker on Earth traversal

### 2. Quick Location Reload Is Still Fragile Under Overpass Recovery

Current affected check:

- `npm run test:city-reload-cycle`

Current issue:

- the settled Baltimore -> menu -> New York flow is now clean
- the quick reload scenario can still drop into `partial_world_ready` after Overpass `502` or timeout recovery
- this means location switching is much better than before, but still not robust enough to trust under upstream instability

### 3. Public Overpass Still Creates Branch-Level Instability

Current affected checks:

- `npm run test:city-reload-cycle`
- `npm run test:continuous-world-building-continuity`

Current issue:

- Overpass `429`, `502`, and timeout failures still affect quick reload and far-drive continuity
- normal startup/performance is much more isolated than before, but the branch is still not self-contained enough to ignore upstream failures

### 4. Manual Dense-Area Traversal Still Feels Hitchy

Current automated status:

- `npm run test:drive-camera-smoothness` currently passes
- `npm run test:boat-smoke` currently passes all `5/5` cases

Current issue:

- player reports still describe a visible half-second hitch or slowdown pulse in dense areas across drive and other traversal modes
- the current normal-drive probe is now trustworthy for camera/chase stability, but it still does not fully represent the long dense-city hitch being reported during manual play
- the remaining problem appears to be in movement-time streaming / surface recovery, not in the simplified camera rig

## Medium Priority

### 5. Mirror Drift Risk (`app`, landing/account roots vs `public/*`)

Canonical runtime is edited in `app/*` and canonical landing/account roots live outside `public/*`, but deployment serves `public/*`.

Mitigation:

- always run `npm run sync:public`
- always run `npm run verify:mirror`

### 6. Long-Distance Traversal Still Needs Better Test Coverage

The current automated split is:

- `test:drive-camera-smoothness` now covers normal on-road driving and currently passes
- `test:continuous-world-building-continuity` covers far-drive continuity and currently fails

The gap is:

- there is still no single branch-level test that perfectly represents the dense-city “every half second it hitches” complaint from manual gameplay

### 7. Cold Boot Is Still Slower Than Warm Reload

Latest performance snapshot:

- boot: `firstControllableMs 5097`, `worldLoadMs 7893`
- warm reload: `firstControllableMs 7093`, `worldLoadMs 6103`

This is much better than the earlier branch snapshot, but cold boot is still not as strong as warm reload.

## Low Priority

### 8. Cloud Functions Runtime Upgrade

Functions are still configured for Node 20 in repo settings.

### 9. Additional Mobile UX Polish

- tighter layout tuning in account/social cards for smaller screens
- optional hint text for advanced room rules
