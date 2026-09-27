# Portable core map

The existing product already separates important authorities. Extract from those boundaries; do not create a parallel world compiler, inventory, economy, property store or expedition mutation path.

| System / existing boundary | Portability state | Action |
| --- | --- | --- |
| World request/session, cancellation, layer metadata (`earth-core/`) | Portable now at data/state-machine level | Preserve request IDs, sequence and stale-result ownership; type inputs/results. Browser scheduling remains adapter code. |
| Provider transport normalization and identity | Portable now for neutral records | Preserve provider priority and source provenance. Fetch/auth/cache implementation needs platform adapters. |
| Building provenance (`world/building-provenance-model.js`) | Portable now | Retain mapped/inferred/absent distinctions and parent/part identity. |
| Shared interior/ship layout and pod-bay cycle | Portable now for definitions and state transitions | Keep renderer furniture/collision construction separate; reuse layout identity. |
| Road profiles, geometry predicates, topology definitions | Portable now or after small refactor | Typed numeric arrays and explicit local frame. Preserve precise distance coordinates and units. |
| Active-world road/navigation queries | Portable after small-to-major refactor by function | Split explicit world/query input from teleportation and scene fallback. Existing spatial indexes remain. |
| Terrain accepted-ground values | Portable now as data, adapter required for residency | Preserve artifact ID/hash/provider/vertical datum. Web image decode/cache and GPU terrain meshes remain browser/renderer-specific. |
| Building compilation/publication | Portable after major boundary refactor | Records and Three geometry are interleaved. Extend existing published definitions incrementally, preserving collision and facade entrance ownership. |
| POI definitions/lifecycle | Portable now for records/rules | Preserve provider feature IDs and source licenses; marker/UI presentation is separate. |
| Water definitions/surface registry | Portable after small refactor | Publish existing water identities and datum; Three shaders are presentation. |
| Deterministic RDT/random functions | Portable now as algorithms/data | Preserve one seed and cache owner; do not create a second RNG. |
| Capture nearest-building heap/RDT | Portable now | Measure validation/rebuild/query together. A numeric index should still reference the canonical building list. |
| Collision broad phase | Portable after small refactor | Numeric bounds/footprints and suppression policy inputs. Mesh raycasts remain renderer adapters. |
| Vehicle/aircraft/maritime catalogs, damage and condition rules | Portable now as definitions/algorithms | Version units and tuning. Engine-specific controller/physics integration must be recreated. |
| Player/backpack/resource/activity/discovery definitions | Portable now or after small refactor | Type serializable records and commands; local storage/UI/subscriptions stay adapters. |
| Expedition rules, research recipes, voyage simulation | Portable now for neutral rules | Keep the existing authoritative mutation path. Backend decides shared state, not each renderer. |
| Wallet/property/shared expedition transactions | Should remain backend-specific | Reuse validated request/result contracts from future clients; never transfer transaction authority to the client. |
| Firebase SDK, Auth, Firestore/Storage listeners | Should remain backend/browser adapters | Keep Firebase; hide SDK snapshots and listener lifecycle behind existing service contracts. |
| Three shaders, scene graph, camera, GLB animation, batching | Should remain renderer-specific | No ideological vector replacement. Publish semantic records separately where simulation needs them. |
| HTML UI, accessibility, browser input and capture permissions | Should remain browser-specific | Native clients need their own interfaces and platform permissions. |
| Universe navigation metrics/coordinates | Portable after small refactor | Numeric pose and canonical offset; preserve physical units versus compressed playable scene scale. |
| Nebula/galaxy volume appearance | Should remain renderer-specific | Catalog science and navigation frame are reusable, shader/material implementation is not. |

[Coupling inventory](COUPLING_CLASSIFICATION.md) records all listed context/THREE modules and explicitly distinguishes initial triage from complete transitive review. [Portable projection](PORTABLE_WORLD_SCHEMA.md) demonstrates a bounded real-location record view without replacing existing authorities.
