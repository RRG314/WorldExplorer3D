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
