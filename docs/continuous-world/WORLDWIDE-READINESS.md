# Worldwide streaming readiness

October 6, 2026. Working source on `steven/visual-quality`. **Continuous worldwide travel is not enabled.** The current app still has a fixed geographic source window. This document records inspected implementation boundaries and concrete acceptance gates, not completed features inferred from old phase notes.

## Feasibility and scope

A browser can render a bounded moving portion of a much larger geographic world. The [OGC 3D Tiles standard](https://www.ogc.org/standards/3DTiles/) provides established precedent for spatial hierarchy and large geospatial rendering. It does not supply this game's collisions, persistent activities, transport or multiplayer semantics. The recommended path retains the existing renderer and working game systems while changing their geographic ownership incrementally; importing another globe renderer alone would not complete the game.

Free source data remains a requirement. Free data does not imply an unlimited production tile service. The current [OSMF vector policy](https://operations.osmfoundation.org/policies/vector/) permits external uses, requires attribution and cache compliance, prohibits bulk advance downloading, and provides no availability guarantee. Keep provider configuration replaceable, respect cooldowns and ordinary browser HTTP caching, and admit only the active visible window. Any future travel-ahead fetching or packaged geographic data must use a source whose terms permit it. No new paid subscription, proxy scraping, globe download or cloud infrastructure is introduced here. Both sources checked October 6.

## Inspected blockers

| Boundary | Current code and consequence | Required completion evidence |
| --- | --- | --- |
| Fixed source geography | `world/fixed-regional-context.js` and `terrain/far-field.js` center mapped scenery on the initial location. Moving road geometry only consumes this existing catalog. | An outward journey actually requests new source cells and a return retires/reconstructs them. |
| Detailed ground | `terrain/location-world.js` publishes a fixed seven-by-seven district. Far geometry chooses holes from those published tiles. | Detailed/far ground ownership and physical sampling move together, without holes or overlapping surfaces. |
| Publication lifetime | Far terrain used to enter the scene before instance building construction finished; early dependency rejection could orphan late worker packets. Reset also discarded the drain barrier. | **Repaired here:** staged construction, serial cancellation drain, complete region handoff, retry after failure, explicit water registration/retirement. Controlled real-renderer acceptance described below. |
| GPU coordinate precision | Regional instances previously uploaded absolute world coordinates to Float32 matrices. | **Repaired for regional instances here:** 2,048-unit cells hold local matrices; each cell's Object3D carries the offset. Near/exact meshes, physics and other scene owners still need compatible framing. |
| Source addressing | Far bounds take longitude min/max; Shortbread range enumeration and regional bounds assume an ordinary non-wrapped rectangle. Detailed tile neighbors can exceed XYZ limits. WorldCover/other provider windows also assume non-wrapped rectangles. | One geographic-window authority, separate antimeridian source rectangles, canonical tile keys, explicit polar coverage, and no accidental globe-wide request. Must cover every participating provider/consumer together. |
| Active coordinate frame | `earth-core/coordinate-frame.js` centralizes conversion, but `LOC` remains the scene origin. Wrapped conversion is not rebasing; a large equirectangular scene is not a globe. | Atomic presentation/physics rebase with stable geographic positions, headings, velocities and camera history. Polar entry/exit and dateline traversal use the same authority. |
| Persistence and rooms | `earth-session.js` captures local x/z poses associated with a selected location. Other shared/persistent systems must retain their own identity and authority. | Versioned geographic anchors and backward-compatible save/room migration, preserving original and unknown fields. Save, fallback build, current build and shared peers agree on the same location. |
| Global collections | `world/load-roads.js`, building/collision/entrance registration and `world/load-reset.js` own a whole location. Reset tears down activities and gameplay as well as scenery. | Cell-specific ownership and retirement for render, collision, contacts, POIs, vegetation and indices. Movement must never call the full location reset. |
| Resource peak | Source caches have ceilings, but a whole regional replacement still temporarily holds a published region plus a draft. | Shared byte budgets for residents, staging, worker packets and source cache; small cell changes instead of repeatedly rebuilding a 14 km district. Long-route memory plateaus. |

## Implemented in this change

`earth-core/region-build.js` owns construction resources and drains all launched dependencies, including late results after failure/cancellation. Ownership transfers explicitly to the live publication. Unpublished buffers, geometry, materials, road masks and water masks retire in a `finally` path. Cleanup continues through an individual disposer failure.

`terrain/far-field.js` prepares terrain, instance batches and water off-scene. The previous region remains published during cooperative compilation. The final scene/sampling/road/water handoff has no asynchronous yield. Cancelling a generation or resetting it preserves a drain barrier; a newer generation cannot overlap its still-finishing provider/compiler work. Obsolete queued generations are skipped. Failed keys can be requested again. Shared water animation registration now follows publication, and retired water materials leave the registry. Detailed meshes retain only the published land lookup, not the full compilation context.

`terrain/far-building-instance-batches.js` uploads positions relative to each spatial cell. Spatial culling bounds and picking still describe the same buildings and source IDs. Component tests check positive and negative offsets of tens of millions of world units with horizontal errors below 0.00013 units. This checks regional instance storage and picking; it does not claim that actors, the complete renderer or Earth physics already operate at global offsets.

The real WebGL fixture also exposed a regional facade shader that assumed `worldPosition` always existed in Three r128. It now computes its own instanced world position and works in an unshadowed scene. No building selection quota or source coverage target was reduced.

## Finite remaining acceptance gates

### Preserve the location-based game and make travel optional

Owner requirement, October 6: continuous travel must be an optional mode, never
a replacement for the existing location-based game. The current candidate has
no completed worldwide scheduler and therefore continues to use location-based
travel. There is no working continuous-world toggle in this candidate.

The four gates below must include these mode-isolation requirements:

- Existing installations and new players start in location-based mode. Presets,
  custom coordinates, favorites, existing geography, activities and saves remain.
- A working settings choice may enable continuous travel only after the complete
  moving-world journey is accepted. Changing graphics quality or opening a saved
  location must never silently enable it.
- Changing the choice uses the session authority: preserve the location-based
  selection and pose, drain the departing mode's work, and publish the destination
  only when its ground and collision state are ready. Failed transitions leave
  the prior playable mode and its saved records intact.
- Continuous geographic anchors use a separate, versioned record. Preserve legacy
  records and unknown fields; switching off restores the location session without
  deleting a continuous journey, Journal, inventory, property or authored edits.
- A shared room declares the supported travel mode. A local preference cannot
  reinterpret another player's coordinates or alter server-owned progress.
- Acceptance includes off → on → off, reload in both modes, failed enable,
  cancellation, fallback-build save roundtrips and repeated switches with bounded
  memory. A checkbox without those behaviors is not completion.

### Implementation and acceptance

1. **Geographic source windows and cell ownership.** Implement canonical wrapped/polar cell addresses and all source adapters; extract terrain/building/road/collision/land-cover publications into independently owned cells used by the existing initial load. Preserve source feature IDs and overlaps across tiles. Enforce combined resident/staging byte and request budgets, deterministic retirement, retry and source completeness. Accept only after boundary fixtures, real-provider samples and repeated cell replacement/return pass. The region transaction completed here is one prerequisite, not this whole gate.
2. **Geographic player and persistent authority.** Add versioned geographic anchors; migrate legacy location-relative records without replacing unknown fields; stage physics/render origin changes atomically. Account for actors, cameras, boats/planes, interiors, authored edits, saved activities and shared-room validation. Accept round trips through old/new saves and peers, reversals, large-distance moves and polar/dateline boundaries before using this during gameplay.
3. **Integrated moving residency.** Connect observer movement to the shared cell scheduler. Keep a complete published local ground/collision set while new cells load; replace only the delta and retain a small bounded overlap. Loading failures must not publish fictitious ground, drop the player through the world or erase their session. Remove the fixed traversal boundary only when this journey is accepted. Require at least 90% of valid received nearby footprints and every source-identified major; report missing source tiles separately. Reduce distant detail or visible extent under pressure rather than silently deleting nearby coverage.
4. **Worldwide journey acceptance.** Run urban-to-rural, coast/water, outward-return, rapid reversal, landing, provider delay/outage/recovery, dateline and polar tests. Include long-route CPU/GPU/source/worker plateaus, scene exit, save/reload and shared-session agreement. Repeat on desktop and actual mobile devices before a production claim. Source absence, inferred height, unavailable GIS and unsupported polar data stay explicit.

These gates replace an open-ended count of visual/content phases for this focus. Broader GIS/ecology improvements and London flight hitches remain separate recorded work. Production remains unchanged. The existing test-preview channel now serves the location-preservation artifact 86fdc6e3; this does not enable global streaming.

## Latest preservation evidence

October 6, runtime **86fdc6e3**: location-based play remains the only implemented mode. Fixed graphics-driven authoritative district shrink, connected road retry to the session owner, and retired private building construction scratch without changing adopted geometry. Full PR passes **2,009 contracts** and supporting checks. Five actual loads retain downtown Baltimore's **49,023 buildings / 18,758 roads** through reduced graphics quality, a Hollywood visit and return; saved favorites remain. The packaged **current → 37a12d11 fallback → current** save/read/write journey passes all three stages, preserving original/new records and unrelated data. Three prescribed driving bursts, packaged-world preflight and artifact checks pass. [Test guide](TEST-BUILD.md) and [current evidence](../../CURRENT-STATE.md) identify the exact artifact and receipts.

The preceding 044dd362 long performance run completed all seven sustained windows and twelve reloads. Retention/cleanup passed, but walking/driving reached **533 / 650 ms** stalls. Final source fixes that run's independent reload-coverage regression; it does not fix or supersede its performance failure. A separate short flight pass is insufficient release acceptance. The full current release matrix and required external acceptance remain open. No worldwide toggle has been added or accepted.

## Earlier regional-publication evidence

- Component tests: `tests/region-build-current.test.mjs`; `tests/far-building-instance-batches-current.test.mjs`. Failure/drain, parent cancellation, late ownership, transfer, cleanup failure, pre-abort, culling, picking, cancellation, packed storage and large-coordinate precision.
- Actual regional publisher with controlled source inputs: `tests/fixtures/region-publication.html`, run through the installed develop-web-game Playwright client. Not a real geographic movement or provider test. Initial shader failure is retained in `output/verification/continuous-world/region-publication-initial/`; corrected render and stable-residency evidence in subsequent uniquely named directories. Final run `region-publication-final/` passes four replacements, failure, same-window retry, late-source cancellation, cancellation during instance construction, rapid request supersession and exit. All 1,536 buildings and 5 road lines remain; 60 observations verify staging is off-scene. CPU geometry/material ownership and GPU textures stay bounded, then return to the shared-resource baseline. No error files; latest image inspected.
- Full PR: **2,004 tests and all supporting gates pass**. Local immutable artifact `5.4.0+c2acc7a3c2a2.e6911e31f7a7ab25.staging` verifies 610 files.
- Actual-city packaged regression: `worldwide-c2-baltimore/` preserves 98.9% nearby / 95% regional coverage, all majors and source tiles, and clean exit at 43.97 MB. Its 90-second flight **fails** with a 133.4/183.2 ms cluster. This remains a test checkpoint. The separate `worldwide-c2-game-client/` prescribed drive/turn/idle run passes three bursts without errors; images inspected. At that checkpoint production/preview/GitHub were unchanged; the later staging update is identified above.
