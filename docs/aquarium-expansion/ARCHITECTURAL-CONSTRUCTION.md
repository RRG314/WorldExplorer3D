# Building construction decision and correction

October 12, 2026. Applies to authored venues; existing player homes and mapped
interiors must remain compatible. This is an implementation decision, not a
claim that the aquarium or museums have passed visual acceptance.

## Initial audit result (before this correction)

The shared layout compiler is a useful foundation: a room graph produces shared
walls, doorway cuts, walking surfaces and collision. Replacing it with unrelated
render-only assets would lose that agreement. However, the current aquarium is
a playable blockout, not finished architectural reconstruction:

- Floor planes have no slab edges. Slab thickness exists in the data but is not
  rendered. Wall textures use normalized box UVs and stretch with wall length.
- Lifts have stop coordinates and decorative fronts, without a reserved physical
  shaft. This allows a visible object to disagree with the walking geometry.
- The same glazing treatment is used for a tall tank window, a curtain wall and
  an overlook guard. These have different heights and construction.
- Room labels and reachability do not prove actual door clearance, shaft
  exclusion, headroom or reference accuracy.
- The first aquarium images fail visual review: open background through the
  Pavilion, generic ceiling lights and sparse habitat. Working animal animation
  does not resolve those failures.

## Established workflow adapted to this browser game

[Epic's level workflow](https://dev.epicgames.com/documentation/en-us/unreal-engine/geometry-brush-actors-in-unreal-engine)
separates playable blockout, finished meshes, lighting, collision/performance
testing and polish. Its [modular construction guidance](https://dev.epicgames.com/documentation/unreal-engine/designer-01-project-setup-and-level-blockout-in-unreal-engine)
uses consistently scaled reusable pieces where appropriate and bespoke meshes
for irregular spaces. Neither requires every wall to be a purchased model.
[Blender's glTF material documentation](https://docs.blender.org/manual/en/3.0/addons/import_export/scene_gltf2.html)
describes the PBR channels and baking/export limits used by the browser asset
pipeline. These sources establish a workflow, not evidence for this venue's plan.

Use one accepted building specification with separate outputs:

1. **Evidence and dimensions:** floor plans, dated photographs/tour references,
   connected public areas and geographic envelope. Record measured versus
   estimated dimensions. Do not fabricate an exact survey from a visitor map.
2. **Construction:** wall runs, clear door openings, floor slabs, voids, guards,
   glazing, stair flights/landings and lift cores. Stable element identities and
   consistent units are required. Shared walls are built once.
3. **Presentation:** reusable architectural assemblies with correct material
   scale; venue-specific modeled architecture and licensed GLB exhibit/prop
   assets. Museum joinery and aquarium glazing retain different finishes.
4. **Movement:** simple collision and support surfaces derived from the accepted
   construction. Detail geometry does not redefine where the player can stand.
   A lift transfer is an explicit interaction at a real landing, not permission
   to walk into a shaft. Continuous ride animation is a separate feature.
5. **Runtime:** existing Walk, interaction, asset lease, pause and Journal owners.
   No new player controller, renderer, save system or venue-specific physics.

## Correction order and acceptance

| Stage | Deliverable | Required evidence |
|---|---|---|
| Construction contract | Compiled openings, slab depths, distinct guard/glazing, reserved lift cores | Rotated and irregular plans; no floor inside cores; invalid core/door rejection |
| Shared architectural meshes | Closed slab edges, consistently scaled UVs, framed openings, enclosed lift fronts | Mesh bounds agree with collision; clear widths/headroom preserved; no duplicate museum trim |
| Reference reconstruction | Correct Pavilion/reef section, sightlines, glazing bays, structural details; separate Peale treatment | Compare actual game views with source references; estimates remain explicit |
| Finished art and lighting | Licensed habitat and exhibit art, PBR finishes, credible enclosed space | No blank-background windows, stretched textures or empty showcase rooms; bounded resource use |
| Complete visit | Entry, routes, observations, maps, lift return, exit, retry and reentry | Real input journey, error checks, persistence and resource cleanup |
| Release | Immutable candidate, regression review and owner review | Source tests alone never count as visual or production acceptance |

The first two stages correct the foundation. They must not be presented as the
completed high-realism aquarium. Upper aquarium exhibits, Pier 4 and the full
museum programme remain distinct authored work in the parent plan.


## Reference correction and water — October 12

The [institution's opening announcement](https://aqua.org/contact-us/newsroom/press-releases/2013-03-25-national-aquarium-to-open-12-5-million-blacktip-reef-exhibit-in-baltimores-inner-harbor-in-august)
publishes a 27-foot window and four-foot projection. The earlier authored 21 m
width / 8 m projection was unsupported and is replaced by an 8.2296 m chord,
1.2192 m sag circular arc. A later recap says 28 feet; this is a published-source
discrepancy, not survey-level precision. [Audio tour track 15](https://aqua.org/visit/accessibility/audio-tour)
establishes four flat windows and the central curved opening. Flat-bay spacing,
floor elevations, tank footprint/depth and room height remain inferred.

[CambridgeSeven's project photographs](https://www.cambridgeseven.com/project/national-aquarium-of-baltimore-blacktip-reef/)
were inspected for deep concrete gallery edges, panel joints, dark ceiling
structure, open overlook rails and lower viewing windows. Photographs are
references, not copied textures. The corrected local construction has thick
shared wall solids, clear door apertures, closed slab edges, reserved lift cores,
separate guard heights, four framed flat windows and a continuous curved sheet.
The skin and physical pier collision use the same endpoints. Museum layouts now
also use explicit wall thickness and the shared slab/door construction, while
retaining their own joinery and exhibits.

Contained water uses locally adapted MIT Three.js r128 Water2/Reflector/Refractor,
not another renderer. Two bounded RGBA targets render actual reflection and
refraction. Both sides have dielectric Fresnel including water-to-air total
internal reflection, animated normals and small surface displacement. Submerged
materials attenuate by ray distance inside the actual polygon; the lower view
also attenuates the surface-to-window leg. Dry gallery distance is excluded.
Caustic highlights are a bounded shader approximation on upward-facing surfaces,
not a fluid, wave-optics or measured water-quality simulation. The existing
simulation clock owns animation and pause. Shared asset materials are cloned,
restored before lease release and disposed; targets are released on exit.

The full game uncovered a second independent architectural error: outdoor
building collision still crossed the enclosed authored route. At the stopped
position the nearest authored wall was 1.72 world units away, while the second
mapped aquarium part was 0.281 units away (the actor radius is 0.28). Contained
authored interiors now select their own dynamic collision collection, as ships
already did; exterior roofs, placed blocks and street furniture are excluded.
Exiting restores the ordinary geographic world. Legacy partial/mapped interiors
retain their previous behavior. Component regression tests cover both sides.

Remaining visual acceptance: the pavilion still needs a modeled geographic
exterior visible through its glazing; the habitat needs its actual rockwork,
dense coral communities and broader licensed population; the five-storey atrium
and upper programme are not reconstructed. The reef roof is an estimated closed
enclosure. These corrections are not a claim of a complete institutional replica.


## Renderer integration findings

The gallery and aquarium now share the occupied-venue lighting lease. Its camera
mask, shadow-camera mask and outdoor-light visibility are restored on exit.
Entry and late asset arrival explicitly invalidate shadow maps because the
engine disables automatic shadow updates. Museum spotlights previously looked
at the outdoor layer, which excluded the exhibits from their shadow maps.
Aquarium fixtures and museum spotlights now use inverse-square falloff and
intensities calibrated with the engine's physically-correct-light setting.
These are authored lighting choices, not a measured venue illuminance survey.

The isolated aquarium fixture originally omitted that renderer setting, making
its older images an invalid brightness comparison with gameplay. The fixture
now uses physical lighting and the medium-quality shadow type. A separate GPU
regression demonstrated that an override-material normal/depth pass overwrote
the water's scene-color targets. The aquarium adapter skips optical updates
during override passes; the test compares framebuffer hashes before and after
the same normal pass. No global postprocessing effect was disabled to pass it.

The same fixture was then run through the actual engine postprocessing setup.
Its default r128 composer targets allocated 16-bit depth, producing visible
layer conflicts absent from direct rendering. Both existing ping-pong targets
now request packed depth/stencil; actual GPU readback confirms 24 depth bits.
Half-float color is selected on WebGL 2 with EXT_color_buffer_float to preserve
dark linear-color gradients before display encoding. The 8-bit color fallback
remains on other devices. No additional full-screen targets are created. At
1280×800 target resolution the pair's nominal color/depth storage rises from
about 12.3 MB to 24.6 MB; the existing pixel-ratio and resolution policy still
bounds it. This is not a fresh whole-world performance or physical-phone pass.
Very thin distant joints can still alias; the complete venue still needs its
final art/lighting and distance-detail review.

The final in-game museum images exposed a separate environment-light owner bug.
Outdoor PMREM illumination still reached indoor PBR materials after the outdoor
lamps were hidden. The shared venue lease now removes that outdoor environment
while occupied. The Earth environment publisher keeps its current capture but
does not assign it to an occupied aquarium/museum scene; exit restores that
current capture, including weather changes made during the visit. A runtime
component test exercises both venue states and late environment replacement.

## Underwater surface rejection and projection repair

The owner rejected the earlier underside image: the sharp repeated reef floor
read as a misplaced ceiling. Earlier functional passes did not establish visual
acceptance. An independent flat-plane calculation found the basic mirror aligned;
the ripple shader instead used world X/Z as a fixed screen-space offset, unrelated
to the camera orientation or distance to reflected geometry. This understated and
misdirected the image distortion while changing Fresnel separately.

Each optical pass now publishes its actual virtual-camera projection and inverse.
Supported devices reconstruct visible scene depth and reproject the perturbed
reflection/refraction ray at that distance. Water normals use the mesh's tangent
basis. Smaller periodic ripples and a narrow reflection filter retain moving
habitat detail without the previous sharp floor copy. The two color passes remain;
optional sampled depth replaces their depth renderbuffers. Devices without depth
textures use camera-projected normal distortion, not the old world-axis offset.
The method has captured-view limits: rays leaving that view blend back to the
planar sample. It is not multi-bounce ray tracing or exact curved-acrylic optics.

A second diagnostic changed only the scene background color. It changed the thin
bright waterline, identifying leaked background samples from the clipped optical
passes. Enclosed-tank passes now clear transparently; filtered color retains its
coverage at the wall contact. Background and renderer clear state restore even
on failure. This fixes the seam without changing the habitat wall or hiding it.

The technique follows established projective water/refraction practice described
in [GPU Gems 2, chapter 19](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-19-generic-refraction-simulation).
[Evan Wallace's water demonstration](https://madebyevan.com/webgl-water/) was
reviewed as a higher-fidelity reference for reflections, refractions and caustics;
its ray-traced pool and height-field simulation are not implemented here.

The renderer regression uses physical red markers at known positions, camera
roll and six above/below viewpoints for both depth and fallback shaders (12
cases). Marker pixels stay aligned. The closed tank's waterline has zero pixel
difference when the outside clear color changes between magenta and green.
These establish specific projection/boundary repairs, not complete habitat art
quality. Sparse habitat and incomplete institutional reconstruction remain open.
