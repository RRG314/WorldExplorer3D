# Post-release review: continuous Earth and ship movement

October 11, 2026. Work in progress; no production deployment.

## Scope and baseline

The live manifest was read again and still identifies production source
`d8775a392c4246b2552842c37f40508bd664d4c5`, build
`5.5.0+d8775a392c42.88e67f97c00bb4c2.production`. The working baseline is
`0c0961fe` on `steven/visual-quality`. Production dist, four retained rollback
packages, source history and player storage must remain intact.

The delta contains completed campaign/Journal/provision work, personal workspace
save isolation, ocean depth/entry/submarine authority, licensed vessel and fauna,
continuous ocean scenery, research rooms/map, facility perimeters/transfers,
Earth pavement scheduling, visual color/readability, public media and analytics.
A commit or an old passing receipt is not current release acceptance.

## Findings traced in the current source

1. Regional buildings keep the facade catalog's color but discard its window,
   surface, opening and roof presentation. Their separate world-projected grid
   cannot become the detailed district when the player arrives. Exact polygons
   also share wall/roof vertices, blending incompatible face normals at eaves.
2. Research deck movement never implements an ordinary jump. Space only performs
   the ladder-to-water handoff. Sprint changes speed but always requests walking
   animation. Camera position directly follows individual stair risers and can
   switch between two different eye heights near walls.
3. Regional scheduler cancellation and initial failure recovery need explicit
   review: initial failure is gated by the missing regional mesh, and toggling
   while a region builds does not cancel the obsolete destination.
4. Existing ship route verification proves reachability but did not measure
   camera continuity or airborne movement. Existing regional coverage checks do
   not certify near-detail parity at a newly reached location.
5. Both terrain imagery scales were centered on the original location. The
   terrain could move while its geographic detail remained behind. Broad urban
   classification also suppressed imagery over whole residential neighborhoods.
6. Shared mouse input selected the boat camera while the player was walking its
   deck. The deck controller did not consume camera pitch at all.
7. A regional road raster error was recorded but did not prevent publishing the
   rest of that replacement region. Travel publication now retains the previous
   complete region on that error, as it already does for missing source tiles.

## Finite delivery sequence

- Repair ship movement, ceiling/landing collision and camera; verify physical
  rooms/stairs, running/jumping, water handoff and pause using the licensed mesh.
- Carry compact facade decisions through the regional worker and GPU batches;
  reuse the detailed facade layout/shader and licensed surface catalog. Retain
  source coverage, height authority and bounded cleanup.
- Repair regional cancellation/retry; verify beyond-origin arrival, toggle,
  return, failure/recovery and disposal without resetting the detailed district.
- Review the complete post-release source delta and run the source contract
  chain. Check the changed cross-environment and save journeys against the final
  package, distinguishing controlled providers from live-service evidence.
- Produce one review candidate and a clear test guide. Record any incomplete
  release checks or larger expansion work explicitly; do not deploy production.

## Broader roadmap versus shipped functionality

Full licensed airport terminal/cabin journeys, complete port/gangway packs,
launch-site packs, geographic terrain/farm editing, remaining career/CERN work,
whales/deep squid/global ecology and the broad navigation redesign remain larger
expansions. They are not implied complete by ocean streaming, a perimeter fence,
or a mission starter. This review must not hide them behind a release label.

## Evidence

### October 11 source and real-browser evidence

- `output/streaming-review-20261011/cloud-inventory.json`: fresh safe inventory,
  80 active functions in each project. Production's place gateway remains v1;
  the previously tested offshore-address repair is staging v4. No cloud mutation.
- `ship-interior-final/report.json`: 20 passing cases against the licensed
  furnished vessel and actual deck/input controllers. All 55 route connections
  work in both directions. Space leaves and lands on the deck, mouse drag changes
  deck heading/pitch, maps freeze both, sprint uses running animation, and the
  ladder swim/reboard path and saved galley provisions still work. Maximum
  measured camera rise on the sprint stair route is 0.119 m per 50 ms; collision
  feet retain the actual tread height. Navigation query p95 is 0.1 ms. All tested
  vessel asset leases are released on disposal. Controlled sea, not a phone test.
- `building-appearance/report.json`: actual merged and instanced regional
  shaders, 12 licensed catalog surfaces, near facade openings and night lighting,
  with no graphics or asset errors. Retiring all buildings leaves only the
  fixture ground geometry. This is a controlled visual component test.
- `earth-arrival-final/report.json`: full source app with live map/imagery
  providers and staging attestation. Controlled aircraft arrival at
  39.4347, -76.6912 replaces 375,844 origin instances with 236,471 remote
  instances, increasing mapped buildings within 1.5 km of the destination from
  371 to 751. Local imagery moves with the player. Return restores the same
  85,672,040-byte regional geometry allocation and original building count;
  all 187 retired batches emit disposal. Provider abort retains the last region,
  recovery succeeds, the toggle restores fixed scenery and persists on reload.
  Imagery retains two or three entries at measured checkpoints. No page or
  shader errors. This is controlled arrival, not a sustained flight benchmark;
  unrelated world detail is still finishing during the run, so total renderer
  geometry counts are not presented as a whole-app memory plateau.

Paths above are under `output/streaming-review-20261011/` unless stated otherwise.
Final immutable-package and spaceship checks will be added when complete.
Historical ship/ocean evidence remains in RESEARCH-VESSEL-INTERIOR-DELIVERY.md
and OCEAN-STREAMING-DELIVERY.md and is not substituted for changed-path checks.

## Limits that remain relevant to release

Regional building materials and openings are visual inference unless supplied
by mapped tags. They do not create real interiors, change building heights, or
claim an exact architectural reconstruction. Imagery is dated aerial/satellite
color, with a procedural fallback on provider failure.

Earth's moving scenery window is not yet a globe-spanning physical-road compiler.
Detailed roads/bridges/tunnels still originate from the selected location's
bounded transport source. Regional road color deliberately excludes bridges and
tunnels; it cannot substitute for their physical structure. Pole/date-line
projection boundaries and unlimited-distance Earth origin rebasing remain
separate work. The existing transport authority is preserved by this repair.

The installed explorer rig has no authored jump clip. Jumping now has real
gravity, deck landing and ceiling collision, but uses the rig's neutral airborne
pose. A dedicated authored animation is still an art-quality improvement.

The complete release matrix, ordinary hosted acceptance for this new build and
physical-device performance are distinct from the checks above. Do not mark the
entire roadmap or production readiness complete based on this delivery.
