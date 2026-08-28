# Companion System

Status: implementation contract for the 5.1 local candidate. This document
defines the system that must be playable before companions are described as a
finished feature.

## Product promise

Companions turn an animal encounter into a lasting exploration relationship:

> Explore → meet an eligible animal → learn how it responds → build trust →
> befriend it → name it → travel, care, and train together → unlock visible
> field abilities → build a collection of individual companions.

This is a discovery-and-collection loop, not an animal combat system. The
collection appeal may feel familiar to location-based creature games, but
World Explorer uses observation, trust, training, and fieldwork instead of a
capture device.

An animal shown by the game is a game encounter. It is never evidence that a
real animal is physically present. Real wildlife guidance always favors
distance, legal access, and no disturbance.

## Existing-system audit

The current source contains useful foundations, but the old companion loop is
not the release design.

| Area | Evidence in current source | Decision |
| --- | --- | --- |
| Regional ecology | `discovery/ecology/` supplies versioned taxonomy, habitat, season, provenance, licensing, attribution, sensitive-species policy, migration, and rollback. Baltimore contains 60 reviewed-candidate taxa. | Reuse as species and safety authority. Companion eligibility is a separate reviewed field and never follows ecology rarity automatically. |
| World animals | `wildlife-runtime.js` places bounded game animals with habitat-plausible truth labels and moves observation-only animals away at close range. | Reuse spawning and safety boundary. Replace generic companion steps with archetype encounters and persisted encounter identity. |
| Companion catalog | `catalog.js` has six domestic appearances plus pigeon, mallard, and fox game companions. | Keep the three dog and three cat appearances, admit city pigeon as the first eligible game-wildlife archetype, and stop new mallard/fox acquisition until their behavior and content gates pass. Existing saved mallard/fox instances remain recoverable. |
| Individual identity | `companions.js` creates stable IDs, bounded personality/appearance variation, active state, and non-tradeable instances. `profile-store.js` saves them in IndexedDB and exports/imports them. | Reuse after schema validation and migration. Permit meaningful duplicate individuals; do not deduplicate by catalog ID. |
| Trust and befriending | `runtime.js` currently advances three generic clicks held only in memory. | Retire. Trust must be readable, action-specific, timed where appropriate, and recover safely after a reload. |
| Following | `companion-runtime.js` renders one active animal, follows the active actor, and has bounded car/boat placement. | Reuse the single-active rule and vehicle boarding. Replace one generic ground/air follow response with declared dog, cat, and bird behavior states. |
| Care | Current `Feed` raises fullness and happiness numbers. | Retire the decaying meters. Care becomes optional visible interaction with no starvation, disappearance, death, or missed-day penalty. |
| Training | Current `Train Find` increments a number from a menu. | Retire. Commands are earned through short world-space exercises with success/failure feedback. |
| Companion XP | The uncommitted prototype grants XP from raw distance and trip starts. | Retire. XP comes from completed, explained shared activities with per-source anti-farming rules. Explorer XP stays separate. |
| Journal, Guide, Profile | `profile-store.js` already projects discoveries and important story events. The Field Kit renders the Journal, Guide, life lists, and Explorer paths. | Reuse, but add companion summaries and cross-links. Routine feeding and repeated clicks do not become Journal entries. |
| Backpack | `player/backpack-*` supplies versioned local inventory and migration. | Reuse for food, toys, and accessories. A companion is never a Backpack item. |
| Expeditions and retention | `field-expedition.js` and `field-retention.js` provide three-stop, daily, weekly, and seasonal programs without streak loss. | Reuse as meaningful shared-activity sources; add companion objectives only where the active animal can visibly participate. |
| Live GPS | `live-gps/field-session-authority.js` provides consent, accuracy, speed, foreground, distance, and privacy checks without saving a raw route. | Reuse unchanged. Companion credit consumes qualified activity receipts, never raw coordinates or untrusted distance alone. |
| AR | `ar/eligibility.js` restricts companion AR to owned instances and stops it while driving or moving too fast. | Reuse eligibility and local-camera privacy. Add level-aware pose, recall, and ability reactions. |
| Multiplayer | Rooms, presence, and authorization exist, but no companion presence or ownership contract exists. | Add a small presentation-only active-companion payload with mobile budgets. Ownership, XP, and transfer never derive from another client's presence. |
| Trading | Server-authoritative exact-instance item transfer exists; companions are currently non-tradeable. | Companions stay non-tradeable in the first release. A later transfer feature must use a dedicated server transaction and must exclude protected/sensitive content. |
| Analytics | Discovery telemetry is allowlisted and location-coarse, but only covers adopt, activate, and care. | Extend the allowlist to funnel stages, training result, XP reason, and milestone bands without names, exact coordinates, or route history. |
| Player writing | Existing cards expose internal categories, numeric meters, and phrases such as “virtual unlock.” | Replace with short contextual game language. Internal truth and authority fields remain in diagnostics and data, not button labels. |

The missing `docs/FIELD_EXPLORATION_AND_MOBILE_CONTROL_PLAN.md` is not an
authority in this branch. `ROADMAP.md`, `SYSTEM_INVENTORY.md`, this contract,
and the runtime source are the current sources of truth.

## Species, encounters, and owned individuals

Species discovery and companion ownership are different records:

- A Field Guide entry answers “what species have I identified?” and tracks
  observations, regions, season, sources, and safety notes.
- A companion instance answers “which individual did I befriend?” and tracks
  name, appearance, personality, bond, training, memories, and active state.

Observing a species never grants a companion automatically. Befriending an
individual does record the species if it was not already in the Guide.

Every encounter declares one policy:

| Policy | Player outcome |
| --- | --- |
| Domestic | Can be befriended through a dog- or cat-specific trust sequence. |
| Stray/feral | Requires a reviewed scenario; never implies that a real found animal may simply be taken. Not in the first release. |
| Common game wildlife | May become a companion only when its species, behavior, safety, and presentation gates pass. |
| Difficult game wildlife | Future multi-session path; not stronger because it is difficult. |
| Observation only | Adds Guide and Journal evidence but cannot become a companion. |
| Protected/sensitive | Observation only, generalized location, no lure, trade, collection hint, or nest/roost direction. |

Encounter rarity controls how often a game encounter is offered. Conservation
status controls safety and presentation. They are separate values.

### First-release set

The first complete set is deliberately small:

| Archetype | Current appearances | Acquisition | Field strengths |
| --- | --- | --- | --- |
| Dog | Trail Hound, Field Retriever, Park Terrier | Domestic game encounter | Track or Retrieve specialization |
| Cat | Harbor Cat, Meadow Tabby, Midnight Cat | Domestic game encounter | Observe or Find specialization |
| Bird | City Pigeon | Eligible common game-wildlife encounter | Scout or Observe specialization |

Marsh Mallard and Woodland Fox remain observation-only for new encounters.
They do not pass the current release gate for safe befriending presentation,
ground/flight behavior, and complete interaction animation. A saved legacy
instance remains usable and is never deleted by migration.

### Rural farm life

Rural worlds also need a visible domestic-animal layer. Farmland, farmyard,
meadow, and field context may make a bounded **game farm encounter** eligible;
mapped land use alone never proves that real livestock are present.

The rural set is cattle, sheep, goats, chickens, pigs, and horses. The current
vertical slice gives them distinct silhouettes, bounded scale, follow spacing
and response, individual identity, trust/naming, specialties, and mobile model
budgets instead of presenting them as reskinned dogs. Grazing, pecking,
resting, sound distance, fence awareness, and complete rural observation and
photography journeys remain later depth work and are not claimed complete.

Owning livestock does not make every travel mode physically interchangeable.
Chickens, goats, sheep, and pigs may follow on foot in compatible open areas.
Cattle and horses follow only where their scale and navigation clearance are
safe. Livestock waits for the player during ordinary car, boat, aircraft,
interior, dense-city, underwater, and space travel; it is never shrunk into a
seat or forced through a wall. Collection, XP, care, training, memories, and
level progression continue while that individual is owned. Farm dogs and cats
use the existing dog/cat architecture in eligible rural contexts.

Farm-animal befriending remains game play. A mapped farm does not prove that a
real animal exists there, and the game never suggests taking, feeding, entering
property for, or claiming ownership of a real animal.

Each species must pass all of these gates before the full rural slice is called complete: ecology eligibility,
sensitive/protected review, companion policy, model and scale review,
locomotion, interaction animation, encounter behavior, personality variation,
training compatibility, visible abilities, Guide and Collection presentation,
AR classification, multiplayer budget, rights/attribution, mobile performance,
and acceptance journeys.

## Trust and befriending

Trust is one readable relationship, not a hidden 0–100 meter:

| State | Meaning |
| --- | --- |
| Wary | The animal keeps distance. Observe before acting. |
| Curious | The first correct interaction succeeded. The animal watches or approaches. |
| Comfortable | The encounter sequence is complete and the individual may be named and befriended. |
| Trusting | Reached at companion level 3 after successful recall training. |
| Bonded | Reached at companion level 8 after field ability training. |

Encounter progress is persisted by stable encounter ID. Walking away pauses it;
it does not reset. Trying the wrong action produces a visible animal response
and a short hint, but never removes progress.

The first-release sequences are:

- Dog: **Watch** body language → remain still while it **Approaches** →
  **Greet** after it is comfortable → **Name** and **Befriend**.
- Cat: **Watch** from outside its comfort distance → **Sit quietly** until it
  approaches → **Play** with the game ribbon → **Name** and **Befriend**.
- City pigeon: **Observe** from a respectful game distance → **Photograph** it
  while perched → **Wait for return** at a game perch → **Name** and
  **Befriend**. The Guide states that this is a game encounter and not a real
  animal-location report.

The nearby Action prompt shows only the next verb and the relationship state.
There is no generic `Tame` button and no “progress 2/3” developer language.

## Individual companion model

Companion schema version 2 persists only durable state:

- stable instance ID, catalog appearance ID, species/archetype ID;
- player-chosen name, acquisition time, generalized origin region, and policy;
- bounded personality traits and meaningful coat/size variation;
- level, total Companion XP, bond state, and XP award ledger;
- learned commands, training records, chosen specialization, and mastery;
- favorite, archive, accessory, important memories, and active state;
- local/account authority and explicit migration metadata.

Transient pathfinding, animation, cooldown, and vehicle-seat state are not
saved. Names are trimmed, length-limited, escaped on display, and never sent to
analytics.

Multiple individuals of the same appearance are allowed. They must differ in
identity, bounded appearance/personality, memories, or training. Players may
favorite or archive them. There is no artificial collection limit. Releasing
an individual is a deliberate confirmed action with backup/recovery support;
it is not part of the first implementation slice.

## Active companion and world behavior

One owned companion may be active. It exists in the world instead of hovering
in the interface.

- Dog follows behind and to the side, pauses to sniff, looks toward relevant
  clues, and boards cars and boats.
- Cat follows at a shorter distance, pauses more often, investigates nearby
  ground features, and boards cars and boats.
- Bird alternates between perch and bounded flight, perches on supported
  vehicles, and never clips along the ground as a generic follower.
- Recall, Stay, Pose, Track, Retrieve, Find, Observe, and Scout are visible
  state-machine actions, not passive percentage bonuses.
- Ground companions wait safely while the player is underwater, flying, on the
  Moon, on Mars, or in space. Player text says `Waiting for you`.
- Lost or stuck companions recover behind the player only after path and
  distance thresholds fail; recovery is not used as ordinary movement.

Local AI uses throttled navigation, distance and animation LOD, and no
continuous expensive pathfinding. The local companion receives full fidelity.
Remote room companions update at a lower rate with reduced animation and no
remote AI or audio.

## Companion XP and bond levels

Companion XP belongs to one individual. Explorer XP belongs to the player.
Only first-time companion milestones grant small, one-time Explorer progress.

XP is awarded after a completed shared event and always includes a reason:

| Shared event | Companion XP | Anti-farming rule |
| --- | ---: | --- |
| Complete a compatible field activity | 12 | One award per stable activity claim. |
| Add a new species to the Guide together | +8 | Once per species per companion. |
| Complete an Expedition stop | 8 | Once per stable stop receipt. |
| Complete the full three-stop Expedition | +20 | Once per Expedition version. |
| Finish a training exercise | 15 | First clear per exercise; later personal best is 5 XP, once daily. |
| Care after at least one shared activity | 5 | Once daily; care never becomes an XP-click loop. |
| Reach a new region together | 20 | Once per region per companion. |
| Complete 500 m of qualified shared travel | 10 | Maximum four awards daily; Live GPS requires its qualified foreground receipt. |
| Complete a companion challenge | 15–35 | Once per challenge version. |
| Save the first companion memory in a region | 5 | Once per region per companion. |

Repeated clicks, idle time, menu opening, vehicle entry, and unqualified raw
distance grant no XP. Stable receipt IDs make awards idempotent. A normal
45–60 minute session is expected to earn roughly 50–80 XP; the 500 m travel
award supports exploration but cannot dominate it.

### Complete first-release level table

| Level | XP to next | Cumulative XP | Expected active time | Change and unlock | Other projections |
| ---: | ---: | ---: | --- | --- | --- |
| 1 | 40 | 0 | Befriending session | Name, Follow, Care, and basic Photo | Collection and Profile entry; owned AR idle; room card shows active companion. |
| 2 | 60 | 40 | 0.5–1 h | Recall exercise opens; new greeting reaction | No Journal or Explorer award. |
| 3 | 80 | 100 | 1–2 h | Trusting; Recall command unlocks | First-recall Journal memory; one-time first-companion Explorer award; AR recall and remote recall emote. |
| 4 | 100 | 180 | 2–3 h | Stay exercise opens; calmer follow behavior | Training best appears in Collection. |
| 5 | 120 | 280 | 3–5 h | Stay and Pose unlock; one accessory slot | Important Journal memory; AR/room pose. |
| 6 | 150 | 400 | 5–7 h | Choose one archetype-compatible specialization; field exercise opens | Choice shown in Profile and Collection; no Explorer award. |
| 7 | 180 | 550 | 7–9 h | Specialization command passes supervised practice | Visible command becomes usable with a bounded cooldown. |
| 8 | 210 | 730 | 9–12 h | Bonded; specialization command becomes reliable in field activities | Bond Journal memory; one-time first-Bonded Explorer award; AR and room bond reaction. |
| 9 | 240 | 940 | 12–15 h | Advanced combined-command challenge opens | Challenge card and memory frame. |
| 10 | 270 | 1,180 | 15–19 h | Advanced ability behavior and second accessory slot | Journal memory, AR special reaction, room social emote. |
| 11 | 300 | 1,450 | 19–23 h | Archetype mastery trial opens | Mastery progress shown separately from species discovery. |
| 12 | — | 1,750 | 23–30 h | Master Partner; mastery reaction and profile badge | Journal milestone; one-time first-master Explorer award; AR/room mastery presentation. |

The level never falls. Missing days do nothing. No species receives a higher XP
ceiling, stronger base power, or better rewards because it is rare.

## Training, abilities, and specialization

Training is entered from the companion or through a nearby world prompt. Each
exercise lasts about 20–60 seconds and has a clear reset:

- Recall: the companion waits at a marked point; **Call** succeeds when it
  returns through the gate.
- Stay: **Stay**, move beyond the marked distance, hold, then **Return**.
- Pose: move to the photo mark, **Pose**, and take the picture while the pose is
  held.
- Track/Find: issue the command; the animal visibly searches a bounded area and
  indicates an eligible existing field lead.
- Retrieve: throw a training dummy; the dog returns that same game object.
- Scout: the pigeon performs a bounded flight and marks one eligible existing
  lead. It never invents a mapped place or species occurrence.
- Observe: the companion settles and looks toward an eligible field subject,
  helping the player frame a photo without changing discovery truth.

Specializations are small, decided choices rather than a skill tree:

- Dog: **Tracker** (Track) or **Retriever** (Retrieve).
- Cat: **Finder** (Find) or **Observer** (Observe).
- City pigeon: **Scout** (Scout) or **Observer** (Observe).
- Goat/sheep/pig: **Finder** (Find) or **Trail Partner** (Stay and route work).
- Chicken: **Finder** (ground-level Find) or **Observer** (photo pose and settle).
- Cattle/horse: **Trail Partner** (route work) or **Observer** (calm field-photo work).

Commands only expose leads the existing world/field authority has already made
eligible. A companion cannot manufacture an OSM business, a provider fact, a
species occurrence, access permission, or a reward.

## Care, food, items, and memories

Care is light, optional, and visible: Pet, Feed, Play, Rest, and Groom where
appropriate. The animal reacts through animation and sound. There is no hunger
decay, sickness simulation, breeding, death, abandonment timer, or combat.

Food, training toys, and accessories are Backpack items with provenance and
quantity. The first companion flow provides a reusable training ribbon or
dummy so it cannot be blocked by store stock. Food may be bought or earned, but
ordinary care is always possible without a purchase.

The Journal records only meaningful moments: first companion, chosen name,
first successful command, Trusting, specialization, Bonded, mastery, a first
wildlife companion, and player-saved photo memories. Routine care and repeat
training stay in the companion history instead of flooding the Journal.

## One companion interface

`Companions` is one destination inside the Field Kit with five views:

- **Active** — relationship, level, XP reason, next meaningful unlock, quick
  Care/Call/Stay/Ability controls, and current travel state.
- **Collection** — owned individuals, favorite/archive controls, species link,
  appearance/personality, best bond, and important memories.
- **Training** — available exercises, best result, requirements, and reset.
- **Challenges** — finite personal goals and regional/seasonal companion goals.
- **Help** — short contextual rules, safety, XP sources, and recovery.

The Field Guide remains species-first. A species page adds `Companions owned`,
`Best bond`, and `View companions`; it does not become a duplicate pet
inventory. Profile shows active companion, total befriended, Bonded count,
mastered count, and favorite memories.

The first companion flow teaches itself through prompts in the world. It never
opens a long tutorial before the player has met an animal.

## Natural player language

Buttons are verbs: `Watch`, `Wait`, `Greet`, `Photograph`, `Befriend`, `Name`,
`Call`, `Stay`, `Track`, `Scout`, `Care`, `Train`, and `Set active`.

Examples:

- `The hound is watching you. Stay still and let it approach.`
- `Comfortable — you can greet it now.`
- `+12 Companion XP — field record completed together.`
- `40 XP to Recall.`
- `Copper is waiting for you.`
- `This is a game encounter, not a report of wildlife at this location.`

Do not show `procedural encounter`, `virtual unlock`, schema names, authority
classes, evidence pipelines, diagnostic progress fractions, or deployment
language to players.

## Live GPS, AR, multiplayer, and trust

- Free roam and Live GPS call the same companion event authority. Live GPS
  contributes only qualified foreground activity receipts; raw routes are not
  saved or uploaded for companion progress.
- AR supports owned companions only, stays local to the camera session, and
  reflects learned pose/recall/ability reactions. Camera frames remain neither
  stored nor uploaded.
- Room presence may contain only sanitized presentation state: appearance ID,
  bounded display name, level band, bond stage, accessory IDs, current emote,
  and a version. Remote clients cannot award XP, change ownership, or train it.
- Anonymous players keep a complete local collection. Any later account import
  must preview conflicts and merge explicitly; it must never silently overwrite
  local animals.
- Companion ownership transfer, competitive rewards, and scarce shared rewards
  require server transactions. They are out of first-release scope. Every
  first-release companion remains non-tradeable.

## Release slices and acceptance

Implementation proceeds as complete vertical slices:

1. **Domestic dog — verified foundation:** encounter, observation, trust, naming, persistence,
   following, vehicle boarding, explained XP, Recall training/command,
   Journal/Guide/Profile projections, AR, reload, desktop, and 390×844 mobile.
2. **Eligible game wildlife:** city-pigeon observation and photography,
   persisted trust, naming, bird follow/perch behavior, Scout training, safety
   language, reload, desktop, and mobile.
3. **Collection depth:** cat archetype, duplicates, favorites/archive, all five
   Companion views, care/items, challenges, Expedition and Live GPS receipts,
   level table, specialization, and mastery.
4. **Rural companions — foundation verified, depth incomplete:** cattle,
   sheep, goat, chicken, pig, and horse are farm-context-eligible individual
   companions with distinct models, scale/follow limits, specialties,
   persistence, duplicate-safe collection rows, mobile budgets, and a vehicle
   waiting rule. Species-specific ambient behavior, fences, sound, complete
   observation/photography, rural Guide journeys, and persistence through a
   naturally completed farm encounter remain to finish this slice.
5. **Bounded social presentation:** sanitized remote companion presence,
   disconnect/rejoin recovery, reduced mobile LOD, and no client-authoritative
   ownership or rewards.

Permanent browser journeys must cover both first-companion paths, failure and
recovery, wrong action, walking away and returning, no suitable encounter,
rename validation, duplicate identity, save/reload, schema migration, corrupted
record recovery, active switching, world and vehicle transitions, qualified and
unqualified Live GPS, AR denial/fallback, multiplayer join/leave, offline local
play, anti-farming, XP pacing, Journal noise, and mobile performance.

A slice is done only when the complete player journey works in the current
installed browser and its screenshots, visible behavior, persistence, and
current-contract assertions have been inspected. Old tests are evidence only
when their assertions still match this contract.
