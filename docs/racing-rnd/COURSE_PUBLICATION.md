# Shared routes

Private device routes remain available for practice. Sharing adds an explicit
workflow through the existing Explorer account, room, personal car and Account
review. It does not turn client geometry or client timing into trusted results.

1. The location must have a reviewed snapshot of its published, qualified roads.
2. Create a route in Racing. **Test for sharing** saves a private server draft
   reconstructed from that snapshot and joins a solo timed test in your room.
   Drive your owned car to the mapped start; ordinary proximity and car custody
   rules still apply.
3. Ready, start and finish the exact route using the ordinary driving controls.
   The race service saves the receipt. This private test pays no Credits, enters
   no shared ranking and is identified separately in the existing Journal.
4. Submit the tested version from Results or Account → Contributions → Racing
   routes. Until approval, only its creator can test it.
5. Account → Review → Racing routes shows the course map, geographic sources,
   discipline, distance, test receipt and submitted version. A moderator can
   approve it or request changes with a note. Approved routes can be removed
   from public racing with an explanation. Owners can withdraw to draft.
6. A route edit invalidates its earlier test. An unchanged withdrawal may reuse
   its test, provided the active road snapshot and physics version still match.

The approved catalogue pages through public routes; an account may keep up to
40 server route drafts. Device drafts are unchanged. A route belonging to
another creator cannot be overwritten by submitting the same geometry.

## Geographic intake

`scripts/racing/intake-district.mjs` dry-runs a bounded export of the existing
published world road facts. Its input includes `facts`, source `credits`, and
`provenance` with capture date, source release, exact build and review note.
The script requires OpenStreetMap/ODbL credit and explicit terrain/source rights.
It never downloads a map tile archive or invents replacement pavement. Inspect
and document the actual exported location before using its explicit staging-only
`--approve --project we3d-staging-20260712` option. Do not commit private captures,
operator credentials or raw verification output.

Approved facts have millimetre precision to avoid floating-point noise between
consumers. Existing V1 device routes and fingerprints remain untouched. Courses
reconstruct from stable source spans, direction, deck, width and sampled heights.
Before car adoption, the browser rebuilds the course on its currently published,
collision-qualified roads and requires agreement within 1 cm. Different providers,
changed roads, pending coverage or a replacement location fail admission instead
of placing a car over unsupported ground. A snapshot does not guarantee that a
future provider response still matches; the location must then be requalified.

## Authority and delivery

Both HTTP and socket backends use the same generated portable course rules.
Protected Functions require account authentication, App Check and existing
community consent; review uses the existing moderator authority. Public client
writes cannot approve districts, routes or test receipts. The race service checks
publication revision/status and the active district pointer on admission, renewal
and final settlement. A withdrawn/replaced route cannot settle as a current race.

Approved time trials admit one driver and save comparable server times without
competitive Credits or wins. Competition races still require two humans. Creator
qualification remains private even though it uses the same server clock and
physics. Its immutable receipt is required for submission; local practice finishes
cannot substitute for it.

The course bundle, Functions, indexes, approved data and service must be released
as one compatible candidate. A source/component test is not live-service, actual
city, hardware or professional race-venue acceptance. Existing local city routes
and researched venue references do not become complete major-track packs merely
by being listed in this workflow.

Operator intake uses the pinned racing-service dependencies (`npm ci --prefix services/racing`). Its OAuth-backed Firestore client and the Firebase CLI account/tokens are explicit; no application-default credential or service-account key file is required. Same-origin Hosting routes cover every racing browser endpoint.
