# Visual photo-to-building editor

Local implementation, September 7, 2026. Not yet deployed to staging.

The private hybrid editor now follows a visual workflow:

1. Tap a wall on the mapped 3D building or select its side button. Dragging or pinching the viewer does not select a different wall.
2. Choose a saved photo by thumbnail. Adjust the four crop corners around one planar wall area. Six thumbnails load per page; original access remains authenticated.
3. Place the crop across the wall or choose a grid section. Drag to move; use the lower-right handle to resize. Arrow keys move, Shift plus arrows resize. Repeat for other non-overlapping patches.
4. Inspect and save the private preview through the existing revision authority.

Exact corner coordinates, wall percentages, height and roof settings are optional under Advanced. Unknown measurements can remain unknown. The desktop two-column and phone single-column layouts use the same model and input logic, not separate Android/Apple implementations.

The grid is a placement diagram, not a measured survey. Planar crops do not remove occluders or create hidden geometry. Uncovered surfaces remain procedural. The current preview limit remains 16 patches; saved photos are not discarded. Preview dimension changes do not change mapped doors, collisions or public geometry.

## Verification

The existing browser verifier exercises actual editor DOM and WebGL: rendered-wall taps, orbit exclusion, distinct owner-photo thumbnails and paging, region movement, keyboard controls, Android-emulated native touch resize, two same-wall patches, overlap rejection, shared normalizer revision save, remove/undo/reopen and abort cleanup. Layouts: 1100px desktop, 412px Android-emulated, 390px mobile. Screenshots inspected locally; private photos are excluded from this document and Git. The supplied web-game client also exercised a synthetic local editor fixture.

41 focused authority/security/hybrid Node tests and current source graph passed. Saving uses an explicitly local HTTP transport double in these UI tests. No physical phone, cloud publication, or notification delivery is certified by these results.

## Remaining integration

Account/admin moderation, immutable submitted revisions, world publication after hard refresh and push/email delivery remain separate unfinished work tracked in CAPTURE_PUBLICATION_AND_NOTIFICATIONS.md. This editor checkpoint must not be presented as a completed approval/publication system.
