# MapComplete Adaptation Report

Last reviewed: 2026-03-19

This report documents how World Explorer 3D used the user-provided MapComplete-style `building_3d.json` reference as a rules source for building interpretation, without turning World Explorer into a direct OpenStreetMap editing client.

## Scope

Reference source audited:

- local MapComplete-style building rules file: `/Users/stevenreid/Downloads/building_3d.json`

World Explorer goal:

- improve runtime and editor handling of vertical building semantics
- preserve the existing moderated overlay workflow
- avoid direct OSM write behavior

## What Was Adapted

The useful ideas from the reference file were semantic, not architectural. World Explorer adopted the following concepts:

1. Building parts should not all start at ground level.
2. `height`, `min_height`, `building:levels`, `building:min_level`, `level`, and `building:part` should be interpreted together as a base/top model.
3. Thin or elevated parts such as roofs, balconies, and canopies need different collision and ground-patch behavior than full building bodies.
4. Elevated parts should be allowed to preserve clearance below where the source tags support that interpretation.

## What World Explorer Changed

Runtime:

- [app/js/building-semantics.js](/Users/stevenreid/Documents/New%20project/app/js/building-semantics.js)
  - added a central building-semantics interpreter
  - computes base offset, effective height, top offset, part kind, and passage-below suitability
- [app/js/world.js](/Users/stevenreid/Documents/New%20project/app/js/world.js)
  - applies those semantics while loading and rendering buildings/building parts
  - keeps elevated parts from being treated like ordinary ground-starting solids
- [app/js/physics.js](/Users/stevenreid/Documents/New%20project/app/js/physics.js)
  - respects thin/elevated building-part collision behavior more cleanly

Editor:

- [app/js/editor/config.js](/Users/stevenreid/Documents/New%20project/app/js/editor/config.js)
  - added `building_part` support and vertical fields such as `building_part_kind`, `building_min_level`, and `part_level`
- [app/js/editor/validation.js](/Users/stevenreid/Documents/New%20project/app/js/editor/validation.js)
  - added validation for vertically meaningful building parts so skywalks, balconies, and elevated shells are less likely to be authored as flat ground blockers

## What Was Not Adopted

World Explorer did not adopt the following from MapComplete:

- direct OSM write flows
- MapComplete's editor UX model
- MapComplete-specific rendering or tag-UI contracts
- any requirement that World Explorer data structures match MapComplete internals

World Explorer remains:

- a World Explorer-native 3D runtime
- a moderated overlay-authoring platform
- a separate product with its own runtime, admin, and publishing workflow

## Why This Was Useful

The MapComplete-style rules file helped strengthen these cases:

- elevated building parts
- overhangs
- skywalk-like connectors
- roofs and canopies
- reduced false road blockage from elevated building geometry

It was most useful as a clean reminder that vertical building semantics should be treated as explicit structure rules, not inferred only from a flat extrusion fallback.

## Current Limits

This adaptation improves interpretation, but it does not fully solve every visual or traversal issue by itself.

Still separate work:

- elevated transport deck welding and ramp continuity
- richer enclosed skywalk modeling
- more detailed roof/balcony geometry
- deeper indoor/outdoor connector semantics

## Future Value

This work makes future OSM ecosystem compatibility easier because World Explorer now has a clearer internal model for vertical building semantics. It does not enable direct OSM editing by itself.
