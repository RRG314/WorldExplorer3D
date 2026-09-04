# Home, Property, and World Economy

This design turns buildings into persistent places without creating a second
inventory, a second multiplayer room system, or separate currencies for Earth
and space.

## Player promise

- A building visible in the loaded world can be selected, routed to, and used
  as a game property.
- A home can hold Backpack items when the player is physically at the home.
- Explorer Credits earned across journeys use one wallet.
- One mapped property has one owner across the connected world. Every room
  shows the same owner, listing, and lease.
- Every account receives one free first-property deed. It can claim any
  available mapped building once and is never restored after a sale or trade.
- Owners may keep, list, sell, or rent a property. Players may buy or rent a
  listed property with clear terms.
- Property activity appears in the Community Board without exposing private
  account information or a precise private location outside the room.
- Connected property-data accounts are optional reference tools. They never
  set ownership, rent, sale price, or game value.
- Guests may explore, compare properties, and set routes. A free account is
  required to claim, buy, rent, sell, trade, store items, or join shared play.

## One interface, two access modes

The Home & Property screen uses one `PropertyAuthority` contract:

| Operation | Guest | Signed-in account |
| --- | --- | --- |
| Read nearby properties | Loaded building catalog | Loaded building catalog joined with the world registry |
| Read public ownership | Yes | Yes |
| Buy, sell, rent, trade, or claim | Sign-in invitation | Authenticated world transaction |
| Store Backpack items | Sign-in invitation | Account-backed transfer while at home |
| Notifications | None | Account notification inbox |
| Community results | Public view | Server-maintained property summary |

The screen does not write ownership, balances, achievements, or notifications
directly. The selected authority returns a transaction receipt and the screen
renders the result.

## Stable property identity

Every eligible building uses the identity already produced by the world:

`locationId + sourceBuildingId`

The world registry hashes that identity for the document name. Visual facade,
height, or detail changes do not create a new property. Roads, bridges,
guardrails, roofs, airport markings, and other infrastructure are not treated
as buildings. Residential, retail, office, industrial, civic, agricultural,
and mixed-use buildings are eligible, with category-specific names, values,
storage, and future uses.

## Property state

A connected property is always in one of these states:

```text
AVAILABLE
  -> OWNED
  -> LISTED_FOR_SALE -> OWNED by buyer
  -> LISTED_FOR_RENT -> LEASED -> OWNED when lease ends
  -> AVAILABLE when sold back to the world
```

A property has one owner ID or no owner ID. An active lease has one tenant ID,
one start time, one end time, and one agreed price. A sale and a new lease
cannot settle while another lease is active. A player cannot buy their own
listing or rent their own property.

## Shared records

### World property

Path: `worldProperties/{propertyHash}`

```text
propertyId, sourceBuildingId, locationId, locationLabel
kind, buildingType, footprintArea, levels
x, z
baseValue
ownerUid, ownerName
status
salePrice
rentPrice, rentTermDays
tenantUid, tenantName, leaseStartsAt, leaseEndsAt
revision, createdAt, updatedAt
```

Names are public game display names. Email, provider keys,
real-world owner names, and account details are never stored on a property.

When a map source provides a public street address, the property may display
the building number, street, locality, region, postal code, and country. The
game never invents a missing address and never publishes apartment numbers,
resident names, ownership records, email addresses, phone numbers, precise
player presence, or connected-provider account data.

### Account wallet

Path: `users/{uid}/economy/wallet`

```text
credits, lifetimeEarned, lifetimeSpent, revision, updatedAt
```

Only the server changes this record. Every change also creates an immutable,
bounded receipt with an idempotency key. A retry returns the existing result;
it does not charge or pay twice.

### Property receipt

Path: `users/{uid}/propertyReceipts/{receiptId}`

```text
action, roomCode, propertyId
debit, credit
counterpartyUid
resultingOwnerUid, resultingTenantUid
createdAt
```

### Notification

Path: `users/{uid}/notifications/{notificationId}`

```text
type, title, message
roomCode, propertyId
actorUid, actorName
read, createdAt, expiresAt
```

Notifications are informational. Opening one navigates to Home & Property; it
does not accept a sale, lease, or trade without a separate confirmed action.

### Property trade offer

Path: `propertyTradeOffers/{offerId}`

```text
proposerUid, proposerName
recipientUid, recipientName
offeredPropertyId, offeredPropertyLabel
requestedPropertyId, requestedPropertyLabel
creditOffer
status, createdAt, expiresAt, updatedAt
```

Only the two participating accounts can read an offer. The service verifies
both owners again when an offer is accepted, then swaps both properties and
any included Credits in one transaction. A cancelled, declined, expired, or
completed offer cannot be replayed.

### Property community summary

Path: `propertyLeaderboard/{uid}`

```text
displayName
propertiesOwned, propertiesSold, leasesCompleted
placesOwned, propertyValue
achievements
updatedAt
```

This is a server projection, not a writable score. Achievements are milestones
such as First Home, Three Places, Five Regions, First Sale, First Lease, and
Collector. Exact home coordinates are not published.

## Transaction rules

Every property action requires a signed-in account. When the action begins in a
multiplayer room, the room and membership are also checked; ownership itself is
global and is never copied into a room.

1. The service reads the property, wallet, entitlement, public summary, and
   prior receipt in one transaction.
2. It verifies the account, optional room context, stable property identity,
   action, ownership,
   listing state, price limits, and sufficient balance.
3. It settles all affected wallets and the property in the same transaction.
4. It creates receipts, notifications, activity, and the Community Board
   projection from the accepted result.
5. A rejected transaction changes nothing.

Client writes to shared properties, account wallets, receipts, notifications,
and property summaries are denied by Firestore rules. The application may read
only the records required for the loaded location or signed-in account.

## Values, sale, and rent

- Base value is deterministic from building category, footprint, levels, and a
  stable identity adjustment. External real-estate prices are never used.
- A direct world purchase uses base value.
- The first deed consumes an account-wide entitlement and has an acquisition
  cost of zero. Selling it back to the world pays zero, so it cannot create
  Credits. A sale to another player may be profitable only because existing
  Credits move from buyer to seller.
- A world resale pays 85 percent of the lower of purchase price and current
  base value, preventing a buy/sell money loop.
- An owner chooses a sale price inside a bounded range around base value.
- An owner chooses a rent price and term from clear allowed ranges.
- Player-to-player purchases transfer Credits from buyer to seller atomically.
- Rent is paid once for the listed term in the first version. Recurring billing,
  debt, eviction, deposits, and landlord law are intentionally excluded.
- Stored items remain owned by the player who stored them. Selling is blocked
  until the owner's storage is empty. A tenant receives a separate storage
  allotment so owner and tenant items never mix.

## Navigation and presence

The existing navigation authority owns routes. Home & Property passes a
building destination to it and never draws a second route. Storage requires the
player to be in the same loaded location and within the home access radius.
Properties in another city remain visible in the portfolio, but route and
storage actions remain unavailable until that place is loaded.

## Community Board

Community Board is the umbrella. It contains separate, readable views:

- Community activity: room joins, shared finds, home purchases, sales, and
  completed leases.
- Rankings: validated shared activity only.
- Property: ownership, regions, sales, leases, and property achievements.
- Personal achievements remain in My Explorer and do not inflate shared ranks.

## Delivery order

1. Complete the single authority interface and solo adapter.
2. Add the authenticated world transaction service, rules, emulator tests, and
   location registry listener.
3. Switch Home & Property to the connected adapter for every signed-in player,
   with optional room context when shared play is active.
4. Add sale and fixed-term rent listings through the same service.
5. Add the notification inbox and property Community Board projection.
6. Add building-category uses, furnishing, base camps, and account-synced
   Backpack custody only after shared transaction tests pass.

No production deployment is part of this work until the resulting candidate is
tested and explicitly approved.

## Abuse and consistency review

The following rules are required before connected trading opens:

- Global uniqueness: a single world-property document is the contention point
  for every room. A room does not copy ownership.
- One free deed: the starter entitlement and property claim change in the same
  transaction. Alternate accounts cannot be eliminated completely, so new
  accounts cannot immediately trade away a starter property or score repeated
  Community Board milestones.
- No currency creation from trades: buyer debit and seller credit are one
  transaction; direct world resale is based on acquisition cost, not visual
  value; trades only exchange existing property IDs and optional existing
  Credits.
- Replay safety: every logical action has a unique receipt ID. Repeating the
  same request returns its first result and never repeats payment or ownership.
- Server time and state: lease dates, listing state, ownership, balance,
  receipts, and achievements come from the server. Browser clocks and submitted
  balances are ignored.
- Proximity: initial claim, purchase, listing, rent, and access require current
  room presence near the building. Portfolio review and notifications do not.
- Price bounds: listing and rent values remain inside published game ranges.
  Large or rapid transfers, repeated pairs of accounts, and circular property
  trades are held out of competitive totals for review.
- Public access: owning a landmark or civic building never blocks other players
  from exploring it. Ownership grants game storage, furnishing, trade, and
  progression rights, not control over real land or public map access.
- Display safety: only the chosen game name appears on property records. Account
  IDs, email, exact private presence, API keys, and connected property records
  are not published.
- Deletion and moderation: suspended or deleted accounts cannot transact.
  Ownership is frozen for recovery instead of silently transferred. Offensive
  display names use the existing account moderation path.

The transaction design follows Firestore's requirement that all reads precede
writes and relies on its atomic retry behavior under contention. Authenticated
endpoints verify Firebase ID tokens. App Check with reCAPTCHA Enterprise and
replay protection should be enforced on property/economy endpoints before the
market is opened broadly. Transaction receipts are retained so balance changes,
ownership changes, and suspicious trading patterns can be audited.
