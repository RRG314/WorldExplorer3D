# Character and Specialization Design

Status: implementation design for the local 5.1 source line
Schema target: character 1, progression rules 1

## Purpose

World Explorer uses one character model across fieldwork, companions, vehicles,
building, marine play, and space. Appearance never changes capability. Players
begin with modest differences, then become better mainly through meaningful
activities they actually complete.

This design extends the existing Explorer event/profile store and Backpack. It
does not add a second inventory, a second Explorer rank, or feature-owned XP.

## Existing-system audit

| Existing system | Decision | Reason |
| --- | --- | --- |
| Explorer events and Journal event store | Retain and version | Stable event IDs already prevent duplicate Journal records. Events are the correct input to progression. |
| Explorer points and ranks | Retain meaning; replace projection rules | Overall rank already represents breadth, but its current point rules and six ranks are too small for long-term character development. |
| Nature, Earth, and Places specialties | Migrate | They mix subject matter with travel. Nature becomes Wildlife or Marine based on the activity; Earth becomes Geology; Places remains an Explorer path, not a specialty. |
| Discipline progress | Read-only migration evidence | It duplicates newer event/Guide evidence and must not continue awarding advancement. |
| Field record pacing | Retain as activity pacing | It decides which field leads appear. It is not a character level. |
| Companion levels and trust | Retain | These describe each companion. Character Companion Handling is separate and receives bounded credit from meaningful handling/training events. |
| Backpack schema 2 and hotbar | Retain unchanged | It is the one inventory and quick-loadout authority. Character loadouts reference Backpack instance IDs. |
| Tool unlocks based only on Explorer points | Migrate to capability requirements | Basic tools remain available. Advanced tools use specialty, qualification, and equipment rules without locking basic exploration. |
| Journal and Field Guide | Retain as projections | They consume the canonical event/result and never award XP themselves. |
| Activity completion store | Retain completion history | Completion emits one canonical progression event. Its local count is not another XP source. |
| Firebase account service | Retain boundary; no invented sync | It exposes authentication but no trusted character document. Local progression remains complete until a reviewed cloud adapter exists. |
| Avatar rendering | Retain independently | Current walking and planetary characters are presentation systems, not capability systems. |
| Stamina, fatigue, and player health | Do not claim as existing | Vehicle condition and environmental rules exist; a general player stamina/health authority does not. Exertion is added only with a real climbing/swimming/heavy-work mechanic. |

## Character model

One versioned `CharacterState` is stored inside the existing local Explorer
profile. It contains:

- identity: character ID, created time, revision, schema/rule versions;
- appearance reference: cosmetic configuration only;
- background and creation choices;
- seven bounded attributes;
- developed specialties and proficiencies;
- traits, qualifications, titles, and unspent milestone choices;
- Backpack-referencing loadouts;
- deduplication and repetition ledgers;
- migration evidence and rollback metadata.

Multiple characters are not exposed in this release. The schema uses a stable
character ID and does not use the account ID as the character ID, leaving a
future character collection possible without changing character records.

## Attributes

Ratings run from 2 to 8. A balanced new character starts at 4. Backgrounds move
only a few points and no legal starting value is below 3 or above 6. Ratings
may later reach 8 through infrequent Explorer-rank choices.

| Attribute | What changes |
| --- | --- |
| Strength | Heavy excavation control, demanding construction actions, carrying a specifically heavy field object, and future climbing force. It does not multiply health. |
| Endurance | Sustained swimming/diving assistance, harsh-environment workload, and future meaningful exertion recovery. It does not create a constant run-and-wait loop. |
| Precision | Fine excavation control, camera stability assistance, careful placement, and delicate instrument handling. |
| Awareness | Clue presentation, detector interpretation, wildlife behavior cues, and observation assistance. It never changes the world's target rarity or species presence. |
| Field Knowledge | Identification detail, geological interpretation, ecological context, and planetary-science information. It does not change source data. |
| Technical | Instrument interpretation, construction systems, sonar, vehicles, submersibles, and spacecraft assistance. It does not rewrite physics. |
| Navigation | Route, survey, marine, aircraft, cave, and orbital-navigation assistance. It does not move destinations or shorten physical distances. |

Attribute effects return named assistance and information changes rather than a
generic efficiency percentage. Ratings use diminishing contribution above 6.

## Backgrounds

Backgrounds are starting arrangements, not classes. Every specialty remains
reachable.

| ID | Player label | Starting emphasis |
| --- | --- | --- |
| `general-explorer` | General Explorer | Balanced attributes and surveying familiarity. |
| `field-naturalist` | Field Naturalist | Awareness, Field Knowledge, Wildlife, and Photography. |
| `field-prospector` | Field Prospector | Precision, Awareness, Geology, Detector, and Excavation. |
| `marine-surveyor` | Marine Surveyor | Endurance, Navigation, Marine, Dive, and Sonar. |
| `expedition-pilot` | Expedition Pilot | Technical, Navigation, Piloting, aircraft, and ground vehicles. |
| `field-engineer` | Field Engineer | Technical, Precision, Engineering, and Construction Tools. |
| `research-surveyor` | Research Surveyor | Field Knowledge, Navigation, Surveying, and Survey Equipment. |
| `planetary-explorer` | Planetary Explorer | Technical, Navigation, Space, and Spacecraft. |

`Custom Start` distributes the same point budget with the same 3–6 creation
bounds. The default choice is General Explorer. Background equipment is a
recommendation or a real Backpack grant; it is never a hidden item flag.

## Specialties

The first release uses specialties only for gameplay that already has a
meaningful activity source.

| Specialty | Meaning | First-release sources |
| --- | --- | --- |
| Wildlife | Wildlife, plants, habitats, tracks, and observation | observation, photography, macro, habitat and community surveys |
| Companion Handling | Reading, befriending, caring for, and training companions | trust sequence, successful training, shared field milestones |
| Geology | Rocks, minerals, sediment, fossils, and prospecting | geology inspection, detecting, panning, fossil work |
| Marine Exploration | Water survey, fishing, diving, sonar, boats, and submersibles | catches, sonar/dive surveys, marine navigation milestones |
| Space Exploration | Planetary travel, landings, field science, and atmosphere work | first destinations, guarded landings, planetary field records |
| Piloting | Ground, air, boat, rover, and spacecraft operation | meaningful route/landing/challenge completion, not idle distance |
| Engineering | Building, repair, and technical construction | saved creations and increasing construction milestones |
| Photography | Observation through camera technique | successful distinct photo and macro challenges |
| Surveying | Route, habitat, map, sonar, and planetary survey work | completed distinct surveys and Expeditions |

Astronomy, Archaeology, and Botany remain future definitions until their own
released activity loops justify ranks. They cannot appear as requirements.

Each specialty has six milestone ranks: 0 Unstarted, 1 Familiar, 2 Practiced,
3 Capable, 4 Advanced, and 5 Specialist. The labels are descriptive and never
real-world certifications. Raw XP is visible as progress to the next rank, not
as a 1–100 character level.

## Proficiencies and qualifications

Only encountered proficiencies are shown. Initial categories are Detector,
Excavation, Dive, Sonar, Boat, Submersible, Ground Vehicle, Aircraft,
Spacecraft, Photography, Survey Equipment, and Construction Tools.

Proficiency has five stages from New to Expert. Advancement requires bounded
meaningful-use receipts: a successful target, completed route, new challenge,
or increasing difficulty. Frame time, menu use, empty digging, driving in
circles, and repeated button presses cannot award it.

Qualifications are explicit capability milestones, not real credentials:

- Advanced Excavation;
- Advanced Dive Ready;
- Submersible Operator;
- Orbital Flight Ready;
- Advanced Survey Instruments.

Each qualification has a reachable combination of specialty rank, equipment,
and a completed training activity. No qualification is required to earn the
rank that unlocks its own training.

## Traits

A character chooses up to two creation traits. Traits change assistance rather
than reward multipliers:

- Sure-Footed: steadier rough-ground movement; no impossible-slope access.
- Patient Observer: observation cues settle sooner after sustained stillness.
- Methodical: finer excavation control with slower heavy removal.
- Equipment Minded: clearer equipment-condition and instrument feedback.
- Wayfinder: earlier route and bearing interpretation.
- Strong Swimmer: stronger starting water-movement assistance.

Traits can be changed without losing earned specialty or proficiency progress.
No trait changes XP speed.

## Explorer rank and reward rules

Explorer rank remains overall breadth. It is projected only by the central
progression authority. Large credit comes from first activities, places,
environments, destinations, Expeditions, and multidisciplinary milestones.
Repeating one specialty cannot reach the highest breadth ranks.

Specialty and proficiency credit use the same canonical event but different
rules. One event produces one combined reward receipt. Journal, Guide,
analytics, achievements, and UI read that receipt and cannot submit a second
reward for it.

Repetition bands are keyed by character, activity, subject, location, and
difficulty. A first meaningful completion receives full practice credit; useful
repeats receive decreasing credit; immediate identical repeats receive none.
Novel location, subject, environment, or challenge evidence can restore credit.

Occasional Explorer-rank milestones grant one bounded attribute choice. They do
not automatically increase every attribute. There are no paid points or XP
boosts.

## Capability resolution

One resolver combines character state, equipment, environment, and activity
requirements. Callers request a capability such as excavation, wildlife
observation, dive, sonar, vehicle handling, spacecraft operation, surveying, or
construction. They never check a background or class.

A result contains:

- `allowed` and any real hard requirement;
- difficulty band;
- named assistance values such as control, stability, interpretation, and
  information tier;
- contributing attributes, specialty, proficiency, qualification, equipment,
  and traits;
- plain-language reasons and next steps;
- a character revision for caching.

Basic exploration is always reachable. Hard requirements are reserved for
environmental protection, actual equipment, advanced vehicle access, and
training qualifications. Attributes mainly change control and information.

## Released-activity integration matrix

| Activity | Attributes | Specialty | Proficiency | Qualification | Equipment | Requirement and benefit | Progress event owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inspect field lead | Awareness, Field Knowledge | Surveying | Survey Equipment | None | Field Lens | Basic allowed; richer context and earlier clues | Progression authority from field result |
| Metal detecting | Awareness, Precision | Geology | Detector | None | Metal Detector | Tool hard; signal/depth interpretation soft | Progression authority from resolved target |
| Detector excavation | Strength, Precision | Geology | Excavation | Advanced only for advanced work | Trowel/Shovel/Brush | Suitable tool/depth hard; removal and fine control soft | Progression authority from recovered target |
| Geology inspection | Field Knowledge, Awareness | Geology | Survey Equipment | None | Lens or Rock Hammer | Tool hard where sampling is used; identification detail soft | Progression authority from field result |
| Sediment panning | Precision, Endurance | Geology | Excavation | None | Sediment Pan | Tool/water context hard; separation feedback soft | Progression authority from completed pan |
| Fossil documentation | Precision, Field Knowledge | Geology | Excavation | Advanced for delicate advanced sites | Fossil Brush | Tool/site hard; control and information soft | Progression authority from completed document |
| Wildlife observation | Awareness, Field Knowledge | Wildlife | Survey Equipment | None | Binoculars optional | Basic allowed; behavior cues and detail soft | Progression authority from distinct observation |
| Wildlife photography | Awareness, Precision | Wildlife, Photography | Photography | None | Field Camera | Camera hard; stability and challenge feedback soft | Progression authority from accepted photo |
| Insect macro | Precision, Awareness | Wildlife, Photography | Photography | None | Field Camera | Camera hard; stability and focus assistance soft | Progression authority from accepted macro record |
| Habitat/community survey | Awareness, Navigation, Field Knowledge | Wildlife, Surveying | Survey Equipment | None | Field Lens | Basic allowed; transect and interpretation assistance soft | Progression authority from completed survey |
| Companion trust sequence | Awareness, Field Knowledge | Companion Handling | None | None | Appropriate interaction | Never automatic; cues and timing guidance soft | Progression authority from trust milestone |
| Companion training | Awareness, Precision | Companion Handling | None | Training milestone | Owned companion | Companion ownership/trust hard; cue clarity soft | Progression authority from completed exercise |
| Fishing | Awareness, Endurance | Marine Exploration | Boat where relevant | None | Fishing Rod | Water/equipment hard; reading conditions soft; rarity unchanged | Progression authority from resolved catch |
| Sonar survey | Technical, Navigation | Marine Exploration, Surveying | Sonar | Advanced Survey Instruments for advanced work | Portable Sonar | Tool/water hard; interpretation soft | Progression authority from completed survey |
| Dive survey | Endurance, Technical | Marine Exploration | Dive | Advanced Dive Ready for advanced depth | Dive Kit | Environment/gear depth hard; movement and buoyancy assistance soft | Progression authority from completed survey |
| Boat route | Navigation, Technical | Marine Exploration, Piloting | Boat | None | Boat | Vehicle/access hard; instruments and recovery soft | Progression authority from meaningful route |
| Submersible survey | Technical, Navigation | Marine Exploration | Submersible | Submersible Operator | Submersible | Vehicle/qualification hard; control and interpretation soft | Progression authority from survey completion |
| Ground-vehicle route | Technical, Navigation | Piloting | Ground Vehicle | None | Vehicle | Vehicle hard; recovery and route assistance soft; physics unchanged | Progression authority from route/challenge |
| Aircraft route/landing | Navigation, Technical | Piloting | Aircraft | Advanced activity-specific training | Aircraft | Craft/training hard for advanced route; assistance soft | Progression authority from landing/challenge |
| Space launch and travel | Navigation, Technical | Space Exploration, Piloting | Spacecraft | Orbital Flight Ready for advanced manual operations | Spacecraft | Craft/training hard where advanced; guidance soft; physics unchanged | Progression authority from journey evidence |
| Planetary landing | Navigation, Technical, Precision | Space Exploration | Spacecraft | Route-dependent | Suitable craft | Physical landing evidence always hard; guidance and information soft | Progression authority from first guarded touchdown |
| Planetary fieldwork | Field Knowledge, Awareness, Navigation | Space Exploration plus Geology/Surveying | Survey Equipment | None | Rover/field equipment as required | Destination/equipment hard; interpretation soft | Progression authority from planetary field record |
| Blocks milestone | Technical, Precision | Engineering | Construction Tools | None | Blocks tool | Basic building always allowed; placement assistance soft | Progression authority from increasing milestone |
| Editor feature | Technical, Precision, Field Knowledge | Engineering, Surveying | Construction Tools/Survey Equipment | None | Editor | Basic local drafting allowed; validation assistance soft | Progression authority from saved/submitted feature |
| Live GPS field stop | Same as underlying field activity | Same as activity | Same as activity | Same as activity | Same as activity | GPS evidence affects eligibility, not character rewards | Underlying field result only |
| AR field challenge | Same as underlying observation | Wildlife/Photography | Photography | None | Supported device/camera | Device/privacy hard; character offers non-exclusive assistance | Underlying challenge completion only |
| Multiplayer Expedition | Activity-specific | Activity-specific | Activity-specific | Activity-specific | Activity-specific | Solo path remains; bounded teammate capabilities can add options | Individual trusted completion receipts |

Trading never derives item trust or value from client character stats. Backpack
ownership and server receipts remain authoritative. Character capability may
affect an interaction presentation, not trade authority.

## Creation and Character screen

Character creation follows appearance when an appearance flow exists. Until
then it appears as the final first-run Explorer setup step. `Recommended`
selects General Explorer; backgrounds show practical effects; `Custom Start`
shows the same bounded point budget. Players are told they can develop every
specialty later.

One Character screen contains Overview, Attributes, Specialties,
Proficiencies, Traits, and Loadouts. It shows practical effects and next
capabilities without formulas or a grid of untouched proficiencies. Backpack
remains the inventory surface. A loadout stores selected Backpack instance IDs
and requires confirmation before changing equipped items.

## Persistence and migration

The discovery database gains a versioned character record inside the profile
and a migration-backup store. Migration is idempotent and records the exact
evidence used:

- existing Explorer points/ranks remain unchanged at migration time;
- event and Field Guide evidence seeds specialties conservatively;
- Earth/nature/places counters are used only when detailed evidence is absent;
- companion ownership, levels, and trust remain untouched;
- Backpack, specimens, hotbar, and ammunition remain untouched;
- no unsupported Marine, Space, vehicle, or engineering experience is invented;
- the pre-migration profile is recoverable until the new schema is accepted.

Anonymous players use IndexedDB/local storage. Signed-in players continue to
work locally. Cloud synchronization is added only with a reviewed character
document, merge policy, security rules, and receipt authority; authentication
alone is not treated as cloud persistence.

## Multiplayer, analytics, and privacy

Remote presence may expose only chosen title, top specialties, visible avatar
and equipment, active companion, and relevant cooperative action state.
Attributes and detailed proficiency ledgers remain private by default.

Analytics receives bounded events for character creation, background choice,
attribute choice, rank, specialty/proficiency milestone, qualification, trait,
and loadout use. Analytics does not award progression and receives no precise
location or detailed private build state.

## Performance

Character projections update when a canonical event, equipment change, or
character choice changes the revision. Capability results cache by character
revision, Backpack revision, environment, and capability ID. Nothing scans the
event history or recalculates all capabilities per frame.

## Verification workflow

Verification follows dependency order and does not restart unrelated gameplay:

1. schema normalization, migration, backup, rollback, and deduplication;
2. progression-event projection, repetition control, breadth, and rank curves;
3. capability resolver explanations and reachability graph;
4. one actual geology interaction and save/reload;
5. wildlife/companion, space, marine, vehicles, and engineering slices;
6. Character UI at desktop and 390×844;
7. only after all integrations, cross-specialty simulations, legacy-save
   acceptance, representative full journeys, multiplayer boundaries, and
   performance measurement.

A failed stage is fixed and rerun by itself. Earlier stages rerun only when
their shared authority changes. Existing tests are evidence only after their
assertions have been reviewed against this design; their names or prior green
status do not make them release gates.
