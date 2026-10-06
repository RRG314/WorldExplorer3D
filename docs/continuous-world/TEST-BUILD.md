# October 6 location-preservation test build

[Open the test preview](https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app/app/?launch=earth&gm=free&loc=custom&lat=39.3098&lon=-76.6147&lname=Baltimore&mode=driving). Choose **Explore** to enter. The HUD version includes **86fdc6e**. The preview expires October 13, 2026. Production remains unchanged.

This build keeps the existing location-based game. It fixes buildings disappearing after graphics quality adjusts and connects the road retry action. **Worldwide travel and its on/off control are not implemented yet.** The existing geographic travel boundary remains.

## What to check

1. Start in Baltimore and save it as a favorite. Drive several blocks, open the map, pan/zoom/recenter, then close the map and continue. Check that streets and buildings remain visible in both daylight and night.
2. Return to the main menu, reopen the same location and check that its buildings remain. Quality adaptation should change presentation detail without shrinking the district. Your favorite should still be available.
3. Switch to another city, then return to Baltimore. Existing presets and custom coordinates remain available. The automated test covers Baltimore → Hollywood → Baltimore and a reload after lower graphics quality.
4. Switch to aircraft using Travel, fly within the loaded region and return. Compare ground detail and surrounding building coverage. The existing region is finite; this is not an unrestricted worldwide flight test.
5. If the app reports that roads failed to load, use **Retry roads**. The action should retry the same location through the session owner and should not start duplicate loads while pending.

## Verified on this artifact

- **2,009 game contracts** and dependency/source/ownership/type/inventory/sensitivity checks pass.
- Five actual location loads pass all preservation checks. Four downtown Baltimore visits each retain **49,023 buildings / 18,758 roads**, including after graphics quality decreases. Hollywood retains 34,999 / 18,832. Favorites, live frames, healthy renderer, resource loading and held-key isolation pass.
- Packaged save → retained fallback build → current build passes all three stages. Original/new Journal records, equipment/ammo changes, unknown fields and unrelated pending account data survive in disposable test storage.
- Three prescribed drive/turn/idle bursts pass without error files. At this guide's starting coordinate, Baltimore retains **48,294/48,834 nearby buildings (98.9%)** and **95% regional** source-building coverage. This differs from the downtown preservation test's coordinate.
- Packaged-world readiness and immutable artifact verification pass. Hosted build and asset manifests match local bytes. A normal browser without debug attestation entered gameplay with no captured console errors.

## Still blocking production

The completed long performance run on immediately preceding source 044dd362 passed cleanup/retention but reproduced **533 ms walking and 650 ms driving pauses**, plus some failed FPS budgets. It also exposed the reload coverage bug now fixed. The final city check verifies that repair; it does not establish that stalls are fixed. A separate clean 90-second flight passed (maximum 66.7 ms, no frames over 100 ms), so short smooth flights alone are insufficient release evidence.

The complete current 91-gate candidate matrix and 3 backend groups have not passed for this artifact. Ordinary hosted sign-in/shared/save recovery, named physical iOS/Android devices and uncoached fresh-player acceptance remain outstanding. Phone-viewport tests do not substitute for actual mobile hardware.

Continuous source/terrain/building/road handoff, safe geographic save and frame transitions, broad public GIS expansion and convincing distant ecology remain unfinished. Continuous travel must eventually be optional and must preserve the location session when turned off; this preview contains no working worldwide toggle. See [remaining acceptance gates](WORLDWIDE-READINESS.md).

Coverage percentages describe valid buildings received from providers, not an independent survey of every real building. Source-identified major footprints do not establish correct heights/identities for every landmark. Visible regional road linework does not certify every bridge or physical route.

Build: `5.4.0+86fdc6e3e6a2.febba16c0a5e3daa.staging`. Source history, prior artifacts, four saved candidates and existing player data are preserved. No GitHub push or production promotion was performed.
