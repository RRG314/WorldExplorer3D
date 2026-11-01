# Racing menu

The menu uses one event list and one preview, with the shared Roam typography,
colours and controls. Route names, distance, laps, car and personal best appear
beside the setup controls. Start and result actions stay outside the scrolling
content. Desktop car/opponent settings sit under the event list, with distance and
laps above the image. Small screens place the settings after the preview, using
a horizontal event list and the same full-size controls.

Location view is a temporary image of the player's current game camera. It is
labelled as a current view, not a photograph of an entire course. Route map shows
the selected course, start/finish and the published district roads. Both modes
share the same selection; opening the route creator switches to the map. The
junction selector remains available for keyboard route creation.

`location-preview.js` reads one frame after the existing renderer marks the
captured world publication as presented. It does not render again, move the camera,
fetch geographic data or create another animation loop. The image is bounded to
960 × 540 and 512 KiB, is never saved or uploaded, and is released on menu close.
Closing, changing worlds or replacing the renderer during encoding rejects late
images. A blank, unreadable or manually paused view falls back to the route map.

`course-preview.js` owns map presentation only. Qualification, route geometry,
vehicle admission, simulation, records and progress retain their existing owners.
The runtime only lists routes qualified against the loaded world. Researched
major venues do not become playable through a preview or reference entry.

Local design previews are separate from gameplay and are labelled accordingly.
They use an actual Monaco gameplay image and a retained city practice route;
neither represents the professional Monaco circuit. Planned venues must not reuse
that image as if it depicted their locations. No third-party track photographs,
logos or artwork have been added for this menu.
