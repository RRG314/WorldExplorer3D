# London bare-earth ground replacement

The previous London grid derived ground from the Copernicus surface model. Independent Environment Agency 1 m DTM point samples showed building-scale relief where bare ground falls. The replacement uses all four covering **EA LIDAR Composite 2022 2 m DTM** tiles, downloaded from the official [survey portal](https://environment.data.gov.uk/survey). All 6,724 published cells have complete valid pixel coverage. The original grid extent and spacing are retained, so this is not a claim of 2 m runtime terrain detail.

Each published value is the mean of the 2 m pixel centres inside the projected grid-cell footprint. The 90 Web Mercator metre spacing is approximately 56 physical metres in London. No missing-data fill, rooftop filtering, invented flattening, or arbitrary vertical offset is used. Source metadata identifies British National Grid and Ordnance Datum Newlyn with OSTN15/OSGM15; the target remains WGS84(G1674)/EGM2008.

The exact non-ballpark PROJ operation uses `uk_os_OSTN15_NTv2_OSGBtoETRS.tif`, `uk_os_OSGM15_GB.tif` and `us_nga_egm08_25.tif`. PROJ reports **8.038 m operation accuracy** for this composite frame/datum operation. That is retained conservatively in every sample's uncertainty, combined with the EA 0.15 m source RMSE and within-cell relief. Agreement at local check points does not establish centimetre absolute accuracy. In central London the ODN-to-EGM2008 height difference is approximately −0.541 m; it is computed per cell from the grids, never applied as a hardcoded build offset.

`config/ea-london-ground-source.json` pins archive, raster and datum-grid SHA-256 hashes and carries source URLs and attribution. Raster headers must identify EPSG:27700 and the expected 2 m layout. The builder rejects altered sources, incomplete cells, missing transformation grids and a different PROJ runtime. The runtime receives only the compiled, hash-bound ground artifact; it does not download LiDAR or transformation grids.

To reproduce, obtain the pinned rasters and `grids/` files from the recorded URLs into a local directory, install `scripts/ground-datum-requirements.txt` in an isolated environment, and run:

```sh
WE3D_DATUM_PYTHON=.datum-venv/bin/python node scripts/build-ea-london-ground.mjs --data-dir=/absolute/path/to/ea-sources
```

The default is a dry run. `--write` updates only London's artifact, manifest and matching catalog entry. Seven independently retrieved 1 m WMS points remain as regression evidence; the sampled 2 m pixel values agreed with them within 0.05 m. Tests compare the coarser published means using a tolerance that allows local relief and verify the observed eastward fall rather than the previous rooftop-height rise. Full assembled-world/browser verification is tracked separately in the repair ledger.

Attribution: Environment Agency copyright and/or database right 2022. All rights reserved. Contains modified data under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
