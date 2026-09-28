# Evidence-backed problems

Severity here reflects engineering risk, not an invented measured FPS penalty. All source paths below are relative to repository root.

## 1. Reset service can be resurrected by a pending load — repaired

**Evidence:** `app/js/platform/service-registry.js` cleared a promise on reset but the pending closure subsequently wrote ready/value. Before-test output has four failing lifecycle cases; a minimal reproduction returned ready=true, retained=true, disposed=0 after reset. **Player impact:** stale UI/subscriptions/resources can return if this lifecycle is used. Current app callsites do not establish that this causes normal slowdown. **Developer impact:** reset/unregister contract unreliable. **Root cause:** no generation/current-registration check. **Fix:** invalidate generation, prevent stale success/failure publication, dispose late result. **Risk:** callers now correctly receive AbortError after invalidation; shared singleton disposal is guarded when already adopted. **Verify:** concurrent load, reset, unregister, stale rejection and retry tests; browser integration remains pending.

## 2. Publication summary is not a portable world

**Evidence:** `world/compiler/world-layer-products.js` creates per-layer count/compilation records; `earth-core/world-snapshot.js` freezes them. **Player impact:** none established today. **Developer impact:** a native adapter cannot reconstruct terrain/footprints/entrances from that summary. **Root cause:** observability/publication contract has a world-like name but intentionally limited data. **Fix:** preserve this summary; formalize existing canonical source records and asset references under a versioned export boundary. Do not add a second writer. **Risk:** copying whole source graphs doubles memory and leaks private metadata. **Verify:** actual selected-location records round-trip IDs, coordinates, units, holes, heights, entrances, POI relations and provenance; browser adapter renders equivalent results. Proof remains pending.

## 3. Building semantics and presentation overlap

**Evidence:** `world/load-building-pass.js:568` onward writes footprint, source identity, height, levels, semantics, roof and provenance to mesh.userData. Separate collider records already exist and `building-entry.js` reads them. **Player impact:** divergent semantic copies can make entry/collision/art disagree; no new divergence is claimed reproduced. **Developer impact:** changing renderer risks changing gameplay. **Root cause:** construction and semantic publication share a pass. **Fix:** create one immutable resolved building record before mesh construction; renderer and colliders reference its stable ID. Preserve existing provenance computation. **Risk:** building parts, foundations and source aliases must retain behavior. **Verify:** footprint/height/identity fixtures plus visual/entry/collision/property/capture journeys and allocation comparison.

## 4. Shared mutable context is a broad dependency surface

**Evidence:** lexical inventory finds 166 browser modules importing shared-context; it is an untyped mutable object. `core-frame-systems.js` dispatches many optional callbacks through it. **Player impact:** initialization/transition defects can be silent. **Developer impact:** hidden dependencies and global setup burden tests. **Root cause:** incremental legacy integration through one context. **Fix:** migrate one owner at a time to injected capability interfaces; keep compatibility adapters until all callers migrate. **Risk:** mass extraction can introduce ordering failures. **Verify:** narrow contract tests, missing-capability errors at owner start, transition/UI journeys; do not replace every optional callback with a crash.

## 5. Three r128 makes renderer migration a compatibility project

**Evidence:** package/manifest pin 0.128.0 and legacy examples/js add-ons; custom shaders and onBeforeCompile hooks occur in materials/terrain/space. **Player impact:** upgrading carelessly changes visuals/compatibility. **Developer impact:** current WebGPU renderer cannot be substituted into this stack. **Root cause:** old renderer API and custom shader integration. **Fix:** separate dependency upgrade from renderer experiment, inventory shader/color/loader changes, verify representative worlds. **Risk:** high visual parity and browser reach risk. **Verify:** shader compilation, screenshot review, controls and teardown on Safari/Chromium and a real phone; WebGPU enabled only when its measured case and fallback pass.

## 6. Instrumentation can distort the tests that judge performance

**Evidence:** runtime diagnostics eagerly defined; getters traverse scene structures on request; verification scripts call these APIs. `perf.js` also serves real auto-quality, so deleting it would change product behavior. **Player impact:** eager payload cost is real source size, duration unmeasured. **Developer impact:** snapshot polling can be mistaken for normal gameplay overhead. **Root cause:** heavy and light observation APIs share one module and test harnesses have different sampling policies. **Fix:** profile cheap counters with ordinary clock; isolate expensive inspection behind explicit request, then consider lazy import with compatibility contract. **Risk:** breaking existing synchronous test APIs or auto-quality. **Verify:** resource/coverage capture and paired observer-off/on runs. No blanket diagnostic removal performed.

## 7. Repository history mixes specifications and stale status

**Evidence:** September 7 capture consolidation says proposed/not migrated, while later source and release notes contain revisions/layout/publication work. Older architecture map predates the candidate. **Player impact:** indirect; wrong fixes can reintroduce defects. **Developer impact:** outdated issues can drive duplicate implementation/testing. **Root cause:** historical plans lack a clear authority distinction. **Fix:** use current source/build identity + evidence index; retain historical reports, link them as history. **Risk:** deleting history loses context. **Verify:** document claims cite exact baseline and distinguish source, component, browser and service evidence. These evaluation docs provide that separation; a complete docs deprecation pass remains pending.

## Not established

No measured normal-player leak, dominant CPU kernel, excessive production Firebase bill, or universally faster replacement engine is established in this investigation yet. Per-frame linear scans, timers and cached modules are leads until a representative profile establishes cost and ownership. Rust/GPU compute recommendations remain conditional.
