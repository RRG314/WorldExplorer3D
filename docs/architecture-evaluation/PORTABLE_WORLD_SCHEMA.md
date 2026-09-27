# Portable location projection

A bounded proof now exports **139 building identities, 59 roads, 102 entrances and 29 POIs** from a real Baltimore publication. Terrain is a 25×25 sampled view of the existing accepted-ground query. No water polygon falls inside this selected district. All numeric grid samples are finite.

The projection comes from existing runtime world/collision records, the existing transport compiler, building provenance and published entrance catalog. It is not another provider interpreter or writable store. JSON serialization rejects class instances and nonfinite values; no Three, DOM or Firebase objects cross the boundary.

The standalone preview consumes that JSON through the current Three version and reuses the existing road ribbon/batch renderer functions. It was run with the web-game browser client and visually inspected: footprint/height variation, roads and terrain are visible. This proves data consumption, **not full visual parity with gameplay**. Diagnostic massing materials intentionally omit game artwork. Entrance and POI records are validated/countable but not interactively rendered in this preview.

[Inspected preview](evidence/portable-world-preview/shot-0.png) · [state](evidence/portable-world-preview/state-0.json)

| Field | Existing authority / contract |
| --- | --- |
| schemaVersion / experimental | Explicit version 1 evaluation projection; not a persisted save schema |
| publicationId / requestId | Current WorldSnapshot identity; do not establish a separate sequence |
| frame | Origin latitude/longitude, X east/Y up/Z south, 1.11 metres per world unit and 100,000 world units per degree; all must survive an engine adapter |
| terrain | Existing GroundHeight terrain query, explicit sampled resolution and tile identities; missing samples remain null |
| buildings | Existing sourceBuildingId, component footprints/base/top, roof role and compiled provenance |
| roads | Existing sourceFeatureId, source node identities, normalized transport record, width, compiled double-precision distances/heights |
| entrances | Existing entrance catalog records including mapped/inferred evidence |
| water | Existing registry identity, footprint, provenance and datum when present |
| POIs | Existing feature ID, position, kind and provider/license/attribution |

The bounds select intersecting features; road polylines are preserved in full rather than clipped and assigned new identities. The proof is not a complete terrain package or a complete world export. Accepted-ground artifact hash/provider/vertical datum must accompany full-resolution future interchange; the separately captured load evidence contains them. Never advertise a coarse grid as original terrain fidelity.

Use versioned JSON for semantic records and typed/binary buffers for large terrain/mesh arrays, with explicit precision, stride, bounds, units, ownership and schema version. GLB retains assets/animation. GeoJSON is geographic interchange, not an arbitrary local-space save format. No measured need justifies FlatBuffers/Protobuf/MessagePack yet.

Next production-quality boundary work should extend existing compiler publications, then have the browser consume those exact records before introducing another client. This proof deliberately remains outside the production module graph.
