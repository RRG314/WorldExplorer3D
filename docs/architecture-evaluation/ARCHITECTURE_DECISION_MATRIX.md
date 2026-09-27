# Architecture decision matrix

A technology is listed only for an existing use, completed prototype or evidence-backed next investigation. “Measure” is not approval to integrate. No line-of-code reuse percentages or invented performance scores are used.

| System | Current | Best target | JS | TS | Worker | Rust/Wasm | WebGPU | Portable | Godot reuse | Unity reuse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Provider normalization | JS neutral records | Preserve single authority | Keep | Contract first | Existing fetch/worker adapters | Not justified | No | Data/algorithm | Data + port algorithm | Data + port algorithm |
| World request/session | JS immutable records/state machine | Typed existing authority | Keep | Pilot supports | Cancellation envelope | No | No | State/contract | Adapter | Adapter |
| World publication | Layer counts/metadata plus runtime collections | Extend existing compiler records | Keep | Versioned schemas | Existing buffer ownership | No adoption | No | Partial today | Record adapter | Record adapter |
| Accepted terrain | Provider artifacts + JS mesh preparation | Explicit artifact/grid contract | Keep | Units/datum/ownership | Measure CPU stages | Unproven | Unproven | Data yes | Terrain adapter | Terrain adapter |
| Transport profiles | JS typed numeric arrays | Algorithm-first sorted lookup trial | Prototype wins | Numeric contract | Synchronous query stays local | Scalar loses; batch experimental | No | Already numeric | Algorithm/data | Algorithm/data |
| Carriageway/terrain integration | JS polygon/partition pipeline | Profile then isolate numeric stage | First choice | Compiler result | Strong profiling candidate | Not yet measured | No evidence | Partial | Output or port | Output or port |
| Intersections/topology | Neutral algorithms mixed with publication | Keep topology, narrow adapter | Keep | Records | Measure first | No evidence | No | Algorithm/data | Port/output | Port/output |
| Building provenance | Neutral mapped/inferred compiler | Preserve | Keep | Discriminated records | No need shown | No | No | Yes | Direct data | Direct data |
| Building geometry/facades | Three + compiler/collision | Existing definition consumed by renderer | Keep | Boundary | Measure preparation | No evidence | Later renderer trial | Partial | Mesh adapter | Mesh adapter |
| Entrances/interiors | Shared catalogs/layout + Three scene | Preserve layout authority | Keep | Layout/interaction | No need shown | No | No | Definitions yes | Scene adapter | Scene adapter |
| POIs/activities | Records/lifecycle plus markers/UI | Typed existing records | Keep | Boundary | No need shown | No | No | Rules/data | UI/marker adapter | UI/marker adapter |
| RDT/procedural identity | JS seed/index authority | Preserve | Keep | Inputs/output | Measure bulk workload | Unproven | No | Algorithms | Port/fixtures | Port/fixtures |
| Capture nearest lookup | Exact heap + RDT | Keep: full validated selector 7.2 ms / 32 replay queries | Keep | Building identity | Only if measured | Unproven | No | Yes | Port or data | Port or data |
| Collision/navigation | Spatial indexes + scene fallback | Explicit numeric query interface | Keep | Query/result | Avoid per-frame round trip | Unproven | No readback path | Partial | Physics adapter | Physics adapter |
| Vehicles/traffic | Catalogs/rules + controllers | Preserve specs, isolate pose/contact | Keep | State/specs | Measure bulk simulation | Unproven | No evidence | Rules/specs | Engine controller | Engine controller |
| Player/resources/research | Domain stores + persistence/UI | Typed domain commands | Keep | Progressive boundary | No need shown | No | No | Rules/data | Port/UI | Port/UI |
| Economy/property | Authoritative Functions/transactions | Same backend contracts | Keep server JS | Shared contract | Not client authority | No | No | Contract | Backend adapter | Backend adapter |
| Multiplayer | Room authority + browser pose/network | Same authority, explicit world frame | Keep | Envelope/pose | No need shown | No | No | Contract | Network/pose adapter | Network/pose adapter |
| Expedition | Shared authority/rules + ship scene | Preserve authority and layout | Keep | Commands/state | No need shown | No | No | Rules/data | Port/scene | Port/scene |
| Ocean | Auxiliary renderer + marine rules | Explicit environment ownership | Keep | Domain boundary | No evidence | No | Later only if measured | Rules/catalogs | Renderer/controller | Renderer/controller |
| Moon/Mars | Main renderer + neutral body catalog | Preserve astronomy authority | Keep | Units/body contract | No evidence | No | Later only if measured | Facts/data | Renderer/controller | Renderer/controller |
| Universe/nebulae | Catalogs, frame mapping, Three effects | Neutral frames + renderer adapter | Keep | Frame/address | No evidence | No | Experimental future only | Catalog/navigation | Scene/shaders | Scene/shaders |
| Lighting/rendering | Three r128 WebGL | Avoid variant/work churn first | Keep | Resource ownership | Not synchronous scene graph | No | No current adoption | Presentation-specific | Reimplement | Reimplement |
| UI/input/accessibility | HTML/CSS/browser APIs | Keep browser UI | Keep | Command boundary | No | No | No | Commands only | Native UI | Native UI |
| Diagnostics | Shared runtime snapshots | Owner-aware, on-demand evidence | Keep | Snapshot schema | No need shown | No | No | Schema only | New engine metrics | New engine metrics |

## Cross-cutting assessment

Incremental JS/TS contracts preserve browser compatibility, existing features, Firebase authority and current asset delivery. They lower migration risk and improve future engine interoperability without requiring another renderer. Workers can reduce main-thread contention only at independent bulk boundaries. Wasm currently adds memory/toolchain obligations with no win in the measured scalar calling pattern. WebGPU may become useful, but neither GPU bottleneck attribution nor a representative renderer-parity trial is complete. These conclusions are qualitative evidence judgments, not a fabricated numerical score.
