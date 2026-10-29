# Racing fleet

Two original unbranded CC0 designs: Spectral GT RS by JaronKBragg7337 and the
Innerscene front-engine grand tourer, named Meridian GT in World Explorer.
Source URLs, SHA-256 hashes, dimensions and budgets are in `asset-manifest.json`.
Adjacent notices preserve the creators and CC0 dedication. No manufacturer or
motorsport series endorsement is implied.

`scripts/prepare-racing-fleet-assets.mjs SOURCE EMPTY_OUTPUT` reproduces the
derivatives from the two hash-pinned GLBs. It keeps their closed rest pose,
normalizes the forward axis and ground pivot, uses uniform metre scaling,
reduces geometry within a bounded error, prepares transparent glazing and
separates four wheel steering/spin pivots with fixed brake calipers. The
original showcase scripts and animation controllers are not used.

Models load on demand through the existing shared model cache and material
leases. They retain the current transport, collision, personal garage, wallet,
condition, upgrade, room lease and racing authorities. They do not populate
ordinary traffic or change saved traffic identities. Handling is original game
tuning within the shared 120 mph limit; it is not a manufacturer simulation.
