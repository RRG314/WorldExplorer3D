# Racing fleet

Three original unbranded CC0 Innerscene designs, named Meridian GT, Apex
ClubSport and Kestrel Rally in World Explorer. ClubSport adds an original
competition wing, splitter and safety cage; Kestrel adds a safety cage, lamp
pod, roof vent, skid plate and mud flaps.
Source URLs, SHA-256 hashes, dimensions and budgets are in `asset-manifest.json`.
Adjacent notices preserve the creators and CC0 dedication. No manufacturer or
motorsport series endorsement is implied.

`scripts/prepare-racing-fleet-assets.mjs SOURCE EMPTY_OUTPUT` reproduces the
derivatives from the three hash-pinned GLBs. It keeps their closed rest pose,
normalizes the forward axis and ground pivot, uses uniform metre scaling,
reduces geometry within a bounded error, prepares transparent glazing and
separates four wheel steering/spin pivots with fixed brake calipers. The
original showcase scripts and animation controllers are not used.

Models load on demand through the existing shared model cache and material
leases. They retain the current transport, collision, personal garage, wallet,
condition, upgrade, room lease and racing authorities. They do not populate
ordinary traffic or change saved traffic identities. Handling is original game
tuning within the shared 120 mph limit; it is not a manufacturer simulation.
