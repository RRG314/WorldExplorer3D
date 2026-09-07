# Functional Real-World POI System

Status: runtime integration in progress. One canonical lifecycle now owns
semantic records, stable building tenancy, published-door association, bounded
activation, and truthful exterior fallback. One-wallet item settlement and
compensated service handlers are implemented. The full six-family acceptance gate has
**not** passed and those families must not be described as complete yet.

## Product rule

A mapped POI says where a real place is and what it is mapped as. World
Explorer decides which virtual capability, representative interior, inventory,
service, and progression hook are safe to provide there. Generated gameplay is
never presented as real business inventory, prices, hours, staffing, or layout.

The POI layer extends the existing sandbox. It does not replace or duplicate
building entry, property, interiors, Backpack, Explorer Wallet, vehicles,
companions, health, marine play, progression, multiplayer, or World Editor.

## Resolved prompt conflicts

### Every mapped building remains enterable and buyable

Building identity, building entry, virtual property ownership, and POI tenancy
are separate records:

- Every stable mapped building that already passes the building safety and
  identity checks remains eligible for entry and virtual purchase.
- A POI is a tenant or facility associated with that building. Multiple POIs
  may share one building, entrance, or representative interior.
- Buying a virtual building does not mean buying the real business, brand,
  staff, or real-world property. Business ownership is outside this task.
- POI association must never make a building non-enterable or non-buyable.
- If a POI-specific layout cannot be fitted safely, the building still uses its
  normal enterable interior. The POI gets an entrance/counter interaction or an
  exterior fallback instead of a false or broken interior.

Generated interiors are representative World Explorer spaces. They are not
claims about the real interior layout.

### One Explorer Wallet

There must be one balance for the whole world:

- property purchases and sales;
- POI purchases, sales, repairs, and care;
- gameplay rewards and approved material transactions;
- desktop, mobile, and multiplayer presentation.

Signed-in play uses the existing server wallet document at
`users/{uid}/economy/wallet`. Anonymous/offline play uses one local wallet with
the same currency version and transaction contract. The local store balance is
now used only for anonymous/offline play and is never a competing signed-in
balance. Real Estate, mapped places, and the Backpack wallet header subscribe
to the same connected wallet authority and server document.

Item and service settlement uses idempotent receipts. Item delivery and stock
quantity come from the server receipt. A service debit remains effect-pending
until the existing gameplay authority confirms success; failure compensates the
same wallet once, including reload recovery. Selling cannot mint money from an
item the wallet authority cannot verify.

### Clothing is intentionally limited

This task does not add wardrobes, clothing meshes, character re-skinning,
outfit persistence, or wearable rendering. Mapped clothing-only shops remain
informational. The functional family is presented as **Outdoor and Field
Supplies** and sells only existing usable equipment or supplies. This avoids a
large visual, inventory, save, and asset subsystem that the current character
meshes cannot support cleanly.

### Provider failure cannot break the sandbox

No provider owns gameplay state. Provider failure may reduce newly discovered
POIs, but it cannot remove building entry, property eligibility, saved
inventory, a paid service result, companions, vehicles, or existing airport and
marina systems. Previously accepted stable records may be read from a bounded
cache. Sparse locations remain sparse; World Explorer must not invent a
business to hide missing coverage.

### Notifications are proximity-driven

POIs use the shared contextual interaction surface, not a new stack of cards.

- Free exploration: no automatic distant POI, observation, or route reminders.
- Nearby optional opportunity: at most one bottom-right notice inside 90 m,
  dismissible, and automatically hidden after nine seconds.
- Tracked activity or selected route: persistent guidance is allowed because
  the player explicitly asked for it.
- Active interaction, safety, custody, or failure: urgent status wins over
  discovery suggestions.
- Open panels, map, Backpack, store, property, and tutorial layers suppress
  non-urgent notices.
- A dismissed notice does not reappear until its identity or meaningful state
  changes.

The first part of this rule is implemented in
`app/js/tutorial/current-journey.js`; a single cross-system priority queue is
still required before the notification work is complete.

## Authority and data flow

```text
OSM / Shortbread / future Overture place input
                |
                v
provider adapter (source facts and provenance only)
                |
                v
POI semantic authority (stable identity + family + capabilities)
                |
        +-------+--------+
        |                |
        v                v
building tenancy     spatial activation/search
        |                |
        v                v
existing building    one nearby contextual action
entry/interiors              |
        |                     v
        +---------> capability handler
                             |
       +----------+----------+----------+----------+
       v          v          v          v          v
    Backpack   vehicles  companions   health     marine
       \          |          |          |          /
        +----------+--- Explorer Wallet -----------+
                         + receipt/persistence
```

Provider syntax terminates at the semantic authority. Downstream gameplay uses
capability IDs such as `retail.general` and `service.vehicleRepair`, never
scattered checks such as `shop === "car_repair"`.

## Canonical POI record

`app/js/poi/semantic-authority.js` now establishes the initial pure contract:

- stable canonical ID derived from provider feature identity, never coordinates;
- immutable source facts and provenance;
- separate gameplay-derived families, capabilities, and interior archetype;
- truth flags for mapped facts and representative generated presentation;
- indexed, nearby, and active lifecycle states;
- deterministic dense-area activation caps;
- composite capabilities for places such as fuel plus convenience retail;
- informational handling for unsupported and clothing-only places.

`app/js/poi/lifecycle.js` is the publication boundary: it normalizes each mapped
feature once, associates it to a safe canonical building and published door once,
supports multiple tenants in one building, publishes the representative interior
archetype for the existing entry owner, and caps nearby activation deterministically.
Commerce consumes these records instead of owning a second category table. Accepted-record
version history, cross-provider reconciliation, cache persistence, and richer
representative POI furnishing still need to be completed.

## Initial family contracts

| Family | Mapped trigger examples | Existing authority to call | Released result required |
| --- | --- | --- | --- |
| General supplies | convenience, supermarket, general, kiosk | Backpack + Explorer Wallet | deterministic purchase and receipt |
| Automotive | car repair, parts, tyres, fuel/charging | active vehicle condition/energy + Explorer Wallet | persistent repair and sequential performance upgrades on the owned vehicle; fuel/charging remains pending |
| Pet and veterinary | pet shop, veterinary | active companion progression/care + Explorer Wallet | supplies or care reflected in companion state |
| Outdoor and field supplies | outdoor, sports, fishing, hunting, dive equipment | Backpack + field capability resolver | usable existing tools/supplies; no clothing system |
| Medical | hospital, clinic, doctors, pharmacy | player condition + Backpack + Explorer Wallet | bounded recovery or supplies reflected in player state |
| Marine | boat/fishing/dive supply and mapped marine facilities | vessel condition + marine exploration + Backpack | supplies or persistent vessel service |

Airport, marina, and port complexes keep their specialized transport authority.
They may advertise compatible capability handlers, but they must not be
flattened into ordinary stores.

## Provider strategy

The current runtime uses an exact Overpass supplement plus Shortbread vector
tiles. Shortbread is a lean rendering schema and does not carry every OSM POI
type needed by the six families. It can provide many general, clothing,
outdoor, medical, and veterinary points, but exact OSM queries remain necessary
for categories outside its POI list and for tags it omits. Overture Places is a
future enrichment candidate because it provides stable IDs, taxonomy, source
records, operating status, and existence confidence; it must be added through a
licensed provider adapter and reconciliation policy, not mixed directly into
gameplay code.

Source priority is attribute-specific, not one-provider-wins-all:

1. keep provider identities and provenance;
2. reconcile likely matches without erasing source lineage;
3. prefer explicit source tags over gameplay inference;
4. use confidence only as a relative quality signal;
5. preserve prior identity through category/name updates where source history
   supports the same place;
6. mark disappeared or permanently closed records stale/informational before
   retiring gameplay availability;
7. never equate real operating status with live in-game opening hours.

## Implementation order and stop conditions

1. Finish the audit and one-wallet transaction boundary.
2. Connect semantic records to the world load without increasing provider fan-out.
3. Add building/entrance tenancy association and representative interior fitting.
4. Prove General Supplies end-to-end.
5. Prove Automotive service end-to-end.
6. Run identity, determinism, save/reload, item-conservation, provider-failure,
   dense/sparse, multiplayer-safety, desktop, and mobile checks.
7. Only after that gate passes, add Pet, Outdoor/Field, Medical, then Marine.
8. Reconcile capability advertising with existing airport, marina, and port
   authorities.
9. Run the full regression gate and update canonical documentation.

Do not add restaurants, hotels, museums, universities, observatories,
government services, business ownership, employees, delivery, jobs, quests,
complex supply chains, live inventory/prices, full economic simulation, or
additional POI families in this task.

## Current audit findings

| Area | Existing system | Decision |
| --- | --- | --- |
| Buildings | broad mapped-footprint entry with generated fallback | retain as owner; POI adds tenancy metadata only |
| Property | stable mapped buildings, local guest housing, server-backed signed-in deeds | retain; remove commerce balance split |
| Interiors | mapped indoor fetch plus deterministic generated fallback | extend with bounded archetypes; never replace shell/entry authority |
| Commerce | typed mapped stores, daily deterministic stock, Backpack transfer | semantic records and shared wallet receipts now connected; rare connected trades remain gated |
| Backpack | one inventory model with persistence and provenance | retain as item presentation; signed-in sales need verifiable receipts |
| Vehicles | shared condition/damage contracts across road, aviation, maritime | service handler calls these authorities; no duplicate repair state |
| Companions | trust, care, level progression, homes, travel | pet/vet handler calls this model; no second pet state |
| Health | one persistent player-condition authority | medical services and Backpack consumables call the same owner; signed-in health now hydrates and saves through protected player state |
| Marine | vessel condition plus fishing/dive/marine exploration | vessel repair calls the existing Boat condition owner; broader marine acceptance remains |
| Notifications | several specialized prompts plus a persistent journey card | nearby/dismissible journey behavior started; consolidate priority next |
| Providers | Shortbread + exact Overpass, Overture buildings | expand exact POI selection; evaluate Overture Places separately |

## Definition of done

Completion requires all six requested families to pass the journeys and gates
in the supplied specification, including stable identity, correct building
association, safe fallback, real authority effects, one-wallet transfer,
save/reload persistence, deterministic behavior, and acceptable desktop/mobile
performance. Existing airports, marinas, ports, stores, buildings, interiors,
Backpack, vehicles, companions, geology, marine systems, multiplayer, and World
Editor must still work.

Anything not verified end-to-end remains documented as in progress or
unsupported. Planned functionality is never listed as shipped.
