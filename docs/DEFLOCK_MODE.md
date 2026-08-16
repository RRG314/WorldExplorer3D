# DeFlock Hunt

DeFlock Hunt is a location-based World Explorer 3D game mode. It turns
publicly mapped surveillance nodes into virtual objectives inside the retained
Earth world. Selecting or disabling an objective changes only game state; it
does not affect physical equipment.

## Start a hunt

1. Open **Missions** in the title hub and select **DeFlock Hunt**, or choose
   **Games → Start DeFlock Hunt** while already exploring an Earth location.
2. Choose an Earth location with the normal preset, search, coordinate, globe,
   or geolocation flow.
3. Start exploring. The HUD reports mapped objectives, discoveries, virtual
   disables, score, and elapsed time.
4. Approach a virtual camera and use the normal **E / Action** interaction.

The existing desktop movement modes and responsive touch controls remain in
charge of travel. On touch devices, the normal action area includes a large
**DeFlock** control while this mode is active.

## Mapped information and attribution

Camera locations come directly from OpenStreetMap nodes tagged
`man_made=surveillance`. The bounded query accepts mapped camera, ALPR, and
ANPR surveillance types. When supplied by OpenStreetMap, World Explorer keeps
the node ID, coordinates, direction, timestamp, operator, manufacturer, camera
type, surveillance type, source name, and ODbL provenance. Missing metadata is
shown as unknown rather than inferred.

OpenStreetMap coverage is community-maintained and can be incomplete or
outdated. The runtime first uses a bounded same-origin service that races the
configured Overpass providers outside the browser and keeps a short-lived
last-good response. If that service is unavailable, it falls back to the
existing direct Overpass request, cancellation, memory-cache, and
IndexedDB-cache path. Baltimore also ships with a dated last-good cache of real
OSM nodes for a cold start during a total provider outage. This cache is
identified in the HUD, retains its source timestamps and ODbL provenance, and
is never presented as current live data or used as a second authority.

Required attribution: `© OpenStreetMap contributors` under the ODbL. The game
help surface links to [OpenStreetMap copyright and licensing](https://www.openstreetmap.org/copyright).

The game concept is inspired by the independent
[DeFlock project](https://deflock.org/), which helps people document public
surveillance infrastructure in OpenStreetMap. World Explorer 3D is not
affiliated with or endorsed by DeFlock and does not use DeFlock application
code or a DeFlock-owned data feed.

## Game representation

Each source node is transformed with the canonical Earth geographic-to-world
authority and placed on the shared terrain surface. Mapped direction controls
the virtual camera and direction-zone orientation. Poles, state-colored camera
bodies, lenses, interaction targets, and optional direction zones are rendered
as shared instanced meshes. A state-colored ground ring, short vertical beam,
and elevated beacon make each mapped objective legible against dense buildings
without changing its exact OSM position.

Mapped `camera:mount` and safe height values control the game representation.
Traffic-signal, bridge, gantry, and wire-mounted cameras stay overhead at the
mapped coordinate and receive an overhead support. A pole or unknown mount that
lands inside the mapped road footprint receives a deterministic curb-side
visual anchor while its exact OSM coordinate remains in the source record.
Virtually disabling a camera tips a ground pole from its base or drops an
overhead camera body while leaving its mapped support in place. This animation
is fictional game feedback and does not represent an action on physical
equipment.

The compact hunt HUD stays in the upper-right corner and the persistent game
navigation contracts while a hunt is active. On mobile, the HUD and minimap use
separate bounded regions so neither panel covers the other.

Direction zones use a bounded range and field of view chosen for gameplay.
They are approximations, not claims about a physical camera's recognition
distance or capability. Entering one can apply a virtual score penalty.

Map markers reuse the Earth minimap and large-map pipeline. Their states are:

- red: not yet discovered
- amber: discovered
- cyan: virtually disabled
- outlined: current nearby objective

The large map clusters nearby markers at broader scales and exposes the mapped
metadata and attribution when a marker is selected.

## Progress and multiplayer

Single-player progress works without sign-in. Local storage contains only the
source IDs that were discovered or virtually disabled, plus elapsed/best-score
metadata keyed by source version and location. The geographic source records
remain in the shared OSM cache rather than being duplicated in progress data.

In a multiplayer room, immutable room overlay records hold shared virtual
disables. A callable Cloud Function verifies room membership and the exact OSM
node before a Firestore transaction accepts the first claim. Two players cannot
receive duplicate credit for the same objective. Room listeners rebuild shared
state for players who join or rejoin an in-progress hunt. Clients cannot write
the server-owned shared overlay collection directly.

Completed hunts use the existing unified local/cloud leaderboard UI. Cloud
submission retains the existing authentication and completion validation.

## Lifecycle, empty locations, and privacy

Leaving Earth hides the instanced layer and pauses room listening; returning to
Earth restores the same objectives and reconnects shared state. Main Menu or a
game-mode change aborts the active source request, detaches listeners, disposes
the instanced geometry/materials, clears map markers, and removes the HUD.

If a query returns no mapped surveillance nodes, Earth exploration remains
available and the HUD explains that no mapped cameras were found. The mode does
not invent real-world camera locations.

DeFlock Hunt does not collect license plates, vehicle photographs, live reader
results, or driver data. It contains no instructions for approaching,
damaging, obstructing, or modifying physical equipment. All interaction is a
fictional in-game action.
