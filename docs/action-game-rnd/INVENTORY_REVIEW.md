# Inventory review

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

Keep the existing Backpack as custody owner and equipment model as its adapter. Existing quick-slot selection persists through Backpack export/reload; current tests verify recovered equipment can be assigned to different slots. Ammunition/cooldowns are currently per equipment catalog identity, which needs explicit policy before multiple instances of one item can carry different condition/ammo.

| Concept | Required contract |
|---|---|
| Definition | Stable catalog ID, action policy, asset reference, stack/condition rules |
| Instance | Unique custody identity when condition/provenance matters |
| Stack | Bounded integer quantity; splitting preserves total |
| Quick slot | Reference to owned item; not a duplicate item |
| Equipped | Valid owned reference; changes cancel incompatible pending actions |
| Drop | Atomic custody transfer to world entity, idempotent receipt |
| Pickup | One successful claimant; room/world/reach/capacity checks |
| Vehicle/property storage | Existing property/vehicle permission and storage authority |
| Trade | Existing transaction ownership; no optimistic local final grant |
| Samples/collectibles | Preserve provenance and discovery/research custody |

Avoid adding weight merely to emulate another game. Capacity already has UX consequences; select weight only when it supports expedition decisions and can be explained. Do not consolidate item instances until recipe/resource custody and migrated saves are tested.

Local `loot-pickup-model.js` claimed state prevents repeat local use, not cross-client duplication. Shared pickup/drop requires server transactions and an outbox for world presentation. Current component prototype consumes the existing equipment inventory in server memory; it does not prove durable player inventory or purchases.

Tests: duplicate pickup, simultaneous claim, full bag, invalid slot, equip dropped item, split/merge totals, return from vehicle, migration and retry after reconnect. Keep existing Backpack tests and extend them; do not replace behavioral tests with source-string assertions.
