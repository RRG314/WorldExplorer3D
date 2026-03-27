# Known Issues

Last reviewed: 2026-03-27

Current risks and follow-up items for this branch.

## High Priority

### 1. Driving Still Degrades Under Long Dense-City Runs

Current failing check:

- `npm run test:drive-camera-smoothness`

Current issue:

- camera chase distance still drifts too far during a normal drive run
- the branch still feels laggier in dense areas than in sparse areas
- the remaining problem is in runtime loading and surface/stream interaction, not just the camera rig

### 2. Location Switching Is Not Reliable Enough

Current failing check:

- `npm run test:city-reload-cycle`

Current issue:

- title/menu city reload can still stall before the first playable world finishes
- the current failing run timed out with `roads 0`, `buildings 0`, and `gameStarted false`

### 3. Public Overpass Still Creates Branch-Level Instability

Current affected checks:

- `npm run test:performance-stability`
- `npm run test:continuous-world-building-continuity`

Current issue:

- Overpass `429`, `502`, and `504` responses still affect cold boot and far-drive continuity
- some branch behavior is now better isolated from these failures, but not enough to call the runtime self-contained

### 4. Boat Entry Coverage Is Incomplete

Current failing check:

- `npm run test:boat-smoke`

Current issue:

- `Baltimore Inner Harbor` and `Chicago Lakefront` failed valid-water auto-entry in the latest run
- `Chicago Harbor`, `Monaco Coast`, and `Miami Offshore` passed

## Medium Priority

### 5. Mirror Drift Risk (`app`, landing/account roots vs `public/*`)

Canonical runtime is edited in `app/*` and canonical landing/account roots live outside `public/*`, but deployment serves `public/*`.

Mitigation:

- always run `npm run sync:public`
- always run `npm run verify:mirror`

### 6. Cold Boot Is Much Worse Than Warm Reload

Latest performance snapshot:

- warm reload: `firstControllableMs 8144`, `worldLoadMs 7211`
- cold boot: `firstControllableMs 40007`, `worldLoadMs 35503`

This gap is currently too large for release confidence.

## Low Priority

### 7. Cloud Functions Runtime Upgrade

Functions are still configured for Node 20 in repo settings.

### 8. Additional Mobile UX Polish

- tighter layout tuning in account/social cards for smaller screens
- optional hint text for advanced room rules
