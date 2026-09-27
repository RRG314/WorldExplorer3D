# Action system design

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

Reuse existing equipment definitions, Backpack and condition. Add an explicit action policy by category: unarmed/melee, projectile, hitscan where justified, throwable, utility and field interaction. Reuse collision/ballistics helpers where contracts match. Equip is an owner transition; animation/effects subscribe to accepted events, never decide inventory custody.

Attempt → validate admission/epoch/sequence/rate/equipped ownership → reserve resource → resolve collision on trusted geometry → mutate condition/resource → receipt → replicated presentation. No client-selected victim. Muzzle clearance and camera intent are different checks: a third-person camera can see past a wall while the muzzle remains obstructed.

Current component tests cover a direct pulse ray, melee range, obstruction, a gravity/fuse throwable, cooldowns, duplicate attempts and disconnected actors. The pulse ray is a contained prototype policy, not a claim that the live projectile implementation was converted. Torso spheres are prototype hit volumes, not finished hitboxes. Throwables lack bounce and authoritative persistence. No live PvP endpoint was enabled.

Next: reconcile client/server definition drift, add action IDs and snapshot acknowledgement, wire authoritatively accepted animation events, implement recovery and transactional drop/pickup, then integrate existing vehicles and NPC perception. Do not ship expanded categories before their server policy exists.

Effects subscribe to action/impact/detonation identifiers. Predicted effects must merge with confirmations and expire on rejection; replayed receipts must not replay reward/audio. Use bounded pools, per-distance quality and a voice cap. Existing service oscillators are not a coherent action sound library; new sounds require licenses and user-gesture audio activation. Vibration is optional presentation, never required feedback.
