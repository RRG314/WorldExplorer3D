# One world, explicit rules

Updated October 11, 2026. Owner steering extends the active Explorer career roadmap.
This is an implementation and acceptance contract; the table distinguishes code
that exists from work that still needs delivery. It does not supersede saved
worlds, release gates or the existing environmental and transport owners.

## October 11 cross-environment Journal acceptance

Marine records now retain an allowlisted voyage snapshot through the existing
Journal. Return reuses the voyage owner, preserving the parent vessel and submarine
identity; it does not infer Earth road travel from latitude/longitude. Earth
records use the existing environment/actor restoration before selecting their
location. Lunar/planetary records without a supported travel target have no
misleading Earth-return action. Shared marine authority rejects local-voyage return.

Ocean-first and planetary sessions share the same Journal/Guide reader and visual
shell. Storage remains the existing profile store. Filters, record descriptions,
retry on unavailable storage, pause, close and session cancellation work before
an Earth discovery runtime exists. The inactive Earth reader cannot overwrite
this UI, and late reads cannot reopen it after departure. The old separate
planetary Journal reader was removed rather than retained as a third UI path.

Full source chain: **2,417 pass**. `journey-journal/report.json` has **15** DOM/CSS
browser checks; `ocean-journal-final/report.json` has **20** actual licensed-model
and marine-game checks, including Backpack → Journal → same saved voyage → sub
movement → parent-vessel recovery. Both are under `output/roadmap-20261011/`.
Images were inspected; zero captured page/GPU errors. The first game test used
Explore instead of the actual Backpack menu; its failed receipt is retained.
Actual game testing uses controlled depth and a deliberate observation pose.
It does not establish live regional species occurrence or certify a global ocean.

## October 11 licensed offshore wildlife

The existing ocean-life lifecycle now owns a bounded group of three common
dolphins alongside the fish populations. These are separate from fishing/catch
targets. The CGreature model with kenchoo's authored skeletal animation is bundled
under CC BY 4.0, with both authors credited, source/output hashes and a reproducible
conversion recipe. The 770 KB model has 18,576 triangles, 1K maps and independent
animation/skeleton instances sharing geometry/materials. There is no runtime
Sketchfab dependency and no generic substitute when the asset is unavailable.

Eligibility requires admitted open ocean, the geographic metre-scale depth
profile, an actual water volume over 91–1,980 m of bottom depth, and one of two
conservative reviewed game ranges: California Current or northwest Atlantic north
of Cape Hatteras. This is a subset of the species range. It is not a distribution
survey, seasonal model or guarantee of a live sighting. The animal's shallow
swimming/surface cycle is independent of bottom depth; it does not place dolphins
on the deep seabed. Bounded steering avoids terrain, reef, carrier, sub and diver;
pause does not advance swimming or skeletal animation. Population retirement
cancels late loads, releases leases and disposes the cloned skeleton palettes.

Wildlife watch is a collapsible section in the existing ocean controls. A
stationary player must have a loaded, displayed dolphin in view within 45 m, with
an unobstructed water/reef/carrier line, before recording. The existing research
Journal stores the simulated encounter and game depth, once per species/area/hour,
without invented population evidence or currency. Failed writes can retry;
old-voyage messages cannot appear in the next voyage. A successful save collapses
the section to keep the phone view clear. Source anchor:
[NOAA common-dolphin account](https://www.fisheries.noaa.gov/species/short-beaked-common-dolphin).

`output/roadmap-20261011/ocean-cetaceans-final/report.json`: **16 passed**.
This includes actual GLB skin/animation, independent phases, pause, four regional
resource cycles, actual deck/cradle/sub deployment, real IndexedDB Journal
recording, phone layout and vessel recovery; zero page/GPU errors. Images were
inspected. The provider returns controlled 180 m depth and the observation pose
is deliberate test setup. It is not an uncoached trip, live ecology validation,
surface-vessel wildlife mode or continuous global ocean certification.

The first full source check caught a duplicate query-version model cache import;
the shared import was corrected. The next inventory check caught the new tests
outside the regular component list; both are now included. Their passing focused
checks do not erase those earlier failed receipts. The final source-chain result
is 2,417 passing tests; see CURRENT-STATE.md for the latest journey receipt.

Remaining marine work is explicit: licensed whales and deep squid, broader
habitat/season evidence, surface-vessel encounters and a genuinely streamed ocean.
The finite dive scene, generic fish elsewhere and basic distant water presentation
remain limitations. This addition does not complete creative terrain/farms,
career/CERN expansion, the realism roadmap or release compatibility.

## Latest creative preservation evidence

Both retained local creative owners now reject lossy read normalization: unknown
fields, invalid rows, duplicate addresses and over-limit records remain intact.
Unreadable primary/backup data is read-only, valid backup content can still render,
and the actual builder offers raw recovery downloads. Stale primary or backup
changes reject writes. A committed primary remains successful when its redundant
backup fails. Block limits reject additional work instead of trimming old work.
Legacy Earth blocks with null grid coordinates retain their geographic address
and now remove by their saved identity, so deletion survives reload.

The former Restore Base World command could clear mapped edits successfully and
fail while clearing blocks; the room adapter used two independent concurrent
writes. The UI now explicitly offers **Reset building edits** and **Clear** blocks.
Each command changes its own authority and reports that scope. This is deliberate
scope separation, not a claim of a cross-store transaction or a new storage owner.

`output/roadmap-20261010/creative-scoped-reset/browser.json`: **15 passed** actual
Chromium checks, isolated controlled scene, real builder DOM/Three collision and
storage, prescribed keyboard client, zero captured page/shader errors. Includes
original recovery bytes, failed writes, reset failure/retry and reload. Images
were inspected. A room-session component check verifies the reset waits for its
building commit and never clears the block collection; live shared rooms were
not tested for this change. Full source chain: **2,384 passed**.

The original two stores still use bounded location-based localStorage. Export
is not a full recovery/import tool. Atomic chunked persistence, worldwide creative
identity, terrain/farm simulation and the compatible release roundtrip remain
open; no production package was changed.

## October 11 street publication dependency repair

The actual Moon-to-Earth regression led to a settled-arrival investigation. A
controlled one-kilometre reposition revealed delayed nearby frontage; its early
image alone was not evidence to change the sidewalk geometry rules. Detail
publication was also waiting for overview source transfer and city-wide worker
preparation. Nearby publication now retires unfinished overview work, preserves
accepted atlas cells, fences late worker replies and resumes uncompleted cells.
This leaves the road/bridge/tunnel geometry owners intact.

Full source chain: **2,405 passed**. The bounded rendered acceptance at
`output/roadmap-20261011/street-priority-final/report.json` passes **11** cases:
pending preparation/cell interruption, return publication, render/contact parity,
all 344 overview cells, disposal and the captured hill scene compilers. Native
workers and rendering are real; artificial pending requests control the races.
No full-city performance claim follows from this fixture.

The larger source-app follow-up was stopped for measured host disk/memory
pressure, preserved as incomplete, and its owned browser was closed. The
full-city verifier now has disk preflight and a running safety stop. Full-city
timing/memory, world-scale storage and the release matrix remain separate gates.

## Creative room/frame authority continuation

The audit found mismatches between saved scope, collision and rendering: solo
suppression remained visible after joining an empty room; shared coordinates could
appear in a different environment; stale block failure callbacks could restore an
older object over another builder's newer snapshot; lazy module callbacks could
replay the previous room after a newer join. These paths now use the declared room
frame and generation, preserve accepted data separately from pending previews,
and drain the latest lazy configuration/rows once. Permission changes refresh
the same tools. No new persistence owner or automatic room creation was added.

Earth building edits are limited to Earth. A room's blocks are available only in
its declared Earth origin or its supported Moon frame. Visiting elsewhere retains
membership/data but cannot write to that coordinate frame. Returning restores it;
leaving restores solo work. This is admission/isolation, not a new multi-body room
schema. Local block projection now reuses the existing date-line/polar authority.

The Firestore listener subscribes to metadata acknowledgements and excludes local
pending echoes from accepted room snapshots; the builder owns that preview.
An offline write is described as unconfirmed, since a previously queued SDK write
may still reach the server. Reference: [Firebase listener and pending-write semantics](https://firebase.google.com/docs/firestore/query-data/listen).

`creative-room-isolation-final/browser.json` passes **23** real Chromium builder
DOM/render/collision/storage checks in a controlled scene, including room failure
races, environment return, actual date-line/polar save/reload and an intentionally
delayed real builder-module download. It uses controlled room replies, not live
shared-service certification. `lunar-creative-scope-regression/report.json` passes
**15** actual-game ship/Moon/ship/Earth checks, optical method, native terrain and
injected persistence/ascent failures. Images were inspected; page/GPU errors are
absent, the external Overpass CORS outage is recorded. Full source chain:
**2,401 passed**. Receipts remain under ignored `output/roadmap-20261010/`.

The Earth arrival image is not accepted as a complete street-visual review; any
layout concern needs a settled publication capture and geometric evidence before
altering already repaired road/sidewalk rules. Global creative persistence,
terrain/farm implementation, multi-body shared storage, live collaboration and
release/candidate/fallback acceptance remain open.

## Product structure

Free roam is the persistent personal sandbox. Campaigns are optional journeys
within it, using the same actors, places, equipment and storage. Completing a
chapter records what the player actually did. Entering a campaign does not make
another copy of Earth, delete creative work or quietly change physics.

A shared room is an explicitly created or joined world with a stable identity,
owner, member roles and edit rules. Crossing a streaming boundary never creates
a room. Unloading a region releases its render/physics resources; saved edits
remain and are reapplied when the region returns. Private experiments and shared
world edits never alter the geographic source data or another room.

Creative permission and campaign evidence are separate. Creative tools can be
generous; a campaign still requires its declared physical actions. Moving or
deleting a required target makes the objective temporarily unavailable and
offers restore/reselect, rather than granting completion or corrupting progress.

## Current ownership and remaining delivery

| Area | Existing owner and evidence | Gap to close |
| --- | --- | --- |
| Boats | Maritime catalogue; entry, relocation and movement share hull-fit and known-draft checks. Research equipment follows the admitted vessel. | Unknown mapped depth remains unknown; complete global water/depth coverage and continuous-voyage tests remain open. |
| Submarine | Same-vessel/sub custody, physical deck deployment, drive→dive→reboard→drive→recover verified locally. Small boats cannot manufacture research submarines. | Ocean scene is bounded. Shared/live-service and release acceptance remain separate from controlled local journeys. |
| Swimming | One walking-water controller; ordinary 18 m and research 40 m game profiles; equipment follows the vessel. New geographic voyages use metre-scale bottom depth. | Authored Coral Shelf preserves its older compressed layout. This is not decompression/pressure training; worldwide water geometry and boundary cases still need wider acceptance. |
| Wildlife | Reviewed geographic/habitat fish admission; water/obstacle envelopes; licensed barramundi and animated common dolphins in restricted ranges; Journal observation. | Most fish visuals remain generated. Whales/squid, seasonal evidence, richer habitats and streamed ocean lifetime are incomplete. |
| Creative changes | Editable-world local store and server room modifications already support building suppression/restoration and placed objects, revisions and roles | No complete terrain editing or farming authority. Confirm local-world identity through long-distance streaming; do not add a competing builder store. |
| Land cover | Existing geographic surface, land-use and WorldCover owners | Agricultural presentation is not a farming simulation. Fields need bounded parcel geometry, appropriate crop/season appearance and explicit simulation provenance. |
| Air and space | Aviation catalogue/facilities, environment session coordinator, ship/pod journey authority | Apply the same capability/clearance/transfer/recovery principles; preserve destination-specific rules rather than a universal teleport button. |

## Finite delivery gates, folded into the existing roadmap

These replace weaker exit criteria in existing steps; they are not an endless
second campaign plan. Complete each implementation and its acceptance before
claiming that corresponding roadmap step is finished.

1. **Marine admission and custody (steps 4–5, reopened for owner steering).**
   Catalogue declares deployed equipment. Entry and motion consult the same hull
   footprint and water authority. A small boat fits smaller waters; a large ship
   needs adequate footprint and draft clearance. Missing bathymetry stays unknown,
   not converted from distance to shore into a factual depth. Existing saved
   voyages can recover; migration never silently replaces their vessel. A
   submarine is boarded/deployed from its equipped parent, driven to a target,
   stopped for an eligible dive, reboarded, driven again and recovered to the
   same vessel. Test lake/river/estuary/ocean, failed transfer, pause, reload,
   lost provider, depth limit and control switching.
2. **Water exploration and ecology (steps 5, 7 and realism R2).** One water-volume
   authority supplies local bed, surface, currents, salinity/evidence and depth
   coordinates to diver, sub, habitat and animals. Preserve metre-scale shallow
   diving; deep-ocean compression must not grant human access to abyssal pressure
   regimes. Automatic equipment follows entry context and an explicit capability
   profile, not a mission name. Shore/lake/river dives use their own mapped water;
   they must not load the Coral Shelf scene. Regional habitat packs select actual
   species ranges, depth bands and substrates, with season where supported.
   Deterministic generated encounters are labelled modeled, never live sightings.
   Schools avoid terrain/hulls and keep resources bounded. Add licensed, reviewed
   silhouettes/animation before advertising whale, dolphin or deep-squid content.
   Ship sonar, observation, photography, comparison and sample/report tasks use
   these actual encounters; avoid populating every coordinate with identical loot.
   Acceptance spans tropical reef, temperate shelf, open water, deep water,
   freshwater and unsupported/polar conditions, plus exit/reentry and resource
   plateau. Unreviewed species stay absent rather than appearing worldwide.
3. **Shared transport contract (step 6 and architecture gates).** Each vehicle
   declares supported environment, dimensions, capabilities, boarding interface,
   resource model, recovery and custody. Airports supply runway/rotor/facility
   eligibility; ship/pod transfers preserve identity and inventory. Reuse existing
   domain controllers. Acceptance includes denied admission before scene mutation,
   interrupted transfer, unloading, same-vehicle return and accessible UI.
4. **Persistent creative worlds (steps 3, 9–10).** Audit and complete existing
   building suppression, restore/undo, placement, collision and room authority.
   Add chunk-addressed terrain deltas through that authority, with bounded brush,
   revision, undo, quotas, backup and conflict handling. Terrain deltas feed render,
   collision, support and navigation together. Protect bridge/tunnel envelopes and
   water/portal coherence; reject edits with unsupported consequences. The first
   terrain release excludes caves/overhangs until a real volumetric implementation
   exists. Test edit→leave region→return→reload, room isolation, denied role, two
   writers, failed write, undo and candidate/fallback roundtrip. Never auto-create
   cloud rooms or share GPS/location without the player's explicit action.
5. **Land-use and farming (steps 7, 11 and realism R2).** Render mapped farmland,
   orchards, pasture, forest, wetland and parks distinctly using source provenance
   and bounded geometry. On owned creative plots, implement real planting,
   growth, watering, harvest and saved outcomes as a finite farm loop. Separate
   authored crop choices from any claimed real crop map. Use existing possession,
   inventory, time and editable-world owners; cap offline growth and reject clock
   rollback/duplicate harvest. Test seasons, slope, water, plot boundary, save,
   reload, terrain edit invalidation and room permissions. A green texture or a
   menu labelled Farm does not complete this gate.
6. **Release coherence (step 12).** One understandable route from free roam to
   journeys, tools, creations and shared rooms; compact consistent controls;
   launch/departure/return instructions at the point of use. Complete source,
   rendered gameplay, storage/rollback, environment transitions, bounded long
   travel and device checks, then update the public limitations and media with
   actual captured behavior. No promotional claim for unimplemented content.

## Research anchors and scope

The game's scuba profiles use the distinction between ordinary shallow and
equipped deeper recreation as a design reference. They are not a diving training
or decompression simulator: [PADI depth overview](https://blog.padi.com/how-deep-can-open-water-vs-advanced-divers-go/).
Species range review starts with primary scientific and agency records, such as
the [Smithsonian giant-trevally account](https://biogeodb.stri.si.edu/sftep/en/thefishes/species/5455)
and the [FishBase species account](https://fishbase.se/summary/Caranx_ignobilis.html).
Factual habitat restrictions do not establish abundance or a live sighting at a
player coordinate. Asset rights are reviewed separately from ecological sources.

H10–H12 and the rest of the career/realism roadmap remain active after the
identified marine defects are repaired. This document does not mark terrain,
farms, global dive streaming, fauna assets or the complete roadmap implemented.

## Executed continuation and remaining blockers

The shared vessel admission rule now gates entry, relocation and motion, including
bow/stern corners, declared draft when depth evidence exists, and the actual
rendered hull extent. Rotation is rejected with an invalid movement; the old
shore-distance position correction no longer teleports a valid vessel. Only the
research-vessel capability permits submarine deployment, and it must be stopped
in marine water. This does not claim that every mapped water has measured depth.

Research scuba is supplied by the equipped vessel at 40 m game depth / 300 s game
air; the earned reserve remains 60 s. Ordinary swimming retains 18 m / 180 s.
Submarine exit uses that equipment profile with 2 m of headroom. The single
existing controller still owns swimming, automatic equipment and boarding.
The older 42 m local chapter values were brought into this shared range. Air HUD
now divides by the actual equipped capacity.

`marine-custody-repaired/diver-browser.json` passes 13 real source-game checks:
actual deck/cradle deployment; keyboard submarine driving; diver movement with
parked sub; normal reboarding; prescribed-client movement of the same sub after
reboarding; same-parent recovery; pause; manual day/night; narrow layout; deep
exit refusal and cleanup. Images inspected. The first `marine-custody` run caught
a source-edit regression before launch (`activeCandidate` was absent); it was
repaired and remains a failed receipt, not accepted evidence. The subsequent
conservative rendered-hull envelope and air-capacity HUD refinement are covered
by the following coastal rerun, rather than retroactively assigned to that run.

The local creative store no longer truncates older locations on load or commit.
At the existing 24-area capacity, a new area's edit is rejected clearly; old areas
remain editable. This is preservation, not completion of scalable world storage.
A primary write is now the commit point; a failed redundant backup does not report
that committed operation as failed. Sequential stale writers are rejected.
Unreadable/newer primary records remain intact and read-only; available backup
content remains exportable. This synchronous localStorage adapter does not claim
atomic cross-process compare-and-swap. Chunked IndexedDB migration and shared
terrain editing remain required before worldwide creative persistence is done.
`creative-storage/browser.json` passes seven actual Chromium storage checks.

The fishing authority no longer falls back outside a species' latitude/water
eligibility or accepts an arbitrary override pool. Missing depth remains unknown,
not zero. This repair does not complete basin/depth/habitat/season ecology or
replace generic fish visuals; those remain explicit content/realism work.

The depth audit measured the actual bundled grid: all samples around the old
Coral Shelf origin are between 93 and 987 m below datum. The authored reef renders
near 35 scene units (roughly 39 game metres), blending a compressed elevation
curve. It cannot be advertised as an accurate shallow reef at that coordinate.
A correct replacement must preserve the legacy authored study and saved voyage
identity, choose/source a verified shallow study area, keep shallow depth at
metre scale, and share any deeper compression/inverse mapping across controls,
HUD, species placement and gear limits. The current 1,200-unit Ocean radius also
remains a bounded outing, not completed continuous ocean streaming.

The source audit additionally found an undefined `polygonAreaXZ` fallback in
building ground presentation. It now uses the existing signed-area geometry owner
with absolute area. Actual Three geometry is tested with and without supplied
area, both windings. `verify:runtime-names` checks all 1,008 browser JS files using
the installed TypeScript compiler, with only the documented vendored THREE global
and a deliberately invalid-name control. It is part of `verify:pr`; it is not a
claim that the whole legacy codebase has strict types. No dependency was added.

Receipts above are in ignored `output/roadmap-20261010/`. No production deployment,
asset package replacement or player-data migration occurred in these checks.

Final `coherence-coastal-return/browser.json`: 14 passing source-game cases, no
page errors. Direct target, portrait dive and same-vessel wet-lab report images
were inspected. Final `verify:pr`: 2,331 passing tests plus the complete source
chain and unresolved-name gate. The source gate initially rejected a mixed v1/v3
import of world geometry; that was aligned to the existing v3 identity and rerun.


## Regional ecology and geographic depth continuation

Marine population authority v3 adds reviewed coarse geographic eligibility for
nine existing species, explicit water-column depth bands and habitat exclusions.
An unknown longitude no longer admits a marine pool. The stable bluefin ID now
specifically represents Atlantic bluefin. The rectangles and depth bands are
bounded game rules, not occurrence polygons or a live abundance estimate.
Freshwater still uses the older water-kind/latitude rules; seasonal ecology and
licensed species-specific visuals remain unfinished.

Actual fish placement samples the same water volume as the diver: surface,
rendered bed and metres per scene unit. Bottom-associated species cannot float
above an abyssal bottom. Seeded schools avoid terrain, habitat and vessel/player
hulls with bounded motion. A region/bed rebuild removes the previous population;
shared fish mesh buffers are disposed only after their final instances detach.
The unused procedural shark builder was removed; this adds no advertised shark,
whale, dolphin or squid encounter.

`reef-ecology-final/browser.json` passes 15 actual-game checks. Eight reef fish
remain visible and move within their water/habitat envelope over 180 frames.
Four Florida/Ryukyu visits replace the former population; geometry/texture counts
return to 47/41 on each repeat visit. This bounded test does not certify a long
continuous voyage. Ordinary diver/target and portrait captures were inspected;
the separate fish close-up uses a controlled asset-review camera. Generic fish
silhouettes and sparse habitat remain visual deficiencies. An earlier lifecycle
verifier incorrectly compared a short browser-sampling interval with the game's
whole-frame motion; it remains a failed receipt. The final verifier uses the
simulation's frame clock and production fish updates accept simulation delta.

New geographic voyages outside the preserved Coral Shelf study use the saved
`geographic-metres-v1` depth profile in voyage format 2. Terrain, water volume,
map and diver/sub HUD use the same metres-per-unit transform, including deep
water. Version-1 voyages and the authored study keep their previous layout.
Missing grid cells and coordinates beyond the finite grid use a presentation
extension while the evidence remains unknown. A provider outage can reuse the
accepted origin depth; it cannot invent a surveyed depth. The 5×5 provider grid
is coarse, non-navigation data, and the 1,200-unit outing boundary remains.
This is not yet continuous ocean streaming, a precision coastline, a pressure
simulation or a solution for the mislocated legacy shallow study.

Submarine terrain motion now samples the measured hull footprint and sweeps
bounded movement/turn steps. It rejects a rising seabed instead of snapping the
craft upward; ordinary descent can settle onto a level bed. Ascent out of a
late-data overlap remains possible. Tests cover these differences and unknown
floor rejection; the sampling interval is 1.25 scene units, not a guarantee for
arbitrarily thin unrepresented geometry. Habitat collision remains its owner.

The complete source chain passes 2,343 tests, including native depth, format-1
preservation/format-2 persistence, bounded contour generation and submarine
terrain motion. Actual browser depth/custody acceptance is recorded separately
below. Release must now also test format-2 voyages through a compatible fallback;
the older production/fallback cannot be assumed to support the new format.


`native-depth-accepted/entry-browser.json` passes 23 actual-game checks with no
page errors: ordinary menu selection, loaded research deck/cradle, 30 m native
bed, actual deep-water controls beyond the former -210 limit, stopped-craft
human exit refusal, version-1 resume, provider outage, map/water agreement,
real chart/helm/deck traversal, same-vessel recovery, actual reload and same-sub
redeployment retaining the 80 m origin profile. The prescribed keyboard client
runs on the same attested page. Desktop and narrow-layout images were inspected.
Earlier `native-depth-entry`, `native-depth-entry-final` and
`native-depth-custody` receipts remain failures: respectively an attempted click
of a correctly disabled button, an obsolete deck waypoint, and a premature
assertion before the asynchronous vessel load committed recovery. The verifier
now uses the current layout and completed transfer state; those failures did not
justify changing correct gameplay or weakening the acceptance requirement.


## Coastal identity and depth ownership — October 10

The Ocean entry and return adapters previously replaced mapped coastal water
with open ocean. One bounded saved water context now retains admitted kind,
source and waterbody identity through the existing voyage owner. It supplies
population selection and underwater waves; recovery retains the same context
without claiming its synthetic surface patch is surveyed coastline. Existing
voyages without it use an explicitly legacy context. Unknown/future contexts
cannot overwrite the existing save. This does not extend the mapped coastline
or complete inland submarine entry.

A second defect was stale depth: surface checkpoints moved the voyage site but
retained an unlocated depth value. Geographic profiles now retain their sample
origin. A moved vessel needs new depth before deployment; an unavailable provider
returns the player to that same boat. Legacy authored layouts remain unchanged.

`coastal-water-custody/entry-browser.json` passed 24 checks. The final extended
`coastal-depth-origin/entry-browser.json` passes **26** actual-game checks,
including ordinary deck/cradle UI, driving, native deep refusal, pause/controls,
recovery, reload, same-sub redeployment, coastal population/shader agreement,
and moved-vessel failure/retry. Provider responses and the moved-vessel pose are
controlled test setup. Desktop/cradle and phone images were inspected; no
physical-phone or worldwide-streaming claim. Both reports capture no page errors.
All receipt paths here are under ignored `output/roadmap-20261010/`.

Full source chain: **2,352 tests pass**, plus source/ownership/boundary types,
unresolved-name, inventory and sensitivity checks. The first chain caught an
unregistered scan-cancellation API, then a vessel test fixture missing the water
candidate that actual admission requires. The API owner was reviewed explicitly;
the fixture was completed without weakening admission. Failed logs are retained.


## Licensed swimming animal — October 10

The first new fish visual is Microsoft's CC0 barramundi from the
[Khronos sample collection](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish).
Its original 3,864-triangle topology and PBR maps are preserved; 1K textures
reduce the source from 12.49 MB to 2.75 MB. Intake pins the source hash, records
output hashes/rights and enforces the browser budget. Geometry/textures use the
existing leased model cache; instance materials animate the body/tail with
matching deformed normals. Size follows catalogue centimetres, not decorative
scene scale. There are at most three in this population. No paid asset or service.

A conservative northern Australian subset follows the
[Australian Museum species account](https://australian.museum/learn/animals/fishes/barramundi-lates-calcarifer-bloch-1790/).
Only eligible coastal/estuarine/river context admits it; no open-ocean, coral-reef,
abyssal or Florida substitution. This is a generated encounter, not occurrence
survey data or coverage of the full native range. Other existing fish still use
generated visual meshes; this does not complete the fauna art backlog.

`licensed-fish-accepted/entry-browser.json` passes **28** actual-game checks with
no page/shader errors. It extends the 26 marine checks with loaded, moving,
visible barramundi and Australia/Florida/Australia/Florida visits. Instance leases
are three in the eligible region and zero after leaving; corresponding renderer
geometry/texture counts remain bounded on return. Model/front/side and in-world
images were inspected. Close review uses a deliberate camera pose, not a claim
about the normal diver camera; the first pose was overwritten by the retained
camera target and the final verifier restores/controls both. Model-only review
is separately recorded in `barramundi-intake/report.json`.

Unit cases cover late-load cancellation, no repopulation of retired scenes,
failed assets staying absent, pause holding animation, exactly-once release,
regional exclusion, provenance and payload budget. Full source chain: **2,356
passing tests**. This checkpoint does not complete animal observation missions,
seasonal ecology, globally streamed dive areas, whales/dolphins/squid or release
certification. Production and retained artifacts are untouched.


## Facilities and navigation continuation — October 11

The [facility delivery ledger](FACILITIES-AND-NAVIGATION-DELIVERY.md) records the
new mapped perimeter/access layer, licensed Poly Haven kit, source/memory bounds,
airport transfer failure fixes, large-vessel overview camera and four current
marine captures. The actual world loader was verified with controlled facility
data; this is not a live worldwide airport acceptance result.

The clickable navigation study keeps the visual identity and proposes Explore,
Journeys, Journal and Create. It has not replaced the live HUD. The landing page
adds explicitly labeled development gameplay; the released gallery remains tied
to 5.5. Full source verification passes 2,436 tests. Forty bounded browser checks
cover the fence component, actual app assembly, airport dialog, prototype and
landing display, in addition to the actual marine capture journey.

Complete airport interiors/aircraft, harbor boarding and site assets, real launch
site packs, full media replacement and release qualification remain open. Public
OSM/Overpass availability blocked live-site checks (429/406). No deployment,
source deletion, save reset or retained-build replacement occurred.
