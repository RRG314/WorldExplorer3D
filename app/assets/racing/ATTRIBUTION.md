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
