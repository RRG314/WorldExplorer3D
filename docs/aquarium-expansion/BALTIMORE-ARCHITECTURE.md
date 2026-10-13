# Baltimore: reconstruction evidence and scope

Research date: October 12, 2026. **No measured interior survey obtained.**

## Evidence classes

MEASURED requires dimensional evidence and units. MAPPED establishes placement or
connections. VISUALLY_REFERENCED establishes visible appearance. INFERRED identifies
our dimensional/structural assumptions. REPRESENTATIVE is intentionally generic.
UNAVAILABLE means insufficient evidence or rights. These are separate from gameplay
completion; a tested path cannot turn an inferred wall into a measured wall.

## Geographic anchors

OSM public map API was inspected over the complete waterfront envelope. Campus
relation [6564809](https://www.openstreetmap.org/relation/6564809), version 11,
contains multiple structures. Pier 3 relation
[14162263](https://www.openstreetmap.org/relation/14162263), version 4, joins six
outer ways; Pier 4 relation [14162358](https://www.openstreetmap.org/relation/14162358),
version 3, has an inner roof region. Neither is one interchangeable rectangular
building. The ticket roof (way 440962471) is not the museum entrance identity.
Water View Bridge (way 441501013) is a separate elevated bridge, not ground floor.

The source snapshot is retained locally under `output/aquarium-expansion/research/`.
OSM geometry is ODbL; preserve attribution and a versioned extract. Entry nodes
4390760199, 4390760200 and 4390760201 occur along the pavilion frontage. Their
`entrance=yes` tags do not distinguish main/member/exit doors. Confirm which door
matches the published visitor route before publishing an institutional entrance.

## Public circulation evidence

From the [official accessibility guide](https://aqua.org/assets/documents/National-Aquarium-Accessibility-Guide.pdf),
pages 6–22: Glass Pavilion G connects to 1 and 2. Pavilion 1 joins Blue Wonders
1 and the Pier 4 bridge. Blue Wonders has 1–5 and M; lift A reaches M/5, B does
not. Level 4 begins the descending reef/Shark Alley route to M. Pier 4 has G/1/2.
These are MAPPED connections; floor elevations, widths and wall sections remain
INFERRED. Reference pages were visually inspected locally, not copied into game textures.

| Public area | Evidence | Confidence | Geometry/visual work needed | Difficulty |
|---|---|---|---|---|
| Pavilion G entrance, cafe, orientation | Guide p6; OSM frontage | MAPPED / INFERRED dimensions | Correct door association; paved lobby, glazed structure, furniture and finish review | High |
| Pavilion 1 connector, shop, overlook | Guide p7 | MAPPED | Open connection, guardrails, floor transition; public-only route | High |
| Pavilion 2 Australia | Guide p8; exhibit page | MAPPED | Irregular rock/vegetation habitat and appropriate fauna | Very high |
| Blue Wonders 1 Blacktip Reef overlook | Guide p11; reef exhibit page | MAPPED / VISUALLY_REFERENCED | Shared tank void, perimeter paths, viewing edges and bubble tubes | High |
| Blue Wonders M reef viewing | Guide p16 | MAPPED | Curved viewing wall, continuous water volume, accessible return | High |
| Blue Wonders 2 Maryland | Guide p12 | MAPPED | Multiple regional displays; independent freshwater species evidence | Very high |
| Blue Wonders 3 adaptation / seashore | Guide p13 | MAPPED | Touch-exhibit behavior, dry visitor collision, species review | Very high |
| Blue Wonders 4 regional habitats / river | Guide p15 | MAPPED | Several habitat biomes, documented circulation, daylight transitions | Very high |
| Blue Wonders 5 rainforest / Hidden Life | Guide p14 | MAPPED | Canopy, narrow paths, bird flight, roof/daylight | Very high |
| Descending Atlantic reef / Shark Alley | Guide p15–16; exhibit pages | MAPPED | Long connected ramps, floor openings and nonduplicate tank residency | Very high |
| Pier 4 public floors | Guide p19–22 | MAPPED | Correct dolphins, jellies, seating and connecting bridge | Very high |
| Service, animal-care, plant and security rooms | Outside allowed visitor scope | UNAVAILABLE | Excluded from reconstruction | Excluded |

## First complete route, then building completion

Target the actual Pavilion arrival → Level 1 orientation → Blacktip Reef overlook
→ underwater viewing → same exit. This is a connected section, not the full
aquarium. Do not imply all levels are explorable until those rooms meet the same
asset, circulation and interaction criteria. Expand into Maryland/adaptation,
upper habitats and Pier 4 only after each complete route is reviewed and tested.

The original construction drawings, recent measured heights, exact glazing
thicknesses, stair geometry and a licensed interior scan have not been acquired.
Published tank volume is not enough to solve tank shape. The Sketchfab Baltimore
model found during research has only about 1,600 triangles and no downloadable
license displayed; it is not a usable interior or an approved source.

## Finish and sightline requirements

Use original authored architectural surfaces, licensed PBR materials and reviewed
props. Structural bays and railings must be modeled at human scale. Floor joints
must follow surfaces without z-fighting. Tank glass needs a readable rim and
bounded reflection rather than mirror opacity. Every level needs a visible route
marker and return direction. Seating must leave circulation clear. Ceiling lights
must light the visitor path independently of the habitat. No institutional logo
or copied sign art is required for geographic identity.

## Actual provider correspondence and missing-building cause

The pinned Overture release `2026-09-23.1` includes Pier 3 as feature
`7bacec0b-326a-401f-ad9f-f3ebed72c8cf`, with three polygon components. Its public
source record identifies OSM relation `r14162263@4`; this is explicit provider
provenance, not a nearest-name association. Its single supplied child is
`6251be5f-364a-3ace-90f3-a2e2966e839b`, sourced from `w1061954706@1`.

The importer previously removed all three parent components because it saw that
one child and all network tiles had loaded. That child covers only a small
triangular part. This is a reproduced architectural publication defect, independent
of any aquarium interior. A regression fixture retains the original public
features and source/license record. Parent suppression now additionally requires
actual union coverage of each outline by accepted children. Uncertain geometry
retains its mapped parent; a successful download alone cannot remove it.

The first game survey also offered interiors for Water View Bridge
`07ca0781-716d-4114-a5b4-549b9a086fd7` and the 0.171 m rendered triangular body.
Facade and interaction admission now share the same semantic/headroom gate.
No bridge surface or transport collision rule was changed for this repair.

Restoring these exterior polygons does not supply a measured height, a professional
aquarium model, public interior admission or a resolved compound entrance. Those
remain separate requirements. Multiple polygon components share the provider's
feature identity; they must not be mistaken for independently verified venues.

## Authored reef route implementation — October 12 continuation

The local implementation now encodes Pavilion G, Pavilion 1/orientation/overlook,
and Blue Wonders M with two authored lifts. The mapped outer envelope is the
polygon union of the six OSM r14162263 v4 outer ways, not the rectangular campus
bounds or a museum template. The habitat is an explicit separate polygon: none
of the visitor rooms may intersect it. Underwater glazed boundaries retain full collision; upper overlook guards stop
at their actual guard height. Continuous curved acrylic replaces overlapping
glass boxes. The central opening uses the published 27 ft width / 4 ft projection;
its four flanking flat panes follow the audio tour. Public visitor topology follows guide pages 6, 7, 11 and
16; metric widths, the 0/4.2/8 m floor elevations and finishes remain INFERRED.
They are not measurements extracted from Matterport.

The OSM entrance node 4390760200 sits several metres inside the provider's
simplified Pavilion component. The visible door must be projected onto the
actual rendered wall. Only this reviewed mapped entry allows up to 8 world units
of projection; general mapped entrances retain the 3-unit cap. This is a source
alignment compromise, not an exact reconstruction of the main/member doors.
Distant components of the same Overture ID must never inherit the door.
A future exterior reconstruction should reconcile the Pavilion glass envelope
with the same OSM union rather than loosening all entry eligibility.

Current authored material choices are independently made: existing CC0 concrete
and sand photographs, steel frame geometry, clear curved reef glazing, ceiling
luminaires and unbranded route signs. The public tour was inspected through its
ordinary viewer; no meshes, textures, institutional sign artwork or photographs
were extracted. The acquired rigs illustrate species and retain their authors'
animations. They do not portray the Aquarium's individual rescued turtle.

This section describes implementation, not visual or gameplay acceptance. Current
browser evidence and remaining failures belong in VERIFICATION.md.
