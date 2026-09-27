# Shared room world design

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

Keep `room-admission.js` as the member/capacity owner and the existing UI session as the composition boundary. Add a readiness state machine: admitted → loading world revision → ready to spawn → active → reconnecting → leaving. No equipment damage or vehicle control during loading/rebinding.

A canonical identity must include environment, location anchor, geographic dataset revision, generator version, collision revision and shared modification revision. A display city name or worldSeed alone is insufficient to prove clients loaded equivalent collision. Pin the authoritative snapshot for the room; late joins receive the same revision and supported Blocks delta.

| State | Owner |
|---|---|
| Privacy, members, moderator roles, capacity | Existing admission/room backend |
| Spawn, player motion and competitive action state | Room simulation generation |
| Vehicle lease | Existing lease authority, with simulation adapter |
| Blocks/property/business transactions | Existing backend owners |
| Shared pickups and NPC consequences | Server world entity identity + transactional custody |
| Personal discoveries/preferences | Existing Explorer/Backpack owners |
| Weather/time | Room policy where gameplay relevant; local visual quality may differ |

Public/private remain actual access policies. Friends access requires an implemented relation policy, not a label. Activity rooms add explicit rules (friendly fire, recovery, equipment, join-in-progress) without changing Earth generation. “Play With Others” should query existing populated compatible public rooms, display location/activity/occupancy, and admit through the same backend; fall back to creating a room only when none fits. Never fabricate activity or populate a fake lobby count.

Acceptance must cross locations, join while world loads, capacity race, private-room denial, stale invite, host departure, reconnect, vehicle lease expiry and teardown. These paths are pending for the new action layer.
