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
- This is a geographic source, not a released playable venue. Full ground,
  banking, vertically separated crossings, timing-line placement, presentation
  and gameplay acceptance remain required before race admission. World source
  inspection is enabled with racing explicitly closed. It does not
  substitute for the tourist, GP or combined endurance layouts.

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
