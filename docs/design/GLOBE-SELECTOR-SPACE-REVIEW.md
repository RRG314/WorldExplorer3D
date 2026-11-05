# Globe selector space and control placement

November 5 correction to the actual application. The owner identified a globe clipped above a floating text/credit area and asked for lower world buttons and a more conventional arrangement. GitHub publication and production deployment remain prohibited.

## Findings and implementation

At 1280×508, the previous renderer occupied only170px inside a244px frame. A legacy72px canvas subtraction and a separate destination row reserved the same space twice. The zoomed image ended above unused space; moving the text alone would not repair that geometry.

One native map container now owns a full-size viewport and a separate footer. The original renderer, projection, zoom range, picking, selected point, Map/Satellite provider, world-button handlers and lifecycle remain unchanged. The footer adapts to the existing desktop and compact grids. Obsolete canvas-height/padding reservations and inherited footer flex sizing were removed.

| Element | Placement and purpose |
| --- | --- |
| Globe | Fills its complete visible frame; no reserved blank band |
| Map/Satellite and +/− | Existing corner controls; direct manipulation stays available |
| Gesture instructions | Existing Quick Start and the canvas's accessible description; no floating instruction pill |
| Attribution and scale | Plain adjacent footer text, with original dynamic credit/link updates |
| Earth/Moon/Mars/Space/Ocean | Dedicated lower row, consistent round imagery and original accessible names; minimum44px hit targets |
| Home and Explore | Paired secondary/primary actions on compact screens, so Explore remains visible at normal text size |

Esri's [copyright guidance](https://doc.arcgis.com/en/arcgis-online/reference/display-copyrights.htm) permits credits on or near the map, supporting the adjacent plain-text treatment. NN/G's [contextual-help research](https://www.nngroup.com/articles/onboarding-tutorials/) supports keeping detailed help available in context instead of continuously covering the work area. This is a focused selector review, not a repeated whole-application redesign or research campaign.

## Verification scope

Actual application browser checks cover1440×960 and1280×508 desktop;390×844 and844×390 native-touch emulation at100%/200% text; default and zoomed views; positive point selection in the revised canvas; visible normal-size compact Explore actions; Map/Satellite credits and unchanged selection; accessible gesture help; footer/control bounds and hit targets. Screenshots were opened and reviewed. Existing780 static DOM IDs are preserved, with one new unique description ID. Source and214-field ownership gates pass.

The first touch driver targeted a desktop header action hidden by the native mobile menu. Its failed evidence is retained; the visible native action was used for the corrected checks. The generic skill client invoked the real zoom action but captured the inactive main canvas, yielding a black image. That image is invalid visual evidence; native full-page captures provide the accepted selector images. No renderer or App Check change was made to accommodate automation.

Existing career, race, save, travel, world-launch and live-search acceptance remains closed. No methods, laps, account operations, data migrations or new provider configurations are part of this correction. The isolated staging artifact/hosted receipt is recorded in the local `output/verification/globe-selector-layout-20261105/` ledger. The prior staging artifact and all rollback builds remain preserved.

## Staging result

The existing [staging preview](https://we3d-staging-20260712--trail-20261104-78mwznd9.web.app/app/) is updated to `5.6.1+7b53b2bd7d8c.6672d431963a3ef2.staging`. Its1,229-file isolated artifact verifies, and468 hosted current runtime/page/style/bootstrap files match it byte for byte. Exact hosted1280×508 and390×844 selector checks pass, including zoom, revised canvas bounds and point selection; screenshots were opened. At1280×508, the canvas is now260px tall and destination buttons are36px lower. GitHub and production remain unchanged. Previous full-application acceptance is reused; this is a bounded selector correction.
