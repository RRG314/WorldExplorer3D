# Shared world, individual interests

Existing room membership, role and world-frame authority remains. A career focus is personal guidance and cannot create a separate room or grant owner/mod rights. Current city, racing, shared edits/Blocks, marine and Expedition domains have distinct accepted multiplayer contracts; this review does not replace them with a universal MMO server.

## Current boundary

`functions/room-admission.js` admits through a room transaction/lease/capacity lock. Presence retains its current UID, role and origin. `room-world-policy.js` prevents Earth poses from another origin. `functions/expedition-room-access.js` requires matching UID, valid recent presence and unexpired seat; a recent heartbeat cannot resurrect an expired lease. Original domain servers still authorize commands and rewards.

Two players can choose different activities/interests in the same existing room. This is not proof that every personal authored field course is a synchronized cooperative mission. Shared research station state, contribution adjudication and joint scientific payouts are **not implemented** by a career card or the preview.

## Three levels of cooperative support

| Level | Proposed behavior | Ownership and stopping point |
| --- | --- | --- |
| 1 Existing co-presence | Personal focus does not interfere with room, pose, chat or active shared game | Original room/domain rules; regression at focus/entry boundary. No new payout. |
| 2 Shared plan / personal evidence | Crew can agree a route/goal; a Geologist observes while a Documentary explorer records their own valid photograph | Existing activity/Journal owners. Clearly separate personal result from shared plan completion; shared plan needs versioned room document and membership checks. |
| 3 Cooperative research task | Server accepts a roster, shared task revision, qualified evidence and individual contributions; completes once | New bounded domain extension after explicit scope/approval. Original room admission, server idempotency and economy settlement required. Not a client majority vote or copied inventory. |

## Contribution envelope proposal

Task ID/version, room code/origin, current domain revision, participant UID, contribution ID, action/evidence reference, timestamp/server receipt, allowed role and final eligibility. Pin recipient before await. Repeated delivery has no extra credit. A late join may assist future work but cannot retroactively claim every previous action. Disconnect retains acknowledged contribution and resumes only after re-admission; room expiry cancels pending authority. Conflicting changes require latest revision/recovery, not overwriting teammates.

No research result pays credits until reward authority is specified. An observer can receive an appropriate personal Journal record without receiving the collector’s specimen. Helping transport a real item uses original transfer/custody; no duplication. Private photos are not automatically shared to a room or public contribution feed.

## Prototype E evidence and limit

`native-prototypes.js` executes original room-frame policy for two controlled participants, rejects foreign-frame publication, records distinct personal practice through original profile stores and creates no collectible copies. `career-native-prototypes.mjs` additionally exercises existing server membership for two UIDs plus expired/wrong-UID rejections. These are native contracts with disposable fixtures, **not a newly executed two-connected-client cooperative research playthrough**. Prior accepted shared-domain receipts are reused. Actual connected mixed-focus journey and new shared-task evidence belong to post-approval acceptance.

Acceptance must cover two clients, different focuses, membership/capacity, room/UID switch during await, phase changes, dedup, disconnect/reconnect, leave, host departure, evidence provenance/private media, individual rewards and resource disposal. It must not rerun unchanged race laps merely to test focus metadata.
