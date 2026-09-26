# Interior capture completion — local development

Baseline: fd950816, steven/building-exteriors-local. No production deployment.
Manual single-room photo placement is the target. Paid reconstruction remains
separate and unavailable to public intake. Do not re-enable it as a shortcut.

1. Audit ground refresh/reset and existing capture authorities; save regression
   fixes separately. Preserve exterior uploads, approvals and public images.
2. Define one validated room geometry descriptor: measured rectangular room,
   four walls plus floor/ceiling, named surfaces, room-local coordinates and
   a versioned signature. Reference the original canonical building, never
   substitute a room rectangle as that building's actual footprint.
3. Adapt the existing crop/placement editor and upload/save/revision authority.
   Dimensions are editable with revision conflict protection. Phone and desktop
   use the same UI, thumbnails, capture ID and authenticated media. Account save,
   device recovery and explicit status must remain available.
4. Generate manual room derivatives without reconstruction. Private owner preview
   must work before review. Public sharing needs explicit choice AND review;
   approval alone never switches a private room to public. Exterior patch manifests
   must never contain interior surfaces or textures.
5. Integrate room entry using the same descriptor for rendered walls, floor,
   collision, spawn and exit. Do not hide a building-sized procedural collision
   shell underneath a smaller photo room. Network/permission failure cannot leak
   private assets or trap the player.
6. Verify backend authorization, immutable media generations, cross-account denial,
   review revision conflicts, save/reopen, desktop and Android-emulated camera/
   library/crop flow, walking and exit. Use staging for authenticated phone HTTPS
   and backend integration when necessary; never label mock transport as cloud proof.
7. Publish a precise test guide and local checkpoint. List physical-phone and
   cloud checks that still require observation; don't mark them passed by code review.

Current audit: new room UI is hidden; switchKind rejects interiors; hybrid
normalizer rejects interiors; submit/review assumes exterior patches; protected
interior resolver reads only reconstruction output; generated interior collisions
do not follow supplied room dimensions. These are implementation gaps, not UI-only
switches. They must be resolved together before exposing room creation.
