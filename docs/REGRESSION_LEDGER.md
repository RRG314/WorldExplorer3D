# Regression Ledger

This is the durable record of visual and loading regressions already encountered in World Explorer 3D. Read it before changing terrain, water, sky, location loading, or asset publication. Add a dated entry whenever a regression is found and resolved.

Each resolved issue records the symptom, root cause, durable resolution, verification, and the shortcut that must not be reintroduced.

## 2026-08-07 — Mapped water ends at the detailed-city boundary

- Status: resolved in the 4.1.3 release candidate; production reference was 4.1.2 at commit `f7d04023138d5c1ca7e4a30a6597bfa880ba900d`.
- Symptom: Baltimore harbor and similar mapped water appeared near the city, then disappeared beneath distant land at the fixed detailed-area boundary.
- Root cause: the 4.1.3 far field extended land and buildings to the horizon, but its mapped context loaded only land, sites, and buildings. The authoritative near-water pipeline still loaded only the selected city's detailed bounds.
- Resolution: load low-detail Shortbread `ocean` and `water_polygons` for the entire fixed 22 km far field, simplify only sub-grid shoreline detail, and triangulate the mapped polygons (including visible holes) into a separate horizon-water mesh above the coarse terrain. Water bodies smaller than 200 m are intentionally left to the detailed pipeline because they are below the 320 m horizon grid's useful resolution. Near water remains the higher-detail visible owner at the city center.
- Guard: `npm run test:phase5-aerial-transition`; inspect Baltimore and London from drone altitude in Chrome.
- Never reintroduce: a rectangular blue plane, water inferred from low elevation, terrain vertex colors used as a water substitute, or continuous movement-based streaming.
- Global semantic note: Shortbread stores glaciers in `water_polygons`; the far-water parser must exclude `kind=glacier` so snow/rock terrain remains the visual owner.

## 2026-08-07 — Previous city visible during location transition

- Status: resolved in the 4.1.3 release candidate.
- Symptom: while another city loaded, the prior rendered city showed behind the transition content instead of the normal loading image.
- Root cause: JavaScript assigned the CSS `background` shorthand. That reset the loading screen's black `background-color` to transparent while a fresh Chrome session downloaded or decoded the image.
- Resolution: retain an explicit opaque black background and set `backgroundImage`, `backgroundPosition`, `backgroundSize`, and `backgroundRepeat` individually.
- Guard: `npm run test:loading-transition`, `npm run test:loading-transition-browser`; test a second location with browser cache disabled.
- Never reintroduce: a `loading.style.background = ...` shorthand for the full-screen transition.

## 2026-08-07 — Open-ocean destination renders green ground or a fake shoreline

- Status: resolved in the 4.1.3 release candidate.
- Symptom: a selected Atlantic location showed the green loading ground beneath the boat and reported a precise distance to a shoreline that did not exist.
- Root cause: open-ocean loads deliberately publish no land terrain, but the green bootstrap plane could retire only after a land terrain tile became ready. Separately, clipped vector-ocean tile edges were treated as real coastline boundaries.
- Resolution: suppress the bootstrap plane when the accepted-ground activation selects `open-ocean-surface-only`; use one fixed open-ocean surface extending to the horizon; and mark ocean-polygon edge distances as unknown so the HUD does not present them as shoreline measurements.
- Guard: `node scripts/test-accepted-ground-activation.mjs`; run `atlantic_ocean_custom` through the world matrix and verify zero active land terrain, open-ocean water to the horizon, and no “to shore” subtitle.
- Never reintroduce: fabricated land beneath an ocean-only load, a rectangular city water plane, or coastline claims derived from vector-tile clipping edges.

## 2026-08-07 — Published world keeps the previous location name

- Status: resolved in the 4.1.3 release candidate.
- Symptom: coordinates and geometry changed to a new world location while the HUD or mutable custom selection retained Baltimore/the prior city.
- Root cause: a delayed title/session restoration could mutate the selected location while an already-started world load was completing; reverse-geocoded labels were also accepted without checking their coordinates.
- Resolution: each load captures its requested selection and restores that exact selection before becoming ready. Weather place labels are accepted only when their coordinates match the loaded origin.
- Guard: the world matrix records `locationPresentation`; test a city → ocean → lake sequence and require the selection, origin, resolved HUD label, and rendered geometry to agree at every stop.
- Never reintroduce: using a mutable title-screen selection or an unmatched reverse-geocode result as the identity of an already-published world.

## 2026-08-07 — Custom city arrival is trapped by a steep or enclosed road segment

- Status: resolved in the 4.1.3 release candidate.
- Symptom: a custom city could load successfully but place the walker against a terrain/building wall or on a severe road ramp.
- Root cause: arrival scoring validated the immediate spawn point but did not evaluate whether the mapped road remained usable beyond that point.
- Resolution: mapped spawn candidates sample both directions along a 40 m terrain corridor, choose the lower-change heading, and penalize severe corridor elevation changes while remaining within 160 m of the selected coordinate.
- Guard: `npm run test:phase5-production`; visually inspect a custom Sydney ground arrival and its drone context.
- Never reintroduce: city-name exceptions, camera-only flips, or accepting a spawn solely because the exact point is collision-free.

## 2026-08-06 — False blue square or water moat around a city

- Status: resolved; architectural constraint remains active.
- Symptom: a blue square surrounded Baltimore, London, and other locations even where no water was mapped.
- Root cause: coarse far terrain was classified as water using an elevation threshold and/or a tile-sized water owner, turning rectangular coverage bounds into visible water.
- Resolution: only mapped polygon/ribbon sources may publish water. Elevation can position a mapped water surface or its bed, but cannot decide whether water exists.
- Guard: aerial-transition contract rejects elevation-as-water classification; visual checks use inland and coastal cities.
- Never reintroduce: `sourceMeters <= 0.75` or any equivalent elevation-only water test.

## 2026-08-06 — Blank world and stars visible through the ground

- Status: resolved.
- Symptom: terrain and buildings stopped in a square, leaving empty sky below the horizon.
- Root cause: removal of the erroneous water owner also removed the only coarse background surface.
- Resolution: a fixed-location terrain clipmap extends beyond the camera far plane. It is loaded once per selected location, not continuously while moving.
- Guard: far-field outer-distance and sky-behind-ground contracts plus drone-altitude screenshot review.
- Never reintroduce: hiding stars that should be astronomically visible; the ground must occlude them through correct geometry and depth ordering.

## 2026-08-06 — Stripes or seams on distant ground

- Status: resolved.
- Symptom: alternating ground stripes appeared near the transition between detailed and coarse terrain.
- Root cause: overlapping coplanar detailed and far meshes caused depth fighting.
- Resolution: the far-field grid includes exact detailed-tile edges and excludes only cells with complete detailed terrain coverage.
- Guard: `cellInsideDetailedCoverage` and exact seam-axis assertions in `test:phase5-aerial-transition`.
- Never reintroduce: broad polygon offset as a substitute for non-overlapping ownership.

## 2026-08-06 — Disabled features still add initial loading work

- Status: resolved; performance constraint remains active.
- Symptom: location loading performed work for disabled sidewalks/footpaths or built temporary results that were discarded.
- Root cause: publication policy and fetch/build policy were not consistently coupled.
- Resolution: disabled visual categories must be excluded before network fetch and compilation, and each accepted dataset must have one publication owner.
- Guard: initial-play workload and publication-ownership contracts; compare phase timings in the world-matrix report.
- Never reintroduce: fetch/build/discard pipelines for a feature disabled by product policy.

## Verification rule

A code-only pass is not enough for terrain, water, sky, or transitions. Before release:

1. Serve the canonical app through HTTP, never by opening a raw file.
2. Open a fresh Chrome tab with a unique candidate query so module caches cannot serve an earlier build.
3. Test at least one coastal city and one inland city at ground and drone altitude.
4. Change locations once in the same session and confirm the old city never appears through the loading screen.
5. Record screenshots, runtime state, and the exact commit tested.
6. Include an ocean-only location, a mountainous location, and a city outside North America; confirm that glaciers are terrain, open ocean has no land placeholder, and location labels follow the published origin.
