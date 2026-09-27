# Future Godot and Unity clients

Neither engine client is being built or selected. Browser execution remains primary. Reuse is evaluated by system, not source-line percentages.

| System | Reusable now | Godot work | Unity work | Additional benefit of proposed boundaries |
| --- | --- | --- | --- | --- |
| Provider-normalized world/provenance | Neutral records and algorithms | Data/resource adapter | C# data/asset adapter | One interpretation of mapped identities, units and inferred data |
| Terrain/source artifacts | Elevation data, datum, source hashes | Terrain meshes/collision/materials | Terrain/mesh/collision/materials | Versioned frame and buffer contract avoids reinterpreting providers |
| Road/building/interior definitions | Existing partial records/layouts | Scene/mesh builder | Mesh/GameObject or ECS builder | Full compiler publications reduce reverse engineering of mesh metadata |
| Licensed GLB assets | Geometry/material/animation source | Import tuning and attribution | Import tuning and attribution | Stable asset IDs and provenance survive renderer changes |
| Geographic/spatial/topology algorithms | Algorithm and fixtures | Port JS or bind measured native kernel | Port to C# or bind native kernel | Typed numeric contracts and golden outputs establish equivalence |
| Vehicle/physics | Specs and semantic rules | Controller and physics implementation | Controller and physics implementation | Explicit units, collision queries and state schemas preserve intent, not bit-identical engine physics |
| Expedition/inventory/research | Existing rules/recipes and backend commands | Domain port and UI | Domain port and UI | Type/version contracts rather than reconstructing browser globals |
| Economy/property/shared state | Authoritative backend contracts | Auth/network adapter | Auth/network adapter | Keep the same transactions and permission authority |
| Multiplayer | Room/pose/authority contracts | Transport and interpolation adapter | Transport and interpolation adapter | Explicit world frames prevent mixing cities/interiors/environments |
| Three rendering/shaders | Reference visuals, algorithms and assets | Engine-specific implementation | Engine-specific implementation | Data contracts allow replacement without rewriting domain authority |
| HTML/browser UI, GPS/camera/AR permissions | UX requirements | Native UI/platform integration | Native UI/platform integration | Application commands can be reused; HTML is not a native UI implementation |
| Rust numeric prototype | Source algorithm only; not adopted | Native ABI + ownership/build/test adapter | Native plugin ABI + ownership/build/test adapter | Worth sharing only if a real workload justifies Rust |

[Godot GDExtension](https://docs.godotengine.org/en/4.5/tutorials/scripting/gdextension/what_is_gdextension.html) and [Unity native plugins](https://docs.unity3d.com/6000.0/Documentation/Manual/plug-ins-native.html) provide integration routes, not automatic Rust/JS game portability. JS/TS itself is not directly executed by the ordinary native engine script runtime; schemas and test vectors are more directly reusable than implementation code. The measured scalar Rust result does not justify adding native FFI obligations today.

Change now: type existing authority boundaries, preserve coordinates/provenance/versioning, remove semantic dependence on mesh metadata where another consumer exists, and retain behavior fixtures. Keep Firebase and Three presentation working. Do not sacrifice the browser for a speculative engine migration.
