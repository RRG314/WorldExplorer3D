# P18 shared marine — active, not complete

October 3, 2026. Fresh code inspection confirms the local P10 voyage is not a room-owned vessel. `ui-room-pose.js` and room admission currently describe Earth/Moon/Space; an Ocean explorer cannot be made multiplayer merely by uploading the local voyage record. Existing interstellar expedition roles are participant labels, not exclusive marine helm/submarine seat leases. Do not use historical notes as evidence that these requirements already work.

## First completed prerequisite

The existing shared-expedition endpoint now reads room existence, all crew seats and expedition state inside the mutation transaction. Actor admission requires matching UID, recent heartbeat and an unexpired admission-issued seat. Room ownership is not an expiry bypass. Missing legacy expiry requires normal readmission. Active-crew quorum excludes expired seats. Typed access failures return 403/404/409 without writing expedition state.

The old endpoint checked actor presence outside the transaction and did not require actor-seat expiry. Its active-crew filter also accepted missing expiry. Reusing those checks for marine control would carry the same weaknesses into another system.

Focused contracts cover expired/missing/future/stale/foreign-UID presence, removed member, deleted room and renewal. The authenticated emulator journey uses two independent accounts against the actual HTTP endpoint and Firestore transaction. It checks denied unauthenticated access, expired owner/no write, renewed creation, second crew join, expired crew excluded from advance quorum, renewed ready crew advance, removed-member denial, readmission and deleted-room denial. This is a backend-service test, not a two-browser underwater acceptance.

Evidence: `output/verification/product-plan/expedition-room-access/report.json`, `phase18-room-access-contracts.log` and `phase18-room-access-emulators.log`. Emulator billing/mail parameters use existing disposable non-service fixtures; no production service is deployed or called by this journey.

## Finite remaining implementation and acceptance

One supported shared Coral Shelf expedition is the first contract; do not expand to every ocean/site before finishing it.

1. Server-owned voyage identity, parent ship, submarine and stage; exclusive helm/sub pilot assignments and bounded pose/state mutations. Reject stale revisions and wrong-room/expired-seat requests in the same transaction. No client-local save is promoted to authoritative shared state.
2. Actual player journey: create/join from the existing research-vessel controls, readable crew/seat status, shared deployment/recovery, late join, pilot loss/takeover, underwater reconnect. Marine frame identity must reach admission, presence/rules and the correct Ocean rendering scene; no Earth ghost standing in for a submerged craft.
3. Shared scientific manifest and rescue history with retry-safe IDs. Personal Backpack/Journal remain their existing authorities; shared commands cannot duplicate cargo or silently mint personal rewards. Test conflict, disconnected pilot and recovery with two real clients before closure.

Keep P18 open until those interactions and their server rejection cases pass. P19 operations, camera C04/C05 and P20 release also remain open. This prerequisite is a completed repair to the existing endpoint, not a scaffold presented as a finished shared marine game.

Final combined closeout: all 1,766 registered tests and source checks pass (`street-and-expedition-contracts.log`, `street-and-expedition-source.log`). Production remains unchanged; P18 remains active and incomplete.
