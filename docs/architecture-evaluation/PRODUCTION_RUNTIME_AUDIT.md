# Runtime and ownership audit

Source baseline: candidate `bbe6502`; production remains 5.2 and was not changed. This document describes the candidate's public runtime, not a claim that these files are deployed. The candidate and stable `59b27fb` have identical tracked file content. Compared with live-source `db62593`, Git reports 1,222 changed files, 107,718 insertions and 8,138 deletions; these include assets/docs/tests and are not feature counts.

## Boot and lifetime

`app/index.html` loads the module/script loader and manifest. `modules/manifest.js` selects Three r128 and four critical vendor scripts, with postprocessing dependencies optional. `app-entry.js` imports configuration, auth, shared context, diagnostics, state, input, movement, engine, sky/weather and lazy entrypoints. The lexical static closure estimates 232 local modules; runtime request/coverage capture remains necessary to distinguish downloaded, parsed and executed code.

`bootApp()` installs the Earth entrypoint, initializes engine/accessibility/UI/boat controls, installs lazy fishing, schedules tutorial, starts account observation, then starts the kernel. Initializing boat UI does not prove an active maritime simulation. `platform/service-registry.js` owns lazy service readiness. `runtime/on-demand-modes.js` imports Ocean/Space only when selected; the ES modules remain cached after first use. `on-demand-mars`, `on-demand-block-builder`, `on-demand-live-earth` and the AR platform adapters similarly defer features. A never-used mode and a previously-used/disposed mode have different memory baselines.

`runtime/workload-policy.js` serializes post-first-play work. Analytics warms after play; consent remains a separate requirement. Tutorial has a six-second boot fallback in `app-entry.js`, so it can import while the user remains at title. That is a verified eager path, not yet a measured performance problem. Do not delete tutorial functionality; move the fallback under first-play notification if a title profile justifies it.

## Scheduling

| Owner | Normal work | Gating/lifetime |
| --- | --- | --- |
| Runtime kernel | Ordered input/simulation/world/camera/presentation/render phases; fixed steps capped at five | `runtime/kernel.js`; each system has owner, optional enabled predicate and disposer |
| Frame metrics | Frame statistics, tutorial update, renderer info reset | Runs in core input phase; small but always present |
| Movement | Input, physics update and camera | Game started, not loading, no pending title launch |
| World | Planetary tracks/map, water waves; Earth sky; weather refresh every >5 s; boat availability 0.25–1.2 s | Ship interior short-circuits to ship update; callers and callee guards both matter |
| Presentation | HUD ~15 Hz, minimap ~5 Hz (flight ~4 Hz), visual focus/ownership ~5 Hz | Game started and not loading; large map only when shown |
| Platform | Activity update and optional Live Earth update; selector ~4 s | Actual implementations are absent until loaded; inspect loaded/closed lifetimes separately |
| Main renderer | Render or composer plus cheap renderer counters | Disabled on title, loading and manual pause |
| Ocean/Space | Separate animation/session scope | Own stop paths cancel frames; verify actual GPU release over repeat journeys |
| Room session | Presence/leases, ghost updates, bounded subscriptions | `multiplayer/loop.js`, `presence.js`, `rooms.js`; live backend needed for exact cost |

These intervals come from `runtime/core-frame-systems.js`. They are scheduling evidence, not duration measurements. An inactive callback that returns immediately is different from inactive scene traversal.

## Diagnostics and internal overhead

`runtime-diagnostics.js` is eagerly imported, defines two global error listeners and retains at most 12 distinct errors. Its large read-only snapshots include surface/transport traversal and many domain snapshots. Search found no automatic app/js caller of `getWorldExplorerRuntimeDiagnostics`, `render_game_to_text` or `publishWorldExplorerRuntimeDiagnostics` outside that module. Test polling can therefore create workload that ordinary players do not incur. Developer roof controls require `?diagnostics=1`; graphics interception requires `?graphicsDiagnostics=1`.

`perf.js` is not wholly obsolete instrumentation: it drives automatic quality. It retains a 1,800-sample Float64 ring (14,400 bytes of sample storage). Renderer counters are copied every draw. `perf-panel.js` avoids formatting when hidden, though it still performs a DOM lookup and display assignment when called. Do not remove auto-quality to save diagnostic code. A future split should retain cheap read-only counters/errors in production and dynamically import expensive inspectors only on demand, with an explicit async readiness contract for tests.

## Actual ownership/dependency map

| Chain | Existing authority/data | Consumers and adapter coupling |
| --- | --- | --- |
| Geographic request → compiled Earth | `earth-core/world-load-request.js`, `world-load-session.js`, `world/world-load-coordinator.js`; provider selection and cancellation | Load passes mutate shared scene/collections; `publication.js` commits output; `world-snapshot-adapter.js` stores a summary |
| Terrain/elevation/land cover → walk/drive/water | `terrain/*`, `earth-core/world-surface-domain.js`, district ground selection | Terrain meshes and surface queries must agree on datum/scale; render texture/elevation cache ownership is separate |
| Mapped road → topology → carriageway/collision | `transport-source-normalizer.js`, `transport-network-model.js`, `transport-surface-model.js` | Worker output feeds Three batches and contact indexes; bridge/tunnel semantics cannot be replaced by decorative roads |
| Building → property/POI/entrance/capture | `building-provenance-model.js`, building semantic records, stable sourceBuildingId | `load-building-pass.js` also stores extensive semantic data in Mesh.userData; `building-entry.js` can consume non-mesh colliders |
| Interior/capture | `functions/interior-layout.mjs`, capture session/revision authority | Browser editor, photo surfaces and `interiors/authored-geometry.js` consume layout; private media permissions remain backend-owned |
| Explorer → Backpack → vehicle → business | `player/connected-player-state.js`, Backpack/domain rules, commerce receipts | `economy/connected-wallet-authority.js` wraps server commands but imports Firebase directly; game/UI must consume its interface |
| Spacecraft → ship → sample → cargo → processing | Space journey/craft authorities, expedition command/shared authority and generated shared engine | Ship runtime renders and mediates interaction; shared mutations enforce revisions/custody; do not create a parallel inventory |
| Room → shared state | `multiplayer/rooms.js`, admission endpoint, presence, shared activity authorities | Ghosts and UI are presentation; leases/transactions remain authoritative on server |
| GPS/AR/Live Earth | Sensor and provider records; `live-gps/field-session-authority.js`, geospatial contracts | Browser permissions/cameras are platform adapters, not portable simulation |
| User account/persistence | Auth + server functions/rules; local draft/preferences stores | `platform/account-service.js` observes identity; native clients need auth/application adapters, not raw browser document objects |

## Retention and duplication boundaries

ES module cache, curated asset templates, provider caches and world objects have different owners. `lifecycle-scope.js` tracks resources enrolled through it; raw listeners/timers elsewhere are not covered by its counts. Static existence of stop/dispose calls is not proof of complete teardown. Workers already transfer buffers; a blanket worker rewrite could duplicate more data than it saves.

`shared-context.js` is a mutable null-prototype object, not a typed service container. Optional chaining masks unavailable dependencies and can turn missing initialization into silent no-ops. Narrow injected interfaces should replace specific dependency sets incrementally. No independent world/economy/player authority should be added alongside existing owners.
