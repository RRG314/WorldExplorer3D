# Multiplayer architecture

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

## Decision

Keep bounded rooms and current Firebase admission, persistence, economy and access control. Use a room simulation for frequent movement/action authority; Firestore remains the durable/coarse state layer. Do not increase Firestore pose writes to game-frame frequency.

[Photon's lag-compensation documentation](https://doc.photonengine.com/fusion/v2/manual/advanced/lag-compensation) distinguishes server/host hit resolution from client-trusting shared mode and describes historical hitboxes. [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) documents the transport API. Accessed 2026-09-27 UTC. This is architectural research, not selection or installation of Photon. A transport alone provides neither authority nor bounded queues.

## Required sequence

Authenticate → existing room admission → server reads immutable room/world revision → load trusted collision snapshot → acquire simulation generation → spawn → accept sequenced movement/action inputs → fixed-step resolve → acknowledge and replicate → durable receipts for inventory/economy.

Inputs contain sequence, session epoch, normalized intent, aim, and allowed action identifier. They do not contain damage, victim, money or an authoritative position. The server owns pose, cooldown, ammunition, condition, recovery and accepted world geometry. Clamp catch-up work; reject missing geometry rather than allow shots through it. An owner/moderator role is not permission to bypass simulation validation.

Client movement can be predicted and reconciled. Remote poses interpolate snapshots; extrapolation is short and freezes on loss. Cosmetic muzzle/recoil feedback may predict, while hit confirmation and inventory changes await receipts. Rewind, if added, is bounded by server-measured latency/history and never grants arbitrary client time travel.

## Current component prototype

`room-action-resolver.js` accepts injected admitted actors with existing Backpack/equipment and condition models. It resolves victims from server poses and an obstruction query, bounds projectile/event work, consumes resources once, and remembers accepted/rejected sequences. It is not exposed as a Function. `poseAuthority` is an internal contract label, not authentication or anti-cheat.

Still missing: authenticated gateway, authoritative movement, accepted geographic collision snapshots, transport, ownership failover, durable receipts/outbox, player recovery, authoritative pickup/drop, snapshot reconciliation and actual two-player integration. In-memory receipts are keyed by admitted UID/epoch, independent of replaceable pose records, bounded to 32 sessions and 64 receipts each. Eviction retains a sequence high-water mark. Only the admitted-session owner can release an epoch. Process restart still requires restoring receipts or safely rotating the session epoch. No production-ready claim follows from component tests.

Host changes must revoke the old generation before accepting new inputs. Disconnect freezes inputs and keeps authoritative state for a bounded reconnect interval. Transactions, not network retry order, decide durable rewards. Queue overflow requires resnapshot; silently dropping gameplay state is not acceptable.
