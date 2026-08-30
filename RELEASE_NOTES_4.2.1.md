# World Explorer 3D 4.2.1

World Explorer 3D 4.2.1 is a visual-polish and public-showcase update for the
4.2 release. It replaces the simplest player and traversal models with a
cohesive, performance-bounded expedition style while preserving the fixed-world
architecture, movement behavior, physics, collision, cameras, water ownership,
and planetary controls from 4.2.0.

## Improved player and vehicle presentation

- The player is now the Field Navigator, with a more intentional outdoor
  exploration silhouette and the same four-limb walking animation contract.
- The road vehicle is now the Classic Utility car, with a readable matte-green
  body, practical proportions, rotating wheels, and the existing two-headlight,
  collision, suspension, and chase-camera behavior.
- Boat travel uses the Harbor Scout expedition boat with a shaped hull,
  enclosed cabin, work deck, rails, navigation equipment, radar mast, and
  outboard presentation.
- Flight uses the Trailblazer expedition plane with a high wing, bracing,
  bush gear, cockpit glazing, navigation lights, and the existing animated
  propeller hook.
- Space flight uses the Wayfinder expedition spacecraft with a central cabin,
  swept surfaces, twin engine pods, running lights, and shared cool-blue thrust
  effects.

These are procedural runtime meshes. They add no external model download and
do not introduce another renderer, world stream, animation loop, physics body,
or gameplay controller.

## Public visual overview

The README, landing page, and GitHub Pages overview now include direct browser
captures of expanded New York, Baltimore, Monaco, San Francisco, the Golden
Gate Bridge, Los Angeles, London, Tokyo, Dubai, and phone-sized DeFlock gameplay.
The DeFlock copy continues to state that virtual camera disabling is fictional
gameplay and cannot affect real equipment. A developer-facing system inventory
documents the current runtime and reconstruction boundaries without changing
game behavior.

## Performance budgets

The visual upgrade remains deliberately small:

- Field Navigator: 628 triangles.
- Classic Utility car: 1,060 triangles.
- Harbor Scout boat: 889 triangles, 33 meshes, 13 materials, no transparency.
- Trailblazer plane: 1,098 triangles, 29 meshes, 10 materials, no transparency.
- Wayfinder spacecraft: 1,288 triangles, 24 meshes, 10 materials; transparency
  is limited to three shared thrust-effect materials.

Boat and plane meshes are created only when their travel mode is used. The
spacecraft remains in the separate lazy Space scene. Inactive Earth travel
actors stay hidden, and none of these presentation changes starts provider
queries or reloads the selected world.

## Verification

Automated coverage enforces the mesh, triangle, material, transparency, actor
footprint, propeller, engine-glow, and exhaust budgets. Existing controller,
module-identity, maintainability, asset, CSS, hosting, and release contracts
remain part of the production gate.

Installed Google Chrome completed the full DeFlock desktop/mobile journey and
aircraft motion capture with no fatal browser errors. A real-input Golden Gate
boat journey stayed attached to the authoritative mapped-water registry, moved
under throttle, and exited normally. The space-control suite completed 1,680
multi-axis steering samples with a normalized flight quaternion and bounded
camera motion. Representative locations worldwide remain covered by the
existing fixed-world release matrix.

## Data and attribution

The visual meshes are project-authored procedural geometry and add no new data
or third-party asset license. Existing OpenStreetMap, terrain, imagery, weather,
space, and DeFlock-related attribution remains unchanged; see
[DATA_SOURCES.md](DATA_SOURCES.md), [ATTRIBUTION.md](ATTRIBUTION.md), and
[ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).

## Compatibility and limitations

This update intentionally does not change vehicle handling, aircraft
performance, boat navigation rules, collision dimensions, or space-flight
physics. Map detail still depends on source coverage and provider availability.
See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Rollback

Rollback target: immutable release `v4.2.0` at commit
`993ab660255bff3abf5bc4f9b544972402adeec4`. Promote its retained artifact;
do not rebuild historical source.
