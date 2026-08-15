# Transport Structure R&D Plan

## Goal

Produce one worldwide transport-structure system in which the mapped road
alignment remains the drive surface, while one compiled structure assembly
owns bridges, ramps, elevated approaches, supports, tunnel enclosure, portals,
collision, and camera clearance. Location-specific geometry and renderer-side
structure guesses are not permitted.

## Authoritative inputs

1. Exact OSM way geometry and its bridge/tunnel segment boundaries own the
   structure interval when available.
2. The compiled transport graph owns connectivity and merge identity.
3. The compiled transport surface owns the longitudinal and lateral drive
   surface.
4. Accepted terrain owns ground and tunnel cover.
5. Generalized vector roads may provide non-colliding visual continuity and a
   sparse terrain/road-conflict-aware support fallback, but may not invent hard
   support collision, barriers, portals, or tunnel collision.

OSM treats bridge and tunnel tags as properties of a split road interval.
Bridge approaches may instead be embankments; tunnel entrances occur at the
mapped tunnel interval boundary. ASAM OpenDRIVE likewise models a bridge or
tunnel as an interval on one road elevation profile and requires smooth
junction entry and exit. These rules fit the app's fixed-location, non-streaming
world and do not require a separate tunnel scene.

## Current root defects

- `structure-visuals.js` independently suppresses road deck bodies and all
  supports when a structure is short, curved, ramp-like, or surrounded by
  other elevated roads. This creates the floating interchanges it was intended
  to simplify.
- Exact road bridges currently receive two overlapping body implementations:
  segment boxes and an elevated shell. Their endpoint behavior and thickness
  differ.
- Abutments are emitted only for pedestrian connectors, so vehicle bridges and
  ramps can end as exposed vertical slices.
- Tunnel camera mode is selected from a road semantic tag. A tagged way with no
  buried shell is treated as enclosed, while an actual shell transition can
  lose camera containment when nearest-road identity changes.
- Existing green tests prove counts and isolated straight fixtures, but do not
  require full structural-body coverage, supports on complex ramps, smooth
  visual tie-ins, or camera containment inside the compiled shell.

## Replacement contract

- Every complete elevated road publishes one continuous underside/body across
  its mapped structure interval. Exact geometry receives engineered detail;
  generalized geometry receives only a non-colliding continuity shell.
- Body thickness tapers to the available ground clearance at a surface tie-in
  and closes at its ends. A road structure cannot terminate as an open floating
  slab.
- Exact elevated structures receive deterministic support stations derived
  from structure type, width, length, surface elevation, terrain, and crossing
  exclusion zones. Each station compiles its actual column layout; a candidate
  column is rejected or moved outside the deck when its vertical volume would
  cross another driveable surface. Dense/curved interchanges may reduce detail
  but may not delete structural support wholesale.
- A complete generalized bridge receives the same body-coverage guarantee and
  sparse visual supports at wider spacing. These supports are never colliders
  and are explicitly not treated as mapped engineered detail.
- Real bridge ends receive abutment/tie-in treatment. Low-clearance approaches
  resolve as ground-supported transitions rather than arbitrary piers.
- Tunnel shells publish only where the complete outside roof width has accepted
  cover. Exact graph surface connections own portals; internal terrain cover
  fluctuations never create portals.
- Camera enclosure is active only when the actor is laterally inside a compiled
  shell/covered interval. The camera target is constrained between the compiled
  floor and ceiling and still ray-tests shell, road, building, and portal
  geometry.

## Tunnel construction decision

Use one compiled spline-tunnel system. Terrain holes, modular pieces, Boolean
subtraction, and a separate tunnel scene are not independent runtime owners.
The spline system has one internal closed cross-section and one narrow portal
interface with terrain:

1. The tunnel compiler proves buried shell ranges from the accepted terrain and
   exact road surface before any tunnel mesh is published.
2. One reusable closed cross-section (floor, walls, ceiling) is swept along
   that compiled road spline. These are not separately managed modular assets;
   they are consecutive rings of the same compiled shell.
3. Terrain visibility masks are local to graph-owned portal mouths. They must
   never cut the full tunnel path or create a second terrain authority.
4. Buried shells remain in the normal world scene and are hidden from exterior
   views by terrain depth occlusion. Only the portal aperture exposes them.
5. Runtime Boolean terrain subtraction is rejected: it is too expensive and
   seam-prone for thousands of arbitrary global road paths, and duplicates the
   accepted terrain owner. Boolean carving remains appropriate for offline,
   hand-authored landmark assets, not the worldwide procedural fallback.

There is no separate tunnel scene. Keeping tunnels in the same coordinate and
physics world preserves mode switching, multiplayer positions, and road-graph
continuity; camera behavior changes only while the actor occupies a compiled
shell interval.

## Required evidence

- Pure fixtures: straight bridge, curved ramp, stacked interchange, bridge
  surface tie-in, exposed tunnel tag, buried tunnel, split tunnel chain, and
  steep tunnel approach.
- Browser journeys: Monaco tunnels and ramps, New York bridge/tunnel crossings,
  London bridge/tunnel coverage, San Francisco landmark bridge, and one inland
  interchange fixture.
- Each browser report must include structure-body coverage, unsupported-span
  count, support/abutment count, portal ownership, tunnel roof cover, camera
  floor/ceiling clearance, real-input traversal, and inspected screenshots.
- No terrain, water, building, or actor-driven loading owner may be added or
  replaced by this work.
