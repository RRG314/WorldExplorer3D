# Surveyor Expedition Ship

Status: implementation design for the playable Interstellar Expedition ship

Ship class: original World Explorer long-range research vessel
Parent environment: existing `SPACE_FLIGHT`

## Experience

The Surveyor turns an interstellar route into a journey rather than a loading
screen. The player remains the same Explorer and can walk the ship, stand a
watch, care for the crew, inspect and repair systems, run science, prepare local
craft, process returned samples, respond to hazards, keep the log, and return
to manual flight at any time that local flight is available.

The journey combines three complementary rhythms:

- travel planning, supply pressure, setbacks, choices, and recovery;
- an optimistic exploratory ship where rooms and crew roles have clear
  purposes; and
- the existing World Explorer space sandbox, planetary surfaces, geology,
  mining, vehicles, Backpack, Journal, and progression.

The Surveyor is not a replica of a television or film spacecraft. Its visual
language is an original practical research vessel: warm crew spaces, restrained
navy and pale structural surfaces, visible service trunks, labeled pressure
doors, readable status lighting, and distinct room silhouettes.

## Science and fiction boundary

The ship keeps four truth classes visible where they matter:

- **Observed:** destination identity, catalog distance, body data, and returned
  observations from the existing universe and planetary authorities.
- **Established:** closed-habitat monitoring, atmosphere revitalization, water
  recovery with continuing losses, thermal control, exercise, medical care,
  radiation monitoring, maintenance, isolation, and resource conservation.
- **Modeled:** consumption, wear, crew health, fatigue, repair time, shielding,
  and sample-processing yields selected for playable simulation.
- **Fictional:** the compact long-range drive and any future faster-than-light
  option. Fictional propulsion never changes catalog distance or turns every
  other system into magic.

NASA describes long-duration habitation as a combination of life support,
environmental control, radiation protection, exercise, health maintenance,
food storage, privacy, communal activity, stowage, and emergency response.
NASA and ESA regenerative-life-support work also supports treating air, water,
waste, and food production as connected loops rather than independent meters.
NASA's ISRU program treats local resources as an acquisition, processing,
purification, storage, and transfer chain. The gameplay follows those system
relationships while simplifying the procedures and units presented to players.

## Ship scale and deck organization

The playable pressure hull is approximately 82 meters long, 30 meters across at
its widest point, and 13.5 meters across three primary decks. Exterior drive,
radiator, tank, shield, and sensor volumes account for the remainder of the
ship profile. The current 5,800-tonne dry-mass profile remains a fictional
long-range design value rather than a claim about demonstrated engineering.

Every deck has a central corridor, two pressure-zone crossovers, a deck lift,
an emergency ladder, fire and atmosphere monitors, and clear fore/aft and
port/starboard markings. Doors divide pressure and fire zones. A closed or
jammed door changes the walkable route; an emergency never relies on decorative
door art.

### Deck 1 — Command and Science

| Room | Purpose | Playable work |
| --- | --- | --- |
| Bridge | flight, command, ship status | return to manual flight, engage or interrupt assistance, review alarms and mission state |
| Navigation and cartography | route and local-system planning | choose next leg, inspect reference frame, compare travel time and margins, set an internal destination |
| Communications | telemetry and trusted contact | receive mission traffic, distress requests, science updates, and future multiplayer rescue traffic |
| Sensor control | active and passive observation | configure scan, review uncertainty, detect cataloged or stable generated objects |
| Physical sciences lab | astronomy, geology, sample study | identify samples, run a bounded observation, prepare Journal evidence |
| Analysis and data lab | classification and mission records | compare observations, verify provenance, package discovery records |
| Briefing room | crew coordination | review the next milestone, assign priorities, inspect coverage and fatigue |
| Observation gallery | low-workload viewing | inspect the current space scene and destination without replacing manual flight |

### Deck 2 — Habitat, Health, and Life Support

| Room | Purpose | Playable work |
| --- | --- | --- |
| Medical bay | diagnosis, treatment, isolation | examine health trends, spend medical supplies on valid treatment, stabilize an injured crew member |
| Exercise bay | countermeasure and recovery | complete a short activity that reduces fatigue cost and protects crew condition over strategic time |
| Galley and wardroom | meals and shared time | schedule a crew meal, spend real food/water, improve recovery, hold a briefing |
| Port quarters | private sleep and storage | rest, inspect personal assignment and Backpack transfer boundary |
| Starboard quarters | private sleep and storage | find off-shift crew and review watch rotation |
| Hygiene and waste | water and waste handling | inspect recovery losses and respond to sanitation or filter problems |
| Life-support control | air, water, trace contaminants | monitor oxygen, carbon dioxide, humidity, water reserve, recovery, and atmosphere zones |
| Hydroponics | food-support and biological loop | tend crops, spend power/water/crew time, recover part of forecast food rather than creating unlimited food |
| Storm shelter | radiation safe haven | configure stored water, food, and mission cargo as shielding and shelter during a solar-particle event |

### Deck 3 — Engineering and Mission Operations

| Room | Purpose | Playable work |
| --- | --- | --- |
| Main engineering | propulsion and integrated ship condition | diagnose failures, isolate equipment, apply temporary or complete repair |
| Power control | generation, storage, load shedding | choose priorities, protect life support, trade capability for stability |
| Thermal control | heat transport and radiator operation | inspect loops, reduce load, replace pumps, manage radiator risk |
| Fabrication shop | parts and tools | convert declared feedstock and power into a named repair part with conservation checks |
| Cargo hold | mission stores and secured samples | inspect mass, move declared cargo, stage surface equipment, preserve transfer history |
| Resource-processing lab | returned material and ISRU products | weigh and classify input, choose a supported process, consume power/time, store measured output |
| EVA airlock | suits, pressure cycle, exterior work | inspect suit readiness, prepare an EVA, isolate a damaged zone |
| Local-craft bay | lander, rover, probes, drones | configure a supported craft and hand off to existing planetary flight, rover, geology, or mining play |

## Ship map and navigation

The ship has two map presentations backed by one layout authority:

- A compact deck map remains visible during ship walking. It shows the current
  deck, player location, pressure doors, lift, selected room, nearby crew, and
  warning state without obscuring movement controls.
- An expanded map opens from the ship HUD or `M`. It shows all three decks,
  room names, system status, crew assignments, route accessibility, and the
  selected internal destination. Choosing a room sets guidance; it does not
  teleport the player.

The route uses the same room, door, corridor, lift, and ladder graph as
collision. A closed door appears closed on the map. A jammed or isolated zone
cannot be routed through. The map never shows a usable room or passage that the
walkable interior does not contain.

## Doors, objects, and interaction language

- Pressure doors have visible frames, labels, zone lights, moving panels, and
  collision. `E` or the mobile Interact button opens or closes a normal door.
- An approaching player receives one concise prompt naming the object and
  action. The game does not replace movement with a wall of explanatory text.
- Consoles, medical beds, lockers, exercise equipment, hydroponic trays,
  filters, pumps, fabricators, cargo containers, sample instruments, suits, and
  local craft are visible objects. Only objects with a real action advertise an
  interaction.
- Room interactions open one consistent ship-work panel. It identifies the
  system, evidence, crew assigned, required input, time, expected result, risk,
  and cancel/confirm choices.
- Actions animate the relevant object and crew presentation. Text confirms the
  result but is not the only feedback.

## Core voyage loop

1. **Plan:** choose destination, drive, ship, crew, supplies, stops, risk, and
   survival rules through the existing Expedition planner.
2. **Prepare aboard:** walk the ship, inspect readiness by room, load valid
   cargo, review crew coverage, and resolve missing requirements.
3. **Depart:** use the bridge to start the strategic journey. Manual Space and
   Wayfinder remain available outside long-travel compression.
4. **Stand watches:** visit rooms, complete optional science and maintenance,
   rest, and let qualified crew handle routine work automatically.
5. **Advance time:** choose normal time, a faster rate, or the next milestone.
   Time changes crew, supplies, systems, route, and logs rather than render-frame
   speed.
6. **Respond:** diagnose a causal warning, assign crew, isolate a zone, consume
   a spare or fabricated part, reduce load, divert, shelter, or request rescue.
7. **Explore locally:** stop compression, use existing local flight, land,
   leave the craft, explore, scan, mine, drive, build, and collect through the
   established authorities.
8. **Return and process:** transfer declared samples or commodities into ship
   cargo, process only supported inputs, update the Journal and Field Guide,
   resupply valid stores, and choose the next leg.
9. **Arrive or return:** resume ordinary local Space at the selected catalog
   destination with the same Explorer, ship, cargo, crew, and history.

## Failure and recovery

Failures are causal and readable. A filter loses efficiency before air quality
becomes unsafe. A coolant problem raises thermal load before equipment fails. A
power shortage identifies which loads are protected or shed. A pressure leak
identifies a zone, closes doors, and offers isolation. A radiation event gives
warning and shelter time when detection allows it.

A prepared ship normally has multiple responses: automatic backup, qualified
crew, spare part, fabrication, load reduction, isolation, diversion, local
resource recovery, or trusted rescue. Temporary repairs restore limited
capability and remain in the log. Unrecoverable loss requires a documented
chain, not a random instant failure.

## Shared state and technical authority

| Concern | Owner |
| --- | --- |
| deck geometry, rooms, doors, lift, stations, and map graph | Surveyor layout catalog |
| player movement and camera | existing `Walk` authority |
| collision and containment | existing `activeInterior` plus current-deck door colliders |
| ship, route, crew, systems, resources, cargo, events, and log | versioned Expedition record |
| time and consequences | Expedition strategic simulation |
| destinations, frames, manual flight, assistance, landing | existing universe, Space Flight, Wayfinder, and planetary journey authorities |
| personal tools and samples | existing Backpack |
| discoveries and progression | existing Journal and Explorer event authority |
| planetary collection and mining | existing geology, mining, rover, and surface systems |

The renderer may animate a door, crew member, pump, scan, or repair, but visual
animation never becomes the authoritative resource or mission state. An object
cannot award supplies. A ship console cannot create a second destination,
Journal, Backpack, crew, or system record.

## Release slices

1. Three complete deck layouts, pressure doors, lift, compact and expanded map,
   route guidance, visible equipment, and current crew routines.
2. One shared ship-work panel and real operations for power, thermal, life
   support, medical, fabrication, sensors, and hull/pressure zones.
3. Cargo and Backpack transfer boundary plus a real surface-to-ship sample and
   resource-processing journey through existing planetary play.
4. Radiation shelter, pressure leak, medical event, power cascade, and one
   recoverable/unrecoverable causal failure pair.
5. Multi-stop persistence and full active-journey close/reload restoration.
6. Later roadmap stages: cryogenic mission, generation voyage, multiplayer
   rescue, and persistent outpost.

Each slice requires desktop and 390x844 walking, doors, map, interaction,
resource/state consequences, exit/resume, cleanup, and visual review. A room or
button does not count as complete unless the connected activity works.

## Research basis

- NASA Human Integration Design Handbook and NASA-STD-3001 architecture
  rationale: habitability, activity centers, crew interfaces, architectural
  layout, translation, privacy, communal space, exercise, medical capability,
  stowage, and longer-mission volume.
  https://www.nasa.gov/human-integration-design-handbook/
  https://www.nasa.gov/reference/8-0-architecture-vol-2/
- NASA Deep Space Habitation and Johnson Space Center Life Support: connected
  life support, environmental control, health, exercise, food, monitoring,
  maintenance, waste, air, and water functions for long-duration missions.
  https://www.nasa.gov/humans-in-space/deep-space-habitation-overview/
  https://www.nasa.gov/reference/jsc-life-support-subsystems/
- NASA Human Research Program: radiation, isolation, distance from Earth,
  altered gravity, and closed environments are interacting human-spaceflight
  hazards.
  https://www.nasa.gov/hrp/hazards/
- NASA radiation-protection work: onboard water, food, logistics, and other
  useful mass can support a temporary solar-particle-event shelter; galactic
  cosmic radiation remains substantially harder to mitigate.
  https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon/
  https://www.nasa.gov/science-research/heliophysics/real-martians-how-to-protect-astronauts-from-space-radiation-on-mars/
- NASA ISRU: local water, oxygen, methane, and construction inputs require
  prospecting, acquisition, processing, purification, storage, integration, and
  testing; resource potential and accessibility can remain uncertain.
  https://www.nasa.gov/overview-in-situ-resource-utilization/
  https://www.nasa.gov/reference/jsc-in-situ-resource-utilization/
- NASA ISAAC: deep-space vehicles benefit from autonomous monitoring,
  maintenance, and logistics support, especially when crew or ground control is
  unavailable.
  https://www.nasa.gov/integrated-system-for-autonomous-and-adaptive-caretaking-isaac/
- ESA MELiSSA: regenerative life support is a connected biological and
  physicochemical loop intended to reduce long-duration dependence on resupply.
  https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Research/Life_support
