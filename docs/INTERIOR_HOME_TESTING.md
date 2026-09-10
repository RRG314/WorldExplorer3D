# Test a photo-supported interior

Use the [staging world](https://we3d-staging-20260712.web.app/app/), not production.
Sign in with the same account on your phone and computer.

**Continue on phone** is now in the home editor itself. It saves the current
layout and shows a QR/link to that exact capture. After uploading on your phone,
use **Check phone uploads** in the desktop editor. **Add photos** also works
without leaving the home editor. Uploaded photos are unassigned until you select
their room and wall/floor. You can add more originals to a manually validated set
until it has been submitted for review or reconstruction.

Staging and production use separate account data. Production contributions will
not appear in a staging library unless an explicit, controlled migration is done;
this test update does not copy private production images.

1. Select the mapped building and choose **Improve this place**. Start a new
   **Home interior** capture rather than changing an existing exterior capture.
2. Confirm you have permission to photograph the interior. Upload one or more
   room photos. Manual placement does not require 18 photos or paid processing.
3. Choose **Design my interior floor plan**. A new plan opens directly on one
   open space. Optional **Set up your home** supplies room-count suggestions.
4. Choose **Draw room** and drag a rectangle inside the selected space, or
   **Draw dividing wall**. Use **Select / move corners** for irregular outlines.
   Choose a room label. **Place door** places a real opening on the clicked wall.
   Exact coordinates and stair configuration remain in expandable controls.
   Finish structural divisions before placing photos.
5. Choose **Inside selected room**, or **Add photos to this room**. Choose a
   surface, crop the photo, place it, and save it. Each side of a shared wall has
   its own photo assignment. Floors and ceilings are separate surfaces.
6. Save the layout to your account. **Build saved home for review** creates the
   protected manual photo model. It does not start paid reconstruction. Leave
   public access unchecked unless you explicitly want to request it.
7. Reopen the capture on your other device using the
   [capture page](https://we3d-staging-20260712.web.app/app/capture.html). Confirm
   the room name, shape and photographs survived a refresh.
8. Return to the same mapped building in the staging world, using the same
   account. Enter through its entrance to test your own saved interior. A
   submitted photo model is available to its owner before public approval.

## What to check

- A photo lands on the chosen surface, not an adjacent room or the entire house.
- Door openings and stair openings are not covered with photo triangles.
- Walking, looking around and exiting work; nearby walls do not disappear.
- A save confirms its account revision. A failed save must say so and retain
  the device draft rather than claim success.
- Another account cannot fetch private originals or enter a private interior.
- An exterior's public visibility does not change the interior's access mode.

## Current boundaries

This is a staging test implementation, not a completed production acceptance.
Complex stair guards, L/U traversal, irregular unit-boundary authoring, room
merge/orphaned-placement recovery and large-home performance still need work.
Pitched lofts are constrained by the supported building body height, not an
invented roof interior. The first trial should be one modest room, then a
connected second room. Keep your exterior contribution unchanged.

A multi-floor starter currently repeats the requested starting room counts on
each floor. It is a suggested editable arrangement, not an inferred house plan.
Do not assume it has measured the layout of a townhouse complex or divided that
complex into legal units.
