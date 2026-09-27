# Current system audit

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

## Ownership and observed gaps

| Path (repository-relative) | Current responsibility | Decision / remaining work |
|---|---|---|
| `app/js/walking/player-character-host.js`, `curated-explorer-character.js` | Geometry-free host, licensed glTF attachment, independent mixer, lifecycle | Retain host/cache; replace abrupt whole-body weights with shared layered controller. Local prototype integrated here. |
| `app/js/assets/model-asset-runtime.js` | Cached templates, skeleton cloning, per-instance material/skeleton disposal | Retain. Catalog instance budgets are metadata, not a global allocator. |
| `app/js/walking/held-equipment-pose.js` | Two-bone hand placement after authored animation | Retain; avoid applying it before the mixer overwrites bones. No foot IK proven. |
| `app/js/multiplayer/presence.js` | Client Firestore pose publication, 2.5-second heartbeat, 2.25-second minimum writes, TTL | Retain for membership/coarse presence, not competitive motion authority. |
| `app/js/multiplayer/ghosts.js`, `ghost-proxies.js` | Smoothing/extrapolation, separate procedural remote avatars | Expand into shared character presentation; current 3.5-second extrapolation and velocity-facing are unsuitable for aiming/strafe. |
| `functions/room-admission.js` | Transactional bounded admission and membership lock | Retain as admission authority. Admission does not establish movement validity. |
| `app/js/ui-room-session.js`, `ui-room-room-actions.js` | Join/load/bind world, listeners and room lifecycle | Retain. Add explicit geometry-ready barrier before action activation. |
| `app/js/urban-sandbox/equipment-model.js` | Existing Backpack adapter, quick slots, item definitions, ammunition/quantity and cooldown | Reuse on trusted server; do not introduce a combat inventory. |
| `app/js/urban-sandbox/equipment-runtime.js` | Input, projectiles, local collision/effects, client target selection and shared impact submission | Separate presentation from authoritative resolution; existing local simulation is not PvP proof. |
| `functions/urban-sandbox.js` | Transactional NPC/furniture/vehicle impacts, vehicle leases and civic events | Repair server cooldown; replace trust in reported victims for competitive actions. Preserve leases and civic ownership. |
| `app/js/player/condition-model.js`, `connected-player-state.js`, `functions/player-state-authority.js` | Explorer condition and save synchronization | Reuse model; client-submitted saved condition must not become competitive room health authority. |
| `functions/economy-authority.js` | Purchase transaction, receipt, wallet/stock updates and compensation | Retain. Gameplay actions must not mint credits or rewards directly. |
| `app/js/urban-sandbox/loot-pickup-model.js` | Local pickup/claim guard | Local idempotency alone does not prevent two clients claiming the same shared item. |
| `app/js/living-world/navigation-graphs.js` | Generated pedestrian/traffic topology from world data | Retain geography-derived graphs; expand local avoidance/interior links. |
| `app/js/urban-sandbox/npc-combat-policy.js` | Bounded alert/flee/defend/combat/down/recover policies | Retain explicit states; use spatial witnessed events, not global aggression. |
| `app/js/urban-sandbox/runtime.js` | Composition, input/lifecycle, vehicles/NPCs, service audio | Incremental decomposition; avoid a second runtime. Service audio uses a Web Audio oscillator and closes its context on teardown. |
| `app/js/controls/mobile-touch-authority.js`, `ui/equipment-action-policy.js` | Semantic touch ownership/action gating | Retain; test simultaneous movement/look/action and canceled pointers. |

## Data flow and trust boundaries

Today: controls → local walker/equipment → client pose/target report → authenticated Function → room membership + range/cooldown transaction → entity state → room listener/presentation. Authentication verifies identity, not truth of client geometry or targets. Existing impact targets are NPCs, furniture and vehicles; no complete competitive player-damage path was found in that endpoint.

The server equipment table and client catalog also differ: for example pulse range 42 versus 100, charge range 19 versus 26, and additional client equipment lacks matching server entries. Do not silently expand server permissions to match a richer client list.

Confirmed repair: server timestamps were given an additional 250 ms allowance, shortening every action cooldown. Removed the allowance; a transaction test rejects 60/309 ms repeats and accepts the 310 ms boundary. This does not repair target trust, missing ammo validation or static occlusion.

Additional local repairs: yaw crossing ±π now produces a nonnegative angular distance in either direction; presence velocity inference no longer treats a location/interior transition as ordinary motion. Dedicated component checks exercise both behaviors.

## Audit limits

This is a source-based ownership audit with selected component and character-browser evidence. It is not a comprehensive security certification, a review of every activity, or a live service test. Camera transitions, vehicle control, chat, building permissions, persistent Blocks, match rewards, full audio lifecycle, privacy rules and world teardown still require their existing integration journeys plus new action coverage. Earlier architecture work on full transitive dependency boundaries and compiler workers remains open; see `../architecture-evaluation/`.
