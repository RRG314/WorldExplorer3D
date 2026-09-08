# Floor-plan editing and playable digital homes

## Recommendation

Build a floor-plan-first interior editor inside World Explorer. Start with a short home setup, give the player a gridded plan with editable rooms, doors and stairs, and derive a blank, walkable 3D interior from that plan. Photographs decorate the resulting surfaces; they do not determine the underlying room geometry. One saved layout must drive both views, collision and traversal.

The product sequence is **Set up home → Arrange floor plan → Add photos inside → Test and save**. A whole home does not need to be finished before one room can be saved and previewed. Conversely, finishing a room must not lock it into an isolated box that cannot connect to the rest of the home.

This is a development design, not a declaration that the editor is implemented. Repository observations refer to the local checkpoint `d973e62c`. Source pages were checked on September 8, 2026; older manuals establish interaction patterns rather than current feature parity. Recommendations and numerical targets below are project design choices, not construction standards or measured performance results.

## Established methods and their relevance

Sweet Home 3D documents an editable 2D plan synchronized with a 3D view, plan-image calibration against a known length, closed-room creation, wall openings, levels and visitor viewpoints. These are useful precedents for separating structural editing from decoration. Its guide is for version 7.5; no claim is made that its complete desktop feature set transfers to this application or to every phone. [1]

Floorplanner's published format explicitly distinguishes projects, floors, plans, walls, openings and decoration on each side of a wall. Its Roomplanner documentation also describes an optional initial-room wizard. This supports a guided entry into a structured editor, not deriving an accurate house from bedroom counts. [2][3]

Staircases in Sweet Home 3D are associated with upper-level floor/ceiling cutouts, and their height must correspond to the floor elevation. This is a useful architectural precedent: a staircase is more than a placed model. The game additionally needs tested player clearance, collision and floor-loading behavior. [4]

Three.js supplies polygonal geometry and ray-based picking; it does not supply home semantics, ownership, floor-plan validation or working doors automatically. Polygon triangulation and polygon validation are different tasks. Earcut explicitly cautions that its handling of problematic polygons does not guarantee correct triangulation. Invalid input must therefore be rejected before it becomes a playable mesh. [5][6][7]

## The starting experience

### Home setup

The first screen asks only for information that helps create a starting plan:

- Which building and which unit is yours? Highlight the accepted mapped outline and the selected unit.
- How many floors belong to this home? Include an optional basement selection, subject to supported envelope geometry.
- How many bedrooms and bathrooms? Keep these separate from other spaces; do not ask for an ambiguous total that counts bathrooms twice.
- Which other spaces are needed? Living room, kitchen, dining area, hallway, utility room and closet are quick selections. An open-plan kitchen/living space is allowed.
- Are there internal stairs? If yes, ask which floors they connect; shape and position come next on the plan.

Offer **Arrange a starting plan** and **Start with one room**. Counts produce named room pieces and, when a valid arrangement is available, a clearly labeled suggested layout. Counts are editable preferences, not measurements and not evidence of the real layout. Do not claim automated accuracy, invent five equal townhouse units, or force a bad arrangement just to satisfy the requested count.

Keep requested but unplaced rooms in a small tray. If the outline cannot fit the requested pieces, show what remains unplaced and let the player resize, remove or rearrange. Never silently remove a bathroom, narrow a staircase or expand the mapped building. If the building/unit boundary is uncertain, allow a recoverable design draft while marking installation as unresolved.

### The main 2D workspace

The plan is the main workspace, not a tiny accessory under a large form. At the top are floor tabs and **2D plan / Inside room / Walk through**. On a phone, show one workspace at a time with a collapsible bottom sheet; on desktop, a side panel can remain open. Both edit the same document.

The initial tools are **Room, Wall, Door, Stairs, Select**. Windows can be a secondary opening tool. Choosing a room shows its name, dimensions and **Edit shape / Add photos**. Avoid a permanent screen full of height, provenance, roof, crop and upload settings.

Rooms begin as rectangles or L-shaped templates. **Add corner** splits a wall; moving the new corner creates a recess for a closet or an irregular wall. A closet can be its own small enclosed space or simply an indentation in the adjacent room. It must not be forced through the current rectangular-room minimum size rules.

Use an adaptive visual grid and a separate measurement system. Proposed defaults are coarse 10 cm or 4 inch snapping, with finer increments available while zoomed in; exact entered measurements need not be rounded to that grid. Store a consistent building-local coordinate representation and display feet/inches or metres without repeated conversion drift. Thin geometry should not disappear merely because the drawing is zoomed out.

Dragging a shared wall updates both adjoining rooms. Highlight affected rooms and show the selected wall's dimension. Snapping prioritizes the accepted envelope, existing corners, wall alignment and then the grid. Near a snap target, indicate the proposed join before committing. Undo reverses the complete operation, including doorway movement and any changed room boundaries.

### Doors, open-plan spaces and incomplete rooms

Tap a wall, choose **Add door**, then tap its position or enter a distance from a corner. Show width and swing direction with a simple flip action. Store the opening on its host wall; both adjacent rooms use that same opening. A door symbol on a 2D line is insufficient: the 3D wall and its collision must contain the corresponding hole.

An open archway is an opening without a door leaf. A kitchen and living zone may share one physical room with two labels; do not create a wall because two room types were selected. Conversely, a drawn room outline is not walkable until its boundary is valid and it has an appropriate route to an entry.

Unclosed wall chains remain visible draft work. Show the gap and offer an explicit close/snap operation where unambiguous. Do not infer a floor across an arbitrary gap. Valid closed rooms can be previewed while other rooms remain incomplete; incomplete areas must not expose falls or escape routes in a shared playable version.

## From the plan to a blank 3D home

### One structural document

Keep a stable `homeSpaceId` referencing the existing canonical building and virtual property/unit context. Under a versioned layout, store floors, vertices, shared walls, openings, room identities, zones, stairs and surface assignments. The existing capture records reference these identities and a layout revision; they do not become another building database.

Use a planar wall graph as the structural authority. Each wall has two endpoint identities, thickness, height information and explicit sides. Room boundaries are ordered wall-side loops; geometry edits rebuild affected closed regions. Room labels and photo assignments must not depend on array position or be regenerated just because polygon ordering changed.

When an edit splits or merges a room, preserve lineage and request a choice where identity is ambiguous. A surviving wall side keeps its photographs. Splitting a wall partitions the applicable surface region; deleting it retains the original photos in the account and moves orphaned placements to a recoverable list. Moving a shared wall cannot quietly give one household's images to its neighbor.

### The compiler

The shared layout compiler performs this sequence:

1. Validate finite coordinates, size limits, graph references, topology and the pinned envelope revision.
2. Normalize intended joins and intersections with explicit tolerances. Reject zero-length walls, self-crossing room rings and overlapping wall definitions; do not disguise malformed input as a repaired home.
3. Derive closed room regions and their relationship to shared wall sides. Validate holes, courtyards and floor openings separately.
4. Generate floors and ceilings from those regions, subtracting stairwells and other intentional voids. An L-shaped room remains L-shaped, not its rectangular bounds.
5. Generate wall faces, thickness, corner joins, door jambs and window reveals. For straight walls, rectangular opening intervals can be meshed directly; avoid repeated whole-scene mesh boolean operations during dragging.
6. Derive matching wall collision, walkable floor surfaces, doorway portals and stair connectors from the same accepted geometry.
7. Bind photo placement to stable surface identities and publish the layout revision as a unit.

The output is a home shell, not a collection of independent overlapping room cubes. A room with eight boundary segments has eight wall-side photo targets, plus its floor and ceiling. A shared structural wall has two independently decorated sides.

### Containment inside the real-world exterior

Use the accepted building parts, per-floor footprint, courtyard holes, unit boundary and roof underside where available. Validate full polygon differences and vertical clearance, not just the room's center or sampled corners. Wall thickness, slabs and stair clearances count toward occupied space. Clipper2 and polygon-clipping illustrate the boolean/offset operations involved; neither replaces the home's permission or topology rules. [8][9]

For a townhouse complex, the common building shell and one household's usable unit are different shapes. Repeated doors are not proof of equally spaced unit boundaries. Mapped data may lack the subdivision; the editor must distinguish a user-supplied draft boundary from a confirmed installation envelope.

A pitched roof requires headroom checks across the room, not just total building height. Unknown roof geometry cannot support an unconditional promise of exact loft fit. Conservative supported space may be offered with an explanation, while a correction to the exterior remains a separate, reviewed process. Never silently alter a public exterior to fit a private floor plan.

## Stairs and multiple floors

Provide straight, L-turn and U-turn stair templates for the initial complete home-editor release. A player places one stair connector and sees its reserved area on both linked floor plans. The editor shows the upper level faintly while placing the lower connection, and vice versa.

The stair record owns its lower and upper floor IDs, start/end landing, width, rise, run, turn direction, opening polygon and headroom region. Derive its vertical rise from the two finished-floor elevations, including slabs; do not resize an arbitrary decorative staircase until it happens to look close.

Reserve landings before automatically arranging neighboring rooms. Validate the route onto the first tread, along the flights and out onto the upper landing. The cutout above must remove both the rendered slab and its collision. Guard edges outside the opening's intended access; do not create invisible barriers across the landing.

For movement, the existing ramp-style stair surface is a useful starting point. Render treads while using a smooth traversal surface to avoid camera bob and player snagging, but derive both from the same stair parameters. Verify feet do not visibly float or sink and that the camera has adequate headroom. This is a proposed game implementation, not a statement that a visually plausible staircase meets any jurisdiction's building code.

When no valid staircase fits, retain the player's draft and mark the connection unresolved. Offer another stair shape or location. Do not secretly teleport through a solid floor, flatten the home to one storey, or widen the building. Spiral stairs, complex winders and split-level arrangements need their own later geometry tests; unsupported types must be labeled rather than approximated silently.

Each floor is aligned in one building-local coordinate frame. Floors may have different outlines. Copying a lower-floor arrangement is a convenience, not a requirement. Loading can remain selective, but the destination floor must be ready before crossing a stair connector; unloading must never leave a player without a floor.

## Inside-room photo editing

Selecting **Add photos** enters an eye-level editing view at a validated point inside the selected room. Tap the actual wall to select it; highlight only that wall side and show a thumbnail tray. The same selection is available through a named surface list for accessibility and walls obscured by perspective. Three.js raycasting provides the picking primitive, not the surface identity or permissions. [7]

Separate **Edit surfaces** from **Walk through**. In surface mode, looking around must not accidentally fire weapons, move the explorer or place a photo. In walking mode, existing remappable movement and camera behavior apply. Returning to the plan preserves the selected room; exiting restores the player's exterior position and prior control context.

Reuse the current photo library, crop workflow, grid patches and account save. Add room-specific capture guidance: stand back safely, face the wall as squarely as possible, include its visible edges, and use overlapping sections for long walls. Do not instruct people to climb, move dangerous furniture or photograph private material just to achieve complete coverage.

Offer four-corner perspective correction as an explicit advanced option. It works for a roughly planar wall and cannot remove furniture occlusion or reconstruct hidden surfaces. The default remains understandable crop-and-fit, with preview before application. Multiple image patches can cover one surface; the uncovered area uses a neutral editable material, not invented captured detail.

Door and window holes clip the photo surface. A photographed doorway is not a substitute for a modeled opening; otherwise the player encounters a painted door that cannot be used. Photos of furniture remain flat imagery. Real chairs, cupboards and usable objects belong to the existing object-placement systems and may visually duplicate photographed furniture unless the image is cropped or replaced.

Resizing a wall offers **Keep image scale** or **Fit to changed wall** when necessary. Preserve source photos and crop parameters, and flag newly uncovered regions. A photo is an appearance source; it must not change collision or the public building footprint.

## Android, accessibility and recovery

The entire sequence must work on Android Chrome without a desktop, LiDAR or an Apple-specific scanning API. Camera permission denial must leave the photo library and manual layout editor usable. QR handoff remains optional for switching devices under the same account.

Do not require dragging for precision editing. A player can select a corner and enter coordinates or use nudge buttons, tap two endpoints to draw a wall, and select a door followed by its destination. W3C's dragging guidance explicitly calls for pointer alternatives; keyboard support alone does not solve that requirement on a touchscreen. [10]

Use a proposed 44 CSS-pixel target for primary touch handles, offset dimension labels from the finger, and provide zoom buttons as well as pinch. Keep page scrolling outside the plan independent from panning inside it. The on-screen keyboard must not cover the selected measurement or Save control. Announce validation and save status in text, not color alone.

Maintain local recovery plus explicit cloud revision status: **Saving**, **Saved to account**, **Offline—saved on this device**, or **Needs attention**. Switching to another device must not imply local-only work has uploaded. Upload originals once and reference their validated generations from surface assignments.

Use expected-base revision checks to prevent silent last-writer-wins loss. Firestore transactions can retry when read documents change, so transaction callbacks must not send notifications, upload media or trigger paid processing. Commit metadata and pointers atomically; deliver downstream effects idempotently after success. [11]

## Architecture changes required in this repository

| Current component | Finding | Required change |
| --- | --- | --- |
| `functions/capture-room-geometry.mjs` | Rectangular room dimensions and six numbered surfaces | Retain as a legacy rectangle adapter; migrate authoring to stable graph-derived wall sides and polygon floors |
| `app/js/interiors/floor-model.js` | Multiple floors depend on minimum width 8.5 m and area 92 m²; up to eight floors, three loaded | Keep procedural fallback rules separate; authored homes use explicit floor elevations and actual connector-fit validation |
| `app/js/interiors/scene-builder.js` | Generated walls, slabs and ramp-style stairs already exist | Accept compiled authored geometry; do not generate an unrelated second partition plan |
| `app/js/interiors/planner.js` | Containment samples edges rather than proving full-region containment | Add shared robust validation for authored envelopes, holes and walls; do not use sampled acceptance as a hard guarantee |
| `app/js/reality-capture/interior-runtime.js` | Imported presentation hides generated meshes while retaining generated collision | Manual photo mode decorates the matching authored shell; never hide that shell and keep unrelated collision |
| `functions/reality-capture-authority.js` | Capture space identity incorporates a room label | Stable home and room identities with explicit legacy mapping; renaming must not alter ownership/access |
| `functions/community-reality-capture.js` | Existing capture, private-space, pending and approval flow | Bind each submitted representation to exact layout/media revision and retain public approval separation |
| Exterior crop/editor and protected media | Reusable working foundation | Reuse photo/crop/upload code, not exterior orientation labels or rectangle-only geometry |

These are targeted interior integration changes. Road, bridge, terrain and driving-camera authorities are not part of this feature. No new wallet, building database, authentication system or multiplayer-room service is required. Architectural room IDs must remain distinct from multiplayer session room IDs.

## Build, adapt or embed

**Recommendation: build a narrow World Explorer editor around established geometry methods, reusing the existing runtime and capture pipeline.** Use other products as interaction references rather than embedding an entire competing scene and save model.

Blueprint3D separates a floor-plan model, 2D controller and 3D controller and carries an MIT license. However, the inspected repository itself lists unfinished persistence, testing and modernization work. It is a useful reference or source of carefully reviewed components, not evidence of a ready-made secure multi-floor game integration. Any reused code needs its notices preserved. [12][13]

For geometry, shortlist polygon-clipping for JavaScript boolean operations and a compatible Clipper2 integration when robust offsets are required. Select one coherent supported kernel after testing concave rooms, holes, nearly coincident edges and identical browser/backend output. Do not install both as competing acceptance authorities by default. Reuse the application's existing Three.js triangulation where suitable, with separate topology validation. [5][6][8][9]

An external hosted floor editor would introduce a second product's account, media, rendering and persistence contracts. No demonstrated benefit currently outweighs that integration cost for this specific manual-photo workflow. Reconsider only after an isolated compatibility test proves round-trip geometry, private media handling and mobile usability; do not assume an embed preserves existing security.

## Development sequence and acceptance gates

1. **Canonical layout and envelope.** Add stable home/unit/floor/room/wall-side IDs, versioned records and a legacy rectangular-room adapter. Test rename, split/merge, ownership and pinned exterior changes before building more UI.
2. **Guided 2D editor.** Deliver room-count setup, an unplaced-room tray, rectangular/L-room tools, corner edits, shared walls, doors, undo and local recovery on desktop and Android-sized layouts. A real suggested layout must be feasible; otherwise provide the tray honestly.
3. **Playable blank floor.** Compile two connected rooms, an irregular closet boundary and a genuine door opening into matching render/collision. Test walking, turning, doorway crossing, wall contact and exit. This is the first end-to-end structural slice, not merely a screenshot of boxes.
4. **Stairs and a second floor.** Add straight, L and U stair templates, linked cutouts, headroom and landings. Test ascent/descent, rapid turns, loading boundaries and narrow-townhouse placement. No automatic elevator substitution.
5. **Photos inside the real room shape.** Attach current crop and multi-patch editing to wall-side IDs, including floor/ceiling, openings, dimensions and recovery after topology changes.
6. **Account and private-home lifecycle.** Physical Android creation/upload/save, desktop reopen, protected walk-through, authorized guests and exact-revision review. Default remains private; making the exterior public has no effect on interior privacy.
7. **Polish and regression gate.** Match game UI, document limits, provide a short contextual tutorial, and rerun existing exterior approval/hard-refresh and player transition checks. Only mark the feature ready after visual and runtime evidence covers the whole flow.

The minimum representative home test is a two-storey unit within a five-unit building: living/kitchen space, bathroom, bedroom, closet recess, entrance and a working stair. Also test a concave envelope with a courtyard, different upper-floor outline, a roof-clearance conflict, open-plan labels, disconnected drafts and a measured plan that does not fit its mapped exterior.

Security checks include owner versus stranger, revoked guest, expired session, public approval followed by an unreviewed edit, forged building/envelope references and direct attempts to read private photos. Preserve the prior playable revision on any failed install. Unapproved private previews are not public publication; broader sharing still requires the deliberate access choice and applicable review.

Proposed performance targets are responsive selected-wall feedback during dragging and no continuous whole-world regeneration. Measure p95 editor latency and memory on a representative mid-range Android phone before choosing numerical limits. Rebuild affected geometry, debounce expensive validation, bound photo resolution and dispose replaced textures. Do not claim phone readiness from desktop emulation alone.

## Limits and unresolved decisions

The manual editor can produce a convincing, playable interior without paid reconstruction. It cannot know hidden room shapes, exact unit boundaries or true measurements from room counts alone. Mapping errors need an explicit correction path. Floor photos cannot turn furniture into independent objects. Roof voids, curved walls, split-level homes and spiral stairs require additional verified geometry rather than silent approximations.

The next implementation milestone is the connected blank-floor slice, not more isolated room decoration. Its outcome should demonstrate that the same edited plan produces the walls the player sees and the walls the player collides with. No production changes or new paid services are necessary to research or build that local slice.

## Sources

1. Sweet Home 3D. [Users Guide](https://www.sweethome3d.com/users-guide/), version 7.5 guide, page states last update May 5, 2025. Plan/3D workflow and measurements.
2. Floorplanner. [v3.0 Specification](https://floorplanner.readme.io/reference/v30-specification), accessed September 8, 2026. Structural and decorative data model; no claim of API compatibility with World Explorer.
3. Floorplanner. [Roomplanner](https://floorplanner.readme.io/reference/roomplanner), accessed September 8, 2026. Optional room-setup wizard.
4. Sweet Home 3D. [How to customize staircases](https://www.sweethome3d.com/blog/how-to-customize-staircases/), legacy tutorial, accessed September 8, 2026. Stair height and floor cutouts.
5. Three.js. [Shape](https://threejs.org/docs/pages/Shape.html) and [ShapeGeometry](https://threejs.org/docs/pages/ShapeGeometry.html), accessed September 8, 2026. Polygon shapes and holes.
6. Mapbox. [Earcut](https://github.com/mapbox/earcut), accessed September 8, 2026. Triangulation capabilities and correctness caveat.
7. Three.js. [Raycaster](https://threejs.org/docs/pages/Raycaster.html), accessed September 8, 2026. Surface picking primitive.
8. Angus Johnson. [Clipper2 Overview](https://angusj.com/clipper2/Docs/Overview.htm), accessed September 8, 2026. Polygon boolean and offset methods.
9. polygon-clipping maintainers. [README](https://raw.githubusercontent.com/mfogel/polygon-clipping/master/README.md), accessed September 8, 2026. JavaScript polygon boolean operations.
10. W3C WAI. [Understanding SC 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), accessed September 8, 2026. Non-drag pointer alternatives.
11. Google Firebase. [Transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions), accessed September 8, 2026. Transaction retries and atomic metadata changes.
12. FurnishUp. [Blueprint3D repository](https://github.com/furnishup/blueprint3d), accessed September 8, 2026. Model/controller separation and outstanding work.
13. FurnishUp. [Blueprint3D MIT license](https://raw.githubusercontent.com/furnishup/blueprint3d/master/LICENSE.txt), copyright 2015. Reuse notice requirements; not a comprehensive dependency-license audit.

Repository evidence: `functions/capture-room-geometry.mjs`; `functions/reality-capture-authority.js`; `functions/community-reality-capture.js`; `app/js/interiors/floor-model.js`; `app/js/interiors/planner.js`; `app/js/interiors/scene-builder.js`; `app/js/reality-capture/interior-runtime.js`, checkpoint `d973e62c`. The attached digital-home proposal supplies product intent; implementation claims above come from the repository inspection.
