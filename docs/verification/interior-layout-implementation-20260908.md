# Interior layout implementation checkpoint

This is an implementation checkpoint, **not a production or end-to-end phone
acceptance claim**. Production has not been changed.

## Implemented locally

- One versioned metric layout feeds the 2D editor, 3D shell, backend validation,
  floor surfaces, wall collision, doorway openings and stairs.
- Room counts, shared-corner editing, irregular outlines, room labels, doors,
  floor selection, straight/L/U stair geometry and a connected multi-floor
  starter. A declared unit outline is constrained to the mapped building.
- Existing authenticated capture save and private asset APIs are reused.
  Photos bind to stable room/wall-side IDs; labels do not change those IDs.
- Photo triangles follow irregular room outlines and exclude doors/stairwells.
  The top floor ceiling remains closed. Wall photos sit inside the wall shell.
- Layout account revisions, device recovery, undo, protected manual derivatives
  and an explicit review action. Interior public-sharing requests are separate
  from exterior sharing and unchecked by default.
- Game scene integration uses the existing interior entry/exit and walking
  systems. Unsupported layouts fail visibly rather than resizing the exterior.

## Evidence collected

- Layout, photo geometry, legacy room geometry and HTTP-handler security tests:
  46 passed before the subsequent stair-landing/unit additions. The latter
  layout tests separately passed (8 cases).
- Browser editor at 1100 and 412 CSS pixels: generation, rename, account-style
  save/reopen, overview and inside view passed with the real validator and a
  mocked HTTP transport. This is not Firebase or physical Android evidence.
- Immutable staging-target hosting build succeeded. It has not been deployed.
- Prescribed game browser client: Earth walking loaded visually. A resource
  returned HTTP 401; its origin still needs attribution before calling this a
  clean network check.

## Remaining acceptance work

- Run and inspect actual authored-home walking, stairs, wall/ceiling collision,
  entry/exit and camera behavior; surface sampling alone is insufficient.
- Exercise photo placement, protected derivative submission and account reopen
  against staging Firebase, then verify on a physical Android phone.
- Verify exact approved representation revision binding and guest/revocation
  behavior for whole-home updates; don't infer this from capture-ID checks.
- Finish stair guard/headroom and path-clearance checks, room split/merge and
  orphaned-placement recovery, and concave/unit-boundary editor usability.
- Verify bounded decoded texture memory in the derivative and game paths, not
  only the editor. A compressed GLB size cap is not a GPU-memory cap.
- Refresh system inventory and architecture documentation after these gates.

The research plan remains the target. Features in its remaining acceptance work
must not be described as implemented or publicly ready.
