# Claim-to-source ledger

Accessed 2026-09-07. These are primary documentation sources, not independent
performance benchmarks. Current undated pages are identified as such.

| Claim | Publisher / source | Version/date | Confidence / caveat |
| --- | --- | --- | --- |
| Lean schema, combined covered indication, separate labels | [Shortbread schema](https://shortbread-tiles.org/schema/1.0/) | 1.0; publication date not established | High; provider extensions possible |
| Relative layer ordering | [OSM layer](https://wiki.openstreetmap.org/wiki/Key:layer) | Community documentation; retrieved current | High for tagging intent, not data completeness |
| Tunnel boundaries and building passages | [OSM tunnel](https://wiki.openstreetmap.org/wiki/Key:tunnel) | Community documentation; retrieved current | High for convention, not surveyed portals |
| One junction boundary | [ASAM §12.10](https://publications.pages.asam.net/standards/ASAM_OpenDRIVE/ASAM_OpenDRIVE_Specification/v1.8.1/specification/12_junctions/12_10_junction_boundary.html) | OpenDRIVE 1.8.1 | High; architectural analogy, not app certification |
| Shared elevation surface / transitions | [ASAM §12.11](https://publications.pages.asam.net/standards/ASAM_OpenDRIVE/ASAM_OpenDRIVE_Specification/v1.8.1/specification/12_junctions/12_11_junction_elevation_grid.html) | OpenDRIVE 1.8.1 | High; not an OSM height source |
| Boolean corefinement and input conditions | [CGAL manual](https://doc.cgal.org/5.5/Polygon_mesh_processing/index.html) | 5.5 | High; native-library guidance |
| Polygon Z payload is not 3D union | [Clipper2 overview](https://angusj.com/clipper2/Docs/Overview.htm) | Help dated 2025-12-17 | High |
| Browser robust mesh Boolean / disposal | [Manifold API](https://manifoldcad.org/docs/jsapi/classes/manifold.Manifold.html) | Undated current; package pinned 3.5.3 | High capability confidence; runtime cost measured locally |
| Experimental Boolean limitations | [three-bvh-csg README](https://github.com/gkjohnson/three-bvh-csg) | Undated current | High for stated limitations |
| Terrain hole replacement mesh and physics integration | [Unity manual](https://docs.unity3d.com/2022.3/Documentation/Manual/terrain-PaintHoles.html) | 2022.3 documentation | High pattern confidence; not automatic placement |
| Finite-shape scene queries | [Rapier documentation](https://rapier.rs/docs/user_guides/javascript/scene_queries/) | Undated current | High pattern confidence; no Rapier dependency added |

Highest-impact claims were spot-checked by the coordinating agent in the
Shortbread schema, Manifold guide/API, and ASAM junction/elevation pages. Code
observations are local findings, not assertions attributed to those sources.
