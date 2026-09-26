# Rewrite impact matrix

The JS/Three column is the recommended staged direction; other columns describe work a future client/migration would actually require. R = reuse directly, W = wrap, P = port logic, X = rewrite presentation/integration, E = replace a limited function with an engine facility. None are blanket subsystem removals. Size is relative engineering complexity, not an unsupported calendar estimate.

| Existing system / source anchor | JS/Three refactor | Babylon/PlayCanvas | Godot | Unity | Complexity / important constraint |
| --- | --- | --- | --- | --- | --- |
| World request/compiler: earth-core, world/compiler | R/W | R/W + X mesh outputs | P/W portable outputs | P/W portable outputs | High: provider, request cancellation, datum and publication semantics |
| Terrain/land cover: terrain | R + W render boundary | X terrain/material adapter | P/X meshes or terrain facility | P/X meshes or terrain facility | High: cannot replace real elevation/coverage with generic engine terrain |
| Roads/intersections/sidewalks/bridges/tunnels | R pure topology, W buffers | R topology, X rendering | P topology or W artifacts, X rendering | P topology or W artifacts, X rendering | High: grade separation/contact/entrances must match |
| Buildings/facades: load-building-pass | W resolved definitions | R semantics, X materials | P semantics, X scenes | P semantics, X GameObjects/meshes | High: source IDs, parts, inferred heights and roof behavior |
| Interior layout: functions/interior-layout.mjs | R | R layout, X renderer | P schema/rules, X scenes | P schema/rules, X scenes | Medium-high: floors/connectors/holes/capture alignment |
| Reality Capture editor/photo rendering | R/W authority | R backend, X viewer | W backend, X editor/permissions | W backend, X editor/permissions | High: private originals/revisions, phone/camera access |
| Player/backpack/progression | R/W | R/W | P rules, W backend | P rules, W backend | Medium-high: preserve versioned saves and receipt identity |
| Road vehicles/traffic | R specs, W controller | P/X controller + E physics where chosen | P/X + E physics | P/X + E physics | High: engine vehicle behavior is not current tuning |
| Aircraft/drone | R parameters, W controller | P/X visuals/input | P/X + E limited physics | P/X + E limited physics | High: custom flight/terrain/airport integration |
| Maritime/boats | R specifications, W presentation | P/X water/controller | P/X water/controller | P/X water/controller | High: water surface authority, buoyancy and port behavior |
| Wildlife/ecology/discovery/fishing | R rules, W visuals | R rules, X animation | P rules, X presentation | P rules, X presentation | High: regional evidence and collection progression |
| Economy/business/property/parcels | R server authority, W client | R authority, W client | W authority, P local rules | W authority, P local rules | High: idempotency/access/virtual ownership; never engine store substitute |
| Rooms/presence/chat/shared blocks | R authority, W presentation | W APIs, X ghosts/UI | W APIs, X engine transport/UI | W APIs, X engine transport/UI | High: admission, leases, revision conflicts and cleanup |
| GPS/AR/Live Earth | R provider records, W browser APIs | W browser APIs, X rendering | W native/browser platform bridge | W native/browser platform bridge | High: device permissions/reach differ |
| Quick Build/editable world | R model/store, W geometry | R model, X geometry | P model, W saves, X geometry | P model, W saves, X geometry | Medium-high: same coordinates and room authority |
| Ocean/underwater | R rules, W renderer lifetime | X rendering, R rules | P/X | P/X | High: separate mode/return lifecycle |
| Planets/rovers | R catalogs/surface authority, W render | R records, X materials/controllers | P/X | P/X | High: scientific vs procedural provenance, camera/body scale |
| Space/Solar System/universe | R frames/catalogs/journey, W render | R rules, X shaders/camera | P rules, X renderer | P rules, X renderer | Very high: hierarchical frames/scale and transitions |
| Solis Reach/Pathfinder/research | R layout/domain, W interaction | R rules, X scenes/UI | P rules, X scenes/UI | P rules, X scenes/UI | Very high: cargo custody, physical research and shared expeditions |
| Firebase/Auth/persistence | R backend, W domain API | R backend, W API | W API/auth integration | W API/auth integration | High: no browser tokens/snapshot objects in core |
| Mobile controls/accessibility | R DOM, W input commands | X bindings, retain DOM if possible | X engine UI/platform integration | X engine UI/platform integration | High: focus, touch, screen-reader and form behavior |
| Moderation/analytics/public site | R | R web administration | R web admin, W native events | R web admin, W native events | Medium: retain privacy and public-site behavior |
| Release/verification | R, add boundary checks | W build, X engine tests | X build/package tests, R backend fixtures | X build/package tests, R backend fixtures | High: hardware coverage and rollback need new proof |

Bevy has broadly the Godot/Unity port burden plus Rust domain conversion. Unreal streaming adds server GPU/session infrastructure and does not reuse current browser presentation. Selective Rust kernels are a different proposal from either engine rewrite: one bounded algorithm can be ported while every feature above stays on the current browser stack.

No component is marked REMOVE AS OBSOLETE: this investigation has not established an unused authority safe to remove. Diagnostic and historical files must be classified by reachability/consumers before deletion. A directory's existence does not make it an independently replaceable system.
