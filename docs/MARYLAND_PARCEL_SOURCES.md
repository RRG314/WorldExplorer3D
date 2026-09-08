# Maryland Parcel Sources

Last verified: 2026-09-06.

## Selected source

World Explorer uses one public statewide layer rather than 24 unrelated runtime
clients:

- Name: Maryland Parcel Boundaries.
- Operator/attribution: MD iMAP, Maryland Department of Planning, and SDAT.
- ArcGIS item: `b33e5f03d50844b8819a4046ecfe0d97`.
- Runtime layer: `PlanningCadastre/MD_ParcelBoundaries/MapServer/0`.
- Geometry: parcel polygons for the entire state.
- Native service CRS: Web Mercator WKID 102100/latest 3857.
- Runtime response CRS: EPSG:4326 requested explicitly with `inSR=4326` and
  `outSR=4326`; the game then uses its existing local tangent conversion.
- Service limits observed: query and GeoJSON supported; maximum record count
  1,000. World Explorer uses two pages of at most 250 features, a 900 m hard
  radius, geometry simplification, and a 12,000-vertex per-feature rejection cap.

The official catalog item says the data is supplied as-is and may be freely
distributed when its metadata is retained; derived data must acknowledge the
State of Maryland. World Explorer retains source ID, attribution, geometry date,
assessment date, and the catalog link. Parcel outlines are labeled as exploration
guides, not legal surveys.

## Runtime field policy

Only these fields are requested:

`OBJECTID, JURSCODE, ADDRESS, CITY, ZIPCODE, LU, DESCLU, ACRES, POLYACRES,
POLYID, POLYDATE, SDATDATE, NFMTTLVL, SQFTSTRC, YEARBLT, BLDG_STORY, ZONING,
PFLW, PFUW, PFUS`.

The runtime deliberately does not request `ACCTID`, owner name, owner mailing
address, deed-party, liber/folio, unit/resident, contact, or occupancy fields.
`OBJECTID` is used only for deterministic paging and is not a stable game ID.
The source `POLYID` is required; a stable game ID hashes that public value with
the jurisdiction code. A feature without a recognized jurisdiction, stable
polygon ID, valid Maryland geometry, or reasonable vertex count is rejected.

`NFMTTLVL` is a public assessment input, not a sale price. When present it is one
input to a deterministic World Explorer estimate. The UI calls the result an
"estimated game value" and shows when public assessment data informed it.

## Update and failure behavior

The source exposes `POLYDATE` for parcel geometry and `SDATDATE` for linked
assessment data. These are stored separately and shown separately. The 2026-09-06
live sample audit found jurisdiction samples ranging from 2023 to 2026; freshness
therefore varies by county and field. No uniform current-date claim is made.

Requests begin only when Real Estate is opened at a likely Maryland coordinate.
Results are cached in memory for six hours across at most eight areas. A new
location supersedes old UI work. Timeout, cancellation, malformed geometry,
empty coverage, and service failure never create a procedural parcel. Existing
building-backed Real Estate remains available instead.

## Coverage matrix

`SUPPORTED` means the official statewide service returned a live feature with a
recognized jurisdiction and non-empty `POLYID` on 2026-09-06. It does not mean
every feature is complete or current.

| Jurisdiction | Code | Status | Live sample geometry date |
| --- | --- | --- | --- |
| Allegany County | ALLE | SUPPORTED | 2025JUL |
| Anne Arundel County | ANNE | SUPPORTED | 2026FEB |
| Baltimore City | BACI | SUPPORTED | 2024DEC |
| Baltimore County | BACO | SUPPORTED | 2023NOV |
| Calvert County | CALV | SUPPORTED | 2025NOV |
| Caroline County | CARO | SUPPORTED | 2023DEC |
| Carroll County | CARR | SUPPORTED | 2025JUL |
| Cecil County | CECI | SUPPORTED | 2025NOV |
| Charles County | CHAR | SUPPORTED | 2024SEP |
| Dorchester County | DORC | SUPPORTED | 2025SEP |
| Frederick County | FRED | SUPPORTED | 2024NOV |
| Garrett County | GARR | SUPPORTED | 2025JUL |
| Harford County | HARF | SUPPORTED | 2025JAN |
| Howard County | HOWA | SUPPORTED | 2023DEC |
| Kent County | KENT | SUPPORTED | 2026JAN |
| Montgomery County | MONT | SUPPORTED | 2024JAN |
| Prince George's County | PRIN | SUPPORTED | 2023DEC |
| Queen Anne's County | QUEE | SUPPORTED | 2025FEB |
| Somerset County | SOME | SUPPORTED | 2025JUN |
| St. Mary's County | STMA | SUPPORTED | 2023JUN |
| Talbot County | TALB | SUPPORTED | 2023MAR |
| Washington County | WASH | SUPPORTED | 2025MAR |
| Wicomico County | WICO | SUPPORTED | 2024MAY |
| Worcester County | WORC | SUPPORTED | 2024DEC |

Run `node scripts/verification/maryland-parcels-current.mjs` to repeat the live
metadata, privacy allowlist, distinct-code, and one-sample-per-jurisdiction audit.

## Intentionally unselected sources

County portals and the MDOT SHA Property Parcels Inventory were reviewed as
possible inputs. They are not runtime providers. The official statewide parcel
layer already exposes the required statewide cadastral boundary contract, while
the SHA layer describes agency inventory rather than Maryland land generally.
Adding county clients now would multiply schema, cache, licensing, and outage
paths without improving an existing gameplay decision.
