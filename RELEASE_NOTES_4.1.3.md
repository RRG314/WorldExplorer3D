# World Explorer 3D 4.1.3

World Explorer 3D 4.1.3 restores the complete selected-location Earth horizon
while retaining the deterministic, non-streaming world architecture released
in 4.1.2.

## Highlights

- Detailed accepted ground remains the near-city authority. A coarse fixed
  terrain mesh now continues land toward a 22 km horizon and excludes exactly
  the detailed tiles that fully published.
- Unavailable edge tiles retain coarse ground underneath, eliminating empty
  square holes without overlapping valid terrain or creating z-fighting
  stripes.
- The fixed background loads once for the chosen location and does not follow,
  stream around, or rebuild for the player, vehicle, drone, or plane.
- Up to 10,000 additional mapped building masses extend urban context outside
  the detailed district. Near-city building publication and its 85% coverage
  target remain unchanged.
- Mapped polygon and ribbon geometry remains the only visible water authority.
  The horizon mesh contains no water decoding, elevation-as-water heuristic,
  blue square, sea-level flattening, or duplicate water surface.
- Catalog stars retain their astronomical coordinates and visibility but render
  behind Earth geometry, preventing stars from appearing through distant land.
- Connected bridge transition profiles are reconciled against the existing 12%
  engineered grade ceiling when endpoint and interior constraints conflict.

## Loading and budgets

The background terrain and mapped context begin during the existing location
transaction and publish once. Gameplay waits for that fixed result instead of
showing a blank horizon that is replaced later. Disabled sidewalk/footpath
presentation remains unloaded, and no continuous-world or actor-centered
streaming pipeline is restored.

Both primary and fallback Baltimore data paths passed runtime verification. The
primary scene published 26,163 near-city buildings, 5,125 roads, 74 mapped water
areas, and 51 waterways; the fallback scene published 24,678 buildings and
3,526 roads. Road surfaces remained bounded to the intended vertex batches.
The fixed far-world diagnostic reported 25 detailed tiles excluded from its
coarse terrain, 39,710 remaining terrain triangles, and 8,021 additional far
building masses.

## Verification

Automated verification covers representative locations worldwide and includes
terrain-source, accepted-ground, hydrology, building coverage, transport,
controller, space-flight, security, browser boot, module identity, hosted-source
reachability, and runtime lifecycle contracts.

The Baltimore runtime journey completed all production checks with zero
application or WebGL console errors. Engineered road grade remained within the
12% ceiling, Earth-to-Moon-to-Earth travel preserved the loaded world, and the
fixed-location world did not republish during the test. The 400-foot aerial
frame was visually inspected for terrain continuity, mapped water ownership,
building coverage, ground striping, square seams, and stars crossing the land
silhouette.

Generated hosting output, browser captures, dependency directories, local
progress notes, and temporary artifacts remain outside the source diff.

## Compatibility and limitations

Terrain, road, building, land-cover, and water detail still depend on mapped
source coverage and provider availability. The far terrain uses lower-resolution
accepted elevation and bounded mapped context for visual continuity; it is not
a second detailed or semantic ground authority. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md),
[DATA_SOURCES.md](DATA_SOURCES.md), and [ATTRIBUTION.md](ATTRIBUTION.md).

## Rollback

The rollback target is the retained immutable 4.1.2 production artifact.
Rollback promotes that artifact and does not rebuild the old source state.
