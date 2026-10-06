# Earth coverage and continuous travel

Owner request, October 5, 2026: restore at least 90% of available valid building footprints and every identified major building, preserve roads, render recognizable land uses, extend public GIS, and support bounded continuous worldwide travel. Flight quality was acceptable; removing scenery to meet an FPS number is not an acceptable remedy. Local work; no production promotion.

## Current evidence

Source inspected at 6c32df9f. Preview still 078250e5e401; production still 1532bdfbb5c1. Staging environmental/aircraft/place gateways ACTIVE. These observations are not coverage acceptance.

- `terrain/far-field-mapped-context.js`: 45% sampling for multipart features, equal tile quotas from 280,000-instance cap, early loop termination. Dense tiles lose buildings even when other tiles are empty. The denominator stops early and includes near-owned/invalid records, so it cannot establish real coverage.
- Regional building geometry is z14, but mobile requests z13, where buildings are absent. Reducing texture/detail quality must not remove the building layer.
- Near publication uses a circular domain; far exclusion is a square based on a different planned radius. The overlap must be based on actual publication, not an assumed empty square.
- `fixed-regional-context.js`, `terrain/location-world.js` and `terrain/far-field.js` anchor roads, detailed terrain and aerial scenery at the starting origin. Travel radius is capped. These are fixed regions, not worldwide streaming.
- `load-reset.js` clears gameplay and scene owners on full location loads. Repeating this operation during travel is not seamless streaming.
- `earth-core/location-origin.js` uses a local equirectangular conversion for non-polar travel. Wrapped longitude alone does not solve polar travel, accumulated coordinate error or GPU precision.
- Maryland parcels are a bounded, provenance-labelled adapter; they are not a global cadastral database. Existing WorldCover/OSM/Overture/accepted ground and regional ecology should be extended, not replaced with arbitrary fake scenery.

## Finite delivery gates

1. **Coverage correction**: independent source/eligible/selected/rendered counts; no equal tile quotas; major-building priority; near/far seams and mobile source zoom. Matched daytime/nighttime flight and road screenshots. Keep memory bounded and record provider holes independently of geometry coverage.
2. **Coordinate and cell ownership**: stable geographic feature identity, one geographic position authority, camera-relative local frames and antimeridian/polar addressing. Separate resident data, render detail, physics detail and persistent user state. Shared resource leases; abort/dispose on eviction; cancelled jobs never publish.
3. **Continuous publication**: extract existing terrain/transport/building/land-use compilation from global reset, stage cells with a capped queue, publish terrain plus collision plus roads atomically, keep old neighbours until replacement is usable, prune all indices/caches/meshes. Prefetch only the immediately relevant travel corridor under provider policy. No synthetic roads bridging missing provider data.
4. **Ecology and GIS**: source-backed land cover drives geometry/materials/vegetation/trails/water and regional species. A protected-area boundary does not itself mean forest. Registered public jurisdiction adapters include extent, units/datum, source time, licence, pagination/truncation and precedence; unavailable data stays explicit.
5. **Acceptance**: walk/drive/fly/boat outward and return through multiple loaded windows, rapid reversal, cancellation, failed providers, frame-origin rebasing, ±180°, polar transition, save/reload, Earth/Ocean/Space exits. Fixed camera day/night coverage; parks/forest/farm/wetland/coast/city samples. Plateau in resident cells, CPU heap after collection, GPU geometry/textures and pending jobs after repeated cycles. Then create a local candidate; production remains separate.

Status: audit in progress; no claim that continuous travel or global GIS is implemented. Gates require actual integration/browser evidence, not helper tests alone. Do not enable an incomplete streaming path or remove current boundaries until its replacement has traversable data and cleanup acceptance.

## Verified first correction (October 6)

- Actual source browser audit: Baltimore old selection 139,887 of 473,840 raw footprint pieces outside its old near exclusion. Corrected selection retains 95% of valid, in-request footprints; raw, invalid, outside-request and near-owned counters are separate.
- Assembled source game: 405,067 eligible regional footprints, 384,805 rendered (94.9979%), 1,489 source-identified large/important footprints selected. 240/240 regional tiles loaded. 25,652 nearby buildings and17,754 compiled roads. Day/night regional and close views plus ordinary driving/flight inspected. `output/verification/continuous-world/corrected/`.
- Source sample contains **zero mapped regional heights**; distant massing uses inferred heights. The important-feature count does not prove that every real landmark is identified by Shortbread. Authoritative regional building identity/height enrichment is a remaining requirement.
- Road counter shows70,238 regional ways before the20,000-way selection cap. This is not90% road coverage. Increasing that cap without bounding the transport compiler is not accepted; complete distant source coverage and nearby physical detail need separate budgets under the same transport owner.
- Found a real GPU lifetime bug: Three r128 keeps instance buffers outside geometry attributes. Old disposal leaked all6 instance buffers in a controlled owner test; corrected disposal releases them. Actual WebGL12 allocation/render/eviction cycles (peak288 buffers each) return to0 buffers and0 geometries after every cycle. Screenshot inspected; this is an isolated component lifecycle test, not a whole-world memory plateau certification.
-1938 PR contracts plus source/ownership/types/inventory/sensitivity gates passed before the final clock-injection test adjustment. Remaining final verification recorded separately. No changes to existing published artifacts, saves, GitHub or production.

## GIS source policy reviewed

Public sources remain the direction; no paid subscription is required by this design. Existing hosting/bandwidth infrastructure is a separate resource budget.

- [OSMF vector policy](https://operations.osmfoundation.org/policies/vector/): visible use, browser caching and attribution; bulk downloading/prefetch archives prohibited. Continuous travel must request the current visible window through the configurable provider, not indiscriminately fetch the globe or build an offline archive from OSMF.
- [Overture schema](https://docs.overturemaps.org/schema/) and [Explorer PMTiles](https://docs.overturemaps.org/getting-data/explore/): existing building adapter can supply stable source identity and available semantics, with pinned releases/provenance. A regional Shortbread silhouette is not an authoritative surveyed building model.
- [USGS3DEP](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services): elevation products must retain their acquisition resolution/datum; a rendered mesh grid is not the source survey resolution.
- [USGS PAD-US](https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download): public protected-area inventory supplies purpose/boundary evidence, not a forest map or permission for every real-world activity.
- [ESA WorldCover](https://esa-worldcover.org/en/data-access):10m categorical cover with published year/version/attribution. Combine with mapped paths, water, verified local GIS and regional ecology; do not turn every park polygon into the same tree field. Existing local tree/groundcover generation follows the actor, but the far field remains largely material-based.

## Coordinate authority correction

The scene/map used one polar projection while interiors used the latitude of the destination in its longitude denominator and marine records used a separate flat formula. These now use `earth-core/coordinate-frame.js`, as do property/activity tools. Existing non-polar district coordinates and units are preserved; geographic longitude wraps at the date line and the two poles use the existing ENU source-contract math. Frame snapshots are immutable, the cache is bounded to16 entries and the active-frame hot path allocates no key string. Ordinary district round trips, both date-line directions, invalid input, output-buffer reuse, both poles and the existing map tests pass. All1942 current PR contracts and supporting gates pass.

This establishes conversion consistency in these consumers. It does **not** establish automatic origin rebasing or remove fixed-world travel limits. Remaining independent formulas in authored event/legacy save adapters require compatibility review before rebasing; persistent records and multiplayer room coordinates must not be silently reinterpreted.

## Required ownership migration (do not replace with periodic location reload)

| Existing owner | Required change for continuous travel | Release test |
| --- | --- | --- |
| `config.js` / `earth-core/coordinate-frame.js` | Stable geographic positions; cell-local render frames; atomic actor/camera/velocity conversion when the active frame changes | Round trips at latitude changes/date line/poles; no camera jump or lost speed |
| `world/load-roads.js`, `load-reset.js`, runtime session | Extract reusable cell compilation/publication from world/session reset | Crossing a cell never resets inventory, activities, character, vehicle or room |
| `terrain/location-world.js`, far-field owner, accepted-ground runtime | Moving resident window; terrain/physical query coverage handoff; bounded decoding and imagery leases | No ground gap, overlapping height owners, stale publication or unbounded cache |
| Building compiler, collision index, landmark owner | Geographic IDs and per-cell ownership; complete low-detail coverage; authoritative major-height enrichment; promote details before arrival | Independent denominator ≥90%; all identified majors rendered; cleanup and turnback |
| Transport network/compiler, street overview/pavement, traversal/contact indices | Complete source network separated from close physical geometry; clipped-cell border nodes retain shared identity | Connected roads/bridges/approaches, no orphan graph nodes after eviction |
| Land use, water bodies, vegetation/furniture, facilities | Share cell lifetime; regional biome/cover LOD; distinguish land purpose from physical cover | Park/forest/wetland/farm/coast and national-park journeys remain recognizable |
| Weather/ocean/live Earth services and GIS | Query current geographic window with source TTL, cancellation and honest gaps; optional jurisdiction adapters | Cross-region response races, outages, cache/bandwidth ceilings, no paid provider dependency |
| Saves/property/Journal/shared rooms/GPS | Persist stable geographic identity; migrate versioned local-frame records without dropping unknown fields | Existing save upgrade/rollback; authenticated room authority and two-client handoff |

A new cell becomes active only after usable terrain and collision/transport are published together. Keep the old overlap while that happens. If source data fails, show the actual loading/unavailable condition and retain valid neighbours; do not invent roads or silently drop90% of a city. Eviction must unregister physics, raycast/contact/spatial indices, NPC/furniture/activity references, callbacks, pending requests/workers, textures and instance buffers. Persistent player changes stay in the existing save owner, not resident scene cells.
