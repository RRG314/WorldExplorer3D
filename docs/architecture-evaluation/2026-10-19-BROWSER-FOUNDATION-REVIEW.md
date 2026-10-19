# Browser foundation review: World Explorer and Open-Planet

October 19, 2026. This is a fresh source comparison and a completed, limited repair of navigation ownership. It is not a claim that every feature has been exercised or that the entire application is ready to port.

World Explorer baseline: `c19ba5e6c336676fbfe12d5d5e04d3bb5c3fc240`, in the architecture-evaluation worktree on `steven/visual-quality`. Open-Planet: `bbb183b36f4fd7ea8c6350c43c2c2eb2378099f6`. The latter was inspected as source; its native client was not run. Production remains the released 5.6.1 package.

**The central finding**

World Explorer's main architectural weakness is the distance between having a named authority and having exclusive ownership. It has a session coordinator, transport actor contract, world compiler, lifecycle scopes and resource leases. Yet many consumers still read and change underlying state directly. That permits a feature to bypass the very authority meant to coordinate it. Adding another framework over those consumers would preserve the problem.

The strongest idea to learn from Open-Planet is its separation of geographic computation from the engine, combined with explicit construction, publication and retirement of world pieces. It is not a generally cleaner replacement for World Explorer, and its native rendering features do not establish a browser performance advantage.

**Evidence and limits**

A new Babel AST inventory inspected 1,140 first-party runtime JavaScript files, 231,526 lines, excluding vendor code. It found 167 modules directly importing shared context, 121 directly writing it, and 1,150 distinct accessed context roots. The static import graph has zero cycles. Hidden state dependencies are therefore more significant here than circular static imports.

Direct writer counts include `car` in 18 modules, `Walk` in 13, `carMesh` in 12, `camera` and `spaceFlight` in 10 each, `drone` in nine, and `scene` and `renderer` in eight each. These are syntax observations, not proof that each writer is wrong. They exclude transitive mutation and injected aliases. The existing, more conservative ownership guard includes injected contexts and reports 221 writer files; it measures a different scope.

Nineteen runtime files exceed 1,000 lines. Examples include urban sandbox runtime (3,474), discovery runtime (2,613), ship interior (2,407) and expedition runtime (1,932). Size identifies review targets; it is not a defect by itself. The generated expedition command mirror is deliberately generated, not established duplicate business logic.

The evidence directory is `output/research/browser-architecture-2026-10-19/`: `inventory.json`, before/after navigation reproductions, and the browser component receipt and screenshot. Source review, component execution, full-world play and live service verification are separate evidence levels. This pass performed the first two. It did not repeat the release matrix, run a new full-city benchmark, or verify all live services.

**Where the implementations differ**

| Area | World Explorer today | Open-Planet source | Practical decision |
| --- | --- | --- | --- |
| Ownership | The shared context has many writers. Session and actor contracts exist but consumers can bypass them. | Engine-free `Core` separates much of the geographic/vehicle computation. The Godot adapter still centralizes considerable mutable state. | Migrate callers into existing owners, then remove their old write permissions. Do not introduce a second context container. |
| Continuous world | The starting district, replaceable regional scenery and moving road detail have different lifetimes. The transport planner explicitly retains separate structure ownership. A fixed regional transport envelope is not unlimited playable streaming. | Piece generation looks ahead, ready chunks are published near-first, old pieces retire and the render origin shifts. | Complete one cell lifecycle across geometry, contact, entrances and activities before advertising unlimited traversal parity. |
| Frame work | A shared world-frame yield queue, cooperative construction, workers and serialized deferred startup tasks already exist. | Native jobs are capped; main-thread publication has nominal 4 ms play / 30 ms loading budgets. | Preserve the browser queue. Attribute expensive slices and indivisible uploads before moving more work or adding scheduling. |
| Roads and terrain | Existing accepted-ground compilation, road surface profiles, structure semantics, pavement and contact publications are substantial work worth preserving. | Road heights and seams use stable feature/layer identity and a shared ground/road solution. | Reuse existing accepted surface facts for render and contact. Changing engines is not a reason to reinterpret bridges, tunnels or heights. |
| Building appearance | Near and regional paths already share material/window catalogs, opening rules and night uniforms. Standard near facade material creation uses photographed color textures with scalar roughness/metalness; the inspected path does not bind normal maps. | Building shader samples masonry/roof normal maps, changes glass roughness and filters detail with distance. Lighting has one explicit sky/exposure/fog/contact-shadow policy. | Preserve existing facade semantics and batching. Add a measured normal/material-detail tier and validate lighting/LOD continuity across locations. More random meshes are not the solution. |
| Browser delivery | Existing web UI, asset loading, persistence, connected accounts and service authorization must survive. | Inspected export/extension configuration is Windows-oriented; region conversion uses a native executable and multiplayer uses ENet. | Retain the working web client and backend. Native tools and networking are not browser substitutes. |
| Portability | Some world/domain modules are pure; many runtime files combine rules, scene work, UI and service calls. A bounded JSON projection exists but is evaluation-only. | `Core/GeoWorld`, `GeoRoads`, `GeoGround` and `GeoCar` provide a clearer engine boundary. Godot `main.gd` is still 4,580 lines and its world extension 4,362. | Port contracts, identities, asset definitions and domain behavior. Avoid copying either project's orchestration monoliths. |

Open-Planet also has limits relevant to this comparison: one publication can exceed its nominal budget because at least one ready item is accepted; readiness has a 30-second fallback; altitude suppresses new detailed road/building work. Its source does not establish seamless, fully detailed play at every altitude or unlimited geographic coverage. No equivalent-machine benchmark was performed.

**Confirmed defect repaired in this pass**

Navigation used `selectedProperty || selectedHistoric` as its destination. Those fields are also map/UI selection state. An activity could install a route, then the next guidance update would replace it with the previously selected property. A POI route cleared those selections, so it had no guidance destination; walking POI directions also started from the parked car.

The repair introduces a small engine-independent navigation intent model containing coordinates, label, owner and world generation. Route creation sets that intent; route refresh consumes it. Activities, property directions, historic directions and POIs now supply explicit intent. Inspecting a property cannot redirect the current route. An activity's cleanup can clear only an activity-owned route. World reset cancels any route. Existing entrance resolution, road search, geometry construction and disposal remain in use.

This is a completed consumer migration for destination ownership, not a second navigation implementation. Ten obsolete file/root write permissions were removed from the existing ownership allowlist. The navigation renderer and initial state remain the owners of their existing output fields. Navigation still uses its existing walk/drive/drone routing modes; this change does not claim new maritime or aviation route planning.

Verification completed:

- Baseline-source reproduction: walking POI route starts at `(0, 0)` instead of walker `(30, 10)`; activity destination changes to the old home `(100, 100)` instead of `(-80, 60)`. Updated source preserves the requested actor/destination and displays POI guidance.
- Eleven targeted Node checks passed: immutable intent, activity/checkpoint interaction, scoped cancellation, world replacement, property exterior entrances, existing activity lifecycle and route GPU/animation disposal.
- The home entrance test was strengthened to move beyond the route rebuild threshold; that affected test passed again.
- Browser component using the real navigation/activity modules passed eight interaction assertions with zero console errors. The screenshot was opened and inspected. Its controlled scene is not a full-world gameplay or performance result.
- Existing context ownership guard passed. No blanket baseline regeneration or expanded write permissions were used.

**Finite cleanup sequence before expanding the Godot project**

Current implementation and evidence are recorded in the [local implementation ledger](2026-10-19-BROWSER-FOUNDATION-IMPLEMENTATION.md). This is the current sequence for this comparison request. Older evaluation roadmaps remain historical evidence, not additional queues to rerun. Each package has a bounded completion condition.

| Order / status | Work | Completion condition |
| --- | --- | --- |
| 1 — complete locally | Separate navigation intent from map selection and migrate all current route callers. | Reproduction fixed; scoped cleanup, world invalidation, entrance preservation and resource disposal verified; old write permissions removed. |
| 2 — reader/dispatch consolidation implemented locally; command migration remains | Consolidate active actor, movement-mode and camera ownership through the existing `transport/actor-contract.js`, `travel-mode.js` and session coordinator. Separate environment, vehicle and occupancy so walking a ship deck is not treated as controlling the ship. Group current direct writers by responsibility before moving them. | One transition path owns activation/deactivation and spawn; readers use snapshots; one camera authority is active. Exercise car → walk → boat helm → deck → swim → return, plus Earth → space → Earth. Cancellation and a failed asset load leave one valid actor. Remove migrated direct writes. |
| 3 — retirement defects repaired; coordinated cell residency pending | Finish the existing world residency model. Give scenery, detailed transport, bridges/tunnels, contact, building entrances and POIs explicit cell/publication ownership. Keep persistent room edits separate from disposable geometry. Preserve the location-based option. | One ordinary route crosses three neighboring publications and returns; one bridge and one tunnel span boundaries; one landing requests detail. Geometry/contact/entrance identities agree, stale jobs cannot publish, old resources retire, player edits survive. A second equal route cycle stabilizes retention. No menu reload requirement and no reduced building coverage as a shortcut. |
| 4 — pending | Separate rules from presentation in the touched urban, discovery and ship modules. Extract only behaviors required by the actor/cell migrations into plain models; retain their browser adapters. Version existing world publication data for a full-fidelity selected cell instead of creating a parallel writable world database. | The browser consumes the same model outputs used by portable fixtures. No DOM, Three objects or Firebase snapshots cross the model boundary; units, precision, provenance, entrances, accepted surface data and command idempotency survive round trips. Existing saves read unchanged. |
| 5 — pending | Establish the visual quality contract across existing near/regional renderers, then implement one representative city/harbor/interior slice. Share appearance decisions and permitted detail tiers, not identical mesh complexity at every distance. | Day/night and near/far captures retain material identity, readable characters, continuous facades and water/surface behavior. Frame and texture costs are recorded on the browser target at equal coverage. Only then expand the policy geographically. |
| 6 — pending | Build the first Godot consumer of the proven cell/model contracts and shared licensed assets. Keep the existing browser product as the acceptance reference. | The same cell, building/entrance IDs, road heights, vehicle transitions and saved command outcomes work in both clients. Native-specific shaders/UI are adapters. A browser export, if required for the Godot client itself, is validated separately using its supported renderer and networking. |

These packages do not require converting all 231,526 lines, eliminating every shared-context read, replacing every asset, or implementing every possible game before beginning a useful Godot slice. The prerequisite is that the world and gameplay semantics used by that slice have clear ownership and verified browser behavior.

For performance changes, capture one affected journey before and after with the same geography, quality and coverage. Separate fetch, decoding/compilation, publication, GPU work and retained memory. Targets in `workload-policy.js` are budgets, not proof they are met. Run one heavy process at a time. Reuse unaffected release evidence; rerun only checks invalidated by changed behavior or new failures.

**What should not be rewritten on this evidence**

Keep the existing session cancellation, cooperative scheduling, model-template leases, building provenance, transport compiler, connected economy and persistence authorities. The production bundler already canonicalizes internal module query paths; different source query strings alone do not prove duplicated production state. Listener add/remove syntax counts alone do not prove leaks. Uncertain/unreached code should not be deleted as “AI clutter” without tracing its registration and consumers.

The first visual improvement should use a shared material/lighting contract with measured browser tiers. Godot's native Forward+ effects are not a promise of the same browser image: current Godot web export uses the Compatibility renderer and WebGL 2. Native extensions need a web build; native processes/UDP cannot simply carry over. The local `/Applications/Godot.app` installation was previously verified as 4.7.1; this pass did not create, build or migrate a Godot project. [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [renderer capabilities](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html).

**Source map**

World Explorer:

- [Shared context](../../app/js/shared-context.js), [session coordinator](../../app/js/session-coordinator.js), [actor contract](../../app/js/transport/actor-contract.js), [travel mode](../../app/js/travel-mode.js).
- [World frame queue](../../app/js/world/cooperative-scheduling.js), [startup work policy](../../app/js/runtime/workload-policy.js), [runtime kernel](../../app/js/runtime/kernel.js), [model leases](../../app/js/assets/model-template-cache.js).
- [Transport detail plan](../../app/js/terrain/transport-detail-plan.js), [regional scenery scheduler](../../app/js/terrain/regional-scenery-scheduler.js), [fixed regional transport](../../app/js/world/fixed-regional-context.js), [district ground compiler](../../app/js/world/compiler/district-ground-model.js).
- [Near facades](../../app/js/engine/building-facade-materials.js), [regional facades](../../app/js/terrain/far-building-facade-material.js), [shared catalog](../../app/js/world/building-exterior-catalog.js).
- [Existing portable projection](../../scripts/architecture-evaluation/export-world-projection.js), [publication metadata](../../app/js/world/compiler/world-layer-products.js), [production bundler](../../scripts/hosting-artifact.mjs).
- [Navigation intent](../../app/js/game/navigation-state.js), [navigation adapter](../../app/js/game/navigation-ui.js), [regression checks](../../tests/navigation-ownership-current.test.mjs).

Open-Planet, pinned source:

- [Engine-free world construction](https://github.com/inlighten420/open-planet/blob/bbb183b36f4fd7ea8c6350c43c2c2eb2378099f6/Core/GeoWorld/Piece.cpp).
- [World job/publication/origin adapter](https://github.com/inlighten420/open-planet/blob/bbb183b36f4fd7ea8c6350c43c2c2eb2378099f6/Godot/extension/src/geodrive_world.cpp), particularly constants around line 99, publication around 1679, origin shifts around 2189 and readiness around 2435.
- [Building shader](https://github.com/inlighten420/open-planet/blob/bbb183b36f4fd7ea8c6350c43c2c2eb2378099f6/Godot/building.gdshader), [lighting](https://github.com/inlighten420/open-planet/blob/bbb183b36f4fd7ea8c6350c43c2c2eb2378099f6/Godot/lighting.gd), [project settings](https://github.com/inlighten420/open-planet/blob/bbb183b36f4fd7ea8c6350c43c2c2eb2378099f6/Godot/project.godot).

No Open-Planet implementation was copied into World Explorer. The navigation repair was derived from the reproduced behavior in this project's code.
