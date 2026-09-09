# Interior layout implementation checkpoint

This is an implementation checkpoint, **not a production or end-to-end phone
acceptance claim**. Production has not been changed.

## Latest staging result

The deployed browser/account workflow passed on September 8 against staging build
`5.2.0+5acdce68640a.cdc7fb8f4fbfe7d7.staging`: private layout creation, stale-save
rejection, refresh persistence, real Storage photo upload/validation, CPU manual
GLB generation, private submission, authorized owner representation resolution,
phone-page editor opening, room rename/save and refresh recovery. The test uses a
390 px Chrome viewport and disposable synthetic account/photo, not a physical
Android handset. No public approval or paid reconstruction was performed.
Capture and account cleanup completed and the disposable App Check test token was
revoked. See `output/verification/reality-capture-hybrid/home-staging-report.json`
and `home-staging-phone.png` for local evidence.

64 targeted layout, photo geometry, legacy room geometry and HTTP/access-authority
tests pass. The actual game browser checks also exercised straight-stair ascent,
W movement, entry/exit and near-plane restoration. The full complex-house plan is
not complete; remaining gates below are intentionally still open.

The live check caught three integration failures missed by the earlier local
fixture: the stale exterior-only finalizer, the reconstruction photo minimum, and
the API confusing review consent with public sharing. Each was corrected before
the successful deployed run. Manual private review now sends consent separately
from the explicit public-sharing preference.

## Implemented locally

- One versioned metric layout feeds the 2D editor, 3D shell, backend validation,
  floor surfaces, wall collision, doorway openings and stairs.
- Room counts, shared-corner editing, irregular outlines, room labels, doors,
  floor selection, straight/L/U stair geometry and a connected multi-floor
  starter. A declared unit outline is constrained to the mapped building.
- Room division inserts shared corner identities and retains existing doorway
  routes. Starter plans follow rotated building footprints rather than forcing
  every home onto north-aligned rectangles.
- Existing authenticated capture save and private asset APIs are reused.
  Photos bind to stable room/wall-side IDs; labels do not change those IDs.
- Photo triangles follow irregular room outlines and exclude doors/stairwells.
  The top floor ceiling remains closed. Wall photos sit inside the wall shell.
- Layout account revisions, device recovery, undo, protected manual derivatives
  and an explicit review action. Interior public-sharing requests are separate
  from exterior sharing and unchecked by default.
- Game scene integration uses the existing interior entry/exit and walking
  systems. Unsupported layouts fail visibly rather than resizing the exterior.
- Authored-home first-person entry uses a 4 cm camera near plane and restores
  the previous value on exit; the former 50 cm near plane hid nearby walls.

## Evidence collected

- Layout, photo geometry, legacy room geometry and HTTP-handler security tests:
  46 passed before the subsequent stair-landing/unit additions. The latter
  layout tests separately passed (8 cases).
- Browser editor at 1100 and 412 CSS pixels: generation, rename, account-style
  save/reopen, overview and inside view passed with the real validator and a
  mocked HTTP transport. This is not Firebase or physical Android evidence.
- Immutable staging-target hosting builds succeeded and have been deployed to
  staging only; production has not been deployed.
- Follow-up staging-only deployment began with immutable build
  `5.2.0+2806c3878421.63ef7d7b5dce3416.staging`. Deployed workflow testing found an
  old upload-finalization function that rejected interiors; updating it is part
  of this acceptance pass, not a successful end-to-end claim.
- Expanded desktop and 412 px browser test passed crop/place/save, actual manual
  GLB generation, private submission and reopen using simulated HTTP transport.
- Actual game test passed W movement and a complete straight-stair ascent to
  level 2, plus exit. Camera clipping found visually was corrected and retested.
  This uses a synthetic local building/layout, not a user's saved house.
- Exact installed model generation/revision public approval binding is tested.
  Legacy capture-only records retain their previous access interpretation.
- The deployed manual-interior upload check found a reconstruction-only minimum
  of 18 photographs. Manual mode now requires one valid photo for either family;
  reconstruction thresholds remain unchanged. A dedicated regression test passes.
- Whole-home CPU derivatives and editor previews cap aggregate texture allocation
  at eight million texels; public exterior sizing remains unchanged.
- Prescribed game browser client: Earth walking loaded visually. A resource
  returned HTTP 401; its origin still needs attribution before calling this a
  clean network check.

## Remaining acceptance work

- Extend actual-game straight-stair ascent/exit evidence to L/U turns, wall and
  ceiling impacts, descent and the real saved-home delivery path.
- Exercise photo placement, protected derivative submission and account reopen
  against staging Firebase, then verify on a physical Android phone.
- Verify guest/revocation behavior for whole-home updates in deployed Firebase;
  local model-generation/revision approval tests alone are insufficient.
- Finish stair guard/headroom and path-clearance checks, room split/merge and
  orphaned-placement recovery, and concave/unit-boundary editor usability.
- Measure actual device GPU memory, including decoded originals, rather than
  treating the configured texel budget as measured performance evidence.

The research plan remains the target. Features in its remaining acceptance work
must not be described as implemented or publicly ready.
