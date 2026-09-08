# Building connected bridges and tunnels in World Explorer

Research date: 7 September 2026. Audience: the project owner and maintainers.
Scope: worldwide architecture and local implementation; no publication or deployment.

## Direct answer

The defects have two causes: uncertain cartographic information is being used as
precise transport topology, and independently drawn tunnel strips are being
treated as though they form a connected interior. Materials and wall cutbacks
cannot repair either cause. The chosen solution is to separate display labels
from source connectivity and compile a connected tunnel's closed clearance
volume before deriving its visible boundary, wall collision, and camera space.

This is a general algorithm, not a Monaco coordinate exception. It is not a
promise of surveyed accuracy worldwide. Source capability limits and explicit
validation failures remain part of the system.

## What the evidence establishes

### Cartography does not supply complete engineering geometry

Shortbread is deliberately a lean map schema. Its streets-layer tunnel boolean
combines tunnels, building passages, and covered roads; the standard does not
promise surveyed elevations, physical clearances, source-node topology, or an
explicit layer field. Street labels are a separate layer. A provider can add
extensions, but the application must not assume them. [Shortbread 1.0 schema](https://shortbread-tiles.org/schema/1.0/).

The local code previously assigned a nearby label to `tags.name`, then treated
that name as proof of route continuity in generalized gap and interior joins.
That is a code-confirmed authority error. The implementation now records the
label as display-only and excludes it from those topology decisions.

OSM layer values describe relative stacking rather than measured height. Tunnel
ways are normally split at their real boundaries; internal way seams and tile
boundaries are not automatically entrances. Building passages must not be
confused with bored tunnels. These facts support explicit versus unknown layer
provenance and graph-owned mouth interfaces, not fixed depth from layer number.
[OSM layer](https://wiki.openstreetmap.org/wiki/Key:layer),
[OSM tunnel](https://wiki.openstreetmap.org/wiki/Key:tunnel).

### A junction needs one owned boundary and height contract

ASAM describes closed junction boundaries and a single elevation grid that
supersedes individual road heights inside the junction, with smooth entry and
exit transitions. World Explorer is not implementing OpenDRIVE, but the relevant
architectural principle transfers: incident roads cannot each independently own
the same junction surface. Equal endpoints alone do not prove smooth slopes.
[ASAM junction boundary](https://publications.pages.asam.net/standards/ASAM_OpenDRIVE/ASAM_OpenDRIVE_Specification/v1.8.1/specification/12_junctions/12_10_junction_boundary.html),
[ASAM elevation grid](https://publications.pages.asam.net/standards/ASAM_OpenDRIVE/ASAM_OpenDRIVE_Specification/v1.8.1/specification/12_junctions/12_11_junction_elevation_grid.html).

### Removing wall intervals is not a three-dimensional union

Mesh Boolean operations split intersecting surfaces and classify the resulting
boundary. Valid inputs and numerical robustness matter; deleting some XZ wall
intervals does not compute roof intersections or close changes in width.
[CGAL mesh processing manual](https://doc.cgal.org/5.5/Polygon_mesh_processing/index.html).

Two-dimensional polygon union is useful for footprints, but optional vertex Z
payloads do not make Clipper a 3D union engine. A 2.5D chamber is reasonable only
when the floor and ceiling can each be represented by one surface and its mouths
are explicitly constrained. It is not a general solution to intersecting vaults.
[Clipper2 overview](https://angusj.com/clipper2/Docs/Overview.htm).

Manifold provides browser WASM Boolean operations on oriented, closed manifold
meshes. It requires valid inputs and explicit disposal of WASM objects. Its
topological guarantee does not guarantee correct geography, acceptable device
performance, or a self-intersection-free custom sweep. These remain application
responsibilities. [Manifold guide](https://manifoldcad.org/docs/jsapi/),
[Manifold API](https://manifoldcad.org/docs/jsapi/classes/manifold.Manifold.html).

The alternative three-bvh-csg library describes itself as experimental and warns
about non-manifold/missing-triangle corner cases. That makes it a poor choice
for claiming an unconditional watertightness repair here.
[three-bvh-csg maintainers](https://github.com/gkjohnson/three-bvh-csg).

### Terrain and movement need the same boundary

The documented terrain-hole pattern is a heightfield opening complemented by
additional entrance geometry; its physics, lighting, and navigation implications
must agree. For World Explorer, the portal cut, retaining collar, and physical
opening must be derived from the same accepted terrain and tunnel interface.
[Unity terrain holes](https://docs.unity3d.com/2022.3/Documentation/Manual/terrain-PaintHoles.html).

Scene shape casts account for a moving shape's extent rather than only a point.
The corresponding requirement here is a finite-radius camera check against the
joined tunnel space. A point projected onto one road cannot represent a branch.
[Rapier scene queries](https://rapier.rs/docs/user_guides/javascript/scene_queries/).

## Selected design and implemented boundaries

1. Preserve source identity, inferred display-label provenance, explicit layer
   capability, and generalized covered-indication uncertainty.
2. Restrict enclosure components to graph-connected, nearby mouths in the same
   source family with compatible explicit layers and floor heights. Proximity
   or a nearby road's label alone cannot create a chamber.
3. Build indexed, closed swept clearance meshes with shared station vertices.
   Small convex join volumes connect mouth sections; no independent caps are
   left at every sample. Internal numerical duplicate stations are coalesced.
4. Union those closed volumes using locally bundled Manifold 3.5.3 in a bounded,
   short-lived worker. No Boolean operation runs in the animation loop. Release
   every intermediate WASM object and terminate the worker after compilation.
5. Publish one boundary for the component. Render only its external wall/roof
   skin, omit intentional open-mouth caps and duplicate road-floor skin, derive
   wall colliders from that boundary, and query its indexed vertical intervals
   for camera/ceiling occupancy. The old independent shell is not overlaid on
   a successful compiled boundary.

This list records implementation, not completed acceptance. Final visual and
cross-location evidence is recorded separately. Existing road-floor authority
and portal terrain fitting still require their own continuity/placement checks.
The Boolean kernel cannot compensate for incorrect elevations or invented map
connectivity.

## Validation and limitations

Acceptance covers geometry families before places: T, acute Y, near-parallel,
widening, slopes, curves, multiple source resolutions, unknown versus explicit
layers, open mouths, indexed topology, internal caps, and body/camera clearance.
Actual locations then verify the integrated renderer and movement, not just
triangle counts. Monaco fallback and exact-provider paths are separate cases.

The first live prototype exposed internal cap slivers in short, oblique graded
segments. A targeted regression reproduced this; shared indexed sweeps replace
the defective per-segment convex-hull construction. Passing simple symmetric
fixtures alone was insufficient.

Remaining limits must be disclosed: incomplete map semantics, missing surveyed
portal heights, potentially self-intersecting extreme sweeps, bounded worker
budgets, actual phone performance, and conflicts with surrounding terrain or
other structures. Failed compilation is a diagnostic, not proof of a correct
fallback or permission to hide a mapped building.

## Research stopping decision

Primary evidence converges on the data boundary and joined-volume approach.
Additional broad searches are unlikely to change that choice. The remaining
questions are prototype validity, integration correctness, and measured cost;
they require implementation and real-world verification rather than more search.
