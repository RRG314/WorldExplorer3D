# Ecosystem implementation status — September 8, 2026

The research plan is not fully implemented. This is local work, not a production
acceptance statement. No hosting deployment was performed.

## Curated vegetation checkpoint

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

Implemented locally: existing tree placements publish their rendered base
height; a bounded spatial trunk index supplies nearby candidates to the existing
collision solver. No separate collision response system was added. Polygon
placement now honors its desired accepted count. Driving and phone acceptance
remain pending.

## Numeric land-cover experiment

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
