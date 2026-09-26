# Feature parity and source inventory

Statuses below are **migration obligations**, not claims that every feature has passed a fresh browser test. PRESERVED means keep current behavior and limits; no capability is intentionally removed. A source anchor locates the implementation, not an independent system boundary. Ownership is mapped in PRODUCTION_RUNTIME_AUDIT.md.

| Capability | Source anchor | Disposition | Acceptance invariant |
| --- | --- | --- | --- |
| Bounded Earth generation | `app/js/world/world-load-coordinator.js` | PRESERVED | Provider selection → compiler → publication; bounded coverage remains explicit |
| Terrain and elevation | `app/js/earth-core/world-surface-domain.js` | PRESERVED | Datum, scale and rendered/contact surface agreement |
| Land cover and materials | `app/js/terrain/surface-profiles.js` | PRESERVED | Measured imagery/provenance separate from procedural fallback |
| Roads and intersections | `app/js/world/compiler/transport-network-model.js` | PRESERVED | Stable road identity, junction topology, direction and access |
| Sidewalks and crossings | `app/js/world/street-pavement-runtime.js` | PRESERVED | Worker buffers/contact authority/crossing connectivity |
| Bridges and tunnels | `app/js/world/compiler/transport-structure-model.js` | PRESERVED | Layer/clearance/tunnel envelope survives adapters |
| Buildings and facades | `app/js/world/load-building-pass.js` | PRESERVED | Footprint/parts/heights/provenance; renderer consumes resolved definition |
| Mapped interiors and entrances | `app/js/building-entry.js` | PRESERVED | Same building reference and entry eligibility |
| Reality Capture sessions | `app/js/reality-capture/capture-session.js` | PRESERVED | Private draft → upload → revision → review; preserve authority |
| Exterior photography | `app/js/reality-capture/survey-association.js` | PRESERVED | Target alignment/provenance and approved presentation |
| Interior layouts and photography | `app/js/reality-capture/home-layout-editor.js` | PRESERVED | Shared layout schema, surface IDs, holes and access policy |
| Walking and characters | `app/js/walking/player-character-host.js` | PRESERVED | Input/movement/avatar identity preserved |
| Road vehicles and physics | `app/js/physics/vehicle-config.js` | PRESERVED | Specification units, tuning and lease ownership |
| Traffic and pedestrians | `app/js/urban-sandbox/runtime.js` | PRESERVED | Actor placement/behavior and shared-state limits |
| Urban simulation and weapons | `app/js/urban-sandbox/equipment-runtime.js` | PRESERVED | Equipment, civic/game rules and collision coherence |
| Aircraft and airports | `app/js/transport/aviation-runtime.js` | PRESERVED | Mapped facilities, aircraft specifications and flight integration |
| Flight dynamics | `app/js/plane-mode.js` | PRESERVED | Same input/control behavior and surface transitions |
| Drones | `app/js/physics.js` | PRESERVED | Existing drone movement/camera integration |
| Boats and ships | `app/js/transport/maritime-runtime.js` | PRESERVED | Water authority, playable craft and domain-specific movement |
| Ports and harbors | `app/js/transport/maritime-catalog.js` | PRESERVED | Facility semantics remain mapped/procedural as identified |
| Regional water | `app/js/world/water-environment.js` | PRESERVED | One surface authority; no overlapping independent water layers |
| Ocean and underwater | `app/js/ocean.js` | PRESERVED | Mode-specific renderer/physics/lifecycle and return |
| Fishing | `app/js/fishing/shore-authority.js` | PRESERVED | Population, equipment, catch/loss/collection receipts |
| Wildlife and ecology | `app/js/living-world/population.js` | PRESERVED | Regional plausibility is not a claim of individual real sightings |
| Geology | `app/js/geospatial/geology.js` | PRESERVED | Provider provenance, samples and field activities |
| Journal, Field Guide and field activities | `app/js/discovery/runtime.js` | PRESERVED | Evidence, progression and collection UI remain linked |
| Progression and equipment | `app/js/character/vehicle-assistance.js` | PRESERVED | Existing player rules and equipment effects |
| Backpack | `app/js/player/backpack-model.js` | PRESERVED | Single inventory with custody/receipt continuity |
| Companions | `app/js/discovery/companions.js` | PRESERVED | Existing companion domain and presentation |
| Health and resources | `app/js/player/condition-model.js` | PRESERVED | Condition rules and persisted player state |
| Economy and mapped businesses | `app/js/economy/connected-wallet-authority.js` | PRESERVED | Authoritative commerce, retries and outcomes |
| Explorer Credits | `app/js/economy/connected-wallet-authority.js` | PRESERVED | Single currency authority and migration version |
| Virtual property | `app/js/real-estate/connected-property-authority.js` | PRESERVED | Stable mapped target and server ownership, not legal title |
| Maryland parcels | `app/js/real-estate.js` | PRESERVED | Parcel context distinct from virtual property and capture permissions |
| Quick Build / Blocks | `app/js/block-builder/shared-sync.js` | PRESERVED | Same coordinates, local store and room mutation authority |
| Editable world | `app/js/editable-world/model.js` | PRESERVED | Model/persistence distinct from meshes |
| Multiplayer rooms and presence | `app/js/multiplayer/rooms.js` | PRESERVED | Admission capacity, leases, private/public visibility, leave/rejoin |
| Chat and social | `app/js/multiplayer/chat.js` | PRESERVED | Authorization, moderation and UI focus behavior |
| Shared activities and objects | `app/js/multiplayer/room-activities.js` | PRESERVED | One active room context and revision/custody rules |
| Live GPS | `app/js/live-gps/field-session-authority.js` | PRESERVED | Sensor permissions/accuracy and authoritative field session |
| AR | `app/js/ar/session-service.js` | PRESERVED | Browser/device-specific support with graceful fallback |
| Live Earth/data layers | `app/js/runtime/on-demand-live-earth.js` | PRESERVED | Provider records, provenance and lazy layer lifetime |
| Moon and planetary environments | `app/js/planetary/solid-world-runtime.js` | PRESERVED | Observed data where available, labeled reconstructions elsewhere |
| Rovers | `app/js/planetary/vehicles.js` | PRESERVED | Body-specific vehicle/contact behavior |
| Spacecraft and Pathfinder | `app/js/space/spacecraft-authority.js` | PRESERVED | One craft identity across camera/transition paths |
| Solar-system flight | `app/js/solar-system.js` | PRESERVED | Body/catalog/observer frames and physics conventions |
| Deep-space travel | `app/js/universe/course-authority.js` | PRESERVED | Catalog selection, travel eligibility and hierarchical frames |
| Solis Reach | `app/js/expedition/ship-interior.js` | PRESERVED | 25-room layout, doors, crew, collisions and functional interactions |
| Interstellar Expeditions | `app/js/expedition/shared-authority.js` | PRESERVED | Server-shared revisioned commands and persisted voyage |
| Research/cargo/sample custody | `app/js/expedition/command-authority.js` | PRESERVED | Collection → bench → processing/fabrication → cargo/Backpack, no duplicate materials |
| Account and authentication | `app/js/platform/account-service.js` | PRESERVED | Current auth identity and authority adapters |
| Analytics | `app/js/app-entry.js` | PRESERVED | Consent, account/session lifetime and bounded delivery |
| Accessibility | `app/js/ui/accessibility.js` | PRESERVED | DOM focus, labels, keyboard and reduced motion preserved |
| Mobile/touch | `app/js/controls/mobile-touch-authority.js` | PRESERVED | Input ownership, mode controls and focus restoration |
| Local persistence | `app/js/player/backpack-store.js` | PRESERVED | Existing versioned save/draft migration contracts |
| Moderation | `functions/index.js` | PRESERVED | Server access decisions and administrative web workflows |
| Firebase backend | `functions/index.js` | PRESERVED | Auth/Firestore/Storage/Functions remain one authority |
| Build/release/verification | `scripts/verification/current-contracts.mjs` | PRESERVED | Artifact identity and scoped tests; no inflated blanket pass claims |

## Mandatory integrated journeys

1. Earth exploration → discovery receipt → Backpack → vehicle → mapped business → authoritative economy outcome. A rendered pickup is not proof of a committed credit/inventory transaction.
2. Building identity → property entitlement → entry → private/approved Reality Capture representation. Buying virtual property must not grant private source-media access.
3. Earth → spacecraft → Solis Reach → surface → sample → cargo → processing → Backpack → Earth economy. Test conservation and retry/stale-revision behavior, not just button visibility.
4. Two authenticated room members: join, visibility/presence, chat, vehicle handoff, shared activity/blocks/property/expedition, disconnect/rejoin and cleanup. Separate server authority from interpolated ghosts.
5. Each environment → Main Menu → Earth, including a failed/cancelled load. Camera/avatar/world state and resource ownership must agree.

The platform-service lifecycle is IMPROVED in component tests by the bounded repair. Performance gains, full engine-portability proof and hardware/device acceptance are DEFERRED WITH JUSTIFICATION until normal-player measurements can run safely. Those experiments are deferred; existing player capabilities are not disabled.
