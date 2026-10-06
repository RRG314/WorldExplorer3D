# October 6 test build

[Open the test preview](https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app/app/?launch=earth&gm=free&loc=custom&lat=39.3098&lon=-76.6147&lname=Baltimore&mode=driving). Choose **Explore** to enter. The HUD version ends in **abb8e8a**. The preview expires October 13, 2026; production has not changed.

The subsequent worldwide-readiness artifact c2acc7a3 is **local only** and is not at this link. It passes regional ownership/precision, coverage and driving checks but fails its 90-second flight stall check. See [current readiness and remaining gates](WORLDWIDE-READINESS.md) and [results](RESULT.md).

## What to check

1. Start in Baltimore, drive several blocks, then switch to aircraft through Travel. Buildings and roads should remain across the surrounding region as you climb. Use the time control to compare daylight and night.
2. Open the map. Pan, zoom and recenter. Under Map layers → Places, turn Restaurants & Cafes off and on; other enabled categories should remain visible. Close the map and continue driving.
3. Travel within the loaded region, turn back and return to a previously visited road. Nearby road detail should return with the same ground contact. The automated controlled-return check covers this within the existing region.
4. Return to the main menu and choose another location. London is useful for comparing a denser city. It retains 91.5% nearby and 95% regional source-building coverage, but the latest 90-second test still catches a short late pause.

## Known boundaries

This is a restored-coverage and resource-ownership checkpoint, **not the completed worldwide sandbox**. The existing geographic travel boundary remains. Worldwide terrain/building/road handoff, safe coordinate and saved-position transitions, expanded public GIS and convincing distant forest/national-park scenery are unfinished.

Coverage figures describe valid buildings received from the providers, not an independent survey of every real building. All source-identified major footprints were retained in the two measured cities; correct heights/identities for every real-world landmark are not certified. Regional road linework is visible; this does not certify every bridge or route's physical geometry.

## Verified before publication

- Full game-logic regression: 1,997 contracts and supporting checks pass.
- Packaged-world readiness, controls and resources check passes.
- Nearby/regional coverage: Baltimore 98.9% / 95%; London 91.5% / 95%.
- Clean Baltimore 90-second flight: 46.35 FPS, maximum frame 66.6 ms, no frames over 100 ms. London remains a performance failure (216.6/400.1 ms cluster).
- Mapped-road retirement/return, worker failure/cancellation/fallback, source deadlines and resource disposal tested.
- Desktop and phone-viewport map pan/zoom/recenter/close, input isolation, search-label accessibility and control layout pass. These are not physical-device acceptance.
- Hosted build and asset manifests byte-match the local immutable artifact. A normal browser loads Baltimore and live weather without debug attestation; no error-console entries. Exact Overpass transport was unavailable and used the existing generalized fallback. The separate automated hosted attempt received authorization errors and is not recorded as passing.

Build: `5.4.0+abb8e8a9274a.0218ea3cefb3aa7c.staging`. All prior artifacts, source history, four saved candidates and existing player data are preserved.
