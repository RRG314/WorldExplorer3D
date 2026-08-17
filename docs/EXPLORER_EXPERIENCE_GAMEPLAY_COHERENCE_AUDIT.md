# World Explorer 3D — Explorer Experience and Gameplay Coherence Audit

Date: 2026-08-17
Status: pre-implementation design gate
Scope: the current local working release, including the uncommitted World Discovery and AR work

## Outcome

The current release contains a usable detector state machine, a strong fishing
mini-game, deterministic encounter planning, safe persistence, bounded ambient
wildlife, a real companion follower, a real AR/3D presentation service, Live GPS,
route games, and a concise first-session tutorial. Those are useful foundations.

It does **not** yet contain one coherent Explorer game. The dominant failure is
not visual styling. It is a broken action-to-consequence contract:

- 23 of the 25 catalog activities are presented as if they are distinct systems,
  but every non-detector, non-fishing activity uses the same locate, hold for 1.8
  seconds, reveal, and record session;
- the visible tool, action animation, world reaction, saved record, Guide entry,
  Journal event, Collection object, rank progress, and next goal are not one
  transaction;
- Field Guide, Collection, and the thing labeled Journal are overlapping views of
  the same saved records, while no chronological Journal exists;
- the strongest implemented systems — fishing, AR, route games, Live GPS, Ocean,
  ambient wildlife, and companions — remain partially or entirely outside the
  Explorer history and progression model;
- UI copy frequently describes a future interaction rather than the interaction
  the player can see now.

The implementation must therefore begin with one Explorer event model and one
visible action-result pipeline. Adding more species, cards, buttons, or tooltips
before that would multiply the incoherence.

## Evidence and method

This audit traced UI controls to their handlers, state machines, persistence,
world presentation, audio, progression, analytics, and downstream views. It also
inspected the current Baltimore build at `http://127.0.0.1:4192/app/` on desktop,
the existing 390 × 844 capture, and the focused Discovery/AR browser journey.

Primary implementation evidence:

- `app/index.html`
- `app/js/discovery/*`
- `app/js/ar/*`
- `app/js/fishing-game.js` and `app/js/fishing/*`
- `app/js/activity-discovery/*`
- `app/js/live-gps/*`
- `app/js/ocean.js` and `app/js/ocean/*`
- `app/js/tutorial/*`
- `js/analytics.js`
- `index.html` and `styles/landing.css`
- `scripts/test-world-discovery-browser.mjs`

The recommended onboarding follows the current platform guidance to teach the
core loop through play, one action at a time, with contextual help and a replay
path. See [Apple's game onboarding guidance](https://developer.apple.com/app-store/onboarding-for-games/)
and [Human Interface Guidelines: Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding).
The HUD and workspace recommendations use progressive disclosure: keep essential
actions visible and reveal detail only when it becomes relevant. See
[Human Interface Guidelines: Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls).

The earlier comparison with [Rift Rangers](https://riftrangers.com/) is useful for
marketing hierarchy and proof, not for copying its art, voice, or game framing.

---

# 1. Current exploration-system audit

## 1.1 System inventory

| System | Current implementation | Player-visible reality | Verdict |
|---|---|---|---|
| Explorer entry | `Field Journal & Activities` inside Modes | Opens the Discovery workspace | Functional, poorly named and placed |
| Context awareness | Compiled environment cells and up to 8 contextual actions | Eight buttons can appear, all labeled `Field action` | Functional, poorly communicated |
| Metal detector | Dedicated sweep, signal, refine, classify, excavate, reveal, collect state machine | Bearing, meter, tone when audio is active, held detector, floating generic token | Functional but presentation incomplete |
| Excavation | Resolves trowel or shovel by depth | Text names the tool; detector remains in hand; no digging or ground response | Misleading |
| Generic field activities | One shared locate/hold/reveal/record state machine | Inspect, photo, geology, wildlife, weather, archaeology, drone, sonar, dive, and other labels mostly play identically | Misleading placeholder framework |
| Fishing | Full cast, bite, hook, tension, reel, fish fight, catch and loss flow | Strong visible mini-game and catch history | Meaningful and visible, but siloed |
| Wildlife | Bounded deterministic ambient animal actors | Animals move in the world but cannot be the exact subject of the nearby observation action | Visible, disconnected |
| Plants/fungi | One dandelion record; no fungi catalog | Generic field point can reveal a dandelion model/reference | Incomplete |
| Geology | Granite and quartz records; heavy sand; one fossil representation | Hammer/pan/brush labels use the generic field flow; only a few dedicated models | Functional scaffold, not a geology system |
| Gems/ores/metals | Detector finds and one quartz mineral; no gem/ore guide | No category or progression path | Missing |
| Fossils | One shell-impression cast | Generic observation; brush is not visibly used | Placeholder-scale |
| Photography | `Photograph` generic activity; AR waterfowl tap challenge | No actual in-world shutter/composition/photo artifact; AR count is session-only | Misleading/incomplete |
| Wildlife tracking | Deer sign, mallard, pigeon records | Generic bearing and hold; no clue chain or connection to ambient actor | Placeholder-scale |
| Beachcombing | Sea-glass record | Generic bearing and hold with trowel | Functional scaffold |
| Sonar and diving | Catalog activities and generic field records | Do not enter or use the actual Ocean/submarine sonar presentation | Misleading |
| Ocean | Separate submarine, bathymetry, HUD sonar, reef and fish life | Visually meaningful environment, no shared Explorer record pipeline | Meaningful, disconnected |
| Astronomy | One sky observation record and a telescope catalog entry | Generic field-lens fallback and generic hold action | Misleading |
| Places/history | Survey/urban/archaeology/treasure/delivery/search labels | Mostly generic field actions; route games are a separate, more concrete system | Fragmented |
| Creation-related field work | Farm plot, forest survey, camp | After recording, places a fence, sign, or wooden floor | Meaningful consequence, poorly surfaced |
| Companions | 3 catalog companions; adopt, activate, feed, train, AR; follower runtime | Active companion follows and animates; adoption/feed/train happen through menu values | Mixed: follower meaningful, care state-only |
| AR | Spatial AR when supported, camera overlay fallback, interactive 3D fallback | Real viewer/camera lifecycle and animated models | Meaningful presentation, no durable result loop |
| Live GPS | Permission gate, foreground watch, pause/resume/stop, movement HUD | Meaningfully moves the explorer without world reloads | Meaningful input, no Journal visit/story integration |
| Field Guide | Aggregate IndexedDB store by catalog ID | A list of already observed records, sometimes with real reference photo and AR button | Functional, incomplete purpose |
| Journal | No Journal store | The Journal tab contains Field Guide and Collection | Misleading |
| Collection | Every discovery item instance | Contains observations, weather, surveys and photographs as if all were owned items | Semantically incorrect |
| Inventory | No Explorer inventory UI/store | Players can infer Collection is inventory, but the app does not define it | Missing |
| Equipment | 17-tool entitlement catalog, all free | Read-only raw capability list; no equip, compare, upgrade, mastery, or current state | Placeholder/misleading |
| Tool mastery | `toolMastery` field in profile | Never updated or displayed | Dead state |
| Equipped tool | `equippedToolId` field and runtime snapshot | Hard-coded/default detector; activity silently chooses presentation tool | Misleading |
| Explorer rank | Four ranks from total Collection count | New deterministic slot indexes/rarity bands unlock at 0/3/10/24 records | Functional, opaque and gameable |
| Disciplines | Five counter buckets | Same milestone labels repeated across all five | Functional data, weak design |
| Regional completion | Counts records/families/activities by world identity | Raw/opaque regions shown as `Started`, `Surveyed`, `Well documented` | Functional data, not a player story |
| Achievements | No Explorer achievement system | Milestone arrays are internal only | Missing |
| Personal Museum | Automatic top rare/recent item projection | Copy says `Arrange`; there are no arrangement controls or durable layout | Misleading placeholder |
| Trading | Eligibility rules and server-receipt groundwork | Status-only list; no offer, browse, accept, or trade result | Placeholder; should remain hidden |
| Profile integration | Discovery IndexedDB and optional receipt sync | Account/creator profile does not present Explorer rank, regions, discoveries, companions, or history | Missing |
| Landing page | Stronger player-centered marketing with current-build images | Copy overstates distinct wildlife/geology/tool/progression behavior | Professionally structured, truth gap |
| Onboarding | Optional 3-step move 12 m, choose activity, record | Teaches entry into the generic flow but not result destinations or return reason | Good foundation, incomplete loop |
| Help | Per-activity 3-step quick guide | `?` does not explain Field Guide, Journal, Collection, rarity, evidence, regions, or icons | Misleading scope |
| Sound | Detector oscillator only | No reliable resume path if AudioContext is suspended; no other Explorer SFX | Nearly absent |
| VFX/haptics | Detector meter and rotating reveal/ring | No particles, ground response, camera flash, tool contact, celebration, or haptic contract | Incomplete |
| Persistence | IndexedDB profile/items/claims/Guide/companions; fishing localStorage; tutorial localStorage | Durable locally, but split into silos and loses human-readable place history | Technically sound, semantically fragmented |
| Analytics | Sanitized world sessions, mode/environment changes, tutorial and discovery events | Safe and bounded; incomplete Explorer funnel | Good foundation, insufficient product coverage |

## 1.2 Current action and consequence table

Status meanings:

- **Visible** — the world/avatar and result are perceptible.
- **Poorly communicated** — real function exists but destination/result is unclear.
- **State-only** — state changes without a matching world action.
- **Placeholder** — framework/copy claims a mechanic that is not substantially present.
- **Duplicate** — same event appears as different products or destinations.
- **Misleading** — label promises a different consequence than the code presents.

| UI action | What code/state actually does | Visible world/avatar / animation / audio | Result, progress and later location | Status |
|---|---|---|---|---|
| Open `Field Journal & Activities` | Opens Discovery on Explore tab and refreshes stores | Large right panel; no world action | None | Poorly communicated |
| Minimize | Hides panel; active actions expose resume pill | World becomes visible; no animation/audio | Session remains in memory | Visible |
| `?` Help | Opens tutorial for selected activity only | Three text steps | Marks tutorial ID read | Misleading as workspace help |
| Select any field action | Changes active ID, resets the other session, selects one presentation tool | Panel title/tool later changes | Emits `activity_started` before actual start | Poorly communicated; analytics premature |
| Detector `Start Sweep` | Chooses nearest progressive unclaimed slot and closes panel | Detector appears while walking; meter/bearing; tiny whole-holder sway; optional beep | No progress until collect | Functional, poorly communicated |
| Detector `Refine Signal` | Checks 16 m range and reveals signal/depth class | Text/meter only | No durable state | Functional, low feedback |
| Detector `Excavate` | Resolves trowel/shovel internally and waits 1.25 s | Detector stays equipped; no dig pose, soil, hole, debris, tool contact, or excavation sound | No durable state | Misleading |
| Detector reveal | Sets one generic coin cylinder and ring at ground + 2.8 m | Floating rotating token, not the catalog find | Inspect only via text | Placeholder presentation |
| Detector `Collect` | Writes item, claim, Guide aggregate, rank/discipline counters; optional server receipt | Panel text changes | Same record appears in Guide and Collection; no Journal event/reveal summary | Functional, duplicate destination |
| Detector `Leave` | Marks session left; stable claim remains | Reveal disappears | No Journal event | Functional, low feedback |
| `Inspect` / `Survey Area` | Generic locate/hold/reveal/record | Field lens and generic evidence model | Record goes to Guide + Collection | Placeholder |
| `Photograph` | Generic locate/hold/reveal/record | Camera held in fixed raised pose; no composition, shutter, flash, photo capture or sound | `Rock Pigeon Record` can appear in Guide + Collection | Misleading |
| `Inspect Geology` | Generic locate/hold/reveal/record | Hammer held but never strikes; a granite/quartz model can pop in | Guide + Collection + Earth Science counter | Placeholder-scale |
| `Pan Virtual Sediment` | Generic locate/hold/reveal/record | Pan held but never dips, swirls, drains or reveals concentrate | Guide + Collection | Misleading |
| `Document Fossils` | Generic locate/hold/reveal/record | Brush may be held but never contacts or cleans matrix | Guide + Collection | Misleading |
| `Forage Virtually` | Generic locate/hold/reveal/record | Field lens; dandelion can pop in | Guide + Collection | Placeholder; wording risk |
| `Track Wildlife` | Generic locate/hold/reveal/record | Binoculars fixed to pose; no clue chain; ambient animal is unrelated | Guide + Collection | Misleading |
| `Place Trail Camera` | Generic locate/hold/reveal/record | Field camera held; no camera is placed or revisited | Guide + Collection | Misleading |
| `Beachcomb` | Generic locate/hold/reveal/record | Trowel held; sea glass can pop in | Guide + Collection | Functional scaffold, low feedback |
| `Run Sonar Survey` | Generic locate/hold/reveal/record | Falls back to field lens; does not use boat/Ocean sonar | Generic depth-profile record in Guide + Collection | Misleading |
| `Dive Virtually` | Generic locate/hold/reveal/record | Falls back to field lens; does not enter Ocean or equip dive kit | Generic habitat record | Misleading |
| `Observe Night Sky` | Generic locate/hold/reveal/record | Falls back to field lens; no telescope/sky target | Generic sky record | Misleading |
| `Launch Survey Drone` | Generic locate/hold/reveal/record | Falls back to field lens; no drone launch/flight/camera | Aerial frame record | Misleading |
| `Record Weather` | Generic locate/hold/reveal/record | Falls back to field lens; does not visibly sample the live weather HUD | Generic weather note | Misleading |
| `Document Virtual Archaeology` | Generic locate/hold/reveal/record | Trowel held; no excavation/cleaning/context reconstruction | Guide + Collection | Placeholder |
| `Follow Treasure Clue` | Generic locate/hold/reveal/record | Shovel held; no multi-step clue or cache | One clue-page record | Misleading |
| `Plan Virtual Farm Plot` | Generic field record then place fence | Fixed tool pose, then visible fence | Guide + Collection + persistent world edit | Visible consequence, poor setup |
| `Survey Forest Health` | Generic field record then place sign | Fixed lens pose, then visible sign | Guide + Collection + persistent world edit | Visible consequence, poor semantics |
| `Set Virtual Camp` | Generic field record then place wood floor | Fixed lens fallback, then visible floor | Guide + Collection + persistent world edit | Misleading label, visible edit |
| `Urban Exploration Survey` | Generic locate/hold/record | Field lens fallback | Generic urban note | Placeholder |
| `Start Local Delivery` | Generic locate/hold/record | Field lens fallback; no pickup, cargo, route, destination, or vehicle work | Generic service note | Misleading; route system should own it |
| `Run Virtual Search` | Generic locate/hold/record | Field lens fallback; no search area, clues, rescue target or drone | Generic result | Misleading |
| `Fish` | Opens dedicated fishing game | Cast/bite/fight/fish portrait/world fish; no Explorer audio | Separate catch history and leaderboard | Visible, but disconnected |
| Companion `Approach/Offer/Adopt` | In-memory step increments; step 3 writes companion | Menu text changes; adopted companion can then appear/follow | Companion store; telemetry | State-only until adopted |
| Companion `Make Active` | Marks one companion active | Companion appears and follows with movement animation | Persists active ID | Meaningful and visible |
| Companion `Feed` | Increments fullness/trust | Menu numbers only; no feeding pose/object/response/audio | Companion store | State-only |
| Companion `Train Find` | Increments training counter | Menu numbers only; no training action or gameplay benefit | Companion store; no capability unlock | State-only / placeholder |
| Companion `View in AR` | Opens AR capability preview then viewer/camera/spatial session | Animated model in AR/3D | No Journal entry/progress | Visible, disconnected |
| Guide/Collection `Place in AR` | Opens supported record in AR/3D | Supported model; unsupported records have no button | No durable action result | Visible presentation |
| `AR Field Challenge` | Creates four virtual mallards; tap each once | Animated targets and count; no capture artifact/audio | Completion disappears when session ends | Visible, state-only result |
| Equipment card | Renders tool label and raw capabilities | No action | No equipped/mastery/upgrade change | Placeholder |
| Expedition tab | Renders counters, equipment, museum and exchange | Large read-only dashboard | Emits `museum_viewed` even if museum is not viewed | Misleading analytics |
| Museum cards / recipes | Auto-selects rare/recent records every refresh | Text only | No durable arrangement | Placeholder |
| Online Exchange | Calculates eligibility and renders status | Text only | No trading workflow | Placeholder; unnecessary now |
| Live GPS start/pause/resume/stop | Owns walking translation from real GPS, with safety limits | GPS HUD and real movement | No visit, distance or Journal event | Meaningful, disconnected |
| Route game `Start Activity` | Starts checkpoint runtime | Markers, route progress and completion | Separate local completion history | Meaningful, disconnected |
| Ocean mode | Starts separate submarine environment | Submarine, bathymetry, fish/reef, sonar HUD | No shared discovery/Journal/progression | Meaningful, disconnected |

## 1.3 Catalog and visual-content depth

The Discovery catalog currently has:

- 17 tools;
- 25 activity labels;
- 6 metal-detector finds;
- about 18 broad field records;
- 3 companions;
- 10 reference-image assets mapped to 11 catalog IDs;
- dedicated world models for granite, quartz, dandelion, shell cast, and sea glass;
- a generic ring plus octahedron fallback for most other records;
- 14 fish species in a separate fishing catalog.

It does not yet have the depth implied by the proposed Field Guide categories:

- wildlife records are effectively deer sign, mallard, and pigeon;
- plants are effectively dandelion; fungi are absent;
- geology is granite, quartz and sand; gems and ores are absent;
- fossils have one representation;
- ocean discovery records are a sonar profile and generic habitat record, not
  the actual Ocean fish/reef/wreck/geology world;
- astronomy, history, treasure, weather, archaeology, jobs and search each have
  one generic record type or less.

This is acceptable as a vertical-slice catalog only if the UI says so. It is not
acceptable as a complete Field Guide.

---

# 2. Every action currently lacking visible consequences

These actions change state, start a generic session, or claim a result without a
credible matching world/avatar consequence:

1. detector excavation choosing shovel/trowel;
2. detector collection and rank increment;
3. inspect/classify;
4. photography;
5. geology hammering/sampling;
6. sediment panning;
7. fossil brushing/cleaning;
8. foraging;
9. wildlife clue investigation;
10. trail-camera placement;
11. sonar survey;
12. virtual dive;
13. astronomy observation;
14. drone survey;
15. weather observation;
16. archaeology documentation;
17. treasure clue progression;
18. urban survey;
19. delivery job;
20. virtual search/rescue;
21. companion approach/trust/adoption steps before the follower appears;
22. companion feed;
23. companion training;
24. AR challenge completion;
25. museum arrangement/readiness;
26. trading/open exchange;
27. tool equip/favorite/mastery fields;
28. discipline milestone achievement;
29. regional completion;
30. fishing catch contribution to Explorer history;
31. route-game completion contribution to Explorer history;
32. Ocean exploration contribution to Explorer history;
33. Live GPS distance/visit contribution to Explorer history.

The implementation rule is simple: until an action has a visible use phase and
a visible result phase, it must be hidden, labeled `Preview`, or described as a
recording action rather than presented as finished gameplay.

---

# 3. Placeholder or misleading controls

## Must be replaced or hidden in the core rebuild

- `Equipment` cards: no equip action, no selected state, no upgrade, no mastery.
- `Personal Museum · Arrange`: no player arrangement or saved layout.
- `Online exchange`: no trade workflow.
- `Train Find`: no find behavior or capability effect.
- `Place Trail Camera`: no placed camera object or later retrieval.
- `Launch Survey Drone`: no drone launch.
- `Run Sonar Survey`: no sonar presentation.
- `Dive Virtually`: no Ocean/dive transition.
- `Observe Night Sky`: no telescope or target.
- `Record Weather`: no visible connection to current live conditions.
- `Start Local Delivery`: no job route.
- `Run Virtual Search`: no search mechanic.
- `Photograph`: no photo mechanic or saved photo.
- `Excavate`: no visible excavation tool or ground response.
- `Place in AR`: accurate only for a small allowlist and often means an
  interactive 3D viewer rather than physical placement.
- `Journal`: not a chronological journal.
- `Field Guide Help` expectation: the existing `?` only explains one tool.
- `Your free testing loadout`: internal release language visible to players.
- hard-coded `equippedToolId: metal-detector`: not authoritative equipped state.
- museum analytics on opening all of Expedition: wrong event semantics.

## Duplicates and unnecessary exposure

- `Field Journal & Activities` versus `Games & Activities` uses `activity` for
  two unrelated systems.
- Field Guide aggregate and Collection instance are rendered together under a
  tab called Journal.
- fishing catch history duplicates the role of Journal/Collection.
- route-game completion history duplicates the role of Journal.
- AR and Ocean expose Explorer-worthy events that vanish or live in their own
  runtime only.
- multiplayer controls appear inside the Games menu even though Multiplayer is
  already a primary product section.

---

# 4. Field Guide / Journal / Inventory / Collection overlap

| Concept | Correct question | Current state | Required ownership |
|---|---|---|---|
| Field Guide | What exists, what have I identified, and what remains? | Aggregate of observed catalog IDs only | Canonical catalog index with categories, unknown entries, evidence key, regional occurrence, observation summary |
| Journal | What happened to my Explorer, where, and when? | Does not exist | Chronological immutable Explorer events with readable place, map return, action, result and milestone |
| Collection | What distinct virtual objects/specimens/catches do I own or preserve? | Every record instance, including weather and surveys | Only specimen-like or authored collectible instances; catches may be trophies; observations are not items |
| Inventory | What consumable or countable supplies do I carry? | Does not exist | Do not add unless supplies/crafting become real; otherwise omit the word entirely |
| Gear | What can I equip and what does it enable? | Read-only entitlement list | Loadout, equipped state, capability, mastery, upgrade and contextual `How to use` |
| Profile | Who am I as an Explorer? | Separate account/creator surfaces without Explorer story | Rank, specialties, regions, milestones, favorite finds, active companion, recent expedition summary |

## Event routing rule

One action may update more than one projection, but each projection must answer a
different question:

```text
Explorer event: photographed a mallard in Baltimore
  -> Journal: chronological event with place/time/tool
  -> Field Guide: Mallard now identified; observation count +1
  -> Collection: unchanged (a photograph is not a mallard item)
  -> Media: one saved virtual photo artifact, if the photo mechanic produced it
  -> Progress: Nature specialty and Baltimore regional goal
  -> Profile: recent highlight only
```

```text
Explorer event: excavated a brass token
  -> Journal: chronological find event
  -> Field Guide: token type identified
  -> Collection: one token instance
  -> Progress: Places & History specialty and regional goal
  -> Profile: recent highlight only
```

---

# 5. Progression problems

1. Rank is total Collection count, so weather notes, duplicate observations,
   specimens, photos and service notes all have the same value.
2. The same catalog entry can increase Guide count and Collection count even
   when no collectible exists.
3. Rank unlocks hidden slot indexes and rarity access, not understandable new
   capabilities.
4. The UI says `more local opportunities unlock` without naming what or why.
5. All 17 tools are already available, so the tool catalog cannot create a gear
   journey.
6. `toolMastery`, equipped tool and favorites are dead fields.
7. Five disciplines use the same four milestones, making them counters rather
   than specialties.
8. `creation` is mixed into field science progression while the real builder is
   a separate product system.
9. `history-service` combines history, archaeology, delivery, rescue, drone and
   detector actions without a coherent identity.
10. Regional progress uses opaque world IDs and raw counts rather than named
    place goals.
11. No first-visit, distance, expedition, rare find, full category, tool use,
    challenge, catch, AR, Ocean or companion milestones become Explorer history.
12. No unlock reveal explains what changed or demonstrates the new capability.
13. Rank and specialties do not appear on the account/profile.
14. There is no visible current goal or optional follow-up after recording.
15. Museum recipe availability is calculated but cannot be acted on.
16. Achievements do not exist as durable player-facing records.
17. Analytics cannot currently distinguish `noticed`, `started`, `used tool`,
    `revealed`, `resolved`, `viewed result`, `set next goal`, and `returned`.

## Recommended progression model

Use one **Explorer Rank** and three optional specialties:

- **Nature** — wildlife, plants/fungi, fishing and marine life;
- **Earth** — rocks, minerals, gems/ores, fossils and detector materials;
- **Places** — landmarks, history, archaeology, mapping and documented routes.

Exploration itself is the shared rank, not a fourth grind bar. Creation,
multiplayer moderation, driving and creator publishing keep their existing
systems and may contribute Journal milestones without becoming fake field
disciplines.

Explorer Rank should use weighted milestones:

- unique Guide identifications;
- completed regional goals;
- first successful use of a real tool capability;
- meaningful expedition/challenge completion;
- limited repeat-credit only when it adds a new region, season, evidence type,
  size/trophy class or quality tier.

Ranks must unlock named capabilities, for example:

- starting kit: field lens + camera;
- first completed record: Journal and local regional goal;
- next rank: choose detector, geology or tracking kit;
- specialty milestone: improved signal discrimination, sample cleaning,
  binocular focus, better catch information, or new evidence type;
- regional milestone: a named follow-up expedition, display slot or cosmetic;
- advanced rank: Ocean/AR research challenges and harder multi-step encounters.

No core world access should be paywalled by this progression.

---

# 6. Missing animation, audio and feedback

## 6.1 Presentation gap table

| Action | Equip/ready | Use loop | Contact/world response | Reveal/result | Audio/haptic |
|---|---|---|---|---|---|
| Detector | Mesh appears | 0.025 rad holder sway | None | Floating generic token | Fragile short sine beep |
| Shovel/trowel | Mesh exists but is not selected during detector excavation | None | No soil/hole/debris | None | None |
| Rock hammer | Mesh appears | None | No strike/chip/dust | Model pops in | None |
| Brush | Mesh appears | None | No brush stroke/dust clearing | Model pops in | None |
| Sediment pan | Mesh appears | None | No water/sediment swirl | Model pops in | None |
| Camera | Fixed raised arm | None | No focus/shutter/flash/frame | Reference card later | None |
| Binoculars | Fixed raised arm | None | No zoom/focus/target lock | Generic reveal | None |
| Fishing rod | Dedicated gameplay presentation | Cast/fight/reel feedback | Fish responds in world | Catch card/history | No dedicated sound pass found |
| Sonar | Catalog only in Explorer | None | None | Generic record | None |
| Trail camera | Catalog only | None | No placed object | Generic record | None |
| Survey drone | Catalog only | None | No drone | Generic record | None |
| Weather kit | Catalog only | None | No sampling | Generic record | None |
| Telescope | Catalog only | None | No sky target | Generic record | None |
| Companion care | Menu buttons | None | No item/animal response | Number refresh | None |
| Discovery completion | Panel text | None | No world celebration | Guide/Collection refresh | None |
| Rank unlock | Counter refresh | None | None | Vague next-rank copy | None |
| AR challenge | Animated mallards | Tap removes target | Target vanishes | Count and completion line | None |

## 6.2 Required action-consequence contract

Every shipped Explorer action must implement these presentation hooks:

1. `notice` — a world clue, sound, marker or contextual prompt;
2. `equip` — visible avatar/first-person tool transition and HUD state;
3. `use:start` — pose and tool-specific first feedback;
4. `use:loop` — continuous animation/feedback while held;
5. `contact` — world surface/object responds;
6. `reveal` — category-specific reveal and identification moment;
7. `resolve` — Record, Collect, Release, Leave, Place, or Complete;
8. `persisted` — saved event with explicit destination labels;
9. `progress` — visible progress delta or `No rank credit — already documented`;
10. `follow-up` — optional next reason to explore.

The deterministic presentation test should fail if a capability is exposed in
the UI without the required hook set for its release tier.

## 6.3 Feedback tiers

- **Tier A — complete mechanic:** unique equip/use/contact/reveal/result hooks,
  persistence, progression, help and mobile support. May appear in Explore.
- **Tier B — recording action:** honest `Record a field note` behavior with a
  real visible note/photo/sample result. May appear when labeled accurately.
- **Tier C — preview:** viewer or prototype with no progression promise. Must be
  labeled Preview and live outside the core loop.
- **Hidden:** no credible world consequence. Do not show as available gameplay.

---

# 7. Recommended new Explorer loop

## The loop

```text
ARRIVE at a real place
  -> NOTICE one nearby lead in the world
  -> INVESTIGATE the clue or subject
  -> EQUIP the recommended owned tool
  -> USE it with visible avatar + world feedback
  -> REVEAL a specific discovery
  -> INSPECT the result and its evidence/source meaning
  -> RESOLVE: record / collect / release / leave / complete
  -> REVIEW one compact result card
       Journal event + Guide update + optional Collection item + progress delta
  -> CHOOSE an optional follow-up goal
  -> CONTINUE exploring or put the HUD away
```

## Interaction rules

- Show one best nearby lead and at most two alternatives, not eight equal
  buttons.
- The world prompt names the subject category and action, not an internal
  activity ID: `Fresh tracks nearby · Inspect`.
- Choosing the action equips or recommends the tool; it does not open a large
  dashboard.
- During play, show only current goal, equipped tool, action input and immediate
  feedback.
- The full Explorer workspace is for review/loadout, not moment-to-moment action.
- A discovery result card must say exactly where the result went:
  `New Guide entry`, `Journal updated`, `Specimen added to Collection`,
  `Nature +1`, `Baltimore wetlands 1/3`.
- Repeat discoveries explain their value: new region/evidence/quality, or no rank
  credit.
- The player may dismiss the goal and all nonessential HUD.

## First hour

| Time | Player experience | Capability taught | Visible payoff |
|---|---|---|---|
| 0–5 min | Arrive, move, notice one highlighted nearby clue | movement + notice | world prompt, not a menu list |
| 5–12 min | Inspect/photograph the clue with starting tool | equip + use + reveal | first Guide entry and Journal event |
| 12–20 min | Open the result from the reveal card | Guide vs Journal distinction | named region goal appears |
| 20–35 min | Choose one starter specialty kit | loadout and capability | detector/geology/tracking mechanic visibly differs |
| 35–45 min | Complete a second multi-phase action | tool contact + result choice | first Collection specimen or photo artifact |
| 45–55 min | Encounter active wildlife/companion or fishing lead | living-world connection | meaningful world response |
| 55–60 min | Complete a 3-part local goal | progression + return reason | rank/specialty unlock and next expedition suggestion |

The onboarding remains skippable and replayable. It ends only after the player
opens or acknowledges the first saved result and sees the next optional goal.

---

# 8. Recommended information architecture

## 8.1 During play: compact Explorer HUD

Only visible when relevant:

```text
[Current lead / optional goal]             [Dismiss]
[Equipped tool] [Use / Hold / Cancel] [signal or progress]
```

Default state is fully collapsed. The current lead pill appears after a real
notice trigger. No rank dashboard, catalog, museum, trading or companion care is
permanently on screen.

## 8.2 Explorer workspace

Rename the workspace to **Explorer Journal** and use five destinations:

1. **Today**
   - current optional goal;
   - chronological recent events;
   - expedition summary;
   - return to location/map.
2. **Field Guide**
   - Overview;
   - Wildlife;
   - Plants & Fungi;
   - Geology;
   - Fossils;
   - Places & History;
   - Ocean;
   - search/filter;
   - unknown entries;
   - permanent `How This Works` key.
3. **Collection**
   - actual owned specimens, finds, catches/trophies and created media only;
   - filters and detail;
   - no weather/survey/animal ownership confusion.
4. **Gear**
   - equipped tool and small loadout;
   - owned tools;
   - capability, mastery and next upgrade;
   - `Equip`, `How to use`, and contextual availability;
   - companions as a distinct subarea only after adoption.
5. **Progress**
   - Explorer Rank;
   - three specialties;
   - named regions and goals;
   - milestones/achievements;
   - link to Explorer Profile.

Museum and trading are removed from the core workspace until their interactions
exist. A real museum later becomes a place/building experience and a profile
showcase, not an automatic list. Trading later belongs in an explicit safe
exchange screen, not a collapsed details block inside progression.

## 8.3 Product-level boundaries

| Product area | Owns | Does not own |
|---|---|---|
| Explorer | noticing, tools, discoveries, Journal, Guide, Collection, gear, rank, regions | user-created route editor, multiplayer administration |
| Games | authored routes, races, challenges and game sessions | Field Guide and equipment |
| Build | world edits, construction, property and creator tools | fake field-science records |
| Multiplayer | rooms, friends, chat and shared sessions | Explorer progression rules |
| Profile/Account | identity, privacy, synced summaries and Explorer story | live in-world controls |

Game, Ocean, AR, GPS and multiplayer events may publish sanitized Explorer
events; they do not create competing Journals.

## 8.4 Field Guide first-open state

Do not show an empty giant database. Show:

- `Your Field Guide records what you identify`;
- the current region and 2–3 discoverable category silhouettes;
- the first completed entry;
- one `How This Works` action;
- one optional `Find another nearby` goal.

Unknown entries reveal only honest hints supported by the encounter plan. Do not
claim exact real-world species occurrence from broad biome context.

## 8.5 Landing page truth contract

The landing page hierarchy is strong enough to preserve, but every claim must be
backed by current gameplay capture and the same capability registry used by the
app. Until the rebuild ships:

- do not say all tools visibly operate;
- do not imply broad wildlife/geology catalogs;
- do not imply progression meaningfully improves equipment;
- do not imply companion trust unfolds in the world;
- label AR as camera/3D preview with device-dependent spatial placement;
- show the actual notice → tool → reveal → result sequence after it exists.

Required high-level story remains:

1. choose a real place;
2. enter it as your Explorer;
3. notice and investigate;
4. use a visible tool;
5. build a personal Journal/Guide/history;
6. travel, create, play together, use GPS/AR/Ocean, and go beyond Earth.

---

# 9. Implementation sequence

The sequence deliberately works from the core loop outward. A later phase may
not expose a capability until the prior phase's action-consequence contract is
passing.

## Phase 0 — Preserve and migrate safely

- add schema-v2 stores without deleting v1 data;
- create immutable Explorer event records and projections;
- migrate current items/Guide/companions conservatively;
- import fishing catches as Journal events/Collection trophies without deleting
  the old catch history;
- preserve claim IDs and server receipts;
- add readable place labels separately from stable world identity;
- add feature flags for the new HUD/workspace and v1 compatibility view.

Exit gate: existing local records, claims, companions and receipts survive a
v1 → v2 browser migration test and export round-trip.

## Phase 1 — Canonical Explorer event and result pipeline

- define event types for notice, activity start, tool use, reveal, resolution,
  Journal entry, Guide observation, Collection acquisition, progress and unlock;
- route detector and one field action through one transaction;
- build the compact result card with explicit destinations and progress delta;
- add a chronological Today/Journal view and map-return action;
- stop putting non-collectible observations into Collection.

Exit gate: one detector find and one wildlife/photo record each produce the
correct distinct Journal, Guide, Collection and progress projections.

## Phase 2 — Explorer HUD and information architecture

- replace the large action chooser during play with one contextual lead and at
  most two alternatives;
- implement collapsed-by-default Explorer HUD;
- rebuild workspace tabs as Today, Field Guide, Collection, Gear and Progress;
- add Field Guide categories, overview, search/filter, unknown entries and Help;
- remove Museum and Exchange from the core workspace;
- rename route content consistently to Games and field interactions to Leads or
  Field Work.

Exit gate: a new player can identify current lead, equipped tool, saved result,
Guide, Journal and next goal without documentation on desktop and mobile.

## Phase 3 — Equipment truth and visible state

- make `equippedToolId` authoritative;
- implement Equip, loadout, capability, mastery and How to Use;
- give unsupported actions no fallback claim;
- add the presentation-hook registry and release tiers;
- swap detector to trowel/shovel during excavation;
- add clear equip/put-away transitions and a small equipped badge.

Exit gate: every exposed tool has a current equipped state and its required hook
set; hidden tools cannot appear as available actions.

## Phase 4 — Three production-quality vertical slices

1. **Detector/excavation** — sweep, audio/haptic, pinpoint, tool swap, digging,
   ground response, catalog-specific reveal, collect/leave.
2. **Wildlife/photo** — world actor/clue connection, binocular/camera use,
   shutter and saved observation/photo, conservation-safe release.
3. **Geology/fossil** — visible hammer/brush/trowel contact, debris/cleaning,
   specimen inspection, collect/record distinction.

Exit gate: each slice has unique world/avatar animation, sound, VFX, persistence,
Guide/Journal routing, progression, help and mobile controls.

## Phase 5 — Progression and first-hour journey

- replace raw count rank with weighted Explorer milestones;
- implement Nature, Earth and Places specialties;
- make tool capability unlocks explicit and demonstrable;
- add current optional goal and named regional goals;
- add first discovery, first specimen, first tool choice, first upgrade, first
  region goal and first companion encounter;
- surface Explorer story on the account/profile;
- extend onboarding through result review and next goal.

Exit gate: a clean profile completes the planned first-hour journey with no
dead-end, duplicate reward or unexplained unlock.

## Phase 6 — Integrate strong existing systems

- fishing catch → Journal, Guide, optional trophy Collection, Nature progress;
- AR challenge → Journal/photo/challenge result and honest capability label;
- ambient wildlife → inspect/photo/track targets;
- Ocean → marine Guide, expedition Journal and Ocean regional goals;
- Live GPS → privacy-preserving visit/distance/expedition events;
- route games → Journal milestones without becoming Field Guide entries;
- companion care → visible feeding/training actions and real ability effects.

Exit gate: every integrated system publishes through the shared Explorer event
contract and does not maintain a competing player-history UI.

## Phase 7 — Catalog and visual-content expansion

- expand versioned catalogs by Field Guide category;
- attach source/evidence class and safe location precision;
- use licensed real reference photography where reliable;
- add optimized distinct 3D models/variants only within measured budgets;
- remove generic fallback objects from production-tier discoveries;
- add flora/fungi, broader wildlife, geology/minerals/gems/ores, fossils, marine
  life and places/history in bounded regional packs.

Exit gate: no released Guide entry uses a misleading generic object; image
license/source and model budget checks pass.

## Phase 8 — Landing, analytics and release acceptance

- replace overclaiming landing copy and captures with the completed core loop;
- instrument the complete sanitized Explorer funnel;
- measure first discovery, result comprehension, Guide/Journal return, goal
  acceptance, first-hour completion and D1/D7 return cohorts;
- run player-without-documentation sessions;
- run deterministic presentation-hook, migration, desktop, mobile, AR fallback,
  GPS privacy, memory and regression tests;
- capture detector, geology, companion, fossil, Guide and Journal acceptance
  sequences.

Exit gate: the brief's ten-point quality gate passes for every exposed action,
major focused tests pass, no regression destroys existing user data, and the
build is handed to the user for hands-on testing before commit/deploy.

## Immediate implementation order

The first code change after this audit should be:

1. Explorer event schema and v2 store;
2. projection rules for Journal/Guide/Collection/progress;
3. detector routed through the new result pipeline;
4. Today/Journal and result card;
5. compact HUD and authoritative equipped state;
6. detector excavation presentation;
7. wildlife/photo vertical slice;
8. geology/fossil vertical slice;
9. progression/first hour;
10. integrations and catalog expansion.

Do not begin by adding more cards, categories, species, tools, or landing copy.

---

## Acceptance contract for every released action

An action is not complete unless:

1. the player can find it;
2. the player understands what it does;
3. the player can activate it;
4. the avatar/tool and world visibly respond;
5. animation, sound/haptic and VFX match the action's release tier;
6. feedback explains the result;
7. state persists if appropriate;
8. the result appears in the correct Journal/Guide/Collection projection;
9. progression responds or explicitly explains why it did not;
10. mobile works with the workspace collapsed;
11. Help explains the mechanic and evidence meaning;
12. analytics captures only bounded, non-sensitive funnel events;
13. automated tests verify deterministic presentation hooks and persistence;
14. visual acceptance captures prove the action in the world, not only in UI.
