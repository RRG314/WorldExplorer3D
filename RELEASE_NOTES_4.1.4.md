# World Explorer 3D 4.1.4

World Explorer 3D 4.1.4 stabilizes the fixed selected-location Earth experience
released in 4.1.3. It does not restore continuous world streaming and does not
add a competing terrain, water, road, or building pipeline.

## Highlights

- A location publishes once from six request-matched immutable products:
  terrain, hydrology, transport, buildings, land use, and places. The complete
  Earth scene becomes visible only after the matching snapshot commits.
- Changing locations cancels superseded provider work. An old request cannot
  reveal geometry or overwrite the replacement location.
- Terrain uses one location-wide PBR base material across WorldCover tiles,
  while mapped per-pixel tint preserves local built, vegetated, sand, soil,
  rock, and snow variation without rectangular tile color changes.
- The fixed far horizon reuses mapped surface color at the detailed seam. A
  missing elevation child retries through one unique parent tile under the
  existing 12-worker ceiling instead of removing the complete inland horizon.
- WorldCover values tint the same semantic near/far ground instead of replacing
  far terrain with pale absolute colors; polar fallback terrain uses the fixed
  location's snow surface rather than a generic green-gray elevation color.
- Driving, flying, and crossing the former detailed-terrain boundary do not
  reload or republish fixed-world data. Space return restores the same Earth
  request, selected location, scene root, travel mode, and aircraft pose.
- Space controls retain their screen-relative direction through repeated world-
  axis crossings, and Space remains lazy-loaded outside normal Earth startup.
- DeFlock Hunt is the first Missions and Games entry. It uses publicly mapped
  OpenStreetMap surveillance nodes, keeps mapped mount/height placement, makes
  objectives legible in the world and maps, and supports fictional virtual
  disabling without affecting physical equipment.
- Live GPS Explore follows foreground browser geolocation inside the existing
  fixed world. Accuracy filtering, jump rejection, smoothing, low-power mode,
  pause/manual control, and bounded edge behavior avoid turning Earth into a
  continuously streamed world.
- Brighter environment limits, compact gameplay HUDs, smoother vehicle/camera
  motion, supported elevated roads, graded ramp transitions, and enclosed
  tunnel presentation improve normal exploration as well as location games.

## Loading and budgets

The selected location remains a single bounded load. Disabled sidewalk and
footpath presentation is not fetched or built, movement does not start terrain
or provider work, and returning from Space reuses the retained Earth scene.

On the same machine and connection, the exact 4.1.3 reference loaded Baltimore
in 36.52 seconds cold and 35.25 seconds warm. The 4.1.4 candidate measured 35.68
seconds cold and 32.84 seconds warm: 2.3% faster cold and 6.8% faster warm. All
runs reached stable publication with provider work drained to zero.

## Verification

Automated coverage includes immutable request/session/snapshot behavior,
provider success/abort/timeout/partial/schema fixtures, atomic scene ownership,
terrain request cancellation, WorldCover material ownership, elevation parent
fallback, and release artifact checks.

A real Chromium journey completed a 30-second mapped-road drive, a 30-second
aircraft flight across the measured detailed-terrain edge, and an
Earth-to-Space-to-Earth return. The publication remained unchanged, movement
and Earth return made zero fixed-world data requests, and no application console
errors were reported.

Representative locations worldwide cover Baltimore, Monaco, Iowa farmland,
the Swiss Alps, the Sahara, Antarctica, Lake Tahoe, and open Atlantic ocean.
The reviewed frames retain terrain/building continuity to the horizon without
the former blue square, blank ground, stars through land, striping, or
categorical WorldCover tile blocks.

The production-config hosting artifact also passed bundled-browser startup,
real keyboard driving, and the complete Live GPS/DeFlock mobile journey. The
phone-tested GPS session kept one world identity while physical location
updates moved the avatar.

## Data and attribution

DeFlock Hunt uses OpenStreetMap surveillance nodes under the ODbL and displays
`© OpenStreetMap contributors`. The concept is inspired by the independent
[DeFlock project](https://deflock.org/); World Explorer 3D is unaffiliated with
DeFlock and uses neither its application code nor a DeFlock-owned data feed.
See [DATA_SOURCES.md](DATA_SOURCES.md) and [ATTRIBUTION.md](ATTRIBUTION.md).

## Compatibility and limitations

Map detail still depends on mapped source coverage and provider availability.
The fixed far horizon is visual context for the selected location, not a second
detailed collision world and not actor-centered streaming. See
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), [DATA_SOURCES.md](DATA_SOURCES.md), and
[ATTRIBUTION.md](ATTRIBUTION.md).

## Rollback

Rollback target: immutable release `v4.1.3` at commit
`dabd06b0d6b66e5ef893904018e7ca0233c23de6`. Promote its retained artifact;
do not rebuild historical source.
