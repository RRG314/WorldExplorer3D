# Evidence-backed geology

## Implemented locally

The point-query provider, USGS/Macrostrat normalization, explicit-source study,
existing Journal/Field Guide persistence, stale-session and duplicate-save guards,
and expandable source details are implemented. Inspect Geology uses a new claim
namespace so an old procedural geology claim does not suppress the new study.
Other field claims and old collected specimens are preserved. The existing
Pathfinder (8 Explorer points) rock-hammer entitlement remains unchanged.

The Today panel keeps three recommendations but now exposes other eligible
activities under More field activities. No extra free-roam prompts were added.

Thirteen targeted unit/regression checks passed, covering field evidence,
progression/retention, cache/deduplication, coordinates, source fallback, missing
coverage, stale sessions and Journal transactions. Live provider checks returned
Maryland schist/gneiss, Hawaiian lava flows, and London claystone/regional bedrock.
The actual desktop (1280px) and touch-layout (412px) game completed inspection →
live query → Journal → reload, with source evidence intact and no page errors.
Screenshots were inspected; the expanded-source grid was corrected. The test seeds
only its isolated local profile to the existing 8-point tool unlock and positions
that fixture player at a generated eligible survey point. It does not change the
user's save. This is not a physical Android, production, or global-coverage signoff.

## Plan and boundaries

1. Verify machine-readable USGS surface-unit fields with actual point queries.
2. Reuse the geospatial provider registry for one cached, bounded geology service;
   preserve exact query position, provenance, ambiguities, and failures. Supplement
   missing coverage with Macrostrat, retaining the original source and attribution.
3. Connect Inspect Geology to the existing field activity and journal transaction.
   Replace guessed granite/quartz for this action with a mapped geology study.
   Query only on explicit recording, never in the world startup or frame loop.
4. Verify malformed input, boundaries, no coverage, fallback, repeated requests,
   cancelled/stale sessions, journal persistence and the actual browser UI.
5. Follow with reviewed regional data packages and exposed-rock specimen rules.
   Only after those rules pass should geology influence rock visuals or collectible
   mineral selection. USMIN occurrence ingestion is a subsequent distinct layer;
   a deposit is not a loose sample, a permission, or an exposed surface.

No terrain height, bridge, road, building, currency, or camera changes. No new map
viewer, alternate inventory, account database, or collection authority.

## Source contract

USGS service: https://energy.usgs.gov/arcgis/rest/services/Hosted/mapunitpolys_esurf_labels/FeatureServer/0

Fields: source polygon ID, unit name, geomaterial, geomaterial confidence, age,
map citation, and NGMDB source URL. Service metadata still includes older coverage
language: this integration identifies the service, not an unverified v2 dataset.
Manchester 39.6572814,-76.8875391 returned Wissahickon Formation (undivided),
schist and gneiss of sedimentary-rock origin, from the 1968 Maryland map at 1:250,000.
That is regional evidence, not building-scale certainty or proof of exposure.

International fallback: https://macrostrat.org/api/v2/geologic_units/map
Retain all returned alternatives (up to the declared budget), source citations and
CC-BY-4.0 attribution. London returned both Eocene claystone and a broader Cenozoic
sedimentary unit; do not silently call one an exact surface observation.

Point queries are cached for 24 hours in a bounded in-memory registry. They do not
use rounded coordinates or silently extend a sample to adjacent cells. Saved
records retain the evidence snapshot even if the upstream data later changes.
No paid data service or cloud reconstruction is involved.

## Subsequent regional-package work

Create version-pinned, spatially indexed packages from reviewed published datasets
with scale, CRS, geometry validity, holes, source IDs, revision and attribution.
Use exact polygon containment and explicit boundary ambiguity. Separate bedrock,
surficial deposits, mineral occurrences, and modeled exposure. Connect these facts
to existing environment/discovery contracts. Test Maryland, volcanic, sedimentary,
glacial, desert, international and no-coverage locations before enabling specimen
generation. River material requires catchment/transport evidence, not merely local
bedrock. No geology-derived terrain recoloring until land-cover precedence and
exposure masking are verified. These later capabilities are not implemented here.
