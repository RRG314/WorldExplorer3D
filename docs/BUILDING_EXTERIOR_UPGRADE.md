# Building Exterior Upgrade

## Purpose

World Explorer keeps mapped building footprints, elevation alignment, height/level evidence, roof evidence, collision, entrances, interiors, roads, terrain, parcels, and POI associations authoritative. This upgrade changes only the generated exterior presentation used when mapped facade detail is unavailable.

## Before inventory

The stable renderer already provided five shared facade atlases, seven facade rhythms, four deterministic phase/tone variants, one six-cell entrance atlas, mapped roof geometry, terrain-aligned foundations, near/mid LOD, and geometry batching. It did not have a broad semantic exterior catalog, material surfaces without baked windows, varied window/door/storefront systems, or bounded shared 3D facade details.

## Current system

- `building-exterior-catalog.js` selects one deterministic exterior profile from stable building identity, mapped type/use tags, dimensions, density, and restrained regional material bias.
- The catalog contains 31 building families, 24 material variants, 12 window systems, 12 door systems, 8 active storefront systems, and 14 optional detail-module names.
- Near buildings use shared wall surfaces with shader-projected windows, storefront glazing, and the existing shader-integrated functional entrance.
- Mid-distance buildings retain the established facade atlases and merge per-building facade tint and roof appearance into batch attributes.
- Cornices, parapets, steps, stoops, railings, porches, balconies, fire escapes, awnings, service fronts, loading canopies, garage surrounds, and chimneys are assembled from one shared box primitive into no more than six material batches.
- Low quality disables exterior detail geometry. Performance, balanced, and quality tiers use increasing radii and source-building caps.
- Exterior details have an independent world-load collection and cleanup path. They are hidden with the Earth scene and open-ocean suppression, and never replace collision or transport structure geometry.

## Source truth

Mapped tags continue to win for facade material, facade color, roof material, roof color, dimensions, placement, and identity. Inferred families and all generated facade details publish the claim `generated-visual-representation`. No regional choice is presented as a real-world observation.

## Asset decision

Six Poly Haven CC0 1K surfaces were accepted because they are reusable materials rather than full buildings, have clear redistribution rights, fit existing mapped footprints, and batch efficiently. Full modular building packs were rejected for this pass because substituting authored whole buildings would conflict with mapped massing and footprint truth. A Sketchfab search result with inconsistent license presentation was also rejected. Full provenance and checksums are recorded in `app/assets/textures/ATTRIBUTION.md`.

## Performance contract

- shared texture pool; no texture cloning per building;
- shared material pool with per-building mid-LOD appearance stored in merged vertex attributes;
- at most six added detail draw calls;
- 180 m / 150-building balanced detail envelope;
- no new collision bodies;
- no changes to road, sidewalk, terrain, parcel, POI, entrance, or interior authorities.

## Verification

The focused catalog and integration tests cover deterministic selection, semantic family classification, quality tiers, signed-hash safety, mapped-source preservation, publication order, lifecycle cleanup, and transition visibility. Chrome pilot evidence is written to `output/verification/building-exteriors/after/chrome/` and is not a production artifact.
