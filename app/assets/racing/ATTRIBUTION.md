# Racing geographic source packs

These are independently compiled geographic game data. No circuit/series
endorsement, official timing certification, copied venue maps, sponsor graphics
or game-extracted track models are included.

## Silverstone GP source, October 29, 2026

- Road geometry, topology, tags and source-way versions: © OpenStreetMap
  contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  [Attribution](https://www.openstreetmap.org/copyright).
- The adapted geographic database is `silverstone/source.json`. Its exact bounded
  Overpass query, data timestamp and raw-response digest are retained in its
  `source` member. `scripts/racing/build-venue-source.mjs` and
  `config/racing-venues/silverstone-layout.json` document the derivation. Mapper
  account metadata is omitted. Reuse of this database follows ODbL, independently
  of the project's source-code licence.
- The 5.891 km reference comes from the [2026 Formula 1 circuit facts](https://www.formula1.com/en/racing/2026/great-britain).
  A conservative authored 12 m usable corridor refers to the [FIA's July 2025
  circuit register](https://api.fia.com/sites/default/files/circuits_fia20250707.pdf).
  These are factual references, not imported artwork or a claim of a complete
  measured pavement boundary. Original OSM widths remain in the source tags.
- Terrain: Environment Agency copyright and/or database right 2022. All rights
  reserved. [Open Government Licence v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
  The modified ground artifact and full source/datum/resampling evidence are in
  `../ground/silverstone/`. The original data is the [EA 2022 1 m bare-earth DTM](https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc).
  The delivered grid uses 4 m Web Mercator spacing (about 2.46 m on the ground at
  this latitude), bilinear source sampling, ODN-to-EGM2008 normalization and 1 cm
  quantization. It is not a 2026 laser scan or a 1 cm accuracy claim.
- PROJ datum grids: [OSGM15](https://cdn.proj.org/uk_os_OSGM15_GB.tif),
  [OSTN15](https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif) and
  [EGM2008](https://cdn.proj.org/us_nga_egm08_25.tif). The ground manifest retains
  pinned versions, hashes, transformation definition and stated uncertainty.

The mapped centreline is 5,880.623 m. World Explorer's existing local coordinate
metric produces a 5,870.386 m route. Neither is stretched to the published
reference. The game's Hamilton Straight timing line and results are independent
of official circuit or championship records.

## Full Nordschleife geographic source, October 29, 2026

- Road geometry, topology, tags and source-way versions: © OpenStreetMap
  contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  [Attribution](https://www.openstreetmap.org/copyright).
- The adapted database is `nordschleife/source.json`. Its source member retains
  the finite query, provider endpoint, data timestamp and raw-response digest.
  Reproduce it with `scripts/racing/build-venue-source.mjs` and
  `config/racing-venues/nordschleife-layout.json`. Mapper account metadata is
  omitted. Its database licence is independent of the source-code licence.
- The full connected loop comprises 53 source ways and 1,067 original spans,
  including T13 and five mapped bridge ways. The two-dimensional geodesic
  centreline measures 20,746.161 m; the [venue's reference length](https://www.nuerburgring.de/info/nuerburgring/race-tracks/nordschleife)
  is 20,832 m. No stretching, official record certification, venue artwork,
  sponsor graphics or endorsement is included.
- A seven-metre conservative authored usable corridor refers to the minimum
  retained mapped width, not an independent pavement-edge or bank survey.
  Original varying widths, surfaces and bridge/layer tags remain intact.
- This is a geographic source, not a released venue pack. Full-loop private
  practice uses an authored game timing line on the T13 straight, separate from
  official records. Detailed presentation and full gameplay acceptance remain
  unfinished. It does not substitute for the tourist, GP or combined endurance
  layouts.
- The T13 exterior retains [OSM bleacher way 34435441](https://www.openstreetmap.org/way/34435441),
  version 7 dated April 19, 2026, under ODbL 1.0. The adapted outline is in
  `app/js/world/nordschleife-t13-survey.js`; mapper account metadata is omitted.
  Original terraces, benches, aisles and railings interpret that plan and
  Rheinland-Pfalz DOP20 source imagery. Heights and details are authored
  estimates, not a measured architectural survey. No orthophoto is bundled.
  Orthophoto source: © GeoBasis-DE / LVermGeoRP2026,
  [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0),
  [LVermGeoRP](https://lvermgeo.rlp.de/geodaten-geoshop/open-data/) [Daten bearbeitet].

### Reviewed bridge and approach profiles

`nordschleife/decks.json` contains five reviewed bridge profiles, derived from
167 normalized DOM1 stations, and nine adjoining pavement profiles with 1,714
retained stations. The source observations are retained in
`config/racing-venues/observations/nordschleife-decks.json` and
`config/racing-venues/observations/nordschleife-approaches.json`; the pinned source
rasters, road digest, required ground digests and reproduction parameters are in
`config/racing-venues/nordschleife-decks.json`.

© GeoBasis-DE / LVermGeoRP, [DOM1 data](https://geobasis-rlp.de/data/dom1/current/tif/),
under [Data licence Germany – attribution – Version 2.0](https://www.govdata.de/dl-de/by-2-0).
The retained filenames identify 2025; this does not establish a flight date for
every pixel. Geographic paths remain © OpenStreetMap contributors under ODbL 1.0.
World Explorer 3D fitted a four-metre pavement core and reconstructed its planar
camber across the wider mapped pavement. Vehicles, rails, vegetation and other
outer DOM returns are not admitted as pavement observations.
Eight rough approach stations are excluded. Gaps of at most 8.05 m between
retained stations are explicitly reconstructed; they are not additional measured
points. Graph reconciliation may adjust the retained pavement core by at most
5 cm relative to its recorded profile. This is a local fitting bound, not an
absolute survey accuracy claim.

Heights are normalized from ETRS89/UTM32 with DHHN2016 heights to the existing
EGM2008 target through the pinned GCG2016 and EGM2008 grids. The recorded PROJ
pipeline is applied in its **inverse** direction for this conversion. The
operation's stated 8.1 m accuracy is retained separately from the observed local
fit residual. GCG2016: © BKG, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
with [source information](https://cdn.proj.org/de_bkg_README.txt). EGM2008:
[NGA grid information](https://cdn.proj.org/us_nga_README.txt).

Reproduce the runtime profile from the pinned observations:

```sh
node scripts/racing/build-venue-decks.mjs \
  --config=config/racing-venues/nordschleife-decks.json --output=/new/path/decks.json
```

These profiles do not enable the unfinished venue or certify official geometry,
timing, full-width surveying or venue presentation.

### Delivered Nordschleife ground

`../ground/nordschleife/` contains the four retained 4 m ground grids and their
manifests from LVermGeoRP DGM1, file-year 2025. © GeoBasis-DE / LVermGeoRP2026,
[dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0),
[www.lvermgeo.rlp.de](https://lvermgeo.rlp.de/geodaten-geoshop/open-data/)
[Daten bearbeitet]. The manifests retain all original source URLs, hashes,
normalization operation and uncertainty. Bare-earth data excludes bridge decks;
the reviewed DOM pavement products above supply those independent surfaces.
Delivery spacing and quantization are not source-accuracy claims. No new source
rasters or external artwork were acquired for this delivery step.

### Daytona tri-oval geographic source

`daytona/source.json` retains 26 raceway ways from one bounded native
[OpenStreetMap API](https://api.openstreetmap.org/api/0.6/map.json?bbox=-81.087,29.175,-81.055,29.197)
observation on October 30, 2026. © OpenStreetMap contributors, under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Mapper account and
changeset metadata are omitted. The five selected ways form the tri-oval,
excluding the chicanes, road-course and pit-lane alternatives. Original node
identity and coordinates remain intact.

The mapped centreline measures 4,017.926 m against the venue's 4,023.36 m
reference; the difference is retained. The candidate 12 m usable corridor is
authored, not a surveyed pavement boundary. API observation time is separate
from an Overpass replication timestamp. No official artwork or logos are used.
Reproduce with `scripts/racing/build-venue-source.mjs` and the hash-pinned raw
response declared by `config/racing-venues/daytona-layout.json`. This source
does not enable the unfinished venue or certify banking, timing or oval rules.

### Daytona ground

`../ground/daytona/` derives from public-domain USGS 3DEP one-metre bare-earth
data, project FL_Peninsular_2018_D18, tile 17 x49y323, acquired December 2018–April
2019 and published October 20, 2022. The
[official tile metadata](https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/FL_Peninsular_2018_D18/metadata/USGS_1M_17_x49y323_FL_Peninsular_2018_D18.xml)
records its limitations. World Explorer 3D extracted unchanged native pixels,
resampled at native pixel centres, normalized the datum and quantized delivery.
No USGS endorsement is implied. Unknown source vertical accuracy remains
separate from the datum operation and delivery precision.

The manifests pin NOAA GEOID18 and NADCON5 transformation grids, and the NGA
EGM2008 grid. [NOAA grid information](https://cdn.proj.org/us_noaa_README.txt),
[NGA grid information](https://cdn.proj.org/us_nga_README.txt). The source window
is reproduced by `scripts/racing/extract-native-ground-window.mjs`; the shared
ground product is reproduced by `scripts/build-usgs-venue-ground.mjs` with
`config/racing-venues/daytona-ground.json` and the retained hash-pinned inputs.

### Daytona grandstand exterior

`app/js/world/daytona-grandstand-survey.js` retains the complete 238-vertex
unclosed plan of [OpenStreetMap way 350943720](https://www.openstreetmap.org/way/350943720),
version 10, March 7, 2025, and its mapped 42.6 m height. © OpenStreetMap
contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The native API observation above supplies the source nodes; account metadata
is omitted. The plan and source height are geographic facts, separate from the
original estimated architecture in `daytona-grandstand-exterior.js`.

Public-domain USDA NAIP imagery acquired January 17, 2023, observed through
[USGS NAIP Plus](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer),
provides exterior reference. The retained observation locks USDA raster IDs
36724–36727; its flight date differs from the 2022 program year. No imagery,
logos or sponsor artwork are game textures. The three seating tiers, 68 rows,
two concourses, glazing and access-bay details are original estimates. They
confer no interior admission or official venue endorsement. The existing
building publication, collision and resource owners manage this exterior.
