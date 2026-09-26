# Solis Reach: inhabited exploration vessel

Status: researched design; implementation and visual acceptance tracked separately.
Owner request: curved ship circulation, credible launch bay, purposeful rooms,
hands-on sample research/fabrication, richer explorable space, preserve nebula art.

## Product loop

Observe a destination → plan a sortie → launch Pathfinder → collect a traceable
sample → return through the bay → place it in a laboratory cradle → choose an
instrument and measurement → compare evidence → fabricate a useful part or
retain/export the specimen → use the result to improve the next voyage.

Travel also consumes supplies, wears systems and creates crew needs. Research
must improve decisions and available equipment rather than merely increment a
score. Existing expedition resources, crew, events, samples and Backpack remain
authoritative. The ship becomes the physical interface to those systems.

## Research and original art direction

- [TNG production designers](https://www.startrek.com/en-un/news/designing-a-new-era-of-technology-for-encounter-at-farpoint)
  describe a vessel accommodating long-term life as well as its mission. Borrow
  the broad design goals: comfortable communal spaces, readable workstations,
  curved circulation, continuity between exterior and interior. Create our own
  proportions, names, displays, symbols, materials and equipment. Do not use
  Enterprise blueprints, branded models, insignia, LCARS graphics or franchise audio.
- [NASA human integration](https://www.nasa.gov/human-integration-design-handbook/)
  and [crew interfaces](https://www.nasa.gov/reference/10-0-crew-interfaces-vol-2/)
  support designing around tasks, reach, visibility and the information needed at
  each workstation. This is game-design guidance, not a spacecraft certification.
- [NASA Milky Way structure](https://science.nasa.gov/resource/the-milky-way-galaxy/)
  identifies a barred stellar disk, arms, gas and star-forming concentrations.
  [WISE arm tracing](https://science.nasa.gov/photojournal/tracing-the-arms-of-our-milky-way-galaxy/)
  supports clustering young stars with dust rather than filling interstellar arms
  with nearby asteroids. Observational maps are references, not flat scenery to fly into.

Palette: warm mineral wall panels, matte graphite service hardware, muted teal
navigation, amber machinery and natural habitat accents. Distinct material and
equipment silhouettes identify room purpose. Restrained signage and local task
lighting replace repeated glowing boxes. Existing licensed art is retained where
its function and scale fit; new external art requires recorded license/attribution.

## Spatial design

One explicit layout definition owns room footprints, portal apertures, floor
heights, station mounts, crew paths and map geometry. The renderer, walking
collision, camera clearance, NPC routing and maps consume that same definition.
Do not bend the current rendered hallway while leaving its collision rectangular.

Three circular decks share a central lift/service core and a continuous 3.6 m
wide ring corridor. Four radial passages provide shortcuts and two approaches to
each major work area. Radial room partitions meet curved perimeter bulkheads.
Every doorway has an explicit opening, clearance and closed collision shape.
Existing stable room/station IDs survive the redesign for saves and mission rules.

| Deck | Outer compartments | Inner/service spaces | Distinctive function |
| --- | --- | --- | --- |
| Command/science | Bridge, cartography, communications, physical sciences, observation | Analysis, briefing, sample archive, lift | Forward view, instrument benches, sealed sample handling |
| Habitat/health | Quarters, wardroom, medical, exercise, hydroponics | Hygiene, life support, shelter, lift | Quiet/private rooms, communal tables, medical clearance, growing racks |
| Engineering/flight | Reactor/service machinery, fabrication, cargo, pod bay | Power, thermal control, maintenance, lift | Visible machinery connections, material handling, pressure boundary |

Engineering uses a central power assembly with coolant/service trunks, separated
maintenance access, removable component sockets and instrumentation reflecting
actual game system condition. It must read as a machine installation, not a lounge
with colored cylinders. Machinery is fictional; physical quantities use the
existing game model rather than fabricated scientific claims.

The pod bay has an outward-facing hull opening, observation windows, docking
cradle, work access and a pressure vestibule. Door state is authoritative:
secured → pod boarded/personnel clear → inner door sealed → depressurizing →
outer door opening → launch clearance → departure → close/repressurize.
Returning reverses the safe sequence. Never open both pressure boundaries or
transition to flight before the visible aperture is clear. The outside view shares
the existing flight scene/camera render target; no second simulated universe.

## Physical research and fabrication

An item remains one conserved lot. A bench stores a reference/reservation to a
sample ID, not another inventory copy. Placement records stable station/socket
IDs and a bounded pose. Visual objects derive from persisted placement state.
Moving/retrieving is idempotent; deleting or exporting a reserved lot is rejected.

Research steps: place → choose instrument → calibrate → run → inspect findings →
retain or process. Instruments differ by capability and required input, not just
button label. Measurements record specimen provenance, instrument/method,
modeled versus observed basis, uncertainty and mission time. A game experiment
must not invent a real chemical composition for an unmeasured astronomical body.

Initial useful recipes should cover sealed sample preparation, comparative
analysis, field sensor calibration and replacement service parts. Recipes declare
inputs, tools/station, duration, power, outputs and residue. Consumed mass plus
retained waste must equal input mass; knowledge unlocks are not physical mass.
Recipe commands validate prerequisites and commit input/output changes together.
Interrupted jobs preserve inputs/reservations. Repeated requests cannot duplicate
items or rewards. Shared expeditions execute through command authority/server
validation, not only a browser handler. Local saves migrate additively.

Interaction: select a carried item, aim at a compatible highlighted bench cradle,
place it, then use physical instrument controls. Mouse and touch both expose the
same actions. A concise contextual panel can explain inputs/results; do not add
another always-visible HUD stack. Moving away closes temporary panels without
discarding a running experiment. A visible specimen and instrument state must
agree with the authoritative record after reload and multiplayer reconnect.

## Space content rules

Inventory at design start: 61 public destinations — 3 galaxies, 11 planetary
systems, 2 black holes, 3 nebulae, 2 stellar regions, 1 cluster, 39 exoplanets.
Exoplanets inherit their system frame but each retains its own selection and
visual profile. Every destination receives an explicit content/evidence profile.

| Class | Required composition and activities |
| --- | --- |
| Galaxy | Spatial disk/bar/bulge/halo, structured arms and dust, clusters; navigable regions and survey bearings |
| Stellar region | Layered stellar populations, molecular complexes and clear navigation landmarks; survey transects and selectable systems |
| Planetary system | Host-appropriate light, coherent planet/orbit scale, bounded circumstellar material only where justified; planet selection, survey, travel |
| Exoplanet | Distinct modeled surface/atmosphere based on known constraints; label unknowns, do not present procedural textures as photographs |
| Nebula | Preserve current emission/absorption artwork; correct independently owned line overlays/transit lifecycle; observation tasks use existing volume |
| Black hole | Existing lensing/accretion model plus physically motivated environment and safe observation positions; no random obstacle wallpaper |
| Cluster | Depth-distributed galaxies with differentiated morphology; meaningful galaxy selection and distance information |

“Full” means composition at near/middle/far distances, distinct landmarks and
things to investigate, not maximal object count. Density and visibility are
compressed for play with honest provenance. Instanced geometry and bounded
particle/volume budgets scale down on phones; observation data and deterministic
seeds do not change with quality. Avoid multiple competing starfield owners.

## Architecture findings to address

Current ship layout is a Cartesian room list; geometry, furniture and crew paths
also contain fixed coordinates in ship-interior.js. Maps assume room rectangles.
Changing only ship-layout.js would break those consumers. Migrate them together
to one spatial model and remove the superseded path when the replacement passes.

Current samples already support processing, approval and Backpack transfer in
ship-operations.js/runtime.js. Extend that authority instead of creating a new
crafting inventory. Shared command normalization must carry bounded sample,
station and recipe identifiers and revalidate all mutations.

Current galaxies with imagery render an observer-facing Sprite and dim the star
field; this explains the photograph-sheet effect. Stellar-region scenery and
the 36-rock encounter are separate owners; region richness belongs in scenery,
not in inflated encounter counts. Nebula artifacts require visibility diagnostics
with constellations both off/on and real movement before changing any gas shader.

## Implementation order and acceptance

1. Freeze references and inventory; produce scaled deck plan and system design.
2. Spatial model and walkable graybox: complete ring routes, portals, map, lift,
   crew paths and containment. Check every room and wall from player cameras.
3. Functional bay and distinct room kits; preserve existing station/game actions.
4. One complete sample-to-research-to-useful-output loop, save/load and shared
   authority; then add recipes through data rather than duplicated code.
5. Diagnose/fix line ownership without changing nebula materials; replace flat
   galaxy presentation and enrich every region using class-specific profiles.
6. Verify every destination and full player loops in the real packaged browser.
   Inspect screenshots at rest and in motion, all decks, outside/bay transitions,
   visible specimens, failed/interrupted jobs and repeat boarding. Record missing
   evidence plainly. Use remote runners for expensive checks; one local task at a time.

No design drawing, source assertion or fixture-only screenshot is acceptance of
the completed game. Production remains separate until these new changes pass.
