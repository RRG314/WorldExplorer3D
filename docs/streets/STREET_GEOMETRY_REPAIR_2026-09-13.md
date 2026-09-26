# Street geometry repair — September 13, 2026

## Problem

The Sacramento Street scene in San Francisco showed pavement climbing into
large humps, road surfaces separated from the ground, and fragmented white
markings. Source coverage did not establish correct geometry.

## Changes

- Terrain grading searches include the entire shoulder influence, including
  building frontages. The collision index previously excluded part of that
  influence at spatial cell boundaries.
- Overlapping road grades blend continuously. Selecting a single winning
  road produced abrupt height changes where influences crossed.
- Ground-level road rendering reads the terrain after grading, for both cuts
  and fills. It no longer combines two competing heights with a maximum.
  Bridges and tunnels retain their engineered profiles.
- Sidewalk foundations extend to eligible building frontages using the same
  ray intersection and facade occlusion rules as pavement generation. The
  original terrain transition starts beyond that edge. Explicit absent
  sidewalks remain excluded from this extension.
- Lane and crossing markings are clipped to the triangles of their supporting
  road. Their heights follow those same planes, including folds and gaps.
- Ground-level movement accepts the published mesh height when grading differs
  from the earlier profile. Structure-specific safeguards remain in place.

The frontage index stores building references. Temporary frontage samples are
bounded and cleared after terrain publication. The world reset disposes the
index. These changes add no new renderer, worker pool, or terrain mesh layer.

## Verification

The combined CPU verification completed 102 tests, six terrain cases, and the
source import/entry checks. The subsequent sample-cache bound change passed the
targeted grading tests. These results are code/geometry evidence, not city
visual acceptance.

A first live San Francisco run, before the frontage and marking corrections,
reduced the captured maximum road-vertex separation from approximately 3.345 to
0.184 world units. The maximum sampled road-contact separation fell from
3.281 to 0.269. Captures were within approximately one world unit of each
other; source contents can differ between city loads. The resulting view still
showed frontage slope and marking defects, which motivated the remaining
changes above.

The combined San Francisco visual run showed the formerly raised frontage
flattened toward the facade. Walking along the road and onto the sidewalk
matched rendered contact: road height 100.786153 and walking support
100.786153 at the sampled road point; sidewalk support and pavement height
98.736130 at the sampled sidewalk point. The actor remained 1.7 world units
above those support surfaces. Screenshots and contact captures are in
`evidence-2026-09-13/sf-frontage-repair-*`.

The live publication audit sampled 1,119,803 road vertices with no buried or
excessively floating at-grade samples (delta 0.180–0.182). The captured local
road-contact maximum was 0.239, including interpolation between vertices.
This audit does not measure sidewalk cross-slope or certify every city view.
The maximum one-unit ground change in the broader local grid increased from
0.818 to 0.988; that grid includes terrain outside the pavement. The fix must
not be described as flattening every steep terrain sample.

A later crossing-material correction aligns its depth bias with lane paint.
The final material passed GPU visibility checks at six camera heights, from
0.2 to 20 world units at eight units viewing distance. The lowest-angle stripe
occupies approximately one pixel, so the test samples its projected 3×3 pixel
neighborhood. Nine separate pavement-mask/cleanup checks also passed. These
small GPU checks are separate from the live San Francisco run.

San Francisco still exceeded whole-app budgets: 170.7 seconds to first play
and approximately 1.38 GB of reported JavaScript heap. Pavement refinement
fell to 2.32 times its input triangle count. These performance limitations
remain open.

Monaco was visually inspected at Avenue de la Costa from two ground-level
angles. The curved carriageway and adjoining pavement remained continuous in
those views. Walking road contact matched the rendered road at 57.372133; the
sidewalk return sample matched pavement at 57.086405. The initial lateral move
overshot the narrow sidewalk into an unpaved area; that capture is retained
alongside the return sample rather than labeled a sidewalk pass.

Monaco's road-vertex audit reported no separation failures, with deltas
0.180–0.182. Its refinement multiplier was 3.38. No WebGL warnings/errors were
returned by the final browser log check. A drone overview and driving route
were not completed; travel-menu automation was unreliable and no result is
claimed for those actions.

Monaco still exceeded application budgets: 209.8 seconds to first play and
approximately 1.26 GB of JavaScript heap. Both current city checks used the
saved Medium setting; the earlier Low-setting Monaco figures are not a
controlled performance comparison.

The preview remains at `http://127.0.0.1:4192/app/?streetDiagnostics=1`, with the
diagnostic panel collapsed. These are shared source repairs, with no city-name
conditionals. They do not constitute exhaustive worldwide visual approval.
No production deployment or GitHub push has been performed.
