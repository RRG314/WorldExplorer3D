# Ecosystem implementation status — September 8, 2026

The research plan is not fully implemented. This is local work, not a production
acceptance statement. No hosting deployment was performed.

## Antarctic snow and material fallback

The September 8 Antarctic report at -83.1664,-99.4784 exposed a material
contract defect: polar latitude unconditionally selected snowRock, the registered
texture resolved that to rock, and snowRock had no semantic blend mapping.
Flat polar fallback now selects snow; mixed alpine snowRock explicitly retains
65% snow / 35% rock rather than falling through to the base texture. This is
representative fallback styling, not a measured snow-coverage percentage.
Distant terrain now publishes its selected fallback material when WorldCover
is unavailable, before applying any exact mapped surface overrides.

ESA WorldCover excludes Antarctica, so satellite land-cover recovery cannot fix
this location: https://worldcover2021.esa.int/data/docs/WorldCover_PUM_V2.0.pdf
The existing polar fallback is not surveyed Antarctic elevation or seasonal
snow mapping. Ground geometry, road grading and water ownership were not changed.
17 focused biome/material, categorical-data and road checks pass. These cover
all supported land-cover class mappings, not every location on Earth.
Actual Antarctic gameplay was inspected after loading and again after a 15-second
settling interval: snow remains visible rather than the gravel fallback.
Evidence: output/verification/antarctica-snow-final. The flat surface reflects
the existing polar elevation limitation; this fix does not claim to add a
surveyed Antarctic elevation provider. Local production-service CORS remains.

## Cross-location terrain corruption

Reproduced the user's Niger terraces through the actual Main Menu transition
from Monaco to20.5043,8.1750. The destination had zero roads but retained11,211
location-relative road grading records from the previous city. Those old cut/fill
profiles carved the new DEM: worst rendered-minus-source difference was572.55
world units across1,681 probes. A fresh load at the same coordinates was smooth;
PNG decoding agreed in Chrome, WebKit and the in-app browser. This was a world
lifecycle defect, not a reason to smooth or replace the source elevation data.

`resetEarthStreaming` now releases the corridor records, spatial index, publication
and cached height results before new terrain loads. Cooperative structure
compilation also rejects a replaced world/ground generation. The same real menu
transition after the reset fix retained zero stale cuts and the worst difference
fell to0.229 world units. Before/after screenshots were inspected. Existing road
surface rules and DEM values are unchanged. The omission is present in the
August22 release commit af540b39; an earlier exact introduction is not established.

Evidence: `scripts/verification/terrain-location-transition-current.mjs`;
`output/verification/terrain-transition-before-fix-ui` and
`output/verification/terrain-transition-after-fix-ui`. An earlier probe that opened
only the selector rather than returning to Main Menu did not change worlds; it
failed and is excluded from acceptance. The maintained script uses the real menu
button and requires a new world sequence before examining the destination.

A second transition from Monaco to the Namib destination(-24.8,15.3) retained
zero old grading corridors;1,681 origin-neighborhood samples stayed within0.667
world units of the DEM and the gameplay image was inspected. Cancelling actual
cooperative compilation with an Earth reset produced AbortError and no corridor
republication. The first report's overall flag was false because its test wrongly
required zero road records (Namib has four mapped ways but zero grading corridors).
The saved measurements passed the relevant checks when reassessed; the maintained
test now checks absence of grading corridors and the actual destination instead.
No gameplay rule was changed to satisfy that incorrect road-count assumption.

## Curated vegetation checkpoint

Distant tree follow-up: the first broadleaf LOD retained2,924 of3,182 triangles,
so the LOD label overstated its benefit. Offline bark-only spatial reduction now
produces1,772-triangle broadleaf and997-triangle pine distant meshes. Near assets
and leaf-card coverage are unchanged. The actual Amazon comparison retained
4,180 plants/43 batches/666 draw calls and reduced total rendered triangles from
9,745,927 to7,738,823 (about20.6%). Both gameplay images were inspected. This is
geometry reduction, not an FPS or physical-mobile acceptance claim; the total
render workload remains substantial. Tests now require at least30% tree LOD
reduction, valid finite positions/indices and manifest-matching asset hashes.
Method reference: [meshoptimizer simplifier](https://github.com/zeux/meshoptimizer/blob/master/js/README.md#simplifier).

Player-relative refresh: both terrain candidate lists now prioritize the current
player, not the original world origin. A real browser relocation check at 500m,
1,000m and back retained 327, 330 and 235 plants within 100m respectively;
previous batches were removed, world sequence stayed unchanged and no runtime
exceptions occurred. The original test exposed zero nearby plants at 1,000m;
that result was rejected and the ordering corrected. Screenshots at 1,000m and
on return were inspected. This is a bounded relocation/lifecycle check, not a
sustained-driving or physical-phone performance claim.

Wetland follow-up: numeric class90 now remains a distinct low-vegetation biome
and soil/grass material mix. Bounded nearby tall-grass clumps use the same CC0
Quaternius pack, existing instance publisher and placement exclusions; soft
groundcover has no trunk collider. The actual Everglades mobile-sized run
published600 nearby clumps with one additional draw call (87 total in that view),
49 numeric tiles and no runtime exceptions. This is generic stylized wetland
vegetation, not a surveyed species map. Physical-phone performance is unverified.

Secondary distant mapped-context batches have a30s cooperative deadline using
the existing batch authority. Completed records survive; outstanding requests
are cancelled and missing context is reported in metrics. Primary road/building
loaders are unchanged. The original Everglades90s startup failure is recorded;
the later actual run completed, but did not exercise the deadline. Forced
deadline/cancellation/normal-completion execution tests separately passed.

The old procedural trunk/canopy builder and its furniture allocations have been
removed. CC0 Quaternius trees, shrubs and ferns now use the existing model asset
loader, spatial cell instancing, tree LODs and shared collision authority. Source
and conversion records are in app/assets/models/nature/asset-manifest.json and
scripts/build-nature-assets.mjs. No paid assets or reconstruction jobs were used.

Actual Amazon gameplay at -2.9,-60.2 contains 4,180 plants, 121 within 100m,
in 46 spatial batches. The composited screenshot was inspected: forest occupies
the nearby ground rather than spending the budget on distant tiles. Yosemite
tree close-ups, mobile-sized Sahara gameplay and Arctic gameplay were inspected.
These are not physical-phone frame-rate measurements. The later muted tundra
palette and 450m follow-player refresh still require visual acceptance.

Remaining blockers: mountain seams are visible; an Alpine start exceeded the
90-second test limit, including 35s regional-ground and 20s transport-ground
waits. Their common far-field dependency needs profiling, not larger test
timeouts. The exact historical floating-skyline screenshot remains unresolved.
Provider recovery and the remaining regional matrix are not fully accepted.

## Terrain boundary investigation

Adaptive boundary geometry is now implemented locally: only adjoining far-field
cells acquire detailed edge vertices, and height queries use their exact triangle
fans. Water/transport rebuilds update the bound heights before cache invalidation.
Yosemite's worst measured difference is0.04155m and Chamonix's0.04476m, sampled
0.02m outside the detailed edge on steep slopes. Added vertices:4,250 and4,176
respectively. Both actual gameplay screenshots were inspected; no runtime
exceptions were recorded. Evidence: yosemite-edge-lifecycle-current and
alpine-edge-lifecycle-current. This supersedes the earlier gap measurements below,
not the outstanding global/device acceptance gates.

Actual boundary sampling found a separate inland-water defect: missing DEM
samples were coerced to zero in sampleWaterPolygonInteriorHeights (introduced
in f7d040231 on August 6). A Chamonix mapped water polygon was consequently
published at0.08m against964m ground. Excluding missing samples removed the
roughly965m discontinuity; the next worst measured difference was25m beneath
water, where near/far bed policies differ. Evidence: alpine-water-authority-current
and alpine-inland-water-current under output/verification. This is not a claim
that all seams are fixed. Yosemite has a separate dry boundary gap up to95m.

Terrain bed handling now also uses the existing water-body/profile resolver,
so an explicitly absent flat datum cannot silently become sea level. Three
execution tests cover missing inland samples, varying river profiles, and
known lake/ocean datums. No road geometry was changed.

Successful Alpine dependency profile: numeric cover238ms, elevation2122ms,
mapped context3733ms, both downstream ground waits0ms. The earlier slow run
remains a provider-dependent startup limitation, not a permanent loading failure.

Implemented locally: existing tree placements publish their rendered base
height; a bounded spatial trunk index supplies nearby candidates to the existing
collision solver. No separate collision response system was added. Polygon
placement now honors its desired accepted count. Actual BMW contact, reversing
and walking contact passed with inspected screenshots. Physical-phone acceptance
remains pending.

## Numeric land-cover experiment

Browser persistence check passed for a real128px Yosemite tile:16,384 class
bytes survived a page reload unchanged with both land-cover providers blocked;
the result came from IndexedDB and attempted zero network requests. An earlier
arbitrary32px bbox request timed out at6.5s and is not a provider-reliability pass.
Evidence: worldcover-browser-cache-current/report.json. The test now uses the
same tile dimensions/bounds as normal game loading.

scripts/lib/worldcover-categorical.mjs reads range-limited, nearest-resampled
ESA WorldCover v200/2021 COG windows using the installed geotiff dependency.
It is an offline utility, not loaded by the game. Source tile names, boundary
splitting and class placement have execution tests. A real Baltimore Node read
returned 1,024 cells with classes10,30,40,50,60,80 in approximately1.05seconds.

The first direct AWS browser experiment failed CORS and was removed. The new
runtime path now reads bounded numeric NPY windows from Microsoft's Planetary
Computer public data API, with nearest resampling and strict class/layout
validation. The browser does not download full COGs or load a GeoTIFF decoder.
Versioned numeric bytes use the existing memory/IndexedDB cache and bounded
request queue. WMS is an explicitly labeled, uncached lower-confidence fallback.
No extra service has been provisioned and no paid reconstruction is involved.

Actual browser reads returned numeric Baltimore, Yosemite and Sahara classes.
The latest Yosemite gameplay run selected temperate forest from the nearest
accepted tile (76.7% woody cover), rather than an asynchronous regional aggregate.
One run loaded49 numeric tiles; another22 with27 unavailable. Bounded two-attempt
recovery exists, but provider failure/performance acceptance remains open.

Vegetation now reads normalized byte attributes correctly on Three r128,
rechecks forest support after jitter, uses source-based seeds and prioritizes
nearby cells inside large mapped forests. Yosemite's nearest tree moved from
489m to48m. This earlier measurement predates the curated models described above.
Regional model forms are implemented; authoritative species distributions are
not implemented and must not be inferred from the asset selection.

Rock uses three-axis projection to avoid cliff UV stretching; material classes
have differentiated roughness and snow can use the existing snow texture on
capable devices. The composited Yosemite gameplay image was inspected under
output/verification/yosemite-rock-projection-current. Rendering works, but
vegetation quality and worldwide appearance are not accepted yet. The earlier
black canvas extraction is not a visual pass; verification now captures the
composited page instead of a cleared WebGL drawing buffer.

Sources: [ESA data access](https://esa-worldcover.org/en/data-access),
[GeoTIFF.js documentation](https://geotiffjs.github.io/geotiff.js/).
WorldCover data are CC BY4.0 and contain modified Copernicus Sentinel data.

Sources also include [Microsoft's dataset](https://planetarycomputer.microsoft.com/dataset/esa-worldcover)
and [public data API](https://planetarycomputer.microsoft.com/api/data/v1/openapi.json).

Still pending: provider failure/cache acceptance; finer regional climate
context; normal-map blending improvements; regional species/cluster/LOD work;
global desktop/mobile visual and performance checks. No production or staging
deployment was performed.
