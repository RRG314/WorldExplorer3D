# Street architecture audit and repair sequence

The current street system is not ready for acceptance. The latest Monaco screenshot remains a rejected result. This audit examines the source-to-surface pipeline and includes a numerical counterexample executed against the current implementation. It does not claim to reproduce the owner's exact Monaco camera or to complete a full application audit.

## What went wrong in the repair process

Changes were made to local frontage, terrain blending, mesh conformance and rendering before resolving who owns the final street surface. Tests then confirmed local consistency rather than physical correctness. The app was handed back without a post-change driving route. The resulting passing checks did not justify visual acceptance. Further threshold changes would repeat this mistake.

## Current flow and ownership

| Stage | Current implementation | Output and dependency |
| --- | --- | --- |
| Source and coordinates | `load-road-pass.js`, `transport-source-normalizer.js`, `config.js` | Geographic centerlines become world coordinates; source tags become cross-sections and structure semantics. |
| Road profiles | `structure-aware.js`, `transport-surface-model.js`, `transport-surface-profile.js` | Terrain-fit longitudinal profiles, graph tie-ins and structure constraints. |
| Ground modification | `terrain/height-sampling.js`, `street-frontage-grading.js` | Overlapping road profiles and facade extents modify terrain. |
| Road rendering | `terrain/rebuild.js` | At-grade rendering replaces the profile sample with the final terrain sample. Structures retain separate profiles. |
| Pavement footprints | `compiler/street-pavement.js` | Sidewalk areas are unioned and clipped against carriageways, buildings and selected land uses. |
| Pavement elevation | `pavement-height-sampler.js`, `pavement-terrain-conformance.js` | Pavement follows modified terrain, with nearby road clearance; adaptive subdivision approximates that sampler. |
| Distant pavement | `street-overview.js`, `pavement-terrain-mask.js` | The compiler's footprint becomes a terrain material mask. |
| Movement | `ground.js`, road/pavement contact indexes | Movement can agree with rendered triangles without those triangles being well graded. |
| Publication | `load-support.js`, `terrain/rebuild.js`, `street-pavement-runtime.js` | Terrain, transport and pavement publish in sequence; this is not one jointly solved street surface. |

## Defects reproduced at the start of the audit

### 1. Neighboring frontage grading can overwrite a carriageway

`street-frontage-grading.js` searches building edges. `street-frontage-geometry.js` checks facade obstruction by another facade, but does not stop at an intervening carriageway. The terrain stage treats the resulting frontage extent as a full-strength road grading area.

`height-sampling.js` averages all overlapping at-grade targets using shoulder weights. It does not give a road's own carriageway priority over another road's frontage. It also does not require a shared graph junction before combining their elevations.

Executed counterexample: two disjoint parallel four-unit carriageways, six units apart, with constant engineered heights of 2 and 6. Attached facades beyond the first road allow the second frontage search to cross it. The lower road renders at height 4, including its centerline. Its engineered height is 2.

Evidence: `audit-2026-09-13/road-authority-counterexample.json`. Reproduce with `node scripts/verification/street-authority-audit.mjs`. This is a small numerical investigation using actual production functions, not a city visual test.

### 2. Road conformance cannot establish road quality

`createCompiledRoadSurfaceSampler` in `terrain/rebuild.js` makes at-grade road rendering consume final terrain. The conformance audit compares the resulting vertices back to that same terrain. In the counterexample it reports zero issues and the expected 0.18 clearance while the road has moved two units away from its engineered profile.

This is a consistency check with a correlated reference. It is useful for detecting separation, but cannot detect a terrain-induced hump or an incorrect joint road grade. A separate profile-preservation and slope/curvature check is required.

### 3. Pavement clipping and terrain grading use different boundaries

The footprint compiler subtracts carriageways and land-use/building obstacles after generating frontage areas. Terrain frontage grading does not consume those clipped polygons. Thus an area can be excluded from visible pavement but still influence another street's ground elevation. Sharing facade rules did not fix this boundary mismatch.

### 4. Physical units remain inconsistent upstream

`load-road-pass.js` assigns `transportRecord.crossSection.widthMeters` directly to renderer `roadFeature.width`. The source normalizer parses physical metres; the normal geographic projection uses approximately 1.11 metres per world unit. Pavement widths are divided by that scale in the compiler, while the road width path is not converted at this boundary.

The previous policy consolidation preserved an existing renderer-coordinate convention, but did not establish physically consistent input conversion. Correcting this requires tracing all consumers of cross-section widths, placement, profile distances and structure clearance; changing one width field alone risks double conversion elsewhere. No unit conversion patch was made during this audit.

### 5. Refinement accuracy is not street design

Pavement refinement tests triangle error against its height sampler. Even exact conformance can reproduce a bad height function. The refinement routine also stops at its depth/edge limit without making that limit a proof of acceptable residual error. Neither triangle counts nor a refinement multiplier establishes acceptable sidewalk crossfall or continuity.

## Replacement contract

The repair must establish an accepted street surface before either ground or visible geometry is generated.

1. **Normalize at the source boundary.** Keep source metres and renderer units explicitly separate. Convert widths and placement once; retain source values for provenance. Verify equivalent geometry at different world scales before migrating all consumers.
2. **Resolve horizontal ownership.** Produce carriageway, actual connected junction and clipped pavement regions with their source ownership. Frontage must stop at intervening streets and excluded areas. Unknown land is not automatically a plaza.
3. **Resolve vertical constraints within those regions.** Preserve the accepted road profile on its own carriageway. Only connected junctions may reconcile incident road profiles. Solve sidewalk curb edges from their adjacent street and frontage edges from feasible constraints. An impossible hillside transition needs an explicit unresolved condition or designed retaining/stepped treatment, not unrestricted averaging.
4. **Make terrain a consumer.** Terrain grading follows accepted region heights and blends outside those regions. A neighbor's shoulder cannot move an owned carriageway. Bridge/tunnel ownership remains separate.
5. **Publish matching geometry and contact.** Road meshes, pavement meshes, junctions, terrain transitions and contact indexes use the same accepted region solution and revision. Near/far representations preserve the same footprint. Rebuild work is invalidated coherently.
6. **Reject bad solutions independently.** Compare final road geometry to its accepted profile; check shared-edge gaps, grade changes, crossfall, terrain penetration and residual mesh error. Unsatisfied constraints remain visible failures. Regional coverage and performance remain separate gates.

## Implementation order and acceptance

First implement carriageway ownership and frontage obstruction together, with the recorded counterexample converted into a regression requiring both roads to retain their profiles. Do not merely change the audit threshold or return the old profile while leaving terrain inconsistent.

Next extend the shared region contract to actual junctions and pavement/terrain boundaries. Then migrate the physical-unit boundary with tests through the real loader, not only a rescaled synthetic compiler input.

Use a bounded repeatable matrix: parallel hillside streets, switchbacks, connected steep intersections, disconnected crossings, offset/variable-width roads, attached and isolated frontages, bridges, tunnels, missing sidewalk tags, explicit absent/separate sidewalks, obstacle polygons, and near/far tile transitions. Each case needs horizontal and vertical assertions. Rotation/translation checks supplement these cases; they do not replace them.

After numerical failures are corrected, record one sequential browser route at a time through the rejected Monaco area, SF hills, Baltimore corners and a rural/structure case. Inspect ground and overhead views, drive/walk transitions and streaming in both directions. Preserve the quality setting and record loading/memory. No global visual acceptance follows from a few city samples; the sampled routes validate the common rules alongside the deterministic matrix.

## Repair status and verification

The source-unit boundary now converts physical road widths and placement into world units, and the road-width, building-clearance and navigation consumers share that convention. Frontage rays stop at intervening carriageways. Occupied road regions exclude unrelated frontage votes; overlapping road cores use continuous penetration weights. These changes have deterministic regression coverage.

Ordinary connected streets now share node elevations without becoming bridge approaches. Pavement is partitioned against the rendered terrain grid rather than repeatedly subdividing thin triangles. Walking over ordinary mapped paths uses their published contact geometry and cannot select a buried profile. The sequential street suite passed 143 tests and six hill fixtures before the ground-data repair below; 38 bridge/tunnel regressions also passed. These results do not establish global visual quality.

### Recorded city results

Monaco's comparable captured road area above a 30% slope fell from 132.583 to 9.235 square world units; the sidewalk area fell from 69.710 to 13.557. One thin sidewalk face remained defective. San Francisco's post-change UI walk reached a sidewalk with foot contact exactly matching its published surface, but the captured road and sidewalk still contained slopes of 61% and 83%. Both city results remain short of acceptance. Evidence is in `audit-2026-09-13/*-junction-units-*`.

A terrain-grid constraint prototype and a separate local junction-plane experiment were rejected after measurements worsened. They are not part of the current implementation. A prior profile replay overestimated a mismatch because numeric-array types were restored incorrectly; capture serialization now preserves those types.

### Upstream ground reconstruction defect

Both Monaco and San Francisco use classified Copernicus surface data stored on a 90-metre Web Mercator grid. At the examined San Francisco cell, the source elevation was 102.062 metres, but the classification pipeline stored 75.236 metres as ground. Adjacent source/ground samples remained around 94–115 metres. The morphological opening was being used as the replacement surface, creating a depression rather than estimating ground from neighboring ground observations.

Classification and ground reconstruction are separate operations. [PDAL's ground-filter tutorial](https://pdal.io/en/stable/tutorial/ground-filters.html) describes classifying observations and subsequently producing a terrain model from ground returns. This project now reconstructs classified cells using the surrounding retained ground boundary. The solver preserves known observations, converges with an explicit residual limit, retains unsupported exterior observations, and does not increase confidence simply because a surface is smoother. This is an approximation from a coarse surface model, not surveyed street elevation.

`scripts/repair-classified-ground.mjs` validates source hashes and every candidate artifact before writing. It migrated all 38 classified artifacts, retained the three USGS artifacts, and updated content hashes and correction provenance. Future builds use the same reconstruction implementation. The examined San Francisco cell now has a reconstructed ground elevation of 100.925 metres. On the same captured sample lattice, the maximum ground-axis grade fell from 56.98% to 21.62%, with no edges above 50%. This is ground-data evidence; a new full-world render is still required.

### Surface publication and visibility

Terrain sampling now uses exact coordinate keys. Rounding to one tenth of a world unit made distinct points on a slope reuse a height; the cache could also grow without a limit during city compilation. Each cache is now bounded to 65,536 entries, and unavailable samples are not retained.

Pavement clearance now blends incident road-edge profiles continuously. A nearest-centerline switch caused unequal-width roads to produce a height discontinuity across their bisector. The profiles retain changes along the curb, use actual placement offsets, and use physical metres for the transition distance. Regression tests cover interior curb elevation changes as well as continuity and source-order independence.

Path batch replacement now republishes its walking-contact index and releases the old index. Terrain, path and land-use reprojection and terrain seam changes invalidate geometry bounds. The app's Three.js r128 frustum check reproduces the visibility defect with old bounds and passes with regenerated bounds. The reusable check is integrated into `scripts/verification/street-quality.html`; see `audit-2026-09-13/reprojection-culling-regression.json`. [Three.js documents the need to refresh bounds after modifying vertices](https://threejs.org/docs/pages/BufferGeometry.html).

Final local validation: 151 street tests, six hill fixture variants, the source gate, 38 bridge/tunnel tests, and all 41 terrain artifact hashes/compilations passed. These do not replace a fresh browser route.

### Remaining acceptance work

Reload the corrected artifacts and repeat ground-level/overhead routes in San Francisco, Monaco and Baltimore. Check intersection crossfall, curb continuity, frontage gaps, terrain penetration, road/path contact, and both directions through near/far transitions. Independent distant profile departures, long loading and the approximately 1.2–1.4 GB JavaScript heap measured before the cache changes remain unresolved. The Baltimore visual run lost its Chrome inspection connection and has no acceptance result. Main, live deployment and GitHub remain untouched.
