# Post-release review: continuous Earth and ship movement

October 11, 2026. Focused repairs implemented and verified in the review preview;
no production deployment. Broader release gaps are explicit below.

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

The production-to-working-source review separates these delivered increments
from the larger requests they started:

| Area | Implemented increment | Still outside a completion claim |
| --- | --- | --- |
| Earth | Preserved source coverage, near pavement scheduling, moving terrain/building presentation | Moving physical transport/building interactions, global coordinate rebasing, full visual parity |
| Ships | Licensed vessel/sub, furnished rooms, maps, shared Journal/provisions and movement repairs | Authored jump animation and further art polish |
| Oceans | Separate authored studies and geographic voyages, bounded depth/scenery streaming, vessel custody and save recovery | Complete worldwide ecology, whales/deep squid and expanded activities |
| Progression | First Bearings, Harbor, Three Views, workspace and lunar/homecoming sequences | Full career campaigns, remaining scientist/mining/CERN requests |
| Creative play | Room isolation, possession ownership and compatible saves | Geographic terrain/farm editing and a complete construction/destruction loop |
| Facilities | Mapped perimeters and supported transfers | Fully furnished airport terminals, harbor/gangway packs and launch-site gameplay |
| Data/backend | Bounded providers/caches, truthful unavailable states, staging offshore address repair | Approved production promotion of that repair and final live-service release acceptance |
| Release/public presentation | Prior gallery/color/readability/analytics work, current source checks and focused journeys | Final whole-release matrix, final public capture refresh, physical-device performance |

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

### Final package and hosted acceptance

The retained package is `output/hosting-validation/streaming-reviewed`, build
`5.5.0+31ab54cd264b.113b39b42da96b2a.staging`. Its 678 payload files have asset
manifest SHA-256 `8001cc65e1b2b7462c019bd43820e752c6897f2cbb952a16730b8623273962f9`.

- `selected-gates.json`: all eight selected packaged gates pass: regional
  arrival, capabilities, marine habitat, research, diving, local water entry,
  spaceship traversal and artifact integrity. This is a selected run, not the
  complete release matrix. The matrix's separate aggregate manifest deliberately
  does not certify an incomplete selection.
- `packaged-earth-final/report.json`: the built app passes remote arrival,
  moving imagery, return, toggle, provider recovery and regional disposal. The
  destination capture shows facade openings, surface variation and roof colors
  beyond the original detailed district. Provider data is live; arrival position
  is controlled, so this does not measure sustained flight performance.
- `packaged-spaceship/report.json`: actual held-key traversal reaches all 25
  rooms across 27 routes including lift transits. Door passages, jumping and
  landing, and all 31 observation views pass, with no captured runtime errors.
- `packaged-research/`: the 16-case full-app journey verifies room actions,
  navigation chart, survey/rewards, map layouts and the same vessel after reload.
  Route following steps the real controller; it is not elapsed-time evidence.
- `packaged-ocean-fallback/report.json`: 11 cases pass against this exact package
  and the retained d877 release. Keyboard tile crossing, repeated 9 km setups,
  rebasing, nine-tile residency, outage handling, remote save/reload, diver/sub
  custody and original-vessel recovery work. The actual fallback reads and
  writes its old voyage while the candidate preserves the continuous voyage.
  Depth responses are controlled; the test is not global coverage certification.
- `hosted/report.json`: ordinary hosted Chrome passes real mouse look,
  Shift+W running, Space jump and landing, galley entry, bridge stairs/chart,
  and desktop/phone-width ship map. There is no provider interception or debug
  attestation, and no captured page errors or failed HTTP requests. Room routes
  step the real controller. Phone-width screenshots are not a physical-device
  performance test.
- The first hosted jump assertion expected a deck jump at the dive ladder.
  `hosted-diagnostic/report.json` traces the intentional water transfer, not a
  menu-focus failure. The corrected journey physically runs away from the ladder
  before jumping; no runtime change or weakened movement assertion was needed.
- `hosted-identities.json` confirms the preview build and unchanged d877
  production. Only the existing staging Hosting channel was updated. No source
  push, production deployment, Functions, rules or player-data changes occurred.

Paths above are under `output/streaming-review-20261011/` unless stated otherwise.
Historical ship/ocean evidence remains in RESEARCH-VESSEL-INTERIOR-DELIVERY.md
and OCEAN-STREAMING-DELIVERY.md and is not substituted for changed-path checks.

The superseded `streaming-ready` validation package was retired only after all
678 payload hashes matched the retained package. Its manifests and receipt remain
in `retired-validation/`; 276,321,775 payload bytes were reclaimed. Production
dist, the four saved fallback packages, source history, the prior research
candidate and player storage remain intact. All owned check browsers closed.

## Owner test build

[Open the review preview](https://we3d-staging-20260712--ship-review-1011-pb8x1l4l.web.app/).
The channel expires October 18 in America/New_York. Check the HUD source label
`31ab54c` to identify this build.

1. Start the Coral Shelf research outing. Use WASD to move, Shift to run and
   mouse drag to look. Away from the dive ladder, Space jumps and lands on deck;
   beside the ladder, Space enters the water.
2. Use Ship map to choose Galley, Crew quarters and Chart table, then follow the
   passages and stairs. Destination selection sets a route; it does not teleport.
3. Enter the spaceship and walk through doors and between decks; check jumping
   and the observation screen's inside/outside views.
4. On Earth, keep “Load regional scenery as you travel” enabled and fly beyond
   the starting district. Arriving facade detail and imagery should follow.
   Turning it off restores fixed-location scenery. This setting still does not
   extend physical roads or interactions worldwide.

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
Regional facade detail also does not extend the starting district's building
interaction/collision collection. The current settings description correctly
limits this option to moving terrain and mapped scenery.

A complete physical-world expansion must publish source roads, structures,
building contacts and interaction indexes as one bounded geographic cell set,
then rebase every dependent actor/camera/navigation frame together. Acceptance
must include long travel in both directions, bridge/tunnel crossings at cell
edges, returning to authored locations, save reload and failed-source rollback.
Replacing the regional appearance renderer alone cannot close those requirements.

The installed explorer rig has no authored jump clip. Jumping now has real
gravity, deck landing and ceiling collision, but uses the rig's neutral airborne
pose. A dedicated authored animation is still an art-quality improvement.

The complete release matrix and physical-device performance remain separate from
the focused hosted acceptance above. Do not mark the entire roadmap or production
readiness complete based on this delivery.
