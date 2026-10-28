# Multiplayer racing architecture

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Actual `multiplayer/presence.js`:2500ms heartbeat,minimum2250ms writes,32player document read cap. `urban-sandbox/room-authority-runtime.js`:1000ms vehicle lease heartbeat. These are casual shared-world/lease mechanisms,not adequate competitive race simulation. A faster Firestore interval is not a sound fix. [Firestore guidance](https://firebase.google.com/docs/firestore/best-practices) warns that write contention/latency depends on workload; it offers no guaranteed racing tick rate.

Retain Firebase Auth,room admission,friends,consents,blocking and lifecycle. Use the room as the control plane: course/version,roster,eligibility,ready/countdown,start time,session authority and durable results. Prototype a scoped low-latency WebSocket service linked to the same UID/room admission before recommending it. Do not silently create another identity,room list or wallet. WebRTC peer authority alone cannot make rewards trustworthy or survive host departure without an explicit authority protocol.

Proposed server session: lobby -> locked roster -> countdown -> running -> complete/cancelled. Server-owned clock and canonical course;ordered progress and plausible movement;deduplicated finish/reward receipts. Disconnect has a bounded grace thenDNF;late join is spectator;host departure cannot reset the clock. Collision policy and reconciliation must be explicit. Backend validation of checkpoints sent by a client is still weaker than server-simulated physics; label evidence honestly.

Two authenticated browsers,latency/loss,reconnect,host departure,teleport/replay/reward attacks and measured operating costs remain required before competitive release. Current ordinary room operation is preserved,not relabelled a racing backend.
