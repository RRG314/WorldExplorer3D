# Space Expedition Alpha

Status: active implementation and release gate

## The player promise

An Interstellar Expedition is a saved journey lived aboard the Surveyor. The
player flies, walks the ship, stands watches, works with the crew, responds to
problems, studies discoveries, diverts to local systems, lands where a solid
surface and the craft permit it, gathers real mission inputs, returns aboard,
and eventually reaches the chosen destination.

The experience should feel like a long-form survival journey inside an
optimistic science-exploration sandbox. It is not a short chain of modal choices
and it is not a separate game pasted over Space Flight.

The current three-deck ship, persistent Expedition record, room map, crew
routines, ship-work panel, and data-driven Voyage Director are the foundation.
The Director now selects 14 paced chapters from 36 authored event families and
records state-gated choices, outcome bands, decision tags, delayed
consequences, contacts, crew responses, and save migration. The physically
entered local-stop loop and event-specific room action remain incomplete, so
this is not yet the completed alpha.

## Alpha shape

A nearest-star Expedition should support roughly 45–90 minutes of active play
when the player engages with ship work and one local stop. It can be saved and
resumed at any time. Players who want a shorter session can let qualified crew
handle routine work and use time compression. Longer destinations add chapters,
route decisions, and local stops rather than stretching one progress bar.

Every chapter contains some combination of:

1. a quiet watch or crew activity;
2. a navigational, scientific, human, or engineering development;
3. physical evidence aboard the ship or in local Space;
4. a player or crew response;
5. an immediate result;
6. a delayed consequence that can influence later chapters; and
7. a Captain's Log entry backed by the existing Journal when it is an Explorer
   discovery or achievement.

The player can leave the planner and walk the ship between events. Important
events identify the responsible room and crew member. Choosing a response may
start a real task there rather than resolving everything inside the event card.

## Voyage Director

One Voyage Director selects and advances events from the persistent Expedition
record. It does not own a second ship, crew, resource, clock, inventory, or
universe catalog.

### State considered

- destination class, route length, current leg, and local environment;
- player-selected survival and realism settings;
- crew roles, experience, health, fatigue, assignments, and relationships to
  earlier decisions;
- propulsion, power, navigation, sensors, thermal control, life support,
  medical, food production, fabrication, hull, doors, and isolated zones;
- food, water, power, propellant, medical stock, maintenance parts, fabrication
  feedstock, samples, and mission cargo;
- completed work, deferred work, temporary repairs, discoveries, route
  contacts, local stops, and prior outcomes;
- current ship room, nearby crew, current control method, and whether the
  player is actively flying, walking, working, resting, or exploring locally.

### Event contract

Every authored event declares:

- entry conditions and reasons it cannot occur;
- evidence presented to the player;
- responsible crew roles and ship rooms;
- urgency, duration, and whether time compression pauses;
- two to five possible responses, with options added or removed by current
  crew, tools, rooms, parts, and knowledge;
- resource and system costs before the response can begin;
- success, partial-success, failure, and deferred outcome bands;
- immediate animation, audio, room change, crew action, or local-space change;
- delayed consequence tags that can open or alter later events;
- cooldown, repetition limits, and incompatibilities;
- Captain's Log and Journal language; and
- internal truth and provenance when a discovery is modeled rather than a
  catalog observation.

Events are selected by eligibility and weight, not by a fixed universal order.
The director guarantees pacing boundaries—departure, at least one quiet watch,
at least one substantial problem, at least one scientific opportunity, and
approach—but does not guarantee the same incident or outcome on every voyage.
A stable seed makes a saved voyage reproducible without making all voyages
identical.

### Consequence chains

Responses produce tags and state changes that matter later. Examples:

- reducing thermal load preserves the loop but lengthens the leg and increases
  food and water demand;
- isolating an impact zone protects pressure but blocks a room and changes crew
  routing until an inspection is completed;
- using the last spare pump solves the current problem but makes a later pump
  failure depend on fabrication or a resource stop;
- delaying a crew rotation raises fatigue and can reduce the quality or speed
  of a later repair;
- spending power on a wide scan may find a useful contact while reducing the
  margin available during a radiation diversion;
- a carefully surveyed contact can reveal a safer landing region or better
  resource estimate than a rushed diversion;
- a temporary repair remains limited and can fail again under the condition
  that stressed it.

Outcomes are legible. The log records why a later problem happened, not only
that a random penalty occurred.

## Alpha event content budget

The alpha requires at least 36 authored event families before it can be called
content-complete. Each family must have state-dependent option availability and
at least three outcome bands where the event permits them. Parameter changes
alone do not count as a new family.

### Navigation and flight — 6

- departure watch handoff;
- course-margin review;
- sensor/navigation disagreement;
- micrometeoroid avoidance maneuver;
- local-system insertion;
- final approach calibration.

### Engineering and ship systems — 8

- coolant pump wear;
- power-converter efficiency loss;
- propulsion injector imbalance;
- radiator obstruction or damage;
- attitude-control degradation;
- pressure-zone leak;
- fabrication defect;
- cascading load-shed recovery.

### Crew and habitation — 7

- accumulated fatigue;
- illness or minor injury;
- exercise and deconditioning concern;
- watch-coverage gap;
- water-recovery contamination;
- crop-cycle problem;
- isolation and morale strain.

### Science and discovery — 6

- faint stellar-system contact;
- unusual spectrum;
- minor-body field;
- transient radiation source;
- geological resource signature;
- conflicting observation requiring follow-up.

### Environmental hazards — 5

- high-velocity particle strike;
- radiation front;
- dust or debris region;
- charged-particle interference;
- thermal stress during close stellar operations.

### Stops, rescue, and route changes — 4

- optional resource-world diversion;
- emergency repair landing;
- abandoned modeled object or debris salvage;
- bounded distress contact with assist, decline, or remote guidance outcomes.

This minimum produces hundreds of possible response/outcome combinations once
crew, equipment, stores, timing, and delayed consequences are considered. The
game should prefer a smaller set of well-animated, consequential events over a
large set of interchangeable text cards.

## Stops and physically explorable destinations

“Physically explorable” means the destination supports the form of exploration
its actual object class permits.

- Solid planets, moons, and small bodies: local flight, orbit/approach, landing
  where the craft and surface permit it, Character or rover exploration,
  scanning, geology or mining, sample custody, return, and takeoff.
- Gas and ice giants: local flight outside unsafe atmospheric limits, moons,
  rings, probes, sensors, and observations; no invented walkable surface.
- Stars: local flight with enforced thermal/radiation limits, observations, and
  suitable surrounding bodies; no landing.
- Nebulae and stellar regions: local flight, sensors, dust/gas effects, and
  stable contacts.
- Black holes: local flight and sensor work outside safe navigation boundaries,
  strong visual and gravitational presentation, and no solid surface or
  survivable event-horizon landing.

An uncharted stop has one persistent route-contact identity. It progresses
through detected, surveyed, route stop, locally entered, landed or probed,
sampled, returned, processed, and completed states. The player sees natural
language such as “survey contact” and “uncharted world.” Internal data retains
the stable seed and modeled-content truth label.

### Resource mission custody

1. Sensors estimate a potential material and uncertainty.
2. The player chooses whether route, time, propellant, and ship condition permit
   a diversion.
3. Strategic travel pauses and the same contact opens in local Space.
4. The player manually flies or uses optional assistance.
5. A suitable solid body accepts landing through the existing landing
   authority; the local craft is not a menu teleport.
6. Existing Character, rover, geology, mining, tools, and Backpack systems own
   collection.
7. Returning to the craft records the exact carried sample or material.
8. Returning aboard transfers declared mass from personal or craft custody to
   ship cargo.
9. Resource processing consumes that input, power, crew time, and equipment
   condition and produces bounded output and waste.
10. The same Expedition leg resumes with the changed route, clock, stores,
    systems, crew, and log.

No event, contact, scan, or button creates supplies by itself.

## The Surveyor visual design

These references establish the target language; they are not textures to paste
onto flat walls:

- `docs/design/space/surveyor-command-science-reference.png`
- `docs/design/space/surveyor-habitat-health-reference.png`
- `docs/design/space/surveyor-engineering-mission-reference.png`
- `docs/design/space/surveyor-expedition-ui-reference.png`

The design is original. It borrows the broad idea of an optimistic expedition
vessel, not protected franchise layouts, insignia, names, or distinctive forms.

### Modular construction language

- structural bulkhead kit: straight wall bay, inner/outer corner, pressure-door
  frame, lift frame, hull rib, ceiling truss, window frame;
- surface kit: layered composite panel, removable service panel, acoustic
  panel, heat-resistant panel, transparent instrument cover, anti-slip floor,
  floor hatch, ceiling light and ventilation cassette;
- utility kit: conduit, insulated pipe, flexible hose, vent, extinguisher,
  emergency mask, handhold, cargo rail, tie-down, locker, label plate;
- interaction kit: console pedestal, seated console, wall terminal, physical
  switch bank, status light, instrument rack, workbench, cabinet, sample tray;
- set-dressing kit: bounded personal object, cup, meal container, bedding,
  tablet, tool case, specimen container, cleaning kit, maintenance tag.

The renderer should instance repeated modules and share PBR-style material
atlases. Room identity comes from layout, equipment, light, sound, and activity,
not a unique high-resolution texture for every wall.

### Room equipment requirements

Command and Science must include flight and navigation consoles, articulated
seats, chart/sensor displays, communication rack, sample bench, analysis
station, briefing table, observation seating, pressure doors, and a real lift.

Habitat and Health must include a working galley, secured food and water stores,
communal seating, bunks and lockers, medical bed and supplies, treadmill and
resistance machine, hygiene/water-recovery equipment, atmosphere racks,
hydroponic trays, dosimeters, and a stocked radiation shelter.

Engineering and Mission must include propulsion service equipment, power
cabinets, coolant pumps and radiators, fabrication machinery, feedstock bins,
cargo restraints, sample processor, contamination controls, EVA suits and
service rack, airlock equipment, local lander, and rover access.

### Rendering and performance

- Use layered geometry for silhouettes, doors, frames, consoles, machinery,
  furniture, pipes, and nearby panels.
- Use material atlases for microdetail, wear, roughness variation, labels, and
  fasteners that do not need geometry.
- Use baked or inexpensive area-like ambient lighting plus bounded dynamic task
  and warning lights.
- Use high detail only in the current room and adjacent sight lines; reduce
  instrument refresh, small props, shadows, and crew animation by distance and
  deck visibility.
- Pool repeated props and dispose room-specific textures, materials, and audio
  when the ship session ends.
- Preserve a mobile material/prop/light budget and test the actual 390×844
  journey. “High detail” does not mean leaving every deck and display active.

## Animation and sound requirements

Text cannot be the only response. The alpha needs visible action for:

- pressure door opening, closing, locking, and isolated state;
- lift arrival, travel transition, and door cycle;
- console use, physical controls, and screen state change;
- crew walking, sitting, working, carrying, resting, treating, exercising,
  sheltering, and repairing;
- pump, fan, crop-light, fabricator, processor, and power-cabinet operation;
- sparks, coolant vapor, alarm light, pressure leak, hull impact, power loss,
  and restored system state;
- local-craft boarding, bay cycle, departure, arrival, rover deployment, and
  cargo return.

Each has restrained room ambience and clear warning/confirmation audio. Audio
must not drown out controls or require sound to understand state.

## UI architecture

The reference `surveyor-expedition-ui-reference.png` defines hierarchy, not
literal final copy.

Normal play keeps the 3D view visible with:

- a compact voyage strip showing current chapter and next known milestone;
- a compact ship map that can expand;
- current watch and urgent objective;
- one contextual interaction prompt;
- bounded warning presentation that never covers the bottom action bar.

One expanded Expedition surface has four primary views:

1. **Voyage:** route chapters, current leg, contacts, event evidence, decisions,
   and likely consequences.
2. **Ship:** deck map, rooms, doors, systems, stores, current work, and route
   guidance.
3. **Crew:** watch, assignments, health, fatigue, skills, location, and
   recommendations.
4. **Log:** Captain's Log with links to relevant existing Journal records.

The same card language serves events and room work: evidence, responsible crew,
required inputs, expected result, risks, time, recommendation, and response.
Mobile uses the same information architecture in a single-column sheet. It does
not receive a separate set of authorities or abbreviated consequences.

## Alpha implementation order

1. Freeze this visual and interaction language and retain the current verified
   gameplay checkpoint.
2. Build the shared modular bulkhead, material, lighting, prop, and equipment
   kits from the four references.
3. Replace each current placeholder room with its required authored equipment
   while preserving the validated room/door/lift/map graph.
4. Add room-level detail/animation budgets, pooling, disposal, and mobile LOD.
5. Extend the active Voyage Director and its 36-event content library with
   event-specific room action, animation, sound, and local-space evidence.
6. Add the unified Voyage/Ship/Crew/Log UI and keep contextual HUD elements
   bounded during normal play.
7. Implement persistent route contacts and a physically entered local Space
   frame.
8. Add a generic modeled solid-world surface path through the existing landing,
   Character, rover, geology/mining, Backpack, and takeoff authorities.
9. Complete one end-to-end resource mission and one emergency repair diversion.
10. Add save/resume, lifecycle cleanup, causal failure reports, input and
    accessibility review, and desktop/mobile performance budgets.

## Alpha release gate

The Space Expedition label is ready for public alpha only when all of the
following work in actual gameplay:

- the three decks meet the reference quality at normal walking distance and
  retain stable collision, doors, lift, map, controls, and mobile performance;
- at least 36 authored event families can produce state-dependent choices and
  delayed consequences without repeating a fixed sequence;
- crew visibly perform ship work and their skills, fatigue, health, location,
  and assignments alter outcomes;
- one known solid destination and one stable uncharted route stop support local
  flight, landing, surface exploration, resource custody, return, processing,
  and voyage resumption;
- gas giants, stars, nebulae, regions, and black holes use physically suitable
  exploration and do not advertise impossible landing;
- a recoverable repair chain, emergency landing, resource shortfall, radiation
  response, crew-health problem, scientific discovery, and safe arrival all
  work without creating supplies or duplicate state;
- a saved voyage reloads with the same player, ship, rooms, doors, crew,
  assignments, resources, systems, route, contacts, stops, outcomes, and log;
- ordinary manual Space, Wayfinder assistance, Solar System landing, planetary
  play, Character, Backpack, Journal, geology/mining, and Earth play remain
  unchanged when no Expedition is active; and
- focused installed-browser journeys pass on desktop and 390×844, and visual,
  performance, memory cleanup, keyboard, touch, and accessibility review have
  current evidence.

Until that gate passes, the feature remains a local development alpha and must
not be described as a complete space game or deployed as production-ready.
