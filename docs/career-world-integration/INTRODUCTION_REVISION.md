# Player-first landing and introduction

November 5 owner correction: the review’s exposed model/onboarding/layout selectors felt like options spread across the screen. The requested flow is an actual introduction with gender, career and starting-car choices, and a landing page that represents more of the app. This supersedes the earlier universal-introduction-first preview emphasis. It is a concrete revision of the review prototype, not approval of a new persistent career architecture or economy.

## Revised entry

The first screen now has one primary **Start your journey** action, immediate free exploration, familiar globe/world access, career discovery, racing/fieldwork/ocean/space sections, Create/Together, Journal/returning-player entry and the existing account center link. Comparison settings and original native contract tools remain available in a collapsed section below the app. They no longer occupy the top of the player’s entry screen.

Four steps:

1. **Your Explorer:** optional name, Man/Woman using the two existing game character models. Appearance does not restrict career access.
2. **Your direction:** the actual twenty-career catalog, family filters, clear selected assignment and a deliberate Free Explorer choice. Career detail pages can start this introduction with that interest preselected.
3. **Your first car:** original BMW 525i E34, BMW M3 E46, Porsche 911 Carrera 4S and Datsun 280Z assets. The included default BMW and existing Garage prices are shown accurately. Choosing a paid car in this design preview neither purchases nor grants it; starter allocation/economy changes still require their original authority and later product decision.
4. **Your departure:** named Explorer, gender, career and vehicle recap with individual Edit actions and a first-task briefing. Begin carries all choices into the next preview screen. Back, Home and free exploration remain available.

Controls are followed by doing the actual first task after entry; the pre-world sequence itself does not award progression. Marine and space interests show their relevant departure context; the selected Earth car remains part of the intended shared collection, not an underwater/space mode. Existing players keep their original saves and can use Continue rather than creation.

## Implementation boundary

`intro-sequence.js` owns only disposable review state and rendering. It imports the original gender constants/character asset map, career display catalog and personal-vehicle definitions. It never writes character preferences, a profile, Garage, wallet or inventory. Native game owners remain unchanged.

`intro-model-view.js` uses the original model lease loader and the original `prepareE34Model` to select the single closed starter car from its multi-variant source. It serializes asset changes, releases stale late loads, retains one on-demand renderer, redraws only on input/resize/load and disposes listeners/observer/renderer/model leases on exit. No new game frame loop, renderer or progression owner is added to the deployed app. Original licensing credits remain visible.

## Evidence and finite stop

`scripts/research/career-introduction-check.mjs` exercises the new landing and four-step sequence through normal browser controls and native touch, including every starting asset, gender switch, family filter, Back/Edit, name/car preservation, Begin, career-detail entry, free exploration and original model lease release. It checks that localStorage is unchanged. The initial functional report passes with no page/console errors; image review separately invalidated the multi-car default BMW and pale showroom presentation. Those images are retained, and only that presentation boundary is rechecked after the correction.

The stopping point for this revision is: updated preview works, affected images inspected, source/helper checks pass, review docs and draft PR142 updated. It does not start the major application migration or deploy to staging/production. The original32-document packet and accepted real gameplay remain available; no full course/lap/provider investigation is restarted.

Final mobile layout keeps the step content in its own scroll area and Back/Next in a separate row. Selection rerenders preserve the scroll position, so changing a car does not throw the player back to the top. Free Explorer is first in the unfiltered career list. Keyboard focus moves to the new step; Reset clears only the preview choices. The verification receipt retains the initial presentation failures, one offscreen hit-test driver failure, the cleared-buffer screenshot limitation and the corrected synchronous resource-check boundary.
