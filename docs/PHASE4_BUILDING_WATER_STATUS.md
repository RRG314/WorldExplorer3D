# Phase 4 Building and Water Provenance Status

**Status:** complete; Phase 4 exit conditions satisfied

## Implemented

- One immutable `compiled_building_provenance` model owns every rendered
  building source feature. Meshes, batches, roofs and colliders retain the
  corresponding authority record.
- Overture is the geometry authority only when the requested tile coverage is
  complete. Public Shortbread data remains the fallback. OSM metadata may
  enrich a building only through an explicit stable feature identity; centroid
  proximity is never treated as identity.
- Outline and part relationships are assembled before suppression. A parent is
  suppressed only when coverage is complete; partial boundary coverage keeps
  the parent instead of creating a missing shell.
- Height, levels, minimum height/level, facade material/color, roof shape,
  roof height/material/color and name retain mapped/inferred status and source
  provenance. Mapped landmarks are protected from generic facade and roof
  rules.
- Every building foundation records its accepted-ground artifact, provider,
  datum, sample range, ground base and deterministic structure offset. Building
  publication does not mutate terrain.
- One `water_surface_registry` resolves ocean, coast, inland area and waterway
  ownership, stable part identity, priority, holes, access, datum and
  navigability. Published water meshes carry the registry record.
- Boat discovery requires containment in a registered navigable surface.
  Private or excluded water, proximity-only shore/tunnel cases, polygon holes,
  vertically separated water and subgrade road contexts are rejected.
- Building publication uses a deterministic 8,000-source budget and rejects
  footprints touching the compiled road core, keeping collision and load costs
  bounded without changing accepted ground or transport authority.

## Verified evidence

- `npm run test:phase4-provenance`
  - stable mapped and inferred field provenance
  - rejection of ambiguous metadata
  - complete/partial parent-part suppression policy
  - accepted-ground foundation contract
  - water registry priority and duplicate replacement
  - polygon-hole containment and private-water rejection
  - proximity, submerged-tunnel and navigability boat gates
- `npm run test:runtime`
  - 6,112 valid building authority records in the recorded Baltimore run
  - 5,735 outlines and 377 parts
  - 119 registry-owned water bodies, 16 navigable
  - zero duplicate/unowned building or water publication
  - zero center/lane collision hits and no console errors
- `npm run test:phase4-journeys`
  - Apple M1 Metal renderer with real browser keyboard input
  - accepted-ground production worlds at Baltimore, Monaco, Golden Gate,
    Holland Tunnel and the Dead Sea
  - dense/generic urban, sloped mountain/coast, coastal water, inland
    below-sea water and water-adjacent tunnel coverage
  - real G/ArrowUp/G boat entry, movement and exit at Golden Gate
  - boat remains attached to `water_surface_registry`
  - horizontally water-contained Holland Tunnel samples are rejected through
    subgrade context
  - stable building/water counts, no orphan/duplicate ownership and no WebGL
    context loss
- Regression suites
  - accepted-ground, surface, transport and compiled structure contracts pass
  - Phase 3 structure journeys and presentation remain unchanged

## Data and permission decision

Phase 4 uses public, unsigned Overture, OSM/Overpass, Shortbread and Copernicus
artifacts already accepted by the repository. No permission-gated dataset,
credential, access bypass or location-specific production geometry was added.

## Exit decision

Phase 4 is complete. Every rendered building and water feature has one
authority record, cross-source guesses are rejected, boundary parent/part
policy is deterministic, mapped attributes remain distinguishable from
inference, foundations consume accepted ground without mutation, and boat
selection cannot originate from an unregistered, non-navigable or subgrade
surface. The recorded city, slope, coast, inland-water and tunnel images were
visually inspected in this Codex task; no floating building shells, duplicate
water sheets or water seams were observed.

## Evidence paths

- `output/playwright/runtime-invariants/report.json`
- `output/playwright/phase4-building-water-journeys/report.json`
- `output/playwright/phase4-building-water-journeys/baltimore-drone.png`
- `output/playwright/phase4-building-water-journeys/monaco-drone.png`
- `output/playwright/phase4-building-water-journeys/golden-gate-drone.png`
- `output/playwright/phase4-building-water-journeys/golden-gate-boat-journey.png`
- `output/playwright/phase4-building-water-journeys/holland-tunnel-drone.png`
- `output/playwright/phase4-building-water-journeys/dead-sea-drone.png`
