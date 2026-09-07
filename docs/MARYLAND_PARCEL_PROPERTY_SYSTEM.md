# Maryland Parcel Property System

## Player promise

In Maryland, Real Estate understands land as well as buildings. Opening Find a
Property loads nearby official parcel boundaries, groups the buildings already in
the world onto those parcels, and keeps mapped land that has no loaded building.
The player can compare a truthful public site address, acreage, land-use context,
source dates, and an explicitly virtual value; inspect the mapped shape; route to
the place; and use the same claim, buy, sell, rent, trade, achievement, companion,
and Explorer Wallet flow already used by Real Estate.

This is an extension of the existing property system. It is not a second market,
wallet, inventory, map, interior system, or nationwide GIS database.

## Authority boundaries

| Fact or action | Authority |
| --- | --- |
| Parcel shape, public polygon reference, acreage, land use, public site address, source dates | Official Maryland parcel layer |
| Loaded building footprint, map ID, type, entrance, and interior support | Existing world/building/interior systems |
| Parcel-to-building association | `parcel-property-model.js`, center-in-polygon against normalized geometry |
| Virtual property identity, owner, listing, lease, trade, receipt, and achievement | Existing connected property authority and Firebase transaction |
| Credits | The one Explorer Wallet |
| Virtual game value | Shared deterministic client/server formula; public assessment may influence but never becomes a claimed sale price |
| Blocks | Existing Quick Build authority plus a parcel-ownership check when Maryland evidence is ready |
| Real-world title, legal boundary, occupancy, or permissible development | Unsupported and never claimed |

## Identity and building association

The canonical parcel identity is:

`parcel:md:{JURSCODE}:{FNV-1a hash of public POLYID}`

The unmodified source polygon ID, jurisdiction, source, and dates remain in the
immutable property catalog so the backend can reject a forged or mutated client
identity. Personal owner fields are not part of the query or record.

All loaded building centers inside the polygon associate with one parcel. The
largest loaded structure becomes the primary route/interior presentation. The
record retains every associated stable building ID and their combined footprint.
That handles several buildings on one lot without selling the same land several
times. A parcel with no loaded building remains a land-only property and does not
promise an interior or storage. A loaded building that cannot be matched remains
available through the worldwide building fallback.

Legacy Maryland building property IDs are retained as read aliases when joining
existing connected records. A pre-existing owner is therefore still shown instead
of silently losing the building when parcel evidence appears. New unowned Maryland
transactions use the canonical parcel identity.

## Value rule

The game estimate is deterministic and capped from $25,000 to $1.5 billion.

1. Land model: parcel square meters multiplied by a broad land-use rate.
2. Structure model: combined loaded footprint × levels × broad structure rate.
3. If a positive public full assessment is present, the estimate is 82% assessment
   input and 18% model input. Otherwise the model is used alone.
4. The result is rounded at a scale appropriate to its magnitude.

The same formula runs in the browser and transaction authority. The UI says
"estimated game value" and identifies when assessment data informed the result.
It does not call that amount a current market listing or exact real value.

## Runtime and performance

- No parcel request occurs during ordinary walking, driving, traffic, or world load.
- Real Estate triggers a 450 m request around the player, with a 900 m hard cap.
- Requests use at most two 250-record pages, provider-side geometry simplification,
  a 14-second timeout, cancellation, in-flight deduplication, six-hour caching, and
  an eight-area cache ceiling.
- Geometry is converted once into the existing local Earth frame. Parcel polygons
  are not colliders and do not alter terrain.
- Only the selected parcel gets a terrain-sampled 3D outline. Details also show a
  compact SVG of the mapped shape.
- Dense-area truncation is surfaced as a warning and asks the player to move closer;
  missing records are never procedurally invented.

## Quick Build and access

When Maryland parcel evidence is ready, placing a new block checks the parcel at
the chosen point against the current property portfolio. Owning the parcel grants
placement; an unowned or unverifiable parcel explains why placement is blocked.
Removing existing player Blocks retains its original authority. Outside Maryland,
or if the state service fails, Quick Build uses the existing rules rather than
allowing a GIS outage to disable creation.

World Explorer's stated goal is that mapped buildings remain enterable and useful.
Virtual parcel ownership therefore does not claim legal control of a real address
and does not hide the shared exploration copy of a mapped interior. Ownership
governs private saved property state, storage/companion home integration, and build
permission—not real-world access rights.

## Truth and privacy

- Boundary: authoritative mapped reference; not a legal survey.
- Address/acreage/land use: shown only when supplied by the source.
- Ownership, price, furnishing, inventory, and Quick Build: World Explorer gameplay.
- Owner names, owner addresses, account IDs, deed parties, resident/unit data, and
  private player presence: never requested from the parcel service.
- No parcel is invented when `POLYID`, geometry, jurisdiction, or provider access is
  missing.

## Scope limits

This implementation intentionally stops at Maryland parcel-backed virtual
property. It does not add mortgages, property taxes, zoning permission simulation,
rent reform, legal-title lookup, owner/occupant search, business ownership, live
sale listings, county-specific GIS clients, nationwide parcels, or unrelated GIS
layers. Future GIS additions must name the existing gameplay decision they improve.

## Verification summary

See [MARYLAND_PARCEL_VERIFICATION.md](MARYLAND_PARCEL_VERIFICATION.md). The
contract suite covers geometry, privacy, all jurisdiction codes, multi-building and
vacant association, value parity, forged identity, build permission, provider
failure, and existing building/economy regressions. The live provider suite checks
metadata and one real sample from each jurisdiction. Desktop and phone browser
journeys load Baltimore, open Real Estate through player controls, inspect a parcel,
render its boundary, verify diagnostics, and check layout and browser errors.
