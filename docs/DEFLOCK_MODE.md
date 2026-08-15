# DeFlock Hunt

DeFlock Hunt is a location-based World Explorer 3D game mode. It turns
publicly mapped surveillance nodes into virtual objectives inside the retained
Earth world. Selecting or disabling an objective changes only game state; it
does not affect physical equipment.

## Start a hunt

1. Open **Missions** in the title hub and select **DeFlock Hunt**.
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
outdated. The runtime uses the existing bounded Overpass request, cancellation,
memory-cache, and IndexedDB-cache path. It does not import or maintain a second
surveillance dataset.

Required attribution: `© OpenStreetMap contributors` under the ODbL. The game
help surface links to [OpenStreetMap copyright and licensing](https://www.openstreetmap.org/copyright).

## Game representation

Each source node is transformed with the canonical Earth geographic-to-world
authority and placed on the shared terrain surface. Mapped direction controls
the virtual camera and direction-zone orientation. Poles, state-colored camera
bodies, lenses, interaction targets, and optional direction zones are rendered
as shared instanced meshes.

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

## Focused verification

Use these focused gates while changing the mode:

```bash
npm run test:deflock-model
npm run test:deflock-multiplayer
npm run test:deflock-browser
npm run test:rules
npm run test:gameplay-plugins
npm run test:mobile-controls
npm run test:css
npm run test:module-versions
```

`test:deflock-browser` launches installed Google Chrome, intercepts only the
DeFlock Overpass query with `scripts/fixtures/deflock-surveillance.json`, and
checks the Missions launch, placement, direction, terrain height, discovery,
virtual disabling, reload persistence, maps, Earth lifecycle, cleanup, and an
iPhone-sized touch journey. Its screenshots and report are written under
`output/playwright/deflock-browser/`.
