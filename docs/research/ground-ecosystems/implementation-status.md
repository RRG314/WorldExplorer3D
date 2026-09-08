# Ecosystem implementation status — September 8, 2026

The research plan is not fully implemented. This is local work, not a production
acceptance statement. No hosting deployment was performed.

## Curated vegetation checkpoint

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
