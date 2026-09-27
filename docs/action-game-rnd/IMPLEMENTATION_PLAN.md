# Multiplayer action implementation plan

Local work only. Production baseline is 5.3 (`bbe65022`); the local measured refactor is `1c18c696`. Do not publish the branch or deploy. This program is not release-ready until the acceptance matrix is satisfied.

## Dependency order

1. Record existing owners and specific authority gaps. Research animation, networking, licensing, navigation and mobile input before choosing replacements.
2. Reuse the current licensed humanoid assets and character loader. Introduce shared layered clip playback with smooth transitions and explicit action/reaction state; prove skeleton ownership, missing-clip fallback and disposal. Do not create another character appearance catalog.
3. Establish a bounded room simulation prototype using existing equipment definitions, Backpack and condition model. Authenticate/admit outside the simulation. Accept input/attempts, never client-selected victims or arbitrary health. Keep server time, collision geometry and inventory as server-owned inputs.
4. Add sequence/epoch validation, bounded movement, authoritative hit resolution and exactly-once attempts. Test duplicates, stale packets, impossible motion, walls and simultaneous action. Compare a low-latency room transport against current Firestore presence; keep Firestore for admission, durable world metadata, receipts and economy.
5. Integrate presentation replication and representative ranged/melee/throw actions into a contained two-player slice. Validate reconnect, pickup/drop custody, vehicle leases, NPC perception and room identity before expanding the whole game.
6. Integrate mapped-store receipts, mobile controls, audio/effects, sustained budgets and disposal. Add authored clips only after asset/license and rig checks.
7. Re-run changed product gates plus the full release acceptance scenario. Produce a readiness report with failures and unrun gates explicitly identified. Production deployment requires a separate decision.

## Findings shaping the plan

Presence is throttled to 2.25 seconds with a 2.5-second heartbeat; extrapolation can run for 3.5 seconds. That cannot establish shooter-quality authoritative motion. Existing impact transactions check distance/cooldown but accept client target lists and initial target poses. They do not resolve player hits through server geometry. A client-owned persisted condition is useful for exploration saves, but cannot decide competitive room health.

The current GLBs already contain 24 authored clips, while the runtime selects only a few and switches weights abruptly. Start by using those assets correctly. Do not promise that purchasing more models solves the underlying state/authority problems.

## Prior refactor work

Retain measured profile/decal/frontage improvements, explicit location boundaries and renderer diagnostics. A broader compiler Worker migration, renderer migration and full transitive coupling review are still separate investigations. They are not prerequisites for this action slice and are not marked complete.

## Implemented local foundation and evidence

- Shared torso-masked character controller integrated into existing curated-character owner; actual men/women GLBs inspected in the prescribed browser laboratory.
- Contained room action resolver reuses existing equipment inventory and condition models; component tests cover direct/melee/throwable resolution and retry/rate boundaries. Not connected to production APIs or a network gateway.
- Removed the legacy backend's 250 ms action-clock allowance; a 310 ms server cooldown is now actually 310 ms.
- Required research/design documents and exact local character binary inventory added. Unverified asset leads are not approved downloads.

The next dependency is an authenticated local room gateway with server-owned movement and a trusted geographic collision snapshot. Do not claim the complete vertical slice from two independently animated rigs or injected server actors. Keep all changes local and carry open gates in ACCEPTANCE_MATRIX.md.
