# Phase 6 Production Candidate

**Target version:** 4.1.2

**Status:** blocked — failed direct visual acceptance; no preview or production
promotion is permitted

**Runtime baseline:** Phase 5 commit `da9de3b`

## Scope

Phase 6 changes release metadata, evidence gates, artifact identity and
promotion mechanics only. Production geometry, data compilation, rendering,
controllers, UI behavior and lifecycle architecture are frozen. Any newly
discovered runtime defect returns to the phase that owns it.

Direct review on 2026-07-30 found production-code defects in the location
handoff, ground composition, water presentation, transport structures,
environment sky reset and minimap follow behavior. The release verifier's
counter/schema assertions did not prove those player-visible outcomes. The
candidate has therefore returned to its owning phases and is not deployable.

## Candidate identity

The schema-v2 hosting manifest binds:

- full Git commit and commit timestamp;
- clean/dirty source status;
- package version and dependency-lock SHA-256;
- complete asset-manifest SHA-256 and artifact content SHA-256;
- SHA-256 over the accepted-ground catalog and twelve ground manifests;
- Firebase configuration environment, project, and immutable deployment
  target.

The release candidate gate requires a clean worktree, production Firebase
configuration, `worldexplorer3d-d9b83:live` as the intended target, matching
4.1.2 package/lock/changelog/release notes, and exact manifest parity.

## Verification workflow

1. Commit the Phase 6 metadata and release-tooling boundary.
2. Run `npm run release:verify`.
   - This builds the production-configured artifact once.
   - It runs the locked data, geometry, security, runtime, Chromium, WebKit,
     lifecycle, real-input, provider-outage, and worldwide matrix gates.
   - The real-input hardware drive lasts ten minutes.
3. Visually inspect every newly generated world-matrix screenshot.
4. Create a hash-bound review:

   `WORLD_MATRIX_REVIEWER="<reviewer>" npm run release:prepare-visual-review -- --approve`

5. Finalize without regenerating screenshots or rebuilding:

   `WORLD_MATRIX_VISUAL_REVIEW_FILE="output/playwright/world-matrix/visual-review.json" npm run release:finalize`

6. Deploy the already-built production-configured bytes to a temporary
   production-project preview channel:

   `npm run preview:deploy -- 4-1-2-rc --project worldexplorer3d-d9b83 --config-env production --use-existing-artifact --expires 1d`

7. After the preview checklist and second-person approval, promote that exact
   channel without rebuilding:

   `npm run preview:promote -- 4-1-2-rc --project worldexplorer3d-d9b83`

## Preview checklist

- Launch from the public title hub and enter Baltimore.
- Drive forward/reverse while steering; open/close the minimap.
- Cycle drive → walk → drone → plane → drive with `F`.
- Enter and exit one bridge/tunnel scenario without a barrier or camera trap.
- Launch Ocean, Moon, Mars and Space, then return to Earth.
- In Space, pitch/yaw across multiple local axes and confirm no camera flip.
- On an iPhone/iPad and Android device, confirm title selection, touch
  movement, action buttons, mode sheet, portrait and landscape layouts.
- Confirm account/sign-in surfaces load without exposing credentials.
- Confirm the displayed HUD version is 4.1.2.

Record browser/OS/device, result, and any screenshot for every failure.

## Rollback

The rollback target is the retained immutable 4.1.1 production artifact.
Rollback promotes that retained artifact; it does not rebuild tag `v4.1.1`.
Before live promotion, record the current live channel/release identifier and
verify that it can be cloned back to `live`.

## Non-local evidence

Local macOS Chromium and Playwright WebKit evidence does not prove physical
iOS/Android or Windows GPU behavior. Those results remain explicit preview
checklist items. They cannot be converted into a pass by emulation.
