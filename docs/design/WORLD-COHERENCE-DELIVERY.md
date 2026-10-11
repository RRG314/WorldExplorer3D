# One world, explicit rules

October 10, 2026. Owner steering extends the active Explorer career roadmap.
This is an implementation and acceptance contract; the table distinguishes code
that exists from work that still needs delivery. It does not supersede saved
worlds, release gates or the existing environmental and transport owners.

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

## Current source findings

| Area | Existing owner and evidence | Gap to close |
| --- | --- | --- |
| Boats | Maritime catalogue, placement policy, boat runtime and mapped-water footprint checks | Entry lacks the movement path's hull-fit check; large ships can be admitted into unsuitable water. Draft and deployment equipment are not consistently consulted. |
| Submarine | Transactional boat/Ocean transfer, one voyage identity, actual submarine controller, diver returns to parked sub | A generic dive button can manufacture a submarine for a small boat. Some admission uses shoreline distance as a depth proxy. Test moving the sub after boarding, not just showing the diver beside it. |
| Swimming | Existing walking-water controller supports mapped water and local game beds; Ocean diver reuses it | Sub exit is hardcoded to 16 m regardless of equipment. Survey depth and generic swimming need one policy. Underwater scene depth is compressed and is not measured bathymetry. |
| Wildlife | Fishing population authority plus separate reviewed regional ecology packs | Latitude-only catch pool falls back outside latitude; some ocean fish have fixed depths and can intersect the bed. Global basin, habitat, depth and season restrictions and licensed species visuals are incomplete. |
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
