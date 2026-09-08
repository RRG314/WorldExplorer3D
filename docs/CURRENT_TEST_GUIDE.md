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

Source checkpoint: `c801c19f`, branch `steven/building-exteriors-local`.
Recovery branch: `steven/manual-capture-working-checkpoint` at `ba14127f`.

Deployed staging hosting build:
`5.2.0+ba14127f756c.340d783fc235d491.staging`.
This was built from an isolated deployment snapshot, not the current source tree.
Its fingerprint matters: do not infer all current source code is deployed just
because the version begins with 5.2.0.

The last staging update included facade trim orientation, wall-height alignment
and the approved-exterior listing handler. Your saved four-wall contribution
remains approved. New manual-first UI, placed-edit recovery, reconstruction
request restrictions, public-interior approval guards and admin refresh feedback
remain local. A coordinated hosting/backend update and focused acceptance are
needed before those can be tested on your phone. Do not start a reconstruction
job from the older staging UI just to test manual editing.

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
- Forty-three focused geometry, authority and HTTP-security checks passed in
  the preceding implementation pass.
- Manual-editor browser checks covered desktop and touch-sized layouts,
  placement/cropping, save, reopen and device recovery using controlled services.
- The staging neighborhood reloaded with the recorded build. The exact corrected
  house top edge was not visually re-accepted in that pass.

These checks do not prove the undeployed changes work against staging, do not
replace private-room end-to-end tests, and are not a new whole-app release gate.
No paid reconstruction is required for this replay.
