# Curated interiors: integration contract

Status: implemented locally October 12; exact checks and limits are recorded in
VERIFICATION.md. No new player, renderer, wallet, database,
property identity, capture-access manager or global content loader.

## Content and placement

A versioned curated record names its representation kind (authored, exhibit-only,
or representative), accuracy label, reviewed source records, mapped association,
local metric layout, entry and floor IDs, exhibit placements and explicit bounds.
Source records pin original URLs/hashes, rights evidence, authors, transformation
recipe, output hashes, triangle/texture/draw budgets and review state. Unknown
rights, missing geometry or a mismatched envelope means no curated publication.

The first slice is an explicitly representative gallery inside a verified mapped
building. Its collection sources are Smithsonian CC0 specimen models and a Met
CC0 artwork. A third-party venue's name or museum address does not imply that
these rooms or objects occur in the real museum. Other cities' map associations
remain informational until their actual content, entry and layout are verified.

## Ownership and lifecycle

1. Existing entry resolves the building and access. Capture denial still denies
   entry; an unavailable public curated asset never changes that policy.
2. Existing resolver selects reviewed content only when source identity and
   geometry agree. Mapped rooms remain mapped; an incompatible curated shell
   falls back to the existing representation.
3. The shared layout compiler validates connected rooms, door clearance and
   containment. The same result supplies visible shell, walk surfaces and walls.
4. Existing Walk/camera handles movement. Exhibit furniture adds bounded proxy
   obstacles; imported scan triangles are visual only.
5. Content loads only after entry; playable shell and exit exist first. Each
   request carries the active interior generation and abort signal. Late results
   release leases without attaching. No content downloads during other worlds.
6. Inspect uses a native panel and existing pause/input-layer authority. Rotating
   an exhibit changes its presentation, never player position or world physics.
   Return restores focus and the current camera; no second WebGL renderer.
7. Learning notes use stable Journal story IDs and the current store. They have
   no tradeable items, money, fake species observation or unrelated mission credit.
8. Exit closes panels, aborts loading, releases model leases and restores the
   same canonical exterior/actor through the existing interior owner.

## Import and update

Only reviewed source manifests are inputs. Bounded HTTPS acquisition goes into a
quarantine directory; content hash and format validation precede conversion.
The importer must not execute downloaded scripts or follow arbitrary embedded
resource URLs. GLB/glTF and raster artwork use distinct validated paths, then
produce a local versioned record consumable by the existing model catalog.
Normalization, optional simplification and texture limits are offline. Imported
assets never enter initial game startup. Removal disables selection and retains
Journal history; asset revisions invalidate only the existing asset cache key.

## Acceptance

Normal mapped-door entry; two connected spaces and at least three working
exhibits; read/rotate/return; keyboard/touch and portrait/landscape; exact exterior
return; durable Journal notes without repeat rewards; two reentries; slow/missing/
malformed assets; exit and world-switch during load; bounded resource slope;
source/packaged regression and unchanged established release budgets. Physical
phone and named-museum accuracy are separate claims.

## October 12 implemented ownership details

The source implementation now uses `content-contract.js` and `museum-catalog.js`
for reviewed identity; `content-resolver.js` preserves capture/home/mapped-room
priority; `gallery-layout.js` compiles the supported front hall and two galleries.
The source-specific profile carries its reference and rejects unknown profiles.
It is an interpretive adaptation, not a measured reconstruction.

`gallery-finishes.js` decorates compiled wall solids and door cuts. Paint swatches
are decoded from sRGB once for Three r128. Repeated trim uses instanced meshes;
there are two 512-pixel local spotlight shadow maps. The interior temporarily
hides the four exterior sky lights, preserving their live color/intensity updates,
and restores each prior visibility on exit. Gallery texture/shadow allocations
have explicit release, including late texture completion. The existing model
cache retains only its bounded templates after all exhibit/furniture leases end.

For this sealed gallery, presentation layer 1 includes the shell, local lights
and all later exhibit/furniture instances. The existing camera temporarily uses
that layer, then restores its exact prior mask. Outdoor geometry, culling flags,
collision and streaming ownership are preserved. This avoids compiling the
entire city against indoor spotlights or drawing it behind opaque gallery walls;
it does not change the rendering policy for other interiors or open spaces.

`gallery-ui.js` initializes the shared screen-layout singleton if no prior panel
has opened. A native modal owns reading focus; normal game HUD is temporarily
hidden. The existing walking camera frames the exhibit without changing the
walking pose, and resumes normal look on close. The floor map uses the same room
and door geometry as collision. No home, road, bridge or tunnel geometry is changed.

The offline import dependencies are exact development dependencies, with lock
integrity reviewed in the existing runtime dependency inventory. Museum source
contracts and the immutable-candidate browser journey are registered in the
existing test/release inventories; no separate unowned verification pipeline.
