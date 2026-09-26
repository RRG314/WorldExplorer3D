# Repeatable street-quality checks

Road work is ready for release when the geometry checks, rendered camera tests,
and full-app city routes all pass. Each catches a different class of defect.
A missing measurement stays pending; an unresponsive load fails.

## Run the checks

From the street R&D checkout, run `npm run verify:streets`. This runs the road,
pavement, terrain-publication and mapped-ground contracts sequentially, then
checks the Monaco and San Francisco hill fixtures and the source graph.
It uses local fixture data, requires no API key, and installs nothing.
The machine-readable hill report is `output/verification/street-quality/report.json`.

With the existing preview server running, open
[the camera sweep](http://127.0.0.1:4192/scripts/verification/street-depth.html).
“Run camera sweep” checks fifteen slope/distance combinations using the real
hardscape material factory. It compares the nearest geometric surface with an
actual GPU pixel. The sidewalk must remain visible when it is above the ground
paving. Red is a failing ground-paving overlay; white is the expected sidewalk.
This test reproduced ten failures before removal of hardscape's negative depth
bias and passed all fifteen combinations afterward.

Open [the hill scenes](http://127.0.0.1:4192/scripts/verification/street-quality.html)
and inspect Monaco and San Francisco separately. These use the production
pavement compiler and terrain refinement with captured geometry and elevation.
The CPU checks sample every triangle at its center and edge midpoints, require
finite upward geometry and ground clearance, track triangle growth and duration,
and repeat each city after a 90-degree rotation and a distant translation.
Translation must preserve total pavement area within 0.1 square world units.
Per-case limits are 30,000 triangles and ten seconds of compilation on this Mac.
These small scenes do not load the full app's regional buildings, services,
engineering profiles or textures. Building heights are illustrative.

## Full-app routes

Use `scripts/verification/street-routes.json` as the common route checklist.
It covers the three reported Baltimore locations, Monaco and San Francisco.
For each, record graphics quality, data provider, time to first play, an overview,
a walking-height view, and the same frontage before and after movement/turning.
Inspect slope transitions, corners, grade separation where present and unexplained
bare patches. A feature absent from a route is marked not applicable.

Run one city at a time. Close owned component-test tabs first. Stop a stalled
load instead of launching a second world. Save captures and measurements with
the tested source revision; stop the world before running CPU suites.

The opt-in `streetDiagnostics=1` panel records separate JavaScript heap,
geometry-buffer and renderer-resource measurements. “Inspect memory and running
work” now includes an explicit performance assessment. Initial budgets for the
8 GiB reference Mac are 768 MiB JavaScript heap, 16 MiB resident pavement position
buffers, an eightfold maximum triangle refinement multiplier, and the existing
25-second first-play target. These categories overlap and must not be summed.
A pass here still requires the recorded visual route to pass.

## Current findings

The camera-dependent hardscape overlay has a reproducible failing-before and
passing-after test. The Monaco and San Francisco component cases passed their
initial clearance checks. Full Monaco loaded but failed readiness: first play
was 124.795 seconds, JavaScript heap was about 1.48 GB, and terrain refinement
expanded 33,544 base pavement triangles into 432,538 triangles. The simple hill
fixture generated only 5,338 triangles. This difference requires investigation
of the full runtime's road-contact/terrain height field and regional residency;
it cannot be dismissed using the smaller fixture result.

See `STREET_REPAIR_VALIDATION.md` for the actual city outcomes and saved evidence.
San Francisco also failed readiness: first play was 182.068 seconds and
JavaScript heap was about 1.42 GB. These full-app observations used Low graphics.
The original Medium setting was restored afterward, verified through Chrome's
settings UI. Both worlds were returned to the menu before CPU checks.

A translation check initially failed: moving the SF fixture 51,200 world units
changed pavement area by 0.18361 square world units. Polygon clipping now uses
an aligned local origin for integer conversion, intersection and offsets. The
same check passes without relaxing its 0.1 tolerance; the measured remaining
area difference is below 0.000001 square world units. Mesh-cell bounds now reject
nonintersecting polygons before exact clipping. This is a component optimization,
not a measured full-city loading improvement.

The diagnostics also assess loaded-network compilation coverage. They count
required road-side length and separately mapped sidewalk length inside and
outside the current window, with examples of uncovered segments. This measures
source inclusion, not actual polygon completeness or pixels. Roads marked as
having separately mapped sidewalks still need those paths in the input. Unknown
source requirements stay unknown. A complete local cell count cannot pass this
coverage assessment while required loaded streets lie outside the window.

Unresolved frontage gaps, whole-location coverage and full-app performance
remain release blockers. See STREET_COVERAGE_REPAIR.md for the architectural
work that has not yet been implemented.
