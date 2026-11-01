# Multiplayer racing architecture

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Actual `multiplayer/presence.js`:2500ms heartbeat,minimum2250ms writes,32player document read cap. `urban-sandbox/room-authority-runtime.js`:1000ms vehicle lease heartbeat. These are casual shared-world/lease mechanisms,not adequate competitive race simulation. A faster Firestore interval is not a sound fix. [Firestore guidance](https://firebase.google.com/docs/firestore/best-practices) warns that write contention/latency depends on workload; it offers no guaranteed racing tick rate.

Retain Firebase Auth,room admission,friends,consents,blocking and lifecycle. Use the room as the control plane: course/version,roster,eligibility,ready/countdown,start time,session authority and durable results. Prototype a scoped low-latency WebSocket service linked to the same UID/room admission before recommending it. Do not silently create another identity,room list or wallet. WebRTC peer authority alone cannot make rewards trustworthy or survive host departure without an explicit authority protocol.

Proposed server session: lobby -> locked roster -> countdown -> running -> complete/cancelled. Server-owned clock and canonical course;ordered progress and plausible movement;deduplicated finish/reward receipts. Disconnect has a bounded grace thenDNF;late join is spectator;host departure cannot reset the clock. Collision policy and reconciliation must be explicit. Backend validation of checkpoints sent by a client is still weaker than server-simulated physics; label evidence honestly.

Two authenticated browsers,latency/loss,reconnect,host departure,teleport/replay/reward attacks and measured operating costs remain required before competitive release. Current ordinary room operation is preserved,not relabelled a racing backend.

## Selected prototype boundary

Use the extracted existing vehicle calculation for server-owned race actors;
clients send bounded controls,not poses or finish times. The portable session
model now exercises that boundary and disconnect semantics locally. It has no
network clock/database/renderer. A scoped service adapter must still prove real
Auth/room admission,durable existing-wallet receipts,leaderboard integrity and
actual two-client gameplay before release.

[Cloud Run WebSocket documentation](https://docs.cloud.google.com/run/docs/triggering/websockets)
confirms connections have request timeouts and affinity is best effort. Do not
rely on affinity for session authority or deploy an unconstrained multi-instance
in-memory service. Prototype a bounded single-authority room lease with explicit
interruption/reconnect behavior and durable results; capacity beyond that needs
a separately measured architecture. Verify Firebase sessions including revocation
using the [existing Admin Auth contract](https://firebase.google.com/docs/auth/admin/manage-sessions).

## Implemented room authority

The prototype boundary is now implemented in `services/racing/`: portable engine bundle, bounded transport, session owner and Firestore custody/result adapter. The existing personal-car and room owners also cover the starter BMW without replacing its authored mesh. Ordinary heartbeats yield during the race and resume afterward; ordinary presence does not draw a duplicate delayed race car.

The existing Rankings UI reads committed server boards separately from Journal practice. Class identity includes course, car, upgrades, starting condition, grip, grid row/length and physics version. Personal classes have a paged server-owned read projection. A single immutable result/lease-fenced transaction owns boards, reputation counters and bounded existing-wallet awards. Connection recovery can retrieve an already committed result; a pre-commit instance loss cancels rather than fabricating continuation or payment.

Real Auth/Firestore emulators, actual socket transport and two isolated browser accounts passed the controlled road flow, Journal/Rankings return, ordinary starter-custody resumption and targeted failure boundaries. The production entry point requires real App Check and revoked-token checks; the controlled adapter is not its live-service verification. Staging deployment, approved geographic course publication and measured latency/capacity remain before competitive release. See the service README and current release ledger; earlier proposal text is historical design context.
