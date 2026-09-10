# Reality Capture implementation acceptance — September 10, 2026

Staging candidate: **5.2.0+3f388d31fd21.e67945f48ad80ac5.staging**.
Project: `we3d-staging-20260712`. Production was not changed.
Worktree: `/Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70`,
branch `steven/building-exteriors-local`.

## What is implemented

- A new interior opens an empty mapped outline, including irregular footprints
  and courtyards. Drawing creates one known room, with no automatic leftover
  rooms or entrance. The suggested complete plan is optional advanced setup.
  A valid entrance and connected rooms are required before submission.
- Shared geometry remains the authority. Adjacent room drawing keeps existing
  door positions when a wall splits; invalid crossings leave the previous plan.
  Topology changes ask before returning affected photo placements to the tray.
  Other placements and original photos remain available, and Undo restores the
  edit. North, keyboard room selection and larger corner/shared-wall targets
  support orientation and touch use.
- Editors share building context, parent visibility, Back navigation and unsaved
  guards. Capture hashes preserve navigation state; replacing a session cannot
  let a queued close event dispose its successor. Submitted exteriors retain
  navigation to interiors. No paid reconstruction is exposed or launched.
- Reuse explicitly selected photos from owned captures at this building or local
  device batches. Reuse is initially a device copy; saving to account remains an
  explicit action. Copying interior photos toward an exterior requires a warning
  confirmation. Local databases are partitioned by Firebase project; legacy
  batches remain intact and are available only through explicit photo recovery.
- Physical Earth capture lookup groups legacy coordinate-origin namespaces by
  mapped provider building ID. Other world identities remain exact for retrieval
  and access. No second building database or label-based building matching was
  introduced. New interior units have opaque identities; continuations retain
  the original unit. Runtime retrieval pages through all matching records and
  offers only authorized, usable units rather than silently picking the first.
- Approval of an exterior continuation replaces its own installed source
  revision atomically. Other contributors' patches remain. Runtime refresh
  notices revision changes and removes withdrawn roots using the project's
  actual Three.js API; procedural building/collision authority is retained.
- New originals use 60-second signed PUT links with exact size bounds and a
  generation-zero precondition. Firebase SDK creates are denied, preventing
  automatically issued permanent download tokens. Existing immutable uploads
  can be retried by content hash. Originals require authorized short-lived reads.
- Account deletion withdraws publications, clears occupancy, deletes captures,
  all media generations, owned interiors, guest grants and requests. A durable
  tombstone blocks new captures and allows failed cleanup to resume. Storage
  finalization removes late uploads for deleted captures/accounts. The account
  UI explains that published contributions are also removed.
- Contextual sign-in preserves the building on the page; redirect intent is
  project-scoped and expires. Local previews identify the staging test route.
  Manual photo counts and preview/review labels no longer claim reconstruction
  coverage. Owner sharing status is read from the private-space authority.

## Executed verification

| Check | Result and limits |
|---|---|
| Focused geometry, photo, identity, workflow and HTTP tests | 66 passed. After the final usable-unit filter, all 42 HTTP cases passed again. Includes lookup beyond 12 private spaces, owner-only upload tickets, immutable retry, Earth origin matching, approved replacement and cleanup failure/retry. |
| `verify:source` | Passed after removing duplicate module identities. |
| `interior-layout-ui.mjs` | Passed at 1100px and 412px. Includes native browser Back, parent restoration, one-room drawing, undo/redo, photo crop/place/save, actual protected GLB generation, private submission and reopen. HTTP is isolated. |
| `reality-capture-ui-current.mjs` | Passed with photo reuse, local persistence, interrupted signed-PUT retry, continuation, account changes, camera fixture, actual MP4 decoding and reload. Transport and camera are simulated. |
| Firestore/Storage emulator | Both storage-security cases passed with Java 21. Even the owner cannot directly create/read originals through Firebase Storage; unauthorized metadata/path/type/output writes are denied. |
| `reality-capture-hybrid-staging.mjs` with home flag | Passed against deployed staging: three synthetic photos, real signed upload/validation, stale-save rejection, private CPU submission, reopen, photo refresh and continuation. Account cleanup now uses the real deletion endpoint. Temporary attestation is deleted. |
| `capture-public-lifecycle-staging.mjs` | Passed: token-free/idempotent upload, independent viewer denied original media and pending publication, approval, real GLB load/render, legacy Earth origin lookup, approved continuation replacement, complete account media deletion and runtime withdrawal. Uses an isolated synthetic footprint and bundled source runtime with real deployed APIs. Disposable moderator/viewer accounts are deleted. |
| Ordinary signed-in Chrome | Existing seven-photo interior now opens its irregular mapped outline. Returning to the building works. Existing records were opened without saving layouts, uploading, submitting, changing access or deleting anything. No automation attestation was added to this browser. |
| Hosting build/verify/deployment | Staging environment guard and artifact verification passed; explicit staging project was used for every deployment. |

The live runs caught defects that component checks missed: capture hash updates
had erased Back state, the existing staging account-deletion function lacked
browser invocation permission, and the old Three.js runtime did not implement
`removeFromParent`. Each was corrected and exercised again.

Machine-readable local evidence is under `output/verification/interior-layout`,
`reality-capture-ui`, `reality-capture-hybrid` and `capture-public-lifecycle`.
These paths contain generated verification material and are not hosting inputs.

## Owner test sequence

1. Open <https://we3d-staging-20260712.web.app/app/capture.html>, refresh if an old
   tab is already open, and use the account that owns your photos.
2. Open your existing interior and choose **Open floor-plan grid**. Draw one
   room inside the outline. Add an entrance with **Place door**, choose the
   room, and use its saved photos on a wall or floor.
3. Save the private layout to account. Close and reopen it. Open the same staging
   link on Android with the same account and verify the saved layout/photos.
4. Return to the building and switch **Exterior / Home interior**. On an approved
   exterior, choose **Continue improving this building** to create an editable
   version while the published version remains installed.
5. Test phone camera/library selection, rotation, Android Back and background /
   resume. Report the building, action and visible error if anything differs.

Saving is not submission. Interiors stay private unless broader sharing is
explicitly requested and approved. No production promotion is part of this work.

## Limits and external acceptance

Physical Android hardware, camera permissions, background memory pressure and
Google redirect completion on that device still require the owner's test.
Phone-sized Chrome is not presented as physical-device evidence. The public
lifecycle check uses synthetic media/geometry; it does not certify visual quality
for every real photograph, map footprint or building.

Local ordinary App Check still depends on local-domain attestation configuration.
The generic anonymous browser smoke showed storage-access/403 console messages;
ordinary signed-in staging read access succeeded. Automated authenticated tests
use temporary staging attestation and do not prove every browser's attestation.

In-site submission receipts are verified. Email sender/credentials and background
push were not configured by this change; inbox or push delivery is not claimed.
Google popup-blocked redirect intent is retained in code, but the physical
Android OAuth redirect journey is not claimed as executed.

Old pre-change orphaned media are not swept indiscriminately. New upload/token
and deletion safeguards are active; a historical retention sweep would require
an inventory and narrowly scoped migration. Provider-ID replacement/aliases are
not guessed automatically. Reconstruction and procedural systems are retained.

## Interior reshaping correction after user acceptance feedback

The previous acceptance script covered axis-aligned rectangle drawing and a shared-wall drag. It did not demonstrate a usable editing workflow on the user's diagonal building. The user correctly rejected that experience.

Implemented a building-aligned view frame (inverse transforms retain canonical geometry/photo coordinates), one-click Add room with rectangle/L-shaped choices, immediate highlighted reshape selection, live polygon feedback while dragging corners/walls, whole-room movement, add/remove corner, deletion, room zoom and visible undo/redo. Secondary drawing/door tools remain available. Drawing now returns to selection instead of intercepting subsequent corner drags. Shared corners are joined on edit; existing door locations are remapped. Invalid containment/overlap edits roll back. Shared rooms resize together; moving an entire attached room explains that shared-wall handles must be used. Topology changes retain the existing photo reassignment confirmation and undo recovery.

Validation:
- 23 geometry/photo/drawing/frame tests passed, including the outline read from the user's open staging editor, rotated concavity, courtyard exclusion, and joining moved rooms.
- `scripts/verification/interior-reshape-ui.mjs`: 1100px and 412px; real mouse gestures and CDP touch corner drag, one-click room, wall drag, custom polygon, invalid-drag rollback, room movement, fit room, save/reopen, L room, delete/undo. Actual layout authority; synthetic account-save callback.
- `scripts/verification/interior-layout-ui.mjs`: 1100px and 412px; browser Back, rectangle draw/undo, shared-wall resizing, actual photo crop/save, GLB derivative, private submission, reopen, 3D surface picking and recovery. Mock HTTP with real normalizer and builder.
- Source graph checks and skill browser smoke passed. Screenshots inspected at `output/verification/interior-reshape/`.
- No backend schema or rule changes in this correction. Existing contributions were inspected without saving edits to them. Staging hosting is the delivery target.
