# Ecosystem implementation status — September 8, 2026

The research plan is not fully implemented.

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

A browser test failed: the tested AWS response did not include the necessary
cross-origin access header. The experimental runtime wiring and544KB decoder
bundle were removed, and existing runtime loading was restored. A prepared
categorical tile product or deliberately provisioned delivery service is still
needed. Do not claim the game already uses numeric classes.

Sources: [ESA data access](https://esa-worldcover.org/en/data-access),
[GeoTIFF.js documentation](https://geotiffjs.github.io/geotiff.js/).
WorldCover data are CC BY4.0 and contain modified Copernicus Sentinel data.

Still pending: prepared tile delivery/cache policy; stable per-location biome
context; material blending improvements; regional species/cluster/LOD work;
global desktop/mobile visual and performance checks. No production or staging
deployment was performed.
