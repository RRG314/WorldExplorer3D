# Aquarium integration design

October 12, 2026. Design pending implementation/verification unless explicitly
marked otherwise in VERIFICATION.md. Extend existing owners; no separate app.

## Representation and circulation

Owner clarification: museums and aquariums are different destinations, with
different buildings and spatial design. Aquarium content must have its own
venue-specific architectural profile, habitat presentation and visitor activities.
Do not feed an aquarium through `fitGalleryLayout`, reuse the Peale room plan,
put tanks on specimen plinths or give it the museum's timber/dado finish package.
Shared infrastructure means movement, geometry validation, asset leases, input,
accessibility and persistence—not a shared visual building template.

Use a reviewed, versioned interior content profile bound to a geographic building
composition. Verify component source IDs, geometry and public entry together.
Never weaken all building-part admission to make one aquarium enterable. Conflicts
with captures/private access or incompatible footprints retain existing fallback.

Extend the shared layout compiler with bounded, explicit boundary presentation
where required: solid wall, glazed wall and guarded opening. Collision stays in
that same compiled output. Habitat voids must be explicit non-walkable geometry,
not transparent floor meshes over a tank. Stair collision is smooth ramp geometry;
visible steps cannot drive camera bob. Physical floor elevations select interactions.
The existing elevator authority must accept authored destinations without replacing
the entire aquarium with a generated office floor.

Separate three things: public architectural shell, habitat water volume, and
species instances. The shell is playable before assets resolve. Public floor
connections, exits and maps remain usable during a download failure. The mapped
entrance retains the exact exterior return state through the existing runtime.

## Habitat lifecycle

Each admitted tank owns one root, clock, bounded population, loading generation,
abort controller and model leases. Its viewing anchors may span rooms/floors.
Use existing model runtime and marine rig helpers; keep aquarium containment
independent of ocean mode, weather, fishing spawn rules and geographic dive depth.
Visibility/residency is based on current and adjacent rooms. Unseen habitats stop
simulation and release leases after a bounded grace period. Never evict a habitat
while it is visible from another floor. Failed/late loads release immediately.

Animation uses the game's update delta and pause lifecycle, not a second RAF.
Species positions stay within a contracted tank volume with clearance for their
full animated bounds. Authored swim clips run on independent cloned skeletons.
No random spawning through rock, glazing or visitor paths. Quality tiers reduce
population/secondary optics, never remove collision, exits, signs or the only
specimen necessary to complete a task.

## Presentation and interaction

Share the compact reading-panel infrastructure by exhibit capability: static rotation remains for
museum objects; habitat observation frames a viewing region and cannot rotate
animals arbitrarily. One shared floor map shows current level, public connectors,
exhibit anchors and exit. Maps come from accepted layout geometry, not a copied
institutional illustration. Existing screen-layout/pause/focus/touch owners apply.

Keep the environment visible beside or above a compact native panel. Use the
current typography, 44px controls, reduced-motion setting, keyboard dismissal,
restored focus and readable path lighting. No splash screen about demos, sponsors,
future access or institutional partnerships. Source/accuracy detail can sit in
the existing expandable information area.

## Assets, persistence and publication

Review source authorship and commercial redistribution rights per asset. Pin source
hashes, optimize offline, record transformations, runtime bytes/triangles/texture
memory and animation bounds. Prefer self-hosted GLBs with original credits.
No Sketchfab iframe, remote runtime API key or hotlinked artist texture.

Use existing educational Journal events, no new database or wallet. A visit does
not imply research credentials, permission to touch an animal, a live observation
or an official partnership. Publishing a geographic representation follows the
existing curated/capture review path; no backend bypass for a demo venue.

## Implementation gates

1. Geography plus licensed assets reviewed.
2. Connected visitor shell and all vertical movement tested.
3. Complete finished route, animated habitat and three saved interactions.
4. Keyboard, touch layouts, network recovery, pause/resume and reentry measured.
5. Museum, ocean, home/capture, outdoor transport and saves regressions pass.
6. Immutable package, ordinary-hosted and separately recorded physical-device
   review before production readiness is claimed.
