# Major venue source pipeline

The owner confirmed on October 29 that the release must wait for the circuit,
oval and rally packs. The accepted city core remains reusable evidence. No
production deployment or purchase is part of source intake.

## Silverstone implementation

`config/racing-venues/silverstone-layout.json` fixes the complete GP way order.
The bounded OSM extract contains all 95 mapped raceways in its stated query area,
with 27 making up the GP loop. The source compiler checks shared node identity,
continuity, direction, closure and length; it does not infer a GP layout by
finding any nearby loop. Mapper account metadata and venue artwork are omitted.
The ODbL adapted source and derivation recipe are distributed with the game.

The mapped loop is 5,880.623 m against the published 5,891 m reference. The
existing World Explorer coordinate metric gives 5,870.386 m. Both differences
are retained. No geographic stretching or official-record comparison is used.
A conservative authored 12 m usable corridor uses the published FIA reference
width, with that limitation recorded separately from original OSM width tags.

`scripts/build-ea-venue-ground.mjs` uses the existing accepted-ground compiler,
grid and runtime. It verifies pinned source rasters/datum grids and rejects
missing contributing pixels. `scripts/ea-ground-coordinates.py` now accepts an
explicit grid plan in addition to its preserved London path. The delivered
Silverstone terrain uses 4 m Web Mercator spacing, approximately 2.46 m on the
ground here, and centimetre quantization. The maximum observed quantization
error is below 5 mm; the EA source accuracy and transformation uncertainty are
retained separately, not replaced by the delivery precision.

The new `row-major-u16-shared-ground-v1` encoding delivers 956,484 samples in
2,551,677 JSON bytes (approximately 1.39 MB gzip), decoded into one 7.65 MB height
array owned by the existing model. The first Float64 version was approximately
20.4 MB JSON / 14.25 MB gzip. Existing object and Float64 ground formats remain
supported. This encoding is for an already classified bare-earth source whose
raw and ground products agree; it does not erase a separately corrected surface.

The normal world loader adopts the hash-bound road source only with the matching
accepted ground hash. It preserves unrelated roads, buildings, water, identities
and source tags. Fully contained generalized raceways are replaced by the
complete exact raceway extract. Newer conflicting exact geometry rejects adoption.
Surveys are private source annotations, consumed by the existing road compiler;
provider tags or cached JSON cannot confer surveyed status. Its compiled left,
centre and right heights feed the same renderer, contact query and wheel solver.
Canonical district-source normalization explicitly transfers that private
annotation to its immutable way records before the road pass consumes them.
Ordinary roads retain their existing planar cross-section and fitting policy.

The Racing panel builds the full ordered GP path after the existing world surface
qualification. Missing spans reject the event instead of falling back to the
shorter National circuit. The old two-metre minimum discarded five real mapped
spans, including a roughly 0.6 m Chapel link. Bounded spans down to 0.5 m now keep
that topology; self-collapsed graph edges are rejected. A shared 1,024-edge route
bound accommodates the GP's 506 spans. City distance, width, deck, tunnel,
building, water, control and timing admission rules still apply.

Session allowance now comes from one shared course policy: ten minutes minimum,
ten metres/second over the event distance plus two recovery minutes, rounded up
to a whole minute, with a 45-minute absolute cap and a 64 km event-distance cap.
Silverstone receives 12 minutes for one lap and 22 for two. Session snapshots
carry the actual allowance; an authority can shorten it but cannot remove or
extend the bound. The Racing menu shows it, Journal/Rankings readers accept the
same absolute bound, and career finalization grace uses that shared maximum.
Clock-stall and reconnect fences remain separate. This does not itself admit
longer geographic routes or clear the remaining long-course publication limits.

## Qualified road snapshot publication

The existing district publisher supports inline snapshots up to 750 KiB and
larger snapshots up to 4 MiB using at most twelve 384 KiB road chunks below the
same `racingDistricts` document. This stays below Firestore's [1 MiB document
limit](https://firebase.google.com/docs/firestore/quotas). There is no separate
venue database, client geometry authority or background connection.

The parent owns a manifest with canonical road counts, sizes and per-chunk
SHA-256 digests. The operator command owns a cloned, validated handoff and commits
the parent, every child and the current-location pointer in one transaction.
Failed commits publish none; orphaned children or damaged existing snapshots
require inspection instead of being overwritten. Retrying or reapproving identical
content does not rewrite immutable children or change its identity. Descriptive
facts also remain immutable even when the physics fingerprint would be unchanged.

Service reconstruction, catalogues, creator/moderator readers and curated adoption
share the same verified decoder. Missing, malformed or changed chunks cannot
return partial qualified geometry. Canonical schema construction makes digest
verification independent of Firestore map-property ordering. Inline V1 reads keep
their existing fingerprints. Moderator rejection can still withdraw a course
whose source is unavailable. Per-request district deduplication avoids re-reading
the same survey for every row; vehicle custody renewal keeps its existing cheap
metadata/status fence rather than downloading a full survey every five seconds.

`racingRoadChunks.roads` has a single-field index exemption in
`firestore.indexes.json`: the chunks are read by manifest identity, never queried
by their geometry. Deploy this supporting configuration with the coordinated
backend candidate. No public client write or read permission is added.

## Reproduction

Captured source inputs belong outside Git; store the raw EA rasters and pinned
PROJ grids in an input directory. Download URLs, byte lengths and SHA-256 digests
are in the two source configurations. Use Python 3 with pyproj 3.7.2 / PROJ 9.5.1.

```sh
node scripts/racing/build-venue-source.mjs \
  --config=config/racing-venues/silverstone-layout.json \
  --input=/path/to/captured-osm-response.json --output=/new/path/source.json
WE3D_DATUM_PYTHON=/path/to/pinned/python node scripts/build-ea-venue-ground.mjs \
  --config=config/racing-venues/silverstone-ground.json \
  --data-dir=/path/to/captured-inputs --output-dir=/new/path/ground
```

Both builders refuse existing output destinations. The ground output must pass
the existing compiler before catalogue admission. Production assets are never
optimized in place. The wider EA context source had missing pixels and was not
published; ordinary regional terrain remains under its existing owner.

## Acceptance boundary

Numerical source inspection successfully compiled all 27 real GP ways, 506 route
spans and 230 timing gates; maximum sampled crossfall was 3.51%. Focused checks
cover source integrity, full-loop topology, ground coverage, encoding compatibility,
missing data, obsolete revisions, unrelated map identity, four-wheel contact and
compiled ribbon agreement. These are source/component evidence, not a completed
lap, visual acceptance, mobile measurement or a finished major-track pack.

Remaining for Silverstone: actual rendered-world qualification and driving,
track presentation/markings/pits/barriers/landmarks, complete lap and release
integration. The catalogue must remain unreleased until those pass. Other venue
packs, high-bank dynamics, longer geographic route admission, oval and rally rules
remain required by the unchanged full finish goal.
