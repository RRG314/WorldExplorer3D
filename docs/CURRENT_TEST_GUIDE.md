# Current staging and test guide

Updated September 7, 2026. No production deployment is authorized by this guide.

## Open the app

- [Staging game](https://we3d-staging-20260712.web.app/app/)
- [Your improved house](https://we3d-staging-20260712.web.app/app/?loc=custom&lat=39.657281&lon=-76.887539&lname=mapped+building&mode=walking)
- [Your saved photo contribution](https://we3d-staging-20260712.web.app/app/capture.html#capture=capture_d7a83f7f2adf291ac8d76e04a7cb3636)
- [Account](https://we3d-staging-20260712.web.app/account/)
- [Admin moderation](https://we3d-staging-20260712.web.app/account/admin.html?view=moderation)

Use the same account on desktop and phone. Capture and admin links retain normal
ownership/role checks; a link does not grant access. Do not refresh an editor
with unsaved placements. Once saved, reopen the game and refresh to load the
current staging assets. No new photo upload or reconstruction is necessary to
look at the already approved house.

## Exact availability

Gameplay/capture checkpoint: `93470acb`, branch `steven/building-exteriors-local`.
Recovery branch: `steven/manual-capture-working-checkpoint` at `ba14127f`.

Deployed staging hosting build:
`5.2.0+93470acb1767.68ba49afe1848cc2.staging`.
This is a clean build of the production-bound branch, not the earlier isolated
snapshot. The production-configured artifact from the same source has matching
runtime bundles; Firebase accounts, media and backend configuration are separate.
Later local fixes align the phone capture fonts, correct portal frame texture
projection, and keep the camera clear of road surfaces and terrain when it
leaves a tunnel. Read the candidate manifest to distinguish this newer build
from the staged `93470acb` baseline recorded here.

The staged update includes facade alignment, manual-first UI, placed-edit
recovery, protected publication/deletion, public-interior approval guards and
admin refresh feedback. Your saved four-wall contribution remains approved.
Public new-room capture and paid reconstruction admission are unavailable;
existing private records remain accessible to their owners. No reconstruction
job is needed to test editing.

Use local candidates for gameplay/visual checks. Use staging for phone HTTPS,
account continuation, protected media and approval tests that need its backend.
Production remains unchanged at `22b2f4ef4b07`. Do not deploy before owner testing.

Manual room editing, private in-world draft previews, capture-specific rewards,
featured places and contribution-room sharing are not yet available. Room photo
storage is not a finished playable-room editor.

## A practical replay route

| Try | What to check |
| --- | --- |
| Improved house | Walk around all covered sides. Check image coverage at the roof edge and the orientation of trim. Uncovered surfaces should remain generated; other buildings should not acquire these photos |
| Saved contribution | Confirm the existing gallery and saved placements load. Saving is distinct from submitting/approval; do not create a new submission merely to inspect the approved one |
| Earth traversal | Walk, BMW, drone and plane mode changes; camera look; return to the menu and re-enter. Use the current Controls panel for configured keys |
| Roads and buildings | Try both a normal neighborhood and a complex bridge/tunnel location. Check support, camera clearance and visible transitions; the house test cannot establish global transport correctness |
| Backpack and services | Confirm one wallet and relevant supplies. At mapped functional places, check a supported purchase/service and persistence; game money may change when you choose a purchase |
| Property/Blocks | Inspect existing ownership and build access. Maryland parcel context should load on demand, not as an unrelated second property system |
| Ocean and space | Enter from the menu, return, then try a planet/ship journey. Check that the environment, vehicle, outfit and camera change together; verify mission progress rather than only the first screen |
| Community | Join the intended room; check presence, chat and supported shared content. Private room access must remain private |
| Phone/accessibility | Try touch movement/look, portrait and landscape, text size, contrast and notice settings. Browser viewport emulation does not replace this phone test |

This is a concise user replay route, not a claim that every row has just passed.

## Evidence already collected

- The user completed phone upload/manual save/approval and confirmed the real
  mapped house displayed their photos in staging.
- The latest local facade fixture verified six rotated sides, mapped wall height
  and partial regions. Its rendered screenshot was inspected.
- Published-revision deletion/race and post-commit approval-error regressions
  passed. Actual Firestore/Storage emulator rules checks also passed.
- Manual-editor browser checks covered desktop and touch-sized layouts,
  placement/cropping, save, reopen and device recovery using controlled services.
- A disposable staging account uploaded a synthetic photo, saved/reloaded manual
  placements, submitted a CPU-built revision for review, and deleted the pending
  test capture. Paid retry and new-room requests were rejected. This did not
  approve a synthetic building into the public world.
- The staged Mars landing, rover movement and return to the ship passed with no
  page errors or failed local resources; rendered screenshots were inspected.
- Monaco loaded actual OSM transport in the local built artifact with no detected
  discontinuities, grade violations or runtime errors. Its street screenshot
  does not by itself establish tunnel-entrance visual quality.
- The exact corrected house top edge still needs owner visual acceptance.
- A direct recheck of Monaco way `155081313` reproduced a road crossing the
  camera within0.74m. The indexed surface probe and enclosure-exit terrain check
  then produced a clear entrance view at that same way. Generalized-data portal
  endpoint appearance is still a limitation; this is not worldwide visual proof.

These checks are scoped evidence, not proof of every gameplay feature. Before
promotion, production App Check must be configured and the selected approved
house must be migrated with its production owner UID and protected media.
Neither migration nor production deployment has happened. No paid reconstruction
is required for this replay.
