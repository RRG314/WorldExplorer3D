# Provider integration contract

## What runs now

`app/js/geospatial/geology.js` queries the explicit `energy.usgs.gov/…/mapunitpolys_esurf_labels/FeatureServer/0` point-intersection service, asks for seven named attributes, no geometry, at most sixteen records. It preserves exact coordinates rather than rounding across unit boundaries. Existing provider registry bounds cache to 64 entries, TTL 24 hours, timeout 10 seconds; response parsing is capped at 1 MiB. Abort, incomplete transfer, schema error and rate-limit cooldown are handled. Macrostrat is fallback, not evidence of identical coverage.

`geologyRecord` retains query, fetched time, unit alternatives, warnings and references. Interpretation is mapped units, exposure and collecting permission not established. Multiple intersecting units remain alternatives, not a confidence vote. Career runtime performs lookup at admitted site initialization; guidance must not trigger it every frame.

## Bounded live evidence, November 5 UTC

Script: `scripts/research/career-geology-probe.py`; local result `output/research/career-world-20261105/geology-service-probe.json`. These are public demonstration coordinates, not a player location history.

| Probe | Result | What it proves |
| --- | --- | --- |
| Literal runtime layer metadata | HTTP 200, 20,010 bytes; metadata describes conterminous US | Endpoint available in this request; current description is not upgraded national coverage. `currentVersion=12.1` is ArcGIS software. |
| Public Baltimore point 39.2904, -76.6122 | HTTP 200, 1,407 bytes; one unit, transfer not truncated | Schema/point query works here: Lowland deposits, Quaternary, sand/gravel, Medium provider confidence; original Maryland 1968 citation/1:250,000. Not actual surface observation or coverage proof elsewhere. |
| MRDS and USMIN landing pages | Both HTTP 200 under explicit research User-Agent | Service documentation reachable; no production WFS feature-query/CORS/scale guarantee. Web-tool 403 and first metadata parse/request failure retained. |

The first metadata response used a non-JSON content type and was not parsed by the original allowlist. An explicit follow-up JSON parse captured metadata. An untagged follow-up request returned 403; tagged request succeeded. Neither was silently counted as a successful dataset-version validation. The helper is read-only; no token or private configuration was printed.

## Proposed additions after approval

Prefer a bounded backend/proxy query adapter registered with the existing provider registry; no new renderer or global scanner. Resolve and pin actual CNGM v2 service/product/layer from official product metadata before changing source ID. **Do not change the current endpoint based only on its name or news.** A genuine replacement receives a new source selection/version, migration-safe saved citations and covered-region validation.

An optional occurrence-reference adapter must select one explicit release first. Proposed normalized envelope:

```js
{
  sourceId, productId, productVersion, recordId, retrievedAt,
  truthType: 'reported-occurrence' /* or historical-feature/assessment */,
  geometry, coordinateReferenceSystem, locationPrecision,
  commodityTerms, reportedStatus, observationDate, citation, sourceUrl,
  license, uncertainty, warnings
}
```

Do not force all reports to points or invent precision when absent. Keep original commodity terms and map them through a reviewed display vocabulary; do not coerce them into inventory IDs. Reject unsupported geometry/oversized responses; paginate with finite result/radius limits. Provider errors yield **reference unavailable**, not “no minerals.” Cached stale references are labeled and never generate fresh collection evidence. Coarsen only occurrence browsing according to provider precision, never current geology point-boundary identity.

## Geography and safety boundaries

Current runtime surface service: its metadata says conterminous US. CNGM v2 product: all states and most territories, but specific layer/service migration unverified. Global fallback: source-dependent Macrostrat coverage. State surveys: sheet/region-specific. Planetary geology: original planetary sources and authored course evidence, not Earth USGS endpoints. Ocean bathymetry is a different provider and cannot substitute for mineral distribution.

Render only bounded visible references when the player deliberately opens the layer; no mine marker implies enterable world content. A reference marker and a published enterable building are different marker types. Do not navigate a player to a real hazardous mine as if it were a validated game station.

## Acceptance before shipping a new source

Pin dataset/layer version and rights; verify mainland/Alaska/Hawaii/territory/outside-coverage and boundary examples; schema missing fields/ambiguous units/multiple maps; 403/429/timeout/offline/abort/oversize/partial transfer; uncertainty/citation rendering at mobile/200%; no repeated requests from inactive career; no item/economy grant from reference response; saved old citations unchanged; exact staging proxy/App Check/CORS at the affected boundary. These are future integration gates, not claimed complete by four read-only probes.
