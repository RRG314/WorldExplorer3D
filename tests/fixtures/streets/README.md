# Street geometry fixtures

`baltimore-city-tile.json` is a 64 × 64 world-unit cell captured from the local
Baltimore preview on 12 September 2026. It contains public map geometry and
street tags, with rendering, account, and provider configuration omitted.
It exercises the same polygon compiler used by the city worker.

Map data: © OpenStreetMap contributors, ODbL 1.0.
https://www.openstreetmap.org/copyright
The preview used generalized Shortbread transport data after the detailed
Overpass requests failed. This fixture therefore tests fallback geometry; it
is not evidence of surveyed sidewalk dimensions.

`san-francisco-frontages.json` was captured on the same date from the San
Francisco preview. Its 28 road segments and 189 nearby building edges reproduced
a polygon-union performance defect: splitting every road into touching strips
triggered expensive containment repair. The corrected compiler constructs one
outline for each street side. The same public-map attribution applies.

`baltimore-reported-corner.json` captures the cell containing the lowered corner
reported at approximately 39.3098, -76.6150 on 12 September 2026. A rendered-world
ray hit terrain at local x=3.7039674333, z=-13.8068811099 instead of pavement.
The fixture contains only the public geometry and tags needed by the compiler;
account data and provider configuration are omitted. It reproduces the building
corner gap and carries the same OpenStreetMap/ODbL attribution above.

`baltimore-chase-frontage.json` contains the prepared cell southwest of the
39.3025, -76.6125 origin, captured from the user's Chrome preview on
12 September 2026. Neighboring facades with different setbacks caused endpoint
rays to reject an otherwise supported frontage. The regression samples the
previously unpaved interval at local x=-24.5, z=14.5–20.5. Road records retain
only the street-section tags used by this compiler; account and provider
configuration are excluded. The same OpenStreetMap/ODbL attribution applies.

### Hill-district quality fixtures

`monaco-hill-quality.json` (43.7384, 7.4246) and
`san-francisco-hill-quality.json` (37.7924, -122.4147) contain public OSM ways
and a sampled elevation grid. Roads use the app's transport normalizer and
structure classifier. Each file records the OSM database timestamp and source
elevation tile URLs. Relations and building heights are excluded; these are
bounded component fixtures, not complete city reconstructions. The test domain
is 256 × 256 world units. Elevation is resampled to an 8-world-unit grid, which
is then triangulated consistently for both the test ground and height queries.
This does not reproduce the full app's engineering cuts or road height field.

Map data © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
Terrain Tiles was accessed on 12 September 2026 from the
[AWS Open Data registry](https://registry.opendata.aws/terrain-tiles/).
See the dataset's [source attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
The normalized map extracts retain ODbL attribution; elevation retains the
upstream sources' attribution and licensing rather than being relabeled ODbL.

To refresh these intentionally frozen fixtures, download OSM ways using the
Overpass query below, substituting the recorded origin, then download the
`terrainUrls` recorded in the fixture. Save the inputs using the explicit paths
listed in `capture-street-quality-fixture.mjs`, and run that script with `monaco`
or `san-francisco`. It performs no network calls or dependency installation.
Review resulting geometry changes before accepting a refreshed baseline.

```text
[out:json][timeout:20];
(way[highway](around:180,LAT,LON);
 way[building](around:200,LAT,LON);
 way[landuse](around:200,LAT,LON););
out geom;
```
