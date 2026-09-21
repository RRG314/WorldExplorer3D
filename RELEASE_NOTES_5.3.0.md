# World Explorer 3D 5.3.0 — release candidate

This candidate contains the work since deployed 5.2.0 commit
`db62593ba377e276e5079c78238fa3a83e501c93`. These notes describe changes;
release approval requires current artifact, backend and owner acceptance evidence.

- Building windows fit complete bays and floors inside each mapped wall, with
  solid foundation and roof margins. Near and middle-distance buildings share
  that layout. Nearby facades gain aligned sills, frames and architectural trim.
  Procedural appearance remains an inferred representation of mapped geometry.
- Reality Capture connects building selection, guided photo placement, phone
  handoff, a building-aligned floor-plan editor, saved revisions, account review
  and entry into approved captured interiors. Private originals and public
  publication have separate authorization boundaries.
- Streets have connected sidewalks, source-backed crossings and paving aligned
  with terrain. Partial map coverage is confined to the affected road fragments.
- Mapped land cover contributes to terrain materials, and geology exploration
  uses USGS and regional evidence.
- Runtime changes reduce repeated DOM updates, share facade textures and
  equivalent skeleton data, and cull terrain and regional buildings by view.
  Nearby road-junction lookup uses a spatial index while preserving junction
  identities and geometry.
  Static boat parts sharing a material are batched; navigation lights, damage
  panels and smoke retain independent behavior.
  A controlled comparison must establish any performance improvement claim.
- Reliability changes cover doorway clearance, walking pose restoration,
  mobile control overlap, room admission, world teardown and release identity.
  Account deletion includes the hosted collection-group indexes required for
  complete cleanup. Interior previews open facing into the room with a wider
  view and retain mouse/touch look controls.

Acceptance must include functional UI and deployed staging service journeys,
shader/geometry checks and reviewed facade screenshots, actual moving walk/drive
samples, sustained flight and memory retention, matched live/candidate load and
render comparisons, and a physical phone walkthrough. Passing source tests or
emulated touch tests alone does not satisfy these requirements.

Production promotion requires approval of the exact tested build. Preserve a
rollback artifact, wait for required database indexes to become ready, and
deploy compatible backend changes before the frontend.
