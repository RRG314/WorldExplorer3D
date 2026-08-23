# World Explorer 3D Architecture Map

Last audited: 2026-08-22 against World Explorer 3D 4.3.1 at release commit
`af540b39fc80ba01998d48a2739d982fd8b913c1`.

This map explains how the current code executes and where authority changes
hands. It complements the component-by-component
[system inventory](SYSTEM_INVENTORY.md). World Explorer 3D is a bounded,
selected-location application, not a continuous-world streaming engine.

## System context

```mermaid
flowchart TD
    Player["Player and browser"] --> Landing["Public landing and launch"]
    Landing --> Shell["app/index.html game shell"]
    Shell --> Manifest["Module manifest"]
    Manifest --> Entry["app-entry.js"]

    Entry --> Engine["Engine and render loop"]
    Entry --> Kernel["Runtime kernel"]
    Entry --> Services["Lazy platform services"]
    Entry --> Coordinator["Session coordinator"]

    Coordinator --> Earth["Selected-location Earth session"]
    Coordinator --> Planetary["Moon and Mars"]
    Coordinator --> Ocean["Ocean and underwater"]
    Coordinator --> Space["Solar system and deep space"]

    Earth --> Providers["Mapped and modeled providers"]
    Providers --> Compiler["Six immutable world-layer products"]
    Compiler --> Snapshot["Published WorldSnapshot"]
    Snapshot --> Scenes["Owned Earth scene roots"]
    Scenes --> Simulation["Player, vehicles, living world and games"]

    Services --> ClientAPI["Account, creator, discovery, editor, multiplayer and AR clients"]
    ClientAPI --> Auth["Firebase Auth"]
    ClientAPI --> Functions["Authorized HTTPS functions"]
    ClientAPI --> Firestore["Firestore rules and room/profile data"]
    Functions --> Firestore
    Functions --> External["Allowlisted external providers and Stripe"]
```

The renderer does not own provider selection, and providers do not own final
scene attachment. The session coordinator owns transitions; the Earth loading
pipeline owns world publication; individual gameplay systems consume published
surfaces and state.

## Browser boot sequence

```mermaid
sequenceDiagram
    participant Browser
    participant HTML as app/index.html
    participant Manifest as modules/manifest.js
    participant Entry as app-entry.js
    participant Kernel as runtime/kernel.js
    participant Registry as platform/service-registry.js
    participant Loop as main.js

    Browser->>HTML: Load game document and HUD shell
    HTML->>Manifest: Start module bootstrap
    Manifest->>Manifest: Load critical Three.js dependencies
    Manifest->>Manifest: Load optional rendering helpers
    Manifest->>Entry: Import application entry
    Entry->>Entry: Create engine, input, UI and shared capabilities
    Entry->>Kernel: Register phased runtime systems
    Entry->>Registry: Register lazy platform services
    Entry->>Entry: Register on-demand environments and games
    Entry->>Loop: Start the frame loop
    Loop->>Kernel: Run fixed and frame phases
```

`app/js/shared-context.js` is the explicit compatibility surface between many
older and newer modules. It is application-scoped, not a second world model.
New code should prefer a narrow service or lifecycle-owned capability instead
of adding unrelated mutable state to the shared context.

## Selected-location Earth load

```mermaid
sequenceDiagram
    participant UI as Location UI
    participant Coordinator as World load coordinator
    participant Request as WorldLoadRequest
    participant Session as WorldLoadSession
    participant Providers
    participant Compiler
    participant Products as Layer products
    participant Snapshot as WorldSnapshot store
    participant Scene as Earth publication

    UI->>Request: Create immutable location identity and bounds
    Request->>Coordinator: Request selected world
    Coordinator->>Coordinator: Cancel or supersede older request
    Coordinator->>Session: Create load state and provider metrics
    Session->>Providers: Fetch accepted ground and mapped layers
    Providers-->>Session: Payloads with identity and provenance
    Session->>Compiler: Normalize, deduplicate, resolve and compile
    Compiler->>Products: Terrain, hydrology, transport, buildings, landuse, places
    Products->>Snapshot: Assemble one immutable snapshot
    Snapshot->>Scene: Atomically publish accepted lists and scene roots
    Scene-->>UI: World ready; enable normal gameplay
```

If a newer request arrives, the older session becomes superseded and its
provider work, compilation products, scene resources, and callbacks must not
publish. Publication is the boundary between construction and gameplay.

## Physical world authority map

| Physical concern | Selection authority | Geometry/state authority | Publication authority | Consumers that must not replace it |
| --- | --- | --- | --- | --- |
| Ground height and collision | Accepted-ground/provider registry | Terrain tiles, seams, height sampling and WorldCover | Terrain layer product and Earth publication | Roads, buildings, actors, vehicles, water |
| Water surface | Hydrology source and water-body contract | Hydrology compiler and water surface registry | Hydrology layer product | Boat mode, underwater mode, shoreline effects |
| Roads and engineered structures | Transport source normalizer and network model | Surface/profile/junction/structure/tunnel compilers | Transport layer product | Traffic, player vehicles, pedestrians, structure visuals |
| Buildings | Building source selection, stable ID and footprint deduplication | Metadata/height/semantics, batching, roofs, facades and collision | Building layer product | Entrances, interiors, discovery, living world |
| Landuse and vegetation | Mapped landuse and WorldCover classification | Landuse compiler and deterministic placement | Landuse layer product | Visual environment and discovery |
| Places and street objects | POI, entrance and furniture evidence | Place/furniture compilers | Places layer product | UI labels, pedestrian destinations, discovery |
| Environment visibility | Session coordinator and scene ownership | Environment-specific lifecycle scope | Active owned scene roots | Render loop and input modes |

A physical surface may have many consumers, but only one published owner.
Visual decoration, collision, traversal, and simulation should derive from the
same accepted product rather than reconstructing competing geometry.

## Transport data flow

```mermaid
flowchart LR
    Source["Mapped ways, nodes, tags and provider identity"] --> Normalize["Source normalization"]
    Normalize --> Network["Deduplication and topology"]
    Network --> Surface["Surface and vertical profiles"]
    Surface --> Junctions["Junction profile and turn composition"]
    Surface --> Structures["Bridge, ramp, elevated, underpass and tunnel assembly"]
    Junctions --> Product["Immutable transport product"]
    Structures --> Product
    Product --> Render["Road and structure rendering"]
    Product --> Collision["Collision and player traversal"]
    Product --> Traffic["Vehicle navigation"]
    Product --> Eligibility["Pedestrian surface eligibility"]
```

When a bridge or ramp ends incorrectly, review in that order and identify the
first stage where its valid identity, topology, profile, or geometry disappears.
Do not begin by adding a second visual structure. Source incompleteness remains
a possible result and must be labeled rather than disguised.

## Building data flow

```mermaid
flowchart LR
    Inputs["Overture and OSM/Shortbread mapped features"] --> Provenance["Stable ID, provenance and metadata"]
    Provenance --> Dedup["Footprint deduplication"]
    Dedup --> Budget["Load and detail selection budgets"]
    Budget --> Height["Mapped height and bounded fallback resolution"]
    Height --> Geometry["Massing, roofs, facade entrances and storefront detail"]
    Geometry --> Batch["Compatible batching and spatial index"]
    Batch --> LOD["LOD and culling"]
    LOD --> Product["Immutable building product"]
    Product --> Scene["Earth scene attachment"]
    Product --> Collision["Building collision"]
    Product --> Entry["Entrance and interior selection"]
```

Building counts alone do not prove a correct skyline. Reviews must confirm that
mapped height and identity survive every stage and remain visible in the final
assembled frame at the same location and camera path.

## Environment and lifecycle ownership

```mermaid
stateDiagram-v2
    [*] --> Shell
    Shell --> Earth: Select Earth location
    Earth --> Earth: Replace selected location
    Earth --> Ocean: Enter ocean
    Ocean --> Earth: Return to saved Earth session
    Earth --> Moon: Travel to Moon
    Earth --> Mars: Travel to Mars
    Moon --> Space: Launch
    Mars --> Space: Launch
    Space --> Moon: Land or return
    Space --> Mars: Land or return
    Space --> Earth: Return to Earth
    Earth --> Shell: Dispose session
    Ocean --> Shell: Dispose session
    Moon --> Shell: Dispose session
    Mars --> Shell: Dispose session
    Space --> Shell: Dispose session
```

The session coordinator serializes these transitions. Lifecycle scopes own
listeners, timers, callbacks, scene objects, physics resources, provider work,
and deferred tasks. Teardown must release the old environment before another
owner publishes conflicting input, camera, collision, or render state.

## Gameplay dependency map

```mermaid
flowchart TD
    Snapshot["Published world snapshot"] --> Traversal["Player traversal"]
    Snapshot --> Living["Living world and traffic"]
    Snapshot --> Interiors["Entrances and interiors"]
    Snapshot --> Discovery["Discovery and field context"]
    Snapshot --> Games["DeFlock, fishing, Paint Town and activities"]

    Input["Keyboard, pointer, touch and gamepad"] --> Modes["Active player/input mode"]
    Modes --> Traversal
    Traversal --> Camera["Mode-aware camera"]
    Traversal --> Interaction["Backpack, vehicles and world actions"]

    Services["Lazy platform services"] --> Discovery
    Services --> Games
    Services --> Multiplayer["Bounded multiplayer room"]
    Multiplayer --> Presence["Players, chat and shared state"]
    Presence --> Living
    Presence --> Games
```

Non-player people use eligible published pedestrian paths and destinations.
They must not be placed on vehicle-only road, bridge, ramp, or tunnel surfaces.
Traffic consumes the published transport network. A feature system may attach
game state to a mapped identity but must not silently become a second world
surface authority.

## Client, backend, and persistence boundary

```mermaid
flowchart LR
    UI["Browser UI and game services"] --> Auth["Firebase Auth"]
    UI --> Rules["Direct Firestore reads and allowed writes"]
    Rules --> Store["Firestore"]
    UI --> API["HTTPS function client APIs"]
    API --> Functions["Firebase functions"]
    Functions --> Verify["Authentication, authorization and validation"]
    Verify --> Store
    Functions --> Payments["Stripe"]
    Functions --> Geo["Allowlisted geospatial providers"]
    Functions --> Admin["Moderation and admin operations"]
```

Direct-client writes are limited by `firestore.rules`. Operations requiring
transactions, moderation, entitlements, payments, provider credentials,
immutable cooperative claims, or privileged aggregation belong in
`functions/`. Firebase configuration values in the client identify the public
project; they are not authorization secrets.

Multiplayer is room-based. A room owns one bounded location plus player
presence, chat, artifacts, blocks, modifications, activities, and cooperative
game state. There is no single global MMO simulation server.

## External data boundary

```mermaid
flowchart TD
    Provider["External or bundled source"] --> Adapter["Provider adapter and normalization"]
    Adapter --> Evidence["Identity, provenance, freshness, datum and truth class"]
    Evidence --> Cache["Bounded cache and in-flight deduplication"]
    Cache --> Consumer["World or Live Earth consumer"]
    Adapter --> Failure["Timeout, outage or unavailable coverage"]
    Failure --> Fallback["Labeled cached, alternate, inferred or unavailable state"]
    Fallback --> Consumer
```

Mapped features, observations, forecasts/models, predictions, reference-only
routes, and visual fallbacks are distinct truth classes. See
[DATA_SOURCES.md](../DATA_SOURCES.md). A fallback can keep the experience
usable, but cannot be represented as current observed or surveyed data.

## Build and release flow

```mermaid
flowchart LR
    Source["Canonical source"] --> Static["Source and provider verification"]
    Static --> Backend["Functions syntax and security tests"]
    Backend --> Multi["Two-client multiplayer integration"]
    Multi --> Build["Fresh content-hashed hosting artifact"]
    Build --> Artifact["Artifact integrity and reachability"]
    Artifact --> World["Assembled Earth journey"]
    World --> JFX["JFX surface contract"]
    JFX --> Environments["Environment lifecycle journeys"]
    Environments --> GPS["Live GPS journey"]
    GPS --> Worldwide["Baltimore, Golden Gate, London, Monaco, Manhattan, Iowa and Tokyo"]
    Worldwide --> Human["Complete-frame visual inspection"]
```

`npm run release:verify` is the orchestration entry. The built artifact, not a
source-only development server, is the release candidate. Automated assertions
do not replace final-frame review, especially for skyline scale, transport
continuity, terrain/water relationships, actor placement, HUD layout, and
camera/player control.

## Common trace paths

| Change or defect | Trace this path before editing |
| --- | --- |
| World loads the wrong place | UI selection → `WorldLoadRequest` identity/bounds → coordinator → provider request → published snapshot |
| Terrain or water mismatch | Accepted-ground/provider evidence → datum/height sampling → seams/masks → terrain/hydrology products → final collision/rendering |
| Bridge, ramp, overpass, tunnel, or road gap | Source identity/tags → normalization → dedup/topology → vertical profile → junction/structure assembly → transport product → rendering/collision/traversal |
| Missing or incorrect skyline | Source/provenance → footprint dedup → selection budget → height resolution → batching → LOD/culling → building product → final scene visibility |
| Car or actor clips a slope | Published terrain/transport height → collision query → contact solver/interpolation → rendered pose/camera |
| Pedestrian appears on a road or bridge | Published surface eligibility → living-world navigation graph → spawn/destination selection → runtime population |
| Old world remains in memory | Superseded load/session → lifecycle scope → provider abort → scene publication teardown → renderer/physics disposal |
| Backend feature works only in UI | Client API → auth token → function method/validation → transaction/rules/index → second-client readback |
| Environment controls conflict | Session coordinator → active environment owner → input mode → camera → scene roots → teardown |
| Visual feature disappears at distance | Source identity → published object → batching → LOD/culling thresholds → render budget; do not change mapped data detail as a performance shortcut |

## Deliberate boundaries and current gaps

- Earth sessions are location-based and bounded; continuous streaming is an
  intentional non-goal.
- Mapped source quality varies. The system may use a documented fallback, but
  cannot invent exact measurements or source connections.
- Accepted-ground authority covers 41 reviewed fixed-location artifacts; other
  areas can use a labeled fallback with weaker datum guarantees.
- Generated multi-floor interiors exist; mapped indoor ingestion currently
  selects one mapped level.
- Activity creation and local testing exist; production activity publishing
  does not.
- Crafting, a unified mission/economy authority, and universal physical player
  embodiment do not exist in the current codebase.
- The runtime has lazy loading, cancellation, batching, and cleanup mechanisms,
  but named desktop/mobile performance budgets are not yet a release gate.
- Important shipped features still need complete immutable-candidate journeys;
  see [ROADMAP.md](../ROADMAP.md).

## Review rule

Identify the first authoritative stage where correct identity, data, geometry,
state, or lifecycle ownership disappears. Fix that stage and remove the cause;
do not add a city-specific correction, duplicate renderer, test-only camera, or
visual-only physical surface. Verify one bounded change in the complete game,
then checkpoint it before beginning another.
