# Recorded map inputs for the room/vehicle journey

These are unmodified public OpenStreetMap Overpass responses for the exact Logan
Main Street desktop/mobile primary queries. Each metadata file records the query,
upstream endpoint, capture time, upstream database timestamp, byte count and SHA256.
The upstream timestamps differ and are preserved explicitly; these fixtures do
not claim current map freshness. The `.json.gz` files are compressed original JSON.

Map data © OpenStreetMap contributors, ODbL 1.0.
https://www.openstreetmap.org/copyright

The backend browser journey replays only each captured query, ignoring only its
server execution-time limit. It still runs the actual compiler, terrain, gameplay,
Firestore/Functions emulators, DOM input, proximity checks and vehicle authority.
No actor, road width, car pose or lease is injected. Both clients must consume their
expected query. Other provider requests retain normal loading. The fixture does
not become a runtime endpoint or change the app's approved provider policy.

This removes public-provider availability from the room/lease test's map input.
Current provider availability and fallback fidelity remain separate candidate gates.
The original failed journey (35920460779) is retained: its world loaded, detailed
Overpass failed, and no nearby interactable car was available. Do not count that
run as a pass or use this fixture as proof of live-service availability.

To refresh, use an approved provider to request the exact query in each metadata
file, require HTTP200 and no Overpass remark, preserve the unmodified response,
record its upstream timestamp/attribution, update byte count and SHA256, and gzip
it. Review changed data before accepting a new baseline; never refresh silently.
