# Phase 3 Structure Compiler Status

**Status:** complete; Phase 3 exit conditions satisfied on hardware

## Implemented

- One immutable `compiled_transport_structures` model is tied to the active
  Phase 2 transport graph.
- Bridge, ramp, overpass, tunnel, short underpass, culvert, covered road,
  indoor-covered road, building passage, cutting and embankment cases retain
  distinct semantics.
- Split compatible ways share deterministic chain identity. Endpoints record
  structure continuation, surface transition, open boundary or incomplete
  source policy.
- Bridge decks, fascia, guardrail offsets/heights and support spacing consume
  the compiled structure specification.
- Tunnels and short underpasses compile shell ranges and real portal stations.
  Covered roads and building passages have distinct roof, wall and portal
  presentation.
- Tunnel and covered collision publishes actor-height-bounded side-wall
  descriptors from the compiled structure and surface. Roofs/ceilings remain
  visual and camera-obstruction geometry; they are not lateral actor obstacles.
  No terminal or centerline wall is generated.
- Zero-meter surface profile endpoints now remain valid instead of being
  treated as missing data.

## Verified evidence

- `npm run test:phase3-structures`
  - taxonomy and `indoor=no`
  - split bridge chains and graph identity
  - incomplete-source non-driving endpoint policy
  - crossing-derived short-underpass shell and portals
  - tunnel/building-passage visuals
  - actor-height-bounded side walls and no lateral ceiling colliders
  - 600-feature compiler fixture
- `npm run test:runtime`
  - 429 mapped structures and 209 chains in the recorded Baltimore run
  - 958 structure colliders, all from compiled structure/surface authority
  - active graph identity matches the structure model
  - no console errors
- `npm run test:phase3-structure-journeys`
  - Apple M1 Metal renderer, real keyboard input, more than 23 seconds of player
    gameplay, and no console errors
  - Golden Gate, Holland Tunnel, Pregerson, and independent Baltimore
    bridge/tunnel worlds loaded through accepted-ground and production
    transport compilation
  - long-tunnel and short-underpass journeys crossed physical compiled portal
    boundaries; Holland also completed a real F-key walk/aerial/drive cycle
  - covered-road and building-passage journeys remained on their compiled
    chains with enclosed camera heights below 2.4 m
  - every journey recorded zero center collision and remained within the
    0.6 m live suspension/surface budget
  - named, paired-instance, portal, covered, building-passage, bridge, tunnel,
    and interchange screenshots were inspected in this Codex task
- `npm run test:phase3-ground-fixtures`
  - Golden Gate, Holland Tunnel, and Pregerson have integrity-bound accepted
    ground from the public unsigned Copernicus GLO-30 distribution
  - no permission-gated source or runtime coverage bypass is used
- Pregerson full-world evidence
  - all 34 detected stacked crossings meet clearance
  - the minimum measured deck separation is 5.529 m

## Exit decision

Phase 3 is complete. Named and paired journeys run through real input on
hardware, collision/visual/graph ownership agrees, portals are traversable,
covered structures keep the camera inside their clearance, and incomplete
routes retain the Phase 2 non-driving policy. No location-specific production
geometry or accepted-ground bypass was introduced.

## Evidence paths

- `output/playwright/phase3-structure-journeys/report.json`
- `output/playwright/phase3-structure-journeys/golden-gate-bridge-player-journey.png`
- `output/playwright/phase3-structure-journeys/holland-tunnel-player-journey.png`
- `output/playwright/phase3-structure-journeys/holland-short-underpass-start.png`
- `output/playwright/phase3-structure-journeys/holland-covered-road-player-journey.png`
- `output/playwright/phase3-structure-journeys/holland-building-passage-player-journey.png`
- `output/playwright/phase3-structure-journeys/pregerson-ramp-merge-player-journey.png`
- `output/playwright/phase3-structure-journeys/baltimore-second-bridge-player-journey.png`
- `output/playwright/phase3-structure-journeys/baltimore-second-tunnel-start.png`
- `output/playwright/runtime-invariants/report.json`
