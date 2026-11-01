# Major venue source pipeline

## Additional circuit and oval inputs

The source recipes now retain three additional complete ordered layouts and
separate native pit branches. These are source inputs, not admitted playable
packs. Their conservative six-metre eligibility corridor is not a physical
pavement-width survey.

| Source | Ordered ways / spans | Mapped / reference length | Separate pit |
| --- | --- | --- | --- |
| Spa GP | 30 / 329 | 6,994.658 / 7,004 m | 719.478 m |
| Monza GP road circuit | 20 / 293 | 5,794.073 / 5,793 m | 741.826 m |
| Talladega tri-oval | 4 / 71 | 4,308.723 / 4,280.970 m | 764.413 m |

The GP selections exclude motorcycle, kart and historic alternatives while
retaining their original source context. Monza's finite map parts each bind
their original response bytes and coverage. The shared intake rejects holes,
overlaps, changed payloads and conflicting way revisions; it cannot silently
choose a newer fragment. Mapper account metadata is omitted as before.

Talladega also has a pinned USGS one-metre native window and a normalized ground
artifact through the existing compiler. The 1,211 × 1,923 window retains
9,315,012 unchanged pixel bytes; 21 bounded ranges transferred 12,386,304 bytes
from the 340,283,361-byte source object. Offline replay reproduces its exact
pixel and metadata digests. The delivered two-metre Web Mercator grid contains
821,100 samples in 2,190,571 JSON bytes, with centimetre quantization.

The TIFF's declared NAD83 UTM zone 16 is checked against the native keys; the
USGS adapter no longer assumes zone 17 for every venue. The same pinned offline
datum pipeline reports 5.125 m operation uncertainty, excluding unknown source
vertical accuracy. Quantization is delivery precision, not total terrain
accuracy. Every centre and ±6 m probe along the main and pit source is finite.
The raw lateral-edge diagnostic includes a 23.16% local along-route gradient;
the existing 22% road admission gate remains unchanged for pavement review.

Ground artifacts and source files are not registered for automatic world/race
admission until their required pavement, structures, rules and publication are
ready. Bristol and Indianapolis inputs still require length reconciliation;
their mapped/reference differences exceed the existing one-percent source guard.
Do not stretch geometry or change that guard merely to claim completed inputs.

## Shared circuit pit support

Circuit pits now use the existing branch geometry, physical contact and ordered
timing owner. They retain standing starts and receive no oval drafting,
formation, apron or flag rules. An original game pit limit of 60 km/h uses normal
braking, with one five-second speed penalty per visit and a five-second occupied
exit penalty. This is a versioned game policy, not an official venue speed claim.

Circuit source descriptors require an explicit separate pit usable width and
`mapped` or `usable-corridor` width policy. The ordinary transport compiler and
ground probe planner consume that review; the main track width is not copied
onto a narrower pit. Published ordinary pavement is supported without inventing
oval banking/apron profiles. The new circuit-pit record class is separate;
existing ordinary and oval classes remain unchanged.

Controlled full-branch, alternate-finish, speed/merge, prediction and generated
authority checks pass. The existing licensed-car browser fixture was inspected
at entry, mid-pit and exit with zero boundary contacts or penalties. This is
shared support, not a native circuit pit or completed geographic pack.

## Open-stage source and path preparation

Schema-two `open-stage-v1` sources retain the original motor-road tags and exact
ordered way/node endpoints, including reverse legs of bidirectional roads and
trimmed first/last ways. Native and Overpass intake select only explicitly named
stage ways, omit mapper accounts and reject missing geometry. The same bounded
layout compiler checks continuity, direction, repeated intervals and reference
length. Existing schema-one closed sources retain their exact projections.

The version-two venue header carries the stage intervals and reviewed minimum
width through canonical district storage and both generated engines.
`prepareVenueRacePath` requires every qualified interval and correct direction;
ordinary city admission retains its six-metre floor. This header cannot bypass
the existing private source annotation or published-support checks.

This completes source/path preparation only. World source adoption and actual
course creation explicitly reject unfinished stage runtime support. No rally
event is enabled until the shared surface, vertical-motion, staggered-clock and
recovery contracts are complete. Controlled contract/browser checks are not a
geographic pack, real terrain, driving or release acceptance.

## Daytona source and native ground

The exact five-way tri-oval is retained in `daytona/source.json`, alongside all
26 raceways from the finite native OpenStreetMap API observation. The original
Overpass attempts failed upstream; the successful response is independently
hash-bound in `config/racing-venues/daytona-layout.json`. The source recipe now
supports complete native API node geometry as well as the preserved Overpass
format. It rejects missing nodes and mismatched coverage, strips mapper accounts
and keeps API observation time separate from replication-base time. Rebuilding
the existing Silverstone source produces its exact accepted bytes and digest.

`config/racing-venues/daytona-ground.json` pins an unchanged 1,350 × 1,572 pixel
window of USGS one-metre bare-earth data. Thirteen bounded byte ranges delivered
9,502,720 bytes from the 420,717,177-byte source object; the full raster was not
downloaded. Source ETag, window affine, pixel digest and official tile metadata
remain bound. `scripts/racing/extract-native-ground-window.mjs` reproduces that
window; a replay of the retained source ranges reproduces its exact pixel and
metadata digests. No nodata or edge filling is permitted.

The existing datum preparation, global ground grid, quantizer and accepted-ground
compiler deliver 669,685 samples in 1,786,800 bytes. Delivery spacing is 2 m in
Web Mercator, with one-centimetre quantization. The source is EPSG:26917 with
NAVD88 heights; the target remains WGS84(G1674)/EGM2008. Pinned GEOID18, NADCON5
and EGM2008 grids provide one non-ballpark PROJ operation with stated uncertainty
5.125 m. The tile metadata does not publish a vertical RMSE, so source accuracy
remains unknown and is excluded from the reported normalization uncertainty.
Neither delivery precision nor that operation establishes total terrain accuracy.
Acquisition spans December 2018 through April 2019; publication is October 2022.

All 2,196 two-metre route stations have finite centre and ±6 m support. Their
observed crossfall varies approximately 4.4–57.4%; 273 stations exceed 50%.
This is actual normalized source coverage, not native road/contact publication
or permission to substitute a constant 31-degree tilt. The existing world and
ground owners now admit the pinned source at its anchor. Race admission remains
explicitly pending its timing line; oval starts/flags, pit access, detailed
presentation and complete gameplay acceptance are still required. The catalogue
continues to report zero finished packs.

The owner confirmed on October 29 that the release must wait for the circuit,
oval and rally packs. The accepted city core remains reusable evidence. No
production deployment or purchase is part of source intake.

## Full-length venue contracts

An explicit `mapped-venue-v1` source descriptor can carry a bounded venue header
through the existing qualification, district storage, graph, reconstruction and
course identity. It binds the pinned source hash, ordered source-way membership,
mapped length and finite radius. World qualification requires the current load
publication and the same privately adopted survey on each accepted road model;
provider JSON and caller radius options cannot widen ordinary districts. Missing
source ways fail admission. Ordinary routes keep their 8 km / 1,200 world-unit
fences and existing immutable IDs. Reviewed routes are limited to 30 km and a
source-specific length envelope; laps retain the existing session budget.

Long course joins and settled results carry a small course projection, using the
already approved reconstructed geometry on each side. Before opening a socket,
the browser verifies its expected course key; it resolves a projection only when
all retained identity and display facts match. Result recovery needs no stored
copy of track geometry. The 256 KiB incoming frame limit and command bounds are
unchanged. Controlled full-length contract, chunk, transaction and actual local
WebSocket checks cover these paths; they are not rendered venue acceptance.

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

Reviewed banked road fitting uses the same supported 22% grade envelope as
qualification and the graph. Its local fit preserves a linear slope instead of
inventing endpoint ramps from a one-sided average. The existing terrain-owned
street-node anchors also constrain banked at-grade joins; they do not turn those
roads into bridges. Every complete banked connection enters the continuity audit,
and a failed join blocks physical publication. Ordinary-road fitting remains
unchanged. These are bounds and fitting rules, not permission to flatten measured
terrain or certify a full venue without its remaining checks.

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

### Nordschleife trackside interpretation

The existing scoped race-furniture owner selects three corrugated steel bands
for Nordschleife rather than its default concrete barrier. Steel supports and
the set-back mesh fence remain bounded static batches, follow the qualified
pavement and retire with practice. The physical corridor and timing do not
change. This is an authored trackside interpretation, not a complete surveyed
perimeter, kerb or runoff product.

The existing reviewed-building publication owner also adopts an original T13
grandstand exterior from OSM bleacher outline 34435441 v7. The exact indented
plan is retained; terrace and bench heights are estimates. Clipped terraces,
five bench bays, four aisles and safety rails replace only a uniquely matching
provider visual/solid envelope. Nearby buildings, existing entrances and
interior permission retain their owners. The world building collection retires
the batched geometry and owned material resources. The stand is adopted in the
existing deferred transport-dependent phase after road grading, with its static
foundation fitted along the hillside from that same terrain owner. A sequence
or venue change rejects the pending callback. Race paint uses the existing
order-four road-marking layer, after the order-two pavement batches. It does not grant a new
interior or claim completed pits, landscape or venue acceptance.

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

### Published long-venue terrain and navigation

Reviewed source corridors refine the existing distant terrain mesh locally,
using the accepted ground and the same structure grading and water owners.
Adaptive cells share edge vertices; material attributes, detailed-tile holes
and later seam-height refreshes remain with the same mesh. Unavailable ground,
world replacement or the geometry budget reject preparation before adoption.
The current Nord world uses 144,924 vertices and 240,581 triangles for this far
mesh, within the unchanged 220,000-leaf / 500,000-vertex preparation caps. Its
surrounding venue presentation remains unfinished.

Final world publication retires an early navigation cache for a current
reviewed venue before rebuilding from the already finalized transport model.
This preserves its existing bridge connections rather than inferring new
crossings. Lossless source spans between certified node/junction aliases retain
the shared centimetre floor; generalized roads keep the legacy proximity policy.
The current 1,067 mapped spans become 1,081 qualified navigation spans after
certified junction splits. Actual initial navigation, canonical four-chunk
storage and the portable ordered graph now retain one complete connected loop.
The canonical XZ length is 20,710.455 m; the source geodesic and venue reference
lengths remain separate. This does not establish full-lap or venue acceptance.

## Full Nordschleife source

The Nordschleife descriptor explicitly grants virtual motor access to its
reviewed private raceway ways. The existing transport source owner preserves
OSM `access=private`, raw tags and pedestrian restrictions, while its game
motor-access decision can enter the existing driving graph. This capability
requires the privately adopted venue survey, complete lossless raceway identity
and exact approved source membership. Ordinary private roads, explicit motor
bans, incomplete sources and provider/cache JSON cannot opt in. It makes no
claim about permission to drive on the real-world property.


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
admission remains unchanged. The source is now available for world inspection
at its separately defined Nordschleife anchor (50.359, 6.963), backed by all four
retained ground artifacts and the complete reviewed pavement group. The existing
Nürburgring GP preset is unchanged. Both OSM `pitlane` and `pit_lane` tags reject
a main-course layout.

Private practice now uses an original game timing line on the retained T13
straight: way 41395670, segment 6, fraction 0.725 (approximately 50.337833,
6.950706). Its placement follows the visible transverse paint in the official
Rheinland-Pfalz DOP20 orthophotography; the imagery is source review material,
not a bundled texture. This is not an independently surveyed official timing
marker. The complete source path rotates to that interval, retaining every
span; the existing course owner applies the line offset, four-car grid and
finish gates. Certified interval splits preserve the same geographic position.
Missing or ambiguous line support rejects assembly instead of moving the line
to another road. Existing route references retain the rotated path and offset.
The one- and two-lap events use the T13 label rather than GP, and the Racing
panel and event description identify the unfinished venue. The reference
catalogue remains researched; no completed pack or official comparable record
is implied. The actual full-loop one-lap practice journey now passes all 784
ordered gates with a clean finish, Journal save and ordinary walking return.
Detailed presentation and final coordinated release acceptance remain required.

The separate `nordschleife/decks.json` source product carries all five reviewed
bridge profiles and the nine adjoining observed pavement profiles. Its reproduction recipe pins the retained normalized observations,
source road digest, mapped versions and nodes, datum metadata and required ground
group. It distinguishes the four-metre observed core from reconstructed outer
camber. `loadRacingVenueSource` can load an explicitly hash-bound profile alongside
the road source; missing, changed or cancelled data rejects preparation. A private
source annotation transfers it through normal district normalization and the
existing geographic-to-world road compilation. Provider/cache JSON cannot grant
this annotation. No additional height sampler or venue registry entry is created.

Observed approach curves replace bare-earth fitting where DGM excludes the raised
pavement near a bridge. The same packed transport model owns their heights and
camber. Eight rough returns are excluded from the source fit; every reconstructed
gap is bounded to 8.05 m and recorded separately. Shared nodes prefer the measured
pavement over a lower provisional ground fit, while immutable deck observations
retain priority. Deck-plane transfer includes longitudinal grade as well as camber
when the adjoining road turns. It tapers within the next retained pavement station
instead of overwriting measured camber farther along the road. A reconciliation
that moves the observed core more than 5 cm rejects physical publication, even if
the resulting centreline would be continuous. Datum uncertainty remains separate.
Observed pavement also uses the existing independent-profile mesh branch and
contact index. Qualification retains its profile/layer comparison; a lower
published terrain road cannot silently replace the observed surface.

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

## Three-pack launch presentation, October 31

The current launch scope is Silverstone GP, Nordschleife T13 and Daytona only.
The remaining nine source preparations are retained for later releases.

Silverstone now retains 22 exact OpenStreetMap `building=grandstand` outlines
with way IDs, source versions and timestamps in `silverstone-grandstand-survey`.
The native map window is `-1.039,52.060,-0.998,52.084`, read through the public
OSM 0.6 map API on October 31. Mapper account fields are excluded. Seating,
roof/frame dimensions and row counts are original estimates, not official
structural surveys. Existing building reservation, post-transport publication,
collision replacement and LOD/resource owners publish these interpretations.
The repeated terrace recipe is shared with Daytona's already accepted low stands.

Silverstone's 326 closed grass, meadow and woodland ways from that window are
pinned in `app/assets/racing/silverstone/landscape.json`. None is a multipolygon
member in the retained source window; no unrepresented inner rings are filled.
Daytona's sidecar retains OSM ways 1037457928 (Infield grass) and 119970289
(Lake Lloyd) from its previously retained native map. Both sidecars bind to the
unchanged road-source digest and load through the existing venue preparation.
Ordinary landuse/water publication and accepted ground retain their authority;
these are geographic cover plans, not new road, pavement or height facts.
OpenStreetMap contributors / ODbL-1.0 attribution and derivative-data obligations
apply. Original research imagery is not distributed as game textures.

The GP bend-edge red/white treatment is flat original paint on qualified
pavement; it does not claim raised surveyed kerbs or alter physics/times.
Reviewed Nord woodland uses denser placements within an explicit 2,200-tree
base cap through the existing forest masks, road/building/water exclusions,
cooperative replacement and model LOD owners. Ordinary city placement is unchanged.
