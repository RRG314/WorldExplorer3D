# Reality Capture coherence and orientation

Production is unchanged by this work. The approved exterior remains installed.

## Authority contract

The existing canonical building owns footprint, origin and world placement.
Capture wall indices refer to its frozen geometry snapshot; do not rotate or
reorder that polygon to make an editor view feel familiar. Photo crops, wall
assignments and user-facing references belong to the revision. Saving does not
publish; review installs that revision. Interior access remains separately private.

## Local orientation implementation

- Primary north-up footprint, previously buried in Advanced.
- Outward compass labels calculated from the existing east/south coordinate frame,
  handling both provider windings and rotated polygons without renumbering walls.
- Map link at the captured building coordinate, plus entrance reference when saved.
- Straight-on camera view from the selected exterior wall's outward direction.
- Optional user-declared street-facing wall persisted through preview normalization.
  This is not a claim about mapped road data or the actual front door.
- Existing crops can be reassigned to another surface without uploading again.
- Interior room plans explicitly use their local frame, rather than a false north label.

## Completion pass — staging, September 9

Implemented after the initial checkpoint:

- Embedded north-up OSM road context with map wall selection, loaded only when opened.
- Street-facing reference frozen on submission and displayed to the moderator from
  that revision. Contributor and moderator model previews include the blank mapped
  shell, rather than isolated floating photo planes.
- Shared exterior geometry for browser and CPU output fixes outside-view mirroring
  for new V2 photo placements. Existing unversioned/V1 placements stay unchanged.
- Moving a crop guards overlaps; the server independently rejects overlapping patches.
- World-scoped representation listing no longer mixes matching IDs across worlds.
- Replacement tests prove draft/submitted revisions leave installed imagery unchanged
  until the new revision is approved, and stale approval requests are rejected.

Staging build: `5.2.0+14496f5352e6.24812dcd2e3ca853.staging`.
No production deployment or live contribution edits occurred in this pass.

Verified: 53 combined orientation/layout/HTTP tests; exterior and interior editor
flows at desktop and mobile widths; actual-game entry, movement, straight stairs,
surface continuity and exit. Inspected the loaded street-map screenshot and interior
entry screenshot. The stair-end screenshot faces a blank wall and is not a visual
quality demonstration. Real staging exterior upload, validation, CPU model submission
and cleanup passed. Cloud home-flow result is recorded in the completion verification.

## External acceptance gates

- Real email delivery is blocked by missing sender configuration (and missing staging
  sending credentials). Sender-provider acceptance must not be called inbox delivery.
- Physical Android camera permission behavior and final user acceptance require the
  user's phone. Mobile viewport and real cloud account checks are not physical tests.
- Real signed-in moderator acceptance should be exercised on staging; local HTTP
  tests prove authorization/revision contracts, not access to the user's browser session.

## Original audit checklist (historical)

1. Embed surrounding road/building context using the existing spatial provider; do
   not infer a front from the nearest road at corner lots or complex buildings.
2. Propagate the submitted orientation reference into frozen review metadata and
   show the same reference in moderator inspection, not a later mutable draft.
3. Check image left/right handedness across both footprint windings in CPU derivative,
   browser preview and runtime. Existing approved data must not silently flip.
4. Compare room layout, door references and stairs in editor versus actual game;
   complete physical Android capture and private-entry checks.
5. Complete live notification configuration and real moderation/publication checks
   from the prior workflow audit. Queue counts alone are not a full notification inbox.
6. Verify correction of an approved revision preserves the installed result until
   replacement approval, including overlapping patches and failed submissions.

## Local verification

Orientation unit tests cover normal/reversed winding and rotated geometry.
Existing exterior UI harness passed 1100/412/390px with real canvas wall selection,
crop/save/reopen and no cloud processing; it now exercises marking the front.
Phone-width orientation screenshot inspected. These checks do not constitute a
production, physical Android, or whole-system signoff.
