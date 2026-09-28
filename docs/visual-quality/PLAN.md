# Consistent visual quality across World Explorer

September 28, 2026. Implementation in progress on `steven/visual-quality`.
Production remains on runtime commit `2839df5d`. See `EVIDENCE.md` for completed
checks and remaining acceptance work.
Code inspected at `3994ab67`. This document is the working plan for this effort;
older release and architecture notes are background, not acceptance evidence.

## Outcome

Any selected location should use the same standard of materials, coherent
lighting, believable scale, grounded objects, useful close detail and smooth
transitions. A location must not need a hand-authored showcase scene to look
finished. Earth, spacecraft, people and other worlds should feel like parts of
one product.

Presentation quality and geographic knowledge are separate. We can require a
consistent rendering standard everywhere; we cannot promise surveyed geometry,
high-resolution imagery or known species where those observations do not exist.
Missing observations must produce a coherent regional approximation with known
provenance, not a blank surface or invented factual detail.

Use restrained realism: recognizable materials and plausible construction,
readable surfaces and grounded objects. Ship interiors use an original, orderly
exploration-vessel design. Earth remains regionally varied. Do not mix cartoon
vegetation, realistic furniture and primitive placeholder characters without an
explicit style decision. Do not make every place equally crowded: empty desert,
polar ground and space should be visually convincing without fabricated clutter.

## Findings from the current implementation

These are source observations and a limited review of saved images, not a new
visual audit of every destination.

| Evidence | Implication | Work required |
| --- | --- | --- |
| `scripts/build-ship-room-assets.mjs` resizes every extracted texture to at most 512 pixels | Different-sized objects receive the same texture limit, regardless of close viewing distance | Choose texture resolution by physical surface size and projected detail; retain source masters |
| `scripts/build-ship-equipment-assets.mjs` removes specular and emissive-strength extensions and converts textures to 1024-pixel WebP | Optimized derivatives may differ from the source appearance; this is not proof each conversion is wrong | Compare original, converted and in-game versions under matching lighting; preserve or explicitly translate material meaning |
| `app/js/assets/model-asset-catalog.js` combines multiple Sketchfab creators, stylized nature and different instance policies | Provenance and loading exist, but they do not ensure a common appearance | Extend this catalog with visual-family, scale, material, placement and LOD acceptance |
| `app/js/assets/model-asset-runtime.js` creates a plain GLTFLoader, with no KTX2 setup in that path | Compressed download images alone do not establish low GPU texture cost | Pilot locally served GPU texture compression and verify compatibility before broad conversion |
| `app/js/modules/manifest.js` uses Three.js r128-era loaders | Current documentation is not a drop-in implementation guide for this renderer | Confirm renderer/loader/decoder versions; isolate any necessary upgrade and test custom shaders |
| `app/js/engine/quality.js` changes exposure by quality setting; weather, sky, planetary and ship code also write presentation state | Quality changes and transitions can alter appearance independently | Establish one owner for final presentation state; existing world modes supply explicit profiles |
| `app/js/earth-core/biome-profile.js` and `app/js/terrain/surface-material-blend.js` already classify and blend surfaces, with broad fallbacks | A foundation exists, but broad latitude/class rules cannot identify every regional landscape | Extend existing data classification with regional evidence and confidence; avoid a competing biome system |
| Saved engineering/science views show highly detailed dark props, simpler repeated wall/floor panels and apparently detached pieces | Scene assembly and adaptation deserve investigation alongside asset selection | Check hierarchy, extraction, pivots, mounting, lighting and contact before replacing everything |

The reviewed ship images are `output/verification/ship-gallery/ship-engineering.png`
and `ship-science.png`. The weekly-room image was captured at low quality for a
networking test and is not a fair high-quality visual benchmark. New controlled
captures are required before judging improvements.

## Architecture: extend existing systems

The shared flow should be:

**world observations → resolved regional description → approved material/asset
families → deterministic placement → existing render and interaction systems**

1. **Regional description.** Coordinates, elevation, slope, land cover, mapped
   features and supported climate/geology/season data resolve into a versioned
   description. Record source, resolution, freshness and confidence. Explicit
   evidence wins over a broad fallback; uncertainty must survive resolution.
2. **Material library.** Physical texture scale, color handling, roughness,
   surface relief and wet/snow behavior have reusable definitions. Terrain,
   facades, props and interiors may differ appropriately without contradicting
   one another. Keep unique materials and shader combinations bounded.
3. **Presentation profiles.** Earth atmosphere, weather, interiors, planetary
   surfaces and space provide lighting/exposure/fog profiles to one owner.
   Enter/exit restores the correct profile. Quality tiers change cost and fine
   detail rather than choosing an unrelated color treatment.
4. **Asset catalog.** Extend the existing model catalog and loader. Store source
   identity/license, dimensions, axes, material family, local bounds, contact
   points, mounting sockets, collision policy, animation support, LODs and
   measured cost. Keep shared resources reference-counted and disposable.
5. **Placement.** Existing building, road, vegetation and ship systems consume
   catalog contracts. Respect road clearance, slopes, water, doors, walkways,
   support surfaces and functional access. Seed regional variants by stable
   world/feature identity, not each client's random execution order.
6. **Multiplayer boundary.** Shared world IDs, gameplay collision, interaction
   anchors, collection ownership and room state remain authoritative. Visual
   LOD or a different device tier must not move a door, hide an interactable or
   alter where a networked vehicle collides.

Do not introduce another world generator, parallel inventory, replacement room
system or engine rewrite as a prerequisite for better visuals.

## Work sequence and exit criteria

### 1. Establish the visual baseline and asset diagnosis

Capture the current build at fixed camera positions, time, weather, viewport and
quality. Include a mapped urban street, a mixed natural landscape and a ship
room. Capture movement as well as stills. Inventory visible assets and inspect
original versus optimized model hierarchy, materials, texture density and bounds.

**Deliverables:** visual reference sheets, a defect list linked to rendering
owners, an asset keep/rework/replace list, and per-scene resource measurements.
Distinguish source defects, import defects, lighting defects and placement
errors. Do not replace an asset when its importer or mounting transform is the
actual problem.

**Exit:** every high-impact defect in these representative views has a testable
explanation or a clearly recorded unresolved hypothesis. Appearance goals are
concrete: coherent material scale, grounded objects, readable shape, no clipped
facade bays, no unexplained seams, and useful close detail.

### 2. Calibrate the shared rendering foundation

Work first in `engine/scene-bootstrap.js`, `engine/quality.js`, material setup,
and the existing sky/weather/ship/planet transition paths. Verify color textures
versus data textures, custom-shader output handling, tone mapping, normals and
environment response. Use a small reference scene containing representative
stone, concrete, paint, metal, glass, fabric and skin under day and indoor light.

Give final exposure/environment/fog state a single owner. Consolidate callers
incrementally. Preserve real weather and day/night behavior; do not hide weak
materials under bloom, extreme contrast or permanent fog. Evaluate inexpensive
contact shading before adding costly screen-space effects globally.

**Exit:** the same object has consistent material behavior across modes and
quality tiers; round trips restore lighting; night remains playable and polar
clear weather preserves a legible horizon. Shader/resource counts stay bounded.

### 3. Build the Sketchfab asset preparation workflow

Reassess already acquired models before adding downloads. Prefer compatible
families from a small number of creators. Preview assets in this game's lighting,
not only in the Sketchfab viewer. The current catalog is evidence of recorded
sources, not a fresh verification of every license or download.

| Family | Acquisition/adaptation focus |
| --- | --- |
| Ship structure | Compatible curved-wall panels, door frames, ceiling strips, floor borders and mounting modules |
| Ship workspaces | Engineering equipment, laboratory instruments, medical fittings, seats and storage with coherent construction/materials |
| Earth vegetation | Regional tree/shrub/ground-cover families with compatible realism and multiple detail levels |
| Earth surface detail | Geological rock families, trunks and shore detail suited to actual surface class |
| Streets and buildings | Modular facade details and regional street furniture; preserve mapped footprints and road authority |
| Characters and vehicles | Consistent presentation, animation, scale and attachments for both local and remote players |

Each accepted asset needs a reproducible intake record: source URL/ID, creator,
license and attribution, original-file checksum, conversion settings, output
checksum, dimensions, materials, triangles, draw calls, textures and estimated
GPU allocation. Verify the license permits the intended use and adaptation;
free browsing is not download or reuse permission. Avoid noncommercial-only
content for a monetized release and assets with unclear rights.

Keep immutable originals outside runtime packaging. Generate role-appropriate
LODs and collision proxies; retain transform hierarchies, intended material
response and interactive parts. Use physical texture density and closest normal
viewing distance instead of one global 512/1024 resize rule. Some assets will
need replacement; lossless appearance preservation is not promised for every
optimization.

Pilot KTX2/Basis with compatible, locally hosted decoders and device fallback.
Measure visual artifacts, decode peak and actual supported GPU formats. Do not
assume adding today's loader to the old Three runtime will work. Geometry
compression is a separate measured choice, not a substitute for simpler geometry.

**Exit:** selected assets look coherent at intended distances, preserve their
meaning after conversion, fit the material/resource budgets and can be rebuilt
without an undocumented manual extraction step. No new AI-generated substitute
art is needed; procedural code assembles approved art and mapped geometry.

**Access status:** signed-in Chrome download access verified September 28. The
licensed denoises vegetation master was downloaded through Sketchfab's controls.
Existing ship masters and new source maps have reproducible conversion records.

### 4. Improve Earth through general rules

Extend the existing biome resolver, terrain blend, facade materials, vegetation
and roadside placement systems.

- **Terrain:** combine broad imagery/color with physically scaled local surface
  detail. Use slope-aware mapping on cliffs, shared world coordinates at tile
  boundaries, and restrained variation that breaks repetition. Blend by real
  land-cover boundaries, terrain shape and supported regional information.
- **Architecture:** infer an appropriate building family from mapped tags and
  regional evidence. Fit complete stories/bays, corners, roof edges, entrances
  and foundations to each footprint. Preserve footprint, height and access
  authority. Buildings do not become downloaded generic blocks that overwrite
  the real street layout.
- **Vegetation:** choose plausible regional families, age/size variation and
  density from evidence; respect roads, buildings, water, terrain and sightlines.
  Preserve instancing. Use a controlled approximation when species are unknown.
- **Water and ground contact:** retain one authoritative surface per water body,
  reliable banks/shore transitions, grounded props and continuous roads. Better
  textures cannot correct a bad grade, vertical datum or surface overlap.
- **Fallbacks:** no-data, partial-data and late-data paths use the same approved
  materials and construction rules. Upgrade detail without flash, huge scale
  changes or displacement of shared gameplay objects.

**Exit:** improvements survive new coordinates without location-specific code.
Do not approve a facade or terrain change solely because it looks good in the
city or biome where it was developed.

### 5. Finish the ship as a coherent built environment

Retain the existing circular layout, shared door/collision definitions and room
functions. Replace weak shell materials/fittings and incompatible visible props
with a coordinated kit. Mount screens and instruments to believable supports;
verify cables, bases and clearance. Give engineering, laboratories, medical,
cargo and habitation distinct functional arrangements with common construction.
Lighting and sign design should help players understand where to go and what
can be used. Retain specimen placement, fabrication, crew routes, launch sequence
and multiplayer research state. Inspect all rooms from normal player height,
not just an overhead gallery.

**Exit:** all 25 rooms meet the same construction/material standard; relevant
interactions are reachable; crew and players have clearance; no detached pieces,
wall gaps or placeholder replacements appear during load or camera changes.

### 6. Apply the standard to space, planets and ocean

Use body-specific data/material profiles and distinguish orbital, approach and
surface scales. Solid bodies use supported terrain/imagery; gas giants use
atmospheric travel and must not acquire a fictitious walkable solid surface.
Keep the accepted nebula appearance while diagnosing line artifacts separately.
Preserve observer-relative stars, scientific identifiers and travel selection.
Improve depth cues and transitions with bounded spatial detail, not arbitrary
rock clouds everywhere. Ocean assets, lighting and surface transitions receive
the same material and scale checks.

**Exit:** review every cataloged destination by environment family, plus a
complete destination sweep for missing assets/transitions. No uniform asset kit
is imposed on scientifically different worlds.

### 7. Validate generalization, gameplay and delivery

Use three development references, then a separate, fixed set of at least twelve
holdout locations spanning different continents, urban forms and climates.
Supplement them with reproducibly sampled coordinates and fault cases. Save the
coordinates/seed so failures can be repeated; replace part of the holdout set
between milestones to catch tuning to the test locations.

Coverage includes dense and low-rise cities, rural/crop land, forest, tropical
coast, wetland, rocky/arid terrain, high relief, alpine/snow, polar terrain and
poorly mapped areas. Include tile boundaries, dateline/polar coordinates,
partial/missing data and interruption during loading. Test daytime, night and
representative weather. Compare close, street, flight and horizon views where
applicable. Run heavy checks sequentially.

At each milestone review representative screenshots and short motion captures
alongside objective checks: scale, floating/intersecting geometry, facade fit,
material continuity, LOD popping, resource growth and errors. Image differences
alone are not a beauty score or proof of improvement.

Repeat the affected gameplay journeys: movement/collision, vehicles, entrances,
items on workbenches, collection and interactions; two clients in a normal room
and the rotating weekly room; reconnect and world/ship/planet transitions.
Different quality settings must preserve the same gameplay world.

**Exit:** visual improvements hold in unseen places, relevant behavior passes,
and a packaged staging build is reviewed before another production deployment.
No location can be certified at every possible coordinate; the deliverable is
validated general rules, tested coverage and explicit remaining exceptions.

## Resource and quality budgets

Set budgets from representative scene measurements, not a promise that all
locations can load in a fixed number of seconds or use one fixed RAM total.
Retain the existing failed performance receipt as the baseline; do not relabel
it passing or loosen thresholds to make this work appear successful.

Measure download bytes, decoded CPU textures/geometry, GPU texture allocation,
render targets, draw calls, shader variants, frame-time tails, main-thread stalls,
first playable time, detail completion and repeated-session retention separately.
A 2048² RGBA8 texture with a full mip chain is about 21.3 MiB; a 1024² equivalent
is about 5.3 MiB, regardless of a small PNG/WebP download. Compression savings
depend on the actual GPU format and do not equal whole-process savings.

Use projected detail to allocate texture/geometry quality. Share materials,
instance repeated geometry, load regional assets on demand and release unused
families. Low settings retain the same palette, silhouettes, scale, essential
props and interaction readability while reducing resolution and distant detail.
Budget actor skins and simultaneous players as well as scenery.

Before accepting a change, compare matched warm and cold runs and repeated
sessions; keep weather, camera, quality, coverage and browser comparable. Repeat
noisy timing samples enough to establish variability. Any measured regression
beyond that variability needs a specific visual benefit and a recorded decision,
not an automatic pass. Verify on the M1 and a physical phone before claiming
cross-device fidelity. Mobile emulation is functional evidence only.

## Implementation checkpoints

1. Baseline views, asset diagnoses and reference standard agreed against real
   captures; measured budget table established.
2. Shared rendering calibration and one reproducible asset-family conversion
   demonstrated in the app.
3. Earth rules pass development and holdout locations; mappings and interactions
   preserved.
4. Ship rooms and space/ocean families reach the same standard.
5. Generalization, multiplayer, device and retention review; staging delivery.

Each checkpoint replaces obsolete code in the touched path once callers migrate,
rather than retaining duplicate rendering systems. Inspect measurable output
before expanding the scope. No completion date is asserted before the first
baseline and conversion pilot establish the actual work.

## Technical references

- [Three.js color management](https://threejs.org/manual/pages/color-management.html):
  distinguish color and data maps and audit custom shader output. Adapt concepts
  to the installed renderer version; do not copy modern APIs blindly.
- [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) and
  [Khronos KTX](https://www.khronos.org/ktx/): GPU texture delivery and device
  capability handling; benefits require a compatible loader and measured assets.
- [Sketchfab developer tools](https://sketchfab.com/developers) and
  [download terms](https://sketchfab.com/terms): authenticated downloads and
  per-asset license obligations. No blanket reuse permission is inferred.
