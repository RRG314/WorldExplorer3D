# Shared street and frontage rules

The terrain grader and pavement compiler previously made independent decisions about nearby buildings. The grader treated any candidate facade in its search region as urban evidence; pavement used tile-local bounding boxes. Both also inferred attached buildings by rounding absolute coordinates. Those decisions could disagree across tiles, orientations, and world scales. Terrain grading also ignored the road placement offset used by sidewalk geometry.

## Implemented contract

`app/js/world/compiler/street-frontage-policy.js` now supplies both consumers with:

- One positive, finite metres-per-world-unit scale, selected from the world's metre scale, then its inverse scale, then the application default of 1.11. Road widths and placement already in renderer coordinates retain that existing contract.
- Valid, finite building surface footprints. Buildings allowing passage underneath do not become ground-level frontage obstacles.
- Facades at least three physical metres long. Attached frontage requires exact shared source vertices rather than origin-dependent coordinate rounding. Near-but-unconnected footprints do not count as attached buildings.
- Street-segment context based on actual segment-to-facade distance within 20 metres. It is computed on the original source segment and carried into subdivided pavement pieces, independent of render tiles. This remains a documented inference heuristic, not proof that every nearby building implies a municipal sidewalk.
- Existing mapped side-specific sidewalk tags taking precedence over inference, including absent and separately mapped sidewalks. Connectors, grade-separated structures and ramp candidates cannot acquire inferred ground sidewalks.
- The same signed placement-offset calculation for the graded road edge and pavement edge. Ordinary frontage reach remains seven metres beyond the road edge; attached frontage can extend up to 24 metres beyond the nominal sidewalk edge. These are application inference limits, not surveyed boundaries or universal street-design standards.

No city names or geographic special cases select these rules. Near raised pavement and the far terrain pavement mask use the same compiler. The spatial index is publication-local and released with its owning context; this change adds no worker or parallel world.

## Verification

`npm run verify:streets` passed: 121 CPU tests, the six existing hill fixtures, and source checks. The 19 new policy cases exercise physical area and facade distance across four scales and three rotations at displaced map coordinates; tile-independent source-segment decisions; direction reversal; explicit absence and separate mapping; placement offsets; malformed footprints; invalid scale; and semantic structure exclusions.

The browser page `scripts/verification/street-policy-layouts.html` renders actual compiler polygons for visual comparison. Its original, rotated/rescaled, absent-sidewalk and one-sided layouts were inspected in Chrome. This is horizontal geometry evidence, not a substitute for a rendered terrain route. It runs without loading a city or allocating another WebGL world.

## Remaining release evidence

The earlier SF and Monaco ground-level captures predate this policy consolidation. They cannot be presented as post-change live verification. Full-app terrain movement, intersections, mixed-height structures, near/far transitions, loading time and memory require post-change checks. Earlier first-play times and memory exceeded the recorded budgets and are still unresolved.

Incomplete map data still cannot establish an unknown property boundary. This implementation does not invent buildings or pave every empty plot. More elaborate frontage inference needs an explicit evidence policy and tests rather than larger arbitrary fill distances.
