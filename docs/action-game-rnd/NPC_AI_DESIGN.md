# NPC AI design

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

Retain the existing `npc-combat-policy.js` finite states and civic response ownership. A small explicit state machine is suitable for current roles; no evidence yet warrants adding GOAP or a behavior-tree framework. Separate perception, intent selection, navigation and animation instead of adding conditionals to equipment collision.

Events carry world revision, id, source, position, type, visual/audible radius and expiry. Query a spatial neighborhood, then test line of sight/hearing and role. Record bounded last-observed threats; do not publish all player intent to every NPC. Alert propagation requires a witness/report transition. Civilians flee/seek safety or report; responders investigate and intervene; armed defense needs an actual threat and cooldown. Down/recovery are authoritative outcomes in shared rooms.

Suggested priority: incapacitated → immediate collision avoidance → witnessed danger/assist → investigation → routine. A blocked route requests a bounded replan, not teleportation through a wall. Group reactions need varied delay and different escape slots to avoid a coincident pile of NPCs.

Prototype budgets: near thinking 10 Hz, mid 2 Hz, far aggregate only; distance alone must not disable an NPC currently involved in a shared action. These are starting limits, not measured capacity. Maintain deterministic actor IDs from the generated world and a server-owned consequence ledger.

Test occluded versus visible events, hearing radius, witness cap, civilian versus responder reaction, expiry/return to routine, blocked exit, actor removal, world switch and duplicate event. Existing policy unit tests cover some state transitions; the new multiplayer perception chain remains unimplemented.

Research context: [Horizon AI development session abstract](https://www.gdcvault.com/play/1024912/Beyond-Killzone-Creating-New-AI), accessed 2026-09-27 UTC. The specific priorities/budgets above are this project's design, not claims about Horizon internals.
