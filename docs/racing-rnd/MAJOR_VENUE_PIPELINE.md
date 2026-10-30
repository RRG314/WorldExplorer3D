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
provider tags or cached JSON cannot confer surveyed status. At-grade profiles
are inputs to the terrain grading owner. The final published road triangles
own the actual driving surface after intersecting grades and terrain tessellation.
Qualification reads those triangles and the normal surface query at the centre
and both wheel positions; it does not certify a provisional profile as rendered
geometry. Profile departures remain separate diagnostics. Independent bridge,
tunnel and engineered approach heights retain their profile/layer checks.
Canonical district-source normalization explicitly transfers that private
annotation to its immutable way records before the road pass consumes them.
Ordinary roads retain their existing planar cross-section and fitting policy.

Reviewed road profiles have an explicit preparation phase while the shared
structure compiler solves graph joins. An approach can therefore receive its
measured bridge's height and camber before crossfall admission. The final packed
profile handoff validates every reviewed cross-section before replacing any
model, publishing terrain corridors or creating physical surfaces. A bank above
the source's allowed value still rejects the group. Preparation profiles cannot
render as road ribbons, and retained diagnostic profiles are never promoted in
place. This changes compilation order, not the permitted surface envelope or
the supported race controller model.

Banked pavement requires the explicit `banked-road-v1` model in the private
reviewed source annotation. The compiler validates its bound against the shared
driving kernel's 0.7 maximum crossfall. Ordinary reviewed pavement retains 0.15.
Only finalized compiled evidence can grant banked qualification, which still
samples the actual published road top and wheel positions. Provider tags cannot
grant it. Canonical district facts and chunk hashes retain the model; selected
source edges determine the resulting course controller. Player route settings
cannot opt an ordinary road into banked handling.

The model belongs to district and course identity. Service reconstruction,
qualification receipts, moderation, curation, network snapshots, driver profiles,
Journal configurations, shared boards and career classes use its separate physics
version. Existing ordinary course fingerprints and physics versions remain
unchanged. These contracts do not enable a source pack: the Nordschleife still
needs its public reviewed profiles, long-course admission, complete supported
world, presentation and gameplay acceptance.

The loader reads each reviewed source once, before preparing terrain. It plans
ground probes at no more than two-metre spacing down the entire mapped route,
including both pavement edges plus a two-metre margin. The existing accepted
ground owner can activate a finite group of up to 32 explicitly pinned artifacts
from one provider and source release. This admits adjoining tiles outside the
starting point without widening their actual coverage, loading the whole ground
catalogue or creating another terrain sampler. Missing, changed or ambiguous
tiles reject the group before fetch; a failed tile or uncovered route probe
rejects the entire prepared stack. A reviewed venue cannot proceed using the
ordinary worldwide fallback in place of its required ground.

Ordinary location selection keeps its existing anchor-based behavior. Late
success, rejection or exceptions from an obsolete ground preparation cannot
clear or overwrite a replacement world's accepted stack. A current cancelled
preparation retires its partial stack; an already-aborted request cannot disturb
an accepted world. The actual Silverstone source and hash-verified EA artifact
pass the full-route probe plan through the world activation owner in component
integration. This is not rendered-world or completed-venue acceptance.

The Racing panel builds the full ordered GP path after the existing world surface
qualification. Missing spans reject the event instead of falling back to the
shorter National circuit. The old two-metre minimum discarded five real mapped
spans, including a roughly 0.6 m Chapel link. Source-node spans down to centimetres
retain topology above the approved snapshot's millimetre coordinate precision;
self-collapsed graph edges are rejected. A shared 2,048-edge route bound
accommodates the GP's 506 spans and the Nordschleife's 1,067. City distance, width, deck, tunnel,
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

## Shared road and event presentation

Road batches share a bundled 1K CC0 Asphalt Track diffuse/normal/roughness set
through the existing engine texture owner. Its two-metre physical tile replaces
the procedural fallback images in place; published materials keep their borrowed
texture identities. The source manifest records publisher hashes and attribution.
Timed-out late images dispose without replacing an already-published fallback.

The scoped racing presentation adds original temporary World Explorer equipment:
white pavement-edge paint, concrete safety barriers, mesh fencing, distance
boards before route bends and a start/finish gantry. Bases follow qualified
segment height/crossfall; the inner barrier foot meets the controller's existing
20 cm clearance. Equipment uses bounded static batches and distance visibility,
and disposes with the race while borrowing shared concrete maps. These fixtures
are game event equipment, not surveyed permanent venue objects or official
braking references. They do not certify kerbs, runoff, pits, grandstands,
landmarks, complete discipline rules or a finished major venue.

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

## Full Nordschleife source

`config/racing-venues/nordschleife-layout.json` and the adapted
`app/assets/racing/nordschleife/source.json` retain the complete connected loop:
53 ordered ways, 1,067 original spans, T13 and five mapped bridge ways. Source
versions, geometry, varying widths and structure tags are retained; mapper
account metadata is omitted. The mapped two-dimensional geodesic centreline is
20,746.161 m against the venue's 20,832 m reference. Both values and the difference
remain explicit. Elevation and timing-line reconciliation must precede playable
acceptance; the source is not stretched to the reference length.

Reviewed preparation can explicitly retain mapped pavement widths separately
from its narrower usable race corridor. The existing road-source owner rejects
missing mapped widths or a corridor wider than that pavement, and preserves the
source's width provenance. Ground preparation probes the maximum mapped pavement
plus a two-metre margin on each side. The retained four-part Nord ground passes
all 35,970 probes with its 7–12 m source widths; this does not certify its bridge
decks or admit the unfinished venue. Silverstone keeps its authored 12 m corridor.

One real 0.452 m span was lost by the earlier half-metre graph threshold. The
graph and source validator now share a centimetre threshold above canonical
millimetre precision, with the existing collapsed-node check retained. A bounded
2,048-span reference can carry the full loop. Ordinary eight-kilometre route
admission remains unchanged: this source is not added to the runtime adoption
registry until complete accepted ground, banking, crossings and venue gameplay
are supported. Both OSM `pitlane` and `pit_lane` tags reject a main-course layout.

Reproduce the adapted source with the same source builder and this configuration,
using its hash-matching captured raw response. The ODbL attribution and recipe
are in `app/assets/racing/ATTRIBUTION.md`. No official map or venue artwork is
included; factual source intake does not certify a finished playable venue.

## Rheinland-Pfalz ground source adapter

`config/racing-venues/nordschleife-ground.json` pins 56 original one-kilometre
[government DGM1 tiles](https://geobasis-rlp.de/data/dgm1/current/tif/), their
individual byte lengths and SHA-256 digests. The retained file-year is 2025;
it is not a claim that every tile was flown in 2025. The [provider's product
description](https://lvermgeo.rlp.de/fileadmin/lvermgeo/pdf/produktblaetter/DGM.pdf)
specifies ETRS89/UTM32 with DHHN2016 heights and excludes bridge decks.
[DL-DE-BY 2.0](https://www.govdata.de/dl-de/by-2-0) permits attributed use and
adaptation; processing and source attribution must remain identified.

The offline adapter `scripts/build-rlp-venue-ground.mjs` checks all pinned inputs,
uses at most twelve decoded source tiles (48 MB of heights), and interpolates
through actual adjacent pixel centres across file boundaries. It rejects missing
contributors, wrong CRS, moved grids and malformed sources. Compact patch planning
reuses the existing global ground grid without allocating millions of per-point
JavaScript objects. The England builder keeps its existing grid/coverage behavior
and now uses this compact option for its fine source preparation too.

The existing pinned coordinate preparer accepts an explicit source CRS, retaining
its England default. For this source it requires the open [GCG2016 grid](https://cdn.proj.org/de_bkg_README.txt)
and the existing EGM2008 grid, with network and approximate fallback transformations
disabled. The selected operation's stated 8.1 m accuracy is recorded separately
from native source detail and centimetre delivery precision. GCG2016 is attributed
to BKG under CC BY 4.0. Do not silently use a different vertical datum.

Four bounded adjoining patches are planned for the full mapped loop and its
surroundings. The same accepted-ground compiler must accept every output before
catalogue admission. Source capture and processor checks do not establish a bridge
survey, a qualified road surface, a released Nordschleife pack or gameplay quality.

```sh
WE3D_DATUM_PYTHON=/path/to/pinned/python node scripts/build-rlp-venue-ground.mjs \
  --config=config/racing-venues/nordschleife-ground.json \
  --data-dir=/path/to/captured-inputs --output-dir=/new/path/ground
```

An optional `--patch=ID` compiles one selected patch into a new output directory,
allowing an interrupted part to be repaired without rebuilding accepted parts.
Original rasters and failed outputs are retained outside Git. Supporting terrain
artifacts alone must not enable an unqualified venue in the runtime registry.

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

## Long-course query cost

Course construction and the existing session's owned clone freeze their segment
geometry. An automatically released weak spatial index accelerates projection
onto those same immutable segments. It stores no alternate heights, roads,
actor poses, persistence or scheduler. Vertical-deck filtering, distance windows,
source-order tie breaking and contact sampling retain the exhaustive calculation.
Mutable diagnostic fixtures use the exhaustive path, avoiding stale cached bounds.
Distance-based AI, grid and paint lookup uses binary search over source order.
The index is absent from serialized courses and record fingerprints.

Focused differential checks compare thousands of banked, stacked-deck, distant
and windowed queries with the exhaustive path. An actual-source Silverstone
accelerated simulation reproduced the previous complete 230-gate BMW lap and
entire terminal vehicle/timing state exactly, including zero barrier contacts.
Its single controlled CPU run took about 0.44 seconds versus the retained prior
2.74 seconds. This measures numeric simulation only; it is not browser FPS,
mobile, real-time networking or finished-venue acceptance.
