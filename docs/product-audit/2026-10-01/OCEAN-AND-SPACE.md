# Ocean and space: concrete target design

October 1, 2026 · Proposed design, not implemented functionality

This specification preserves World Explorer's existing vehicles, geographic services, discovery records, ship systems, and progression. It defines the experience those parts need to produce together.

## Ocean: one connected above-water and below-water world

The player should be able to arrive at a harbor, board a research ship, plan an outing, travel to a site, walk on deck, swim, deploy a submersible, investigate the seabed, return, and review a meaningful result. A browser may stream or transition between regions; the ship, location, cargo, weather context and return route must remain coherent.

### Research ship

Promote the existing `ocean-research-vessel` identity into the marine expedition hub instead of inventing a disconnected second research-ship type. Preserve other boat classes for their own roles. A usable ship needs:

| Area | Player purpose | Required behavior |
|---|---|---|
| Bridge | Choose destination and control vessel | Chart, heading/speed, forecast/source age, route, draft clearance, assisted/manual navigation; controls cannot move the ship while a text field owns input. |
| Working deck | Prepare and deploy equipment | Clear paths, collision-safe railings, visible sub cradle, deployment exclusion area, equipment interactions. |
| Dive entry | Swim or enter a dive | Ladder/platform, depth and obstruction check, automatic equipment policy, reliable reboarding from water. |
| Submersible station | Launch and recover the same sub | Persistent parent/child identity; launch animation, control handoff, docking capture, recovery/cancel path. No instant conversion of boat into unrelated sub. |
| Wet laboratory | Examine expedition results | Photo/sample/sensor review, quality assessment, hypothesis or identification, saved report. |
| Equipment/storage | Understand capabilities | Show available instruments, upgrades and usable reserves; avoid a manual outfit-selection chore. |

Begin with these functional spaces, then decorate supporting accommodation. The research vessel must have believable dimensions, waterline, displacement response, turning behavior, deck scale and visual machinery. It need not simulate every valve to feel credible.

Real inspiration: NOAA's Okeanos Explorer combines mapping sonars and a remotely operated deep-ocean vehicle. That is a useful operational reference, not a template for claiming the same real equipment or capabilities. World Explorer's player-operated sub can be a fictional craft attached to an original vessel design. [NOAA ship description](https://oceanexplorer.noaa.gov/okeanos/about/)

### Swimming, diving, and automatically selected protection

**The player chooses an action—walk into water, jump, swim, dive, enter the sub—not an outfit from a list.** Equipment follows a deterministic rule based on the water volume, environment, intended action, available kit, and character capability.

| Situation | Automatic behavior | What the player sees |
|---|---|---|
| Shallow water with feet supported | Wading | Slower grounded motion, waterline/splashes, normal clothing. |
| Water deep enough that feet no longer support the body | Surface swimming | Actual swim animation, buoyant body/camera, water drag and ability to turn/reach shore. No scuba merely because water is deep below the player. |
| Brief voluntary submersion without dive equipment | Limited breath-hold dive | Breath feedback and an easy return to surface. No invented unlimited oxygen. |
| Planned dive with a valid carried or vessel-provided dive kit | Automatically fit and use dive equipment at the entry transition | Short, interruptible preparation animation and “Dive equipment ready” feedback; the avatar and equipment actually change. |
| Cold or otherwise supported hazardous-water expedition | Automatically use the appropriate available protection | Explain unmet requirements before departure; offer a loan kit/safer route when designed. No silent equipment purchase or fabricated ownership. |
| Accidental fall without equipment | Swim/recover first | Reachable ladder/shore/assistance. Do not conjure a tank only because the character passed a depth threshold. |
| Inside a sealed submersible | Vehicle cabin state | Personal swimming/breath mechanics suspended; vehicle systems own the relevant limits. |
| Unsupported extreme depth/hazard | Require the rated vehicle or deny deeper entry with recovery | Clear reason and next available action; never a scenery-only capability claim. |
| Leaving water or reboarding | Transition back after stable dry contact | Remove temporary dive presentation at an appropriate safe point; avoid gear flicker at waves. |

Design the starter expedition with a loaned basic kit so players can enjoy the dive without an equipment-shopping prerequisite. Earned upgrades expand instruments, endurance/range within game rules, and access to more demanding surveys. A “Strong Swimmer” trait can change assistance or stamina; it must not stand in for the entire swimming implementation.

The controller needs entry/exit hysteresis, separate body/head immersion, surface buoyancy, underwater acceleration/drag, current-relative movement, collision, camera crossing effects, animation blends, and input parity on touch. Land walking cannot simply continue under a blue overlay. Human diving limits here are simplified game rules, not medical or dive-training calculations; calibrate the game with an appropriate subject expert rather than presenting invented physiology as realism.

**Required edge cases:** beach slopes, riverbanks, docks, ship railings, waterfalls where supported, overhead geometry, low ceilings, ladders, moving decks, disabled input in menus, disconnect/reload while underwater, lost vessel, empty equipment resources, collision after asset LOD changes, and player/companion separation.

### One water model owns both appearance and behavior

The same sampled water volume must supply the waterline to the shader, boat buoyancy, swimmer immersion, underwater effects, fishing and UI. Its record needs waterbody identity, coordinate frame, datum, coverage, time, surface height, depth/bottom source, wave parameters, current vector, temperature/turbidity where supported, habitat, and confidence.

Current code already distinguishes modeled waves and some waterbody categories. Extend it; do not add another independent “ocean realism” object beside it. Current boat drift follows a wave-direction heuristic and submarine movement does not sample an ocean-current field. Displaying current values in Live Earth is not the same as those values moving the vehicle.

Recommended physical layers:

1. **Mean water level and tides:** reconcile vertical datums explicitly. NOAA station levels and a global mean-sea-level model cannot be added as interchangeable numbers.
2. **Waves:** shared phase/time between visible surface and collision/buoyancy samples. Use a bounded wave model suitable for the renderer; do not attempt a global fluid simulation in the browser.
3. **Local current:** separate from wind and wave propagation direction. Apply it to swimmers and vessels according to their motion relative to the water. A surface forecast does not supply an accurate deep 3D current field.
4. **Hull interaction:** several buoyancy samples, damping, propulsion/steering, draft and grounding, wake/foam. Keep the simulated boat controllable at varying frame rates.
5. **Underwater presentation:** depth-dependent absorption/scattering, distance haze, sensible light attenuation, particulate layers, surface light/caustics in suitable shallow areas, contact shadows and habitat motion.
6. **Shoreline:** wetness, shallows, foam and slope-aware transitions where relevant. Rivers, lakes, ports and open oceans need different profiles.

### Geography and ecology: honest precision

Use high-quality local surveys where available, broader grids for regional coverage, and deterministic modeled detail only where evidence is missing. GEBCO provides a global 15 arc-second grid and a Type Identifier grid describing source types. That spacing is roughly 460 m north–south; it cannot locate individual coral heads. Retain dataset version, cell type, footprint and uncertainty. [GEBCO grid](https://www.gebco.net/data-products/gridded-bathymetry-data), [source-type grid](https://www.gebco.net/gebco-tid-grid)

NOAA's bathymetry archive is a possible source for higher-resolution regional surveys; availability, resolution, datum and preprocessing must be checked for each intended destination. Do not download the whole world to the browser. Build tiled, cached regional packages with provenance. [NOAA bathymetric viewer](https://www.ncei.noaa.gov/maps/bathymetry/?layers=multibeam)

The existing Open-Meteo integration is useful context. Its documentation identifies numerical-model currents/tides at about 8 km resolution and limited coastal accuracy. Use these as regional forcing, with separately identified local approximations; do not label them precise harbor currents. Record valid time and stale/unavailable status. Commercial service eligibility must be checked because the project already has billing infrastructure. [Marine API](https://open-meteo.com/en/docs/marine-weather-api), [service plans](https://open-meteo.com/en/pricing)

Species placement should depend on region, habitat, substrate, depth/light zone and season where defensible. OBIS occurrence records can inform plausibility and reference content; they do not tell the game how many animals exist at the player's coordinate now. Preserve the distinction between historical observations and simulated populations. [OBIS data access](https://manual.obis.org/access), [quality controls](https://manual.obis.org/data_qc.html)

Suggested content sequence:

| Region type | Visual identity | Gameplay difference |
|---|---|---|
| Sheltered harbor/estuary | Mud/silt, pilings, local debris, low visibility, regional fauna | Navigation, water-quality transect, sonar interpretation; no tropical reef carpet. |
| Tropical reef | Reef structure, patchy sand, varied coral growth, shoals, shallow light | Habitat photo transects, species identification, comparisons between patches. |
| Temperate kelp/rocky coast | Vertical kelp, rock shelves, surge, different species | Visibility/route planning and current-relative movement. |
| Continental shelf or slope | Sediment, outcrops, increasing darkness, sparse purposeful detail | Submersible mapping and instrument deployment. |
| Deep or exceptional sites | Darkness, site-specific geology, appropriate life | Advanced vehicle survey; not scuba with a larger oxygen bar. |

These are region archetypes, not assertions that all locations or high-resolution datasets are currently available. Select the first real sites after checking data quality and navigable geography.

### A complete first ocean expedition

Working concept: **Map the hidden shelf**. A starter harbor route teaches ship control and the real return point. The player reviews a coarse map, travels to a validated survey area, swims from the platform, photographs an appropriate near-surface subject, returns, then deploys the sub to inspect an unresolved seabed feature. Sonar reveals geometry through coverage, not instant omniscience. A lab review combines the records into a report and unlocks a useful survey improvement or next route.

Do not imply scientific measurement of real Earth by the player's simulated instrument. The result is a game survey of a data-informed world. Sources remain visible in an optional evidence panel.

Completion means the player can do the whole outing, abort it, recover from failure, save, reload, and return to the same ship/site. It also means the above-water deck, water transition, underwater scene and return animation are visually finished. A research-ship mesh sitting beside the existing generic submarine scene does not meet this definition.

## Space: learn from No Man's Sky without copying its identity

Hello Games' published updates demonstrate linked milestones, navigation tools, environmental variety, lighting/water improvements, and underwater vehicle usability. The relevant lesson is how these elements reinforce exploration. Public update pages do not prove how the proprietary procedural engine or streaming internals work.

- **Useful milestones:** NMS Expeditions let players pin objectives and earn rewards that support the journey. Adapt this as a persistent expedition board with explicit benefits, without requiring seasonal deadlines. [Expeditions](https://www.nomanssky.com/expeditions-update/)
- **Map as a decision tool:** Atlas Rises describes system economies and map filters; Pathfinder adds home/waypoint context. Adapt maps that help players choose interesting, reachable destinations and return home. [Atlas Rises](https://www.nomanssky.com/atlas-rises-update/), [Pathfinder](https://www.nomanssky.com/pathfinder-update/)
- **Environmental cohesion:** Worlds I describes wind effects shared across environmental presentation; Worlds II emphasizes revised lighting and underwater ambience. Adapt shared environmental inputs and composed scenes, not arbitrary extra particles. [Worlds I](https://www.nomanssky.com/worlds-part-i-update/), [Worlds II](https://www.nomanssky.com/worlds-part-ii-update/)
- **Flexible play:** Waypoint includes a relaxed mode. Preserve World Explorer's easy free exploration alongside deeper expedition resource management. [Waypoint](https://www.nomanssky.com/waypoint-update/)

### Preserve the strengths already present

Solis Reach, its room roles, Pathfinder deployment, astronomical body definitions, landable/atmospheric distinctions, crew/resource systems, mission state transitions, sample provenance and workbench fabrication are worth keeping. In particular, the current fabrication path consumes characterized samples, binder and power to create repair stock: that is already a more connected mechanic than a cosmetic “research” button.

The missing work is to make these mechanics legible, varied, physically expressed, and connected to sustained advancement. Do not create a second campaign, technology tree or navigation authority without first reconciling the existing ones.

### One navigation experience at three scales

| Scale | Player question | Necessary content |
|---|---|---|
| Local | Where can I land, dock, walk, or investigate? | Reachable sites, terrain/hazards, local waypoints, selected instrument targets, return craft. |
| System | Which body should I visit next? | Current ship, body identities, available operations, visited status, routes, capability requirements, return plan. |
| Interstellar | Which expedition is worth undertaking? | Destination character, evidence certainty, mission type, travel commitment, ship/crew needs, known discoveries. |

A single selected destination and expedition ID drive all three scales. Map selection should reveal a place and let the player set a course, not silently initiate another travel mode. Show physical distance separately from accelerated game travel. If using an assisted transfer, say so; do not show physically implausible distances beside “ready to land.”

Journey phases: briefing → preparation → local departure → cruise/transfer → system arrival → approach → deploy/land → surface operation → return → analysis. Manual flight, autopilot and an optional shorter transfer are policies inside this journey, not separate mission histories. Cancelling assistance keeps the destination; aborting an expedition preserves the ship and handles pending cargo explicitly.

### Progression through capability and discovery

Proposed capability sequence—not a reset of existing ranks:

1. **Scout:** basic map, field instruments and local travel. Finish a nearby survey and understand evidence/result flow.
2. **Surveyor:** better instrument detail and local mission choices. Combine observations rather than repeat one scan.
3. **Expedition operator:** broader landing/vehicle support and crew-assisted journeys. Gain a practical reason to use ship rooms.
4. **Specialist:** more demanding environmental operations, advanced probes or instruments, reusable outpost functions.
5. **Pathfinder:** multi-stage expeditions and collaborative discoveries that connect existing systems.

Every upgrade needs an observable effect: instrument resolution, available method, storage/range, deployment capability, or new operation. Avoid multiplying money, science points, rank points and tokens without a distinct purpose. Free-roam players should retain access to exploration; advancement can improve depth, assistance and mission capability rather than arbitrarily locking the sky.

### Planetary gameplay must vary by place

Current mission definitions contain rich premises but reuse a broad sequence. Build mechanical families that ask different questions: geology transect, timed atmospheric sampling, remote probe placement, thermal comparison, navigation through a hazardous corridor, sample-return logistics, or an original fictional ecology survey.

Moon and Mars should remain recognizably barren where appropriate. Improve terrain scale, rock distributions, contact lighting, material layering, craters/outcrops, tracks and research landmarks. Do not add lush flora just to fill empty ground. For unknown exoplanets, expose “modeled surface” or “fictional frontier” identity; reserve dramatic invented ecology for the latter. A real catalog object's name does not validate its invented surface appearance.

First space completion target: one polished Moon or Mars field expedition using the existing Solis Reach analysis loop, followed by one distinct fictional-world expedition. The first establishes correctness and interaction quality; the second establishes the visual and gameplay range inspired by NMS.

## Asset procurement and art pipeline

Sketchfab is a source of ingredients, not a replacement for scene design. Its current download offering distinguishes Creative Commons downloads and paid assets on Fab. Follow each asset's actual license and retain attribution through redistribution. [Sketchfab availability](https://sketchfab.com/features/free-3d-models), [download guidelines](https://sketchfab.com/developers/download-api/guidelines)

An instructive rejected example: a downloadable [coral skeleton scan](https://sketchfab.com/3d-models/coral-skeleton-3d68f520c74648998f69b692b43371f0) lists approximately 1.6 million triangles and a noncommercial license. A beautiful search result can be unsuitable both for this product's distribution and for instancing in the browser. This audit does not approve any new external model for shipping.

For each candidate, record source/creator/license, allowed modifications, original scale, biome/species or fictional identity, rig/animation, UVs, materials, collision requirements, texture memory, LODs, download bytes, version and fallback. Validate in the actual game renderer before accepting. Existing `model-asset-catalog.js` and intake scripts are the starting point.

Order of work: benchmark image references → greybox functional route → curated asset family → material/light calibration → collision and animation → LOD/compression → in-scene screenshots and performance → rights/attribution receipt. Compression such as KTX2 is useful only after confirming loader support and device behavior in this project's actual Three.js version. [Khronos KTX](https://www.khronos.org/ktx/), [Three.js color management](https://threejs.org/manual/pages/color-management.html)
