# Phase 5 Controller and Lifecycle Status

**Status:** complete; Phase 5 exit conditions satisfied

## Implemented

- The transport controller registry owns one active alternate controller at a
  time. Controller timing measures only the owned dynamics update; tracking,
  police, fishing, world streaming and interactions execute afterward.
- Travel-mode transitions preserve the accepted world pose while clearing held
  keyboard and gamepad state, steering, yaw, slip and mode-local camera state.
  Window blur and document visibility changes also clear held input.
- Walking consumes the compiled transport surface directly. It does not raycast
  the large batched presentation mesh and reuses the current local road
  projection and resolved ground state.
- Vehicle upward surface attachment is immediate across accepted stacked
  surfaces; downward suspension remains smoothed. The chassis clearance target
  includes a one-centimetre tolerance.
- Space runtime dependencies are configured explicitly instead of constructing
  Three.js values at module import. Flight and camera orientation use normalized
  quaternion interpolation and orthogonal local axes.
- Space and ocean sessions lease renderers, animation frames, timers and event
  listeners through named lifecycle scopes. Exit disposes scene resources and
  returns to the module-only baseline. Re-entry creates a fresh usable scene.
- Lifecycle diagnostics expose active scope, owner and resource counts through
  the session coordinator.

## Verified controller evidence

- `PHASE5_HEADED=1 npm run diag:phase5-sustained`
  - Baltimore remained stable at 5,115 roads and 8,378 buildings.
  - Walk: 120 simulated seconds, 7,200 updates, 1,440 m path, exact grounding,
    no penetration and 0.4 ms controller p95.
  - Drive: 120 simulated seconds, 12,373.16 m path, 0.574 m maximum surface
    gap, 0.044 m maximum penetration and 100% grounded samples.
  - Drone: 120 simulated seconds, 2,512.91 m path and 5.01 m minimum
    clearance.
  - Plane: 60 simulated seconds, 2,464.51 m path, 90.09 m minimum clearance,
    100% airborne samples and clean exit.
  - Four mode transitions completed with no controller conflict, failure or
    console error. The sustained harness is synthetic direct-state diagnostic
    evidence and is deliberately not marked as real-input release evidence.
- `npm run test:player-drive-input`
  - Real browser keyboard input verified forward/reverse independence, correct
    steering sign, camera response, surface attachment and stale-input
    clearing. The recorded functional run used SwiftShader and therefore is
    not represented as hardware performance evidence.
- `npm run test:phase5-controls`, `npm run test:transport-controllers` and
  `npm run test:phase5-aerial-transition`
  - stale input and independent directional channels pass
  - controller ownership and p95 diagnostics pass
  - all 25 terrain materials suppress maps at aerial altitude and restore the
    same maps after hysteresis

## Verified space and lifecycle evidence

- `npm run test:space-flight-controls`
  - 1,360 samples with 0.0241 maximum forward step and 0.0817 maximum camera
    step
  - normalized quaternion, orthogonal flight basis and camera-up alignment
  - complete planet, spacecraft, galaxy, asteroid and Kuiper catalogs
- `npm run test:session-lifecycle`
  - ten launch/exit cycles each for space and ocean
  - one active session owner, one renderer and one animation frame while active
  - no session owner, renderer or animation frame after exit
  - stable module baseline of three scopes and sixteen listeners
  - zero disposed-scene GPU resources after exit and no console errors
- `npm run test:title-planetary`
  - title launches, Earth/Moon/Mars/space round trips, repeated space entry and
    stale landing cancellation pass without a main-frame reload
- The required develop-web-game browser client rendered the current title hub
  at desktop resolution. The Baltimore globe, destination choices and status
  panels were visually inspected with no generated error report.

## Regression and data decision

The full `npm test` chain, module URL identity, maintainability, runtime kernel,
runtime ownership, public OSM worldwide smoke matrix and accepted-ground
fail-closed controls pass. Phase 5 adds no permission-gated source, credential,
access bypass or location-specific production geometry. Only existing
public/unsigned repository sources and accepted artifacts are used.

## Exit decision

Phase 5 is complete. Active controllers have deterministic ownership and
bounded measured update cost; mode changes cannot retain stale control state;
space and ocean renderer/animation/listener lifetimes are explicit and return
to a stable baseline; repeated planetary sessions rebuild disposed state; and
the sustained Earth journeys retain their surface, clearance and world
publication invariants.

## Evidence paths

- `output/playwright/phase5-sustained-earth/report.json`
- `output/playwright/player-input-drive/report.json`
- `output/playwright/phase5-aerial-transition/report.json`
- `output/playwright/session-lifecycle/plateau-report.json`
- `output/playwright/session-lifecycle/space-cycle-10.png`
- `output/playwright/session-lifecycle/ocean-cycle-10.png`
- `output/playwright/space-flight-controls/report.json`
- `output/playwright/title-planetary-launches/report.json`
- `output/playwright/phase5-develop-game-client-app/shot-1.png`
- `output/playwright/runtime-invariants/report.json`
- `output/playwright/osm-smoke/report.json`
