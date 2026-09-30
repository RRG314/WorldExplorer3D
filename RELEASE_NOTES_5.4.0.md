# A more consistent world

World Explorer 3D 5.4 was released September 30, 2026. This update improves
movement consistency and world presentation while preserving existing gameplay.

## Materials that hold together

Quality settings preserve the scene's lighting exposure. Terrain materials keep
stable blending weights, and distant facade windows fade smoothly when their
detail becomes smaller than a pixel. Licensed vegetation shares reusable textures
between detail levels, with trees anchored at their trunks.

Ship equipment preserves imported materials, housings, cables and mounting
transforms. Room surfaces use shared licensed materials. Remote walking players
use the game's licensed character and animation controller.

## More consistent movement

Driving and aircraft chase cameras now account for movement throughout each
frame, reducing the repeated pull-back and catch-up visible at uneven frame
intervals. Road queries, geometry buffers and repeated lighting updates create
less temporary work without reducing world detail. Discarded private building
buffers are released after batching to reduce delayed cleanup freezes. Packaged driving, low flight, camera changes and return to ground have been
checked. All 57 candidate gates and 13 isolated backend stages passed, including
performance, space transitions and two-client multiplayer. The current Chicago
weekly-room journey also passed. Occasional GC pauses remain.

## Respect the place

Documented ruins use masonry rather than residential windows and roof equipment.
Historic walls follow intermediate terrain heights, with collision along the
same spans. Building foundations extend to the accepted downhill terrain instead
of ending at a fixed skirt depth. Dedicated landmark models release replaced
visuals and cancelled loads.

Elizabeth Tower gains repeated masonry and window detail. These structures
remain reconstructions from available information; they are not surveyed models
of every historical site.

## Verification and limits

Regional data and landmark reconstructions retain their documented limits.
Physical-phone responsiveness remains unverified. See
[known limitations](KNOWN_ISSUES.md) and the
[verification record](docs/visual-quality/EVIDENCE.md).

The update targets 5.4 rather than 6.0 because its intended changes preserve
existing saves, room interfaces and supported links. Compatibility checks passed for the released build.
