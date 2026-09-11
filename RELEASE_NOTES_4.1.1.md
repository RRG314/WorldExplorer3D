# World Explorer 3D 4.1.1

World Explorer 3D 4.1.1 is a stabilization release for selected-location exploration. It removes the unfinished Continuous World runtime and consolidates terrain, structures, movement, and scene publication around one location session.

## Highlights

- Removed Continuous World, Overture streaming, and duplicate streaming geometry owners.
- Added atomic location loading and cancellation so stale requests cannot replace the active world.
- Unified terrain and surface queries used by walking, driving, flying, spawning, placement, and cameras.
- Compiled bridges, elevated roads, ramps, underpasses, and tunnels with explicit layer and clearance rules.
- Reworked building facades around mapped materials and restrained fallback textures.
- Added improved roof forms, rooftop detail, landmark loading, terrain seams, shadows, and render interpolation.
- Restored My Places naming and double-click exploration while retaining custom coordinates in the globe selector.
- Preserved Earth, Ocean, Moon, Mars, Space, editors, multiplayer, account features, and mobile controls.

## Verification

The release suite covers source reachability, runtime ownership, Firestore rules, terrain and transport contracts, location replacement, movement modes, planetary transitions, mobile layouts, editor and multiplayer flows, artifact identity, and representative locations worldwide.

Installed Chrome testing covered walking, driving, drone flight, mode transitions, and visual inspection on the release candidate. The location matrix includes dense cities, steep coasts, high mountains, desert, rural terrain, open water, landmarks, bridges, tunnels, and stacked interchanges.

## Compatibility and Limitations

World detail depends on mapped geometry, elevation sources, provider availability, and browser hardware. Missing facade, roof, height, or structure metadata uses a restrained fallback and is not presented as authoritative real-world detail.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [DATA_SOURCES.md](DATA_SOURCES.md), and [ATTRIBUTION.md](ATTRIBUTION.md) for current limitations and source information.
