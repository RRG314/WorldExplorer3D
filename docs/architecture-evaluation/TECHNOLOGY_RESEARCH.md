# Technology research

Primary documentation checked September 26, 2026. Links describe platform capabilities; they are not benchmarks of World Explorer. Rolling documentation can change. Version-specific engine proof must pin versions before implementation.

## Browser stack

| Technology | Verified capability and constraint | World Explorer implication |
| --- | --- | --- |
| JavaScript / TypeScript | [Incremental JS migration](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html) and [checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html) support gradual checking | Type contracts first. Emitted JavaScript has no inherent FPS advantage. Runtime validation still required for remote/untrusted records |
| Three / WebGL | [Migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) records breaking changes across releases | Current r128 uses old global add-ons; an upgrade must cover loaders, color handling, shader hooks and postprocessing separately from gameplay |
| Three WebGPU | [Renderer guide](https://threejs.org/manual/pages/webgpurenderer) documents WebGPU with WebGL2 fallback and migration constraints | Existing custom ShaderMaterial/onBeforeCompile/postprocessing code needs adaptation; changing the constructor is not a safe migration |
| Safari WebGPU | [WebKit Safari 26.0 announcement](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) documents support | Do not repeat outdated claims that Safari has no WebGPU. Still feature-detect adapter/capabilities and retain older-device fallback |
| Workers | [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) transfer ArrayBuffer ownership, detaching the sender | Existing tunnel/road workers already do this. Measure input clone cost, queue time and cancellation before adding workers |
| SharedArrayBuffer | [Security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) require secure, cross-origin-isolated contexts for relevant sharing | COOP/COEP must be tested against auth popups, provider images and CDN assets. Do not add headers globally just to use threads |
| OffscreenCanvas | [API](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) allows rendering outside DOM/main thread | Current renderer shares DOM/input/scene state broadly. Start with numeric compiler workers; whole-renderer movement has much higher integration cost |
| Rust/Wasm | [wasm-bindgen boundary benchmarks](https://wasm-bindgen.github.io/wasm-bindgen/benchmarks/) explicitly are not representative whole-app benchmarks | Candidate kernels: polygon/topology/terrain processing only after profile. Include JS↔Wasm conversion and allocation. Keep canonical bulk buffers; avoid per-vertex calls |
| WasmGC | [V8 porting discussion](https://v8.dev/blog/wasm-gc-porting) concerns GC-language runtimes | It is not a switch that removes this app's JS/Three allocation problems or automatically improves Rust linear-memory kernels |
| Asset delivery | [glTF](https://www.khronos.org/gltf/) and [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) support runtime model and compressed texture pipelines | Existing GLB licenses/identities can survive adapters. Benchmark decode/upload/startup and final GPU format; compressed download size is not decoded texture memory |
| Firebase | [Real-time query scaling](https://firebase.google.com/docs/firestore/real-time_queries_at_scale), [billing](https://firebase.google.com/docs/firestore/pricing), [best practices](https://firebase.google.com/docs/firestore/best-practices) | Keep existing backend; limit listener scope/lifetime deliberately. Excessive reconnect churn can cost more than retaining useful listeners. No billable-read estimate from HTTP counts alone |
| Node | [Release schedule](https://nodejs.org/en/about/previous-releases) | Keep pinned supported verification runtime; upgrade build/server runtime independently of browser engine. Current verification uses Node 22.23.2 |

## Alternative engines and future clients

| Candidate | Primary evidence | Assessment for this product |
| --- | --- | --- |
| Babylon.js | [WebGPU support](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU.md), [Apache license](https://github.com/BabylonJS/Babylon.js/blob/master/license.md) | Credible browser engine with WebGPU/WebGL integration. Does not preserve Three meshes/shaders/control APIs. Physics and rendering facilities do not replace geographic normalization, property/capture identity or server transactions |
| PlayCanvas | [Supported browsers](https://developer.playcanvas.com/user-manual/engine/supported-browsers/), [standalone engine](https://developer.playcanvas.com/user-manual/engine/standalone/), [license](https://github.com/playcanvas/engine/blob/main/LICENSE) | WebGL2/WebGPU browser engine; JS/TS rules can be wrapped. Scene/material/input rewrite remains substantial. Standalone engine and hosted editor pricing are separate; adopting an editor is not required |
| Godot Web | [Current export guide](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | WebAssembly/WebGL2 Compatibility renderer; documented C# Web export limitation, mobile/Safari caveats, separate thread/isolation constraints. Not a browser-performance shortcut |
| Godot native | [Large-world coordinates](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html), [MIT license](https://godotengine.org/license/) | Plausible future consumer of portable records. Double precision requires suitable builds and has costs; local frames still useful. New scenes/UI/physics and backend adapter required |
| Unity Web | [Unity 6 browser compatibility](https://docs.unity.com/en-us/engine/6000.0/manual/platform-specific/webgl/intro/browsercompatibility), [Web performance](https://docs.unity.com/en-us/engine/6000.7/manual/platform-specific/webgl/develop/performance) | Evaluate pinned version/device list rather than old blanket mobile prohibitions. Compiled payload/startup and browser restrictions remain; C# UI/physics/controller port required. No measured memory win here |
| Unity native | [Native plugins](https://docs.unity3d.com/6000.0/Documentation/Manual/plug-ins-native.html), [2026 subscription terms](https://unity.com/products/pricing-updates) | C ABI kernels could be shared through plugins; world/domain JSON through C# adapters. Paid-plan eligibility/seat costs and native build pipeline are additional obligations. No need to choose this client now |
| Bevy | [WebGPU/WebGL2 architecture](https://bevy.org/news/bevy-webgpu/), [current feature flags](https://docs.rs/bevy/latest/bevy/), [example runs](https://example-runs.bevy.org/) | Rust ECS and native/Web targets attractive for new products, but current JS domain and HTML UI would be ports. Avoid stale browser claims on example pages; check actual platform support. Engine/tooling/version migration burden is high for this app |
| Unreal | [Pixel Streaming overview](https://dev.epicgames.com/documentation/unreal-engine/overview-of-pixel-streaming-in-unreal-engine) | Browser streaming runs the game on a remote host and streams video. Adds GPU hosting, latency and per-session capacity; not equivalent to current static-hosted browser execution. Not recommended as primary path |
| CesiumJS | [Platform overview](https://cesium.com/platform/cesiumjs/) | Strong geospatial globe/terrain/3D Tiles fit, but not a replacement for World Explorer's interior, vehicle, economy and expedition gameplay. Consider specific geospatial integrations only, not a second renderer without evidence |

No engine provides this application's full geospatial/gameplay/persistence chain out of the box. Engine physics changes collision tuning, step sizes, control behavior and multiplayer reconciliation. A future native port must preserve semantic rules but should not promise bit-identical floating-point physics across engines.

## Interchange

| Format | Fit | Decision |
| --- | --- | --- |
| Versioned JSON | Human-reviewable records/commands, browser and C#/Godot interoperability | Start here for semantic records; validate finite values, units and versions; avoid embedding media or giant mesh arrays |
| Typed/binary records | Terrain grids, mesh positions/indices, masks | Preserve existing transferables; add format/stride/endianness/ownership metadata at boundaries |
| [FlatBuffers](https://flatbuffers.dev/) | Direct buffer access across languages, schema evolution | Consider only if representative large-record parsing/allocation is measured expensive; code generation/toolchain has a cost |
| [Protocol Buffers](https://protobuf.dev/programming-guides/proto3/) | Versioned command/message contracts | Useful future option; preserve field IDs, unknown-field policy and explicit defaults. Not required for current HTTP JSON authority |
| [MessagePack](https://msgpack.org/) | Compact object encoding | Reduces wire verbosity in some cases; does not establish domain semantics or guarantee lower heap |
| [GeoJSON RFC 7946](https://www.rfc-editor.org/info/rfc7946/) | Geographic geometry/interchange | Suitable provider input/export with defined geographic coordinates, not arbitrary local-space meshes or solar-system state |
| glTF/GLB | Geometry, materials, textures, animations | Keep licensed assets portable; gameplay identity/custody/security do not belong solely in model extras |

Rust portability requires a stable data ABI, cancellation/error conventions, native builds for each target and an engine-specific FFI wrapper. Even if one kernel is shared, Godot/Unity scenes, physics and UI are not. Select no Rust kernel until a same-data JS baseline and end-to-end boundary measurement justify it.

## Cross-cutting tradeoffs

Browser-first HTML/CSS remains the best fit for current accessible menus, account/capture forms and public-site SEO. Canvas engines require additional accessibility and web integration rather than providing equivalent DOM behavior automatically. Static hosting can stay with JS/TS, Workers, Wasm and browser engines; native distributions add packaging/signing/update infrastructure. Pixel streaming adds continuing GPU-session cost. Firebase traffic/authority costs remain regardless of renderer.

Asset imports must preserve attribution and redistribution rights. Engine licenses do not grant rights to third-party models. Startup, bundle size, memory and deployment cost depend on the actual retained features/assets; no generic engine percentage or bundle-size promise is defensible without a representative build.
