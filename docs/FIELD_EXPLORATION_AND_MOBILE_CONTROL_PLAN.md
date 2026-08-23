# Field Exploration, Ecology, Fishing, and Mobile Control Plan

Last audited: 2026-08-23 against World Explorer 3D 4.3.1 at GitHub stable
commit `9b28e2952cf22b7bb0d40be655ef9a194d0af75f`.

This document is the implementation contract for turning Live GPS Explore into
a durable real-world field game. It covers the player loop, proximity rules,
regional wildlife, insects, fish, shore fishing, progression, retention,
privacy, anti-abuse, mobile screen ownership, configurable controls, content
quality, performance, and release evidence. It is intentionally more specific
than a feature list. Nothing described here is complete because a button,
catalog entry, mock screen, or isolated demo exists.

## Implementation status — isolated Live GPS branch

As of 2026-08-23, `steven/live-gps-walking-game` starts from exact deployed
commit `8ce4dcbbf0f9dadd6ab99bc335653ce0cf2092c3`. The paused hardening program is
preserved at `steven/hardening-return-db9ffc1` and has not been mixed into this
walking-game branch.

Phase A2 now has a tested vertical slice rather than scaffolding:

- one foreground field-session authority owns GPS trust, accuracy, speed,
  pause reason, movement evidence, and privacy-safe trusted distance;
- reward proximity comes from the filtered GPS fix projected into the fixed
  world, not from a manually moved avatar;
- poor accuracy, unsafe speed, hidden-screen, signal-loss, paused-follow, and
  hard-boundary conditions visibly hold interaction and recording;
- Activities contains a stable three-stop `FIELD TODAY` expedition selected
  from generated, unlocked field opportunities;
- all three stops run through the existing tool, ExplorerEvent, Journal, Field
  Guide, rank, and one-time claim spine; no second reward owner was added;
- a deterministic 390×844 Chrome journey completes all three stops, records
  3/3, advances the shared field record count, and verifies camera follow,
  active GPS watch, accuracy hold, vehicle-speed hold, zero browser errors, and
  zero failed local resources.

This is a local checkpoint candidate, not a production deployment. Phase A3
regional ecology, shore fishing, retained recurring programs, backend receipt
validation, physical-device evidence, and configurable semantic controls remain
open and must satisfy the gates later in this plan.

## Product direction

World Explorer should use the strongest location-game ideas—walking into range,
nearby discovery, short expeditions, rotating field work, collection goals,
routes, social outings, and long-term mastery—while remaining its own game.

The core fantasy is **becoming a capable world explorer and naturalist**, not
capturing real animals. Real species are observed, photographed, identified,
and recorded. Virtual companions, equipment, specimens, artifacts, and created
objects remain explicitly virtual and can use ownership mechanics.

Non-negotiable rules:

1. The existing direct World Explorer controls remain the default. Live GPS is
   an additional movement authority, never an irreversible replacement.
2. GPS, manual free roam, accessibility accommodation, and vehicle travel are
   different evidence classes. Rewards declare which classes are eligible.
3. A biodiversity record supports regional plausibility; it is not proof that
   a real organism is currently at the generated encounter point.
4. One authority owns each concern. Encounter logic cannot mint rewards,
   fishing cannot invent a second water map, and mobile panels cannot bypass the
   screen-layout owner.
5. No worldwide-complete claim is permitted until content, data coverage,
   licensing, quality, and representative-region gates support it.
6. Retention must come from discovery, mastery, variety, and social play—not
   punitive streak loss, unsafe prompts, manipulative scarcity, or driving.
7. The current mobile navigation is accepted for this program: Live GPS remains
   visible under the in-game Games menu. The unresolved mobile product priority
   is configurable controls that alter real gameplay and survive reload.

## Current game audit

### Foundations that are real

- Live GPS obtains explicit consent, requires a fresh fix, filters stale and
  inaccurate samples, quarantines implausible jumps, detects movement class,
  follows the walker or vehicle, pauses in the background, supports low-power
  mode, and enforces bounded-world warning/recenter/hard-pause radii.
- Discovery compiles deterministic local cells from published roads,
  buildings, land use, and water. It has nearby activities, tool requirements,
  interaction radii, hold-to-observe behavior, a Today-like Activities surface,
  Current Goal, Recent Journal, Field Guide records, regional summaries, a
  Backpack projection, companions, and Explorer points.
- Explorer records already use stable claim/event IDs in a chronological
  IndexedDB event store. Four ranks, three specialties, new-identification and
  new-region credit, and released tool unlocks at 0/8/20 points are real
  foundations that must be migrated, not silently replaced.
- Wildlife already has deterministic ambient slots, basic approach/flee
  behavior, a capped visible population, and several interaction paths.
- Fishing has a real cast/fight/catch loop, equipment state, catch records, and
  a 14-species catalog.
- A shared Backpack model, a partial screen-layout service, desktop input
  handlers, and hard-coded touch profiles already exist. The touch layer writes
  directly into Earth/Space key-state channels; one cross-device semantic input
  authority does not yet exist.
- The normal 390×844 production entry now exposes and verifies Live GPS from the
  first screen, and the in-game mobile Games menu exposes the same mode.

### What is still scaffolding or too narrow

- A manual avatar can reach the same discovery targets as a GPS player; there
  is no authoritative walking-session ledger connecting eligible movement to a
  proximity reward.
- The 25-cell discovery grid is a local activity generator, not a regional
  population, migration, season, or live-operations system.
- Ambient wildlife is effectively a few generic archetypes: rock pigeon,
  mallard, a generic small mammal, and several domestic companion variants.
  There is no production insect catalog or credible worldwide species model.
- Field records contain only a handful of wildlife/plant entries. The existing
  first-use/regional/rank goal sequence and shallow unlock thresholds teach the
  foundation but cannot sustain recurring or seasonal play.
- There are no daily field notes, weekly expeditions, routes, habitat mastery,
  seasonal surveys, collection challenges, distance rewards, research chains,
  meaningful repeat observations, or community field events.
- Normal discovery claims receive a server receipt, but the server does not
  independently validate location, movement, proximity, or session eligibility.
- The local Explorer event is richer than the server receipt: the backend does
  not own the complete Journal, Field Guide, rank/specialty projection, or an
  account/device reconciliation contract.
- Fishing is boat-only. Its 14 fish use broad water-kind and latitude filters;
  it has no shore eligibility, waterbody identity, watershed/region checklist,
  season, time, weather, temperature, salinity, current, depth, bait, or gear
  ecology.
- Underwater schools, the fishing catalog, and catch records do not share one
  authoritative fish identity/population model.
- Touch controls are fixed key-emulation profiles. There is no user action map,
  remapping, resize/reposition, handedness, opacity, sensitivity, haptics,
  conflict validation, recovery profile, or proof that settings change gameplay.
- The screen-layout service stores one activity and one panel ID, but it does
  not yet own every modal/focus/back path. The current mobile composition is
  accepted; this remains regression-hardening work, not a reason to redesign the
  menu while configurable controls are unfinished.
- Multiple style layers reposition the same touch controls at overlapping
  breakpoints. They must not be expanded with more per-mode exceptions while
  the semantic, user-configurable control authority is being introduced.

## Location-game comparison and adaptation

The comparison below uses current official Pokémon GO help material as a design
benchmark. It does not propose copying its names, art, economy, combat, or
capture mechanics.

| Proven location-game system | World Explorer today | World Explorer adaptation |
| --- | --- | --- |
| Nearby map objects require physical proximity | Nearby generated activities exist, but GPS is not reward authority | Signals reveal at distance; approach and interaction rings require an eligible field session and accuracy-aware proximity |
| Field, special, timed, and level-up research | Current Goal, regional summaries, Journal events, ranks, specialties, and tool unlocks exist locally | Preserve the Explorer event pipeline; add Daily Field Notes, authored Expeditions, timed Community Surveys, and rank/specialty Research Chapters through one lifecycle |
| Background/weekly walking progress | Foreground GPS only; no distance progression | Foreground field-session distance first; background distance only after a separate privacy, platform, battery, and abuse review |
| Routes with rewards and badges | Navigation exists; no field-route lifecycle | Curated and moderated survey routes, safe start/end, route objectives, habitat diversity, badges, and rollback-able publication |
| Buddy relationship and daily capped actions | Companion ownership/adoption exists | Separate virtual Companion Bond with walk, care, photograph, assist, mood, capped daily bond, and explorer perks |
| Rotating seasons, weather, events, and regional pools | Month/hemisphere metadata exists but barely affects species | Versioned seasonal ecology and event manifests with hemisphere, local time, weather, habitat, migration, and regional constraints |
| Collection challenges and medals | Field Guide and four ranks | Life-list challenges, observation-quality goals, habitat/region medals, specialist mastery, and seasonal atlas completion |
| Stops/resource hubs and first-visit discovery | Mapped places and activity anchors exist, but there is no moderated field-service node | Field Stations at eligible public mapped places provide research boards, supplies, first-visit stamps, route starts, and community context without inventing access |
| Player-activated encounter boosts | No equivalent | Optional Personal Survey Windows and shared Research Beacons increase virtual signal variety for a bounded time; they never claim to attract real wildlife or require payment |
| Scheduled cooperative location encounters, raids, and gyms | Room activities exist separately; no complete field-cooperation loop | Community survey windows, bioblitzes, restoration/education challenges, and shared route objectives; no wildlife combat, capture, or territorial ownership |
| Local showcases and party challenges | Leaderboards and rooms are fragmented | Optional local photo/record showcases and 2–4 player Field Parties with shared, non-exclusive objectives |
| Friends, gifts, postcards, and trading | Friends, rooms, trades, and region-bearing Journal records exist in separate systems | Consent-based Expedition Postcards and field-report exchange with coarse location controls, child-account rules, moderation, and no automatic route disclosure |
| Delayed distance rewards | No equivalent | Virtual specimen incubation/research processing where thematically suitable; never eggs or removal of real wildlife |
| Daily bonuses and streaks | Current Goal is persistent but not time-rotated | A first Field Note and weekly completion bonus with grace/catch-up; missing a day never destroys progress |
| A Today view communicating current reasons to play | Activities already shows Current Goal, nearby leads, rank, result, and Recent Journal | Evolve this existing surface into Field Today with current expedition, daily note, weekly distance, season/event, companion, pack/download, and safety state |
| Camera/AR snapshots | AR and virtual wildlife photography exist, but do not form a complete durable observation-quality system | Optional camera/audio evidence improves record quality; a no-camera identification path remains complete and media requires explicit consent and privacy handling |
| Inventory, replenishment, and monetized convenience | Backpack/tools/trades exist, but no field-supply economy is defined | Define bounded research supplies, gear capability, rewards, and caps before adding scarcity; no pay-to-win proximity, hard energy wall, loot-box species, or paid safety advantage |

## Second-pass omissions and corrections

The first version established the major authorities but missed the following
product contracts. They are now required scope, not optional polish:

1. **Preserve the existing Explorer spine.** `ExplorerEvent` v1, local claim
   idempotency, Recent Journal, Field Guide, Current Goal, ranks, specialties,
   regional progress, Backpack projection, and tool unlocks need explicit
   adapters and migrations. A new Expedition system cannot create a second
   Journal, rank, or reward projection.
2. **Decide the web-platform boundary.** The current browser product reliably
   supports foreground geolocation. Background distance, push alerts, durable
   offline jobs, health-platform steps, and native sensor integrations require
   a documented PWA/native feasibility and privacy decision before they appear
   in schedules or public claims.
3. **Create useful geographic service nodes.** Pokémon GO's stops are not just
   encounter markers; they replenish inventory, distribute research, provide
   route anchors, and create shared local context. World Explorer needs Field
   Stations derived from eligible public mapped places, plus a rural fallback
   that does not make dense cities the only viable progression path.
4. **Specify the actual skill mechanics.** “Observe” cannot remain one hold
   timer with different labels. Photography, track/sign analysis, audio survey,
   macro insect inspection, habitat assessment, identification, geology,
   shoreline fishing, and community work each need a distinct input, evidence,
   success/failure, accessibility, safety, and mastery contract.
5. **Define rewards and supplies before balancing retention.** Explorer points,
   specialty mastery, gear capabilities, cosmetics, research supplies,
   companion bond, badges, catches, and tradeable virtual finds need one source/
   sink and cap policy. Undefined currency, bait durability, energy, premium
   boosts, or inventory pressure cannot be added ad hoc.
6. **Design for spatial equity.** Signal density, Field Stations, route access,
   fishable shores, events, and rewards need urban/suburban/rural/remote,
   wheelchair-accessible, low-connectivity, and data-sparse acceptance. Density
   normalization cannot fabricate POIs or award city players more progression
   simply because mapping is denser.
7. **Build content operations, not only runtime selectors.** Taxonomy/media
   review, pack compilation, licenses, localization, safety exclusions, event
   scheduling, staged rollout, experiments, incident disable, migration,
   rollback, and audit history need operator tooling and least-privilege roles.
8. **Treat player media and routes as user-generated content.** Photos, audio,
   captions, route names/descriptions, postcards, and showcases require metadata
   stripping, consent, retention/deletion/export, reporting, moderation, rights,
   child-account controls, and safe public-location generalization.
9. **Handle international time and language.** Local-day boundaries, time zones,
   daylight-saving changes, the date line, hemisphere seasons, localized common
   names, scientific names, units, scripts, and right-to-left layouts need
   versioned behavior and tests.
10. **Separate plausibility from abundance.** Occurrence records are unevenly
    sampled and do not establish absence, current presence, catch probability,
    or population size. Native/introduced/stocked/migratory status, coordinate
    uncertainty, record age, sampling bias, and coverage confidence must remain
    explicit through ecology and fishing selection.

## The complete player loop

### Moment-to-moment: 30 seconds to 5 minutes

1. Open Field Today or the map and see nearby **signals**, not guaranteed animals.
2. Choose a signal, route waypoint, shoreline, or mission objective.
3. Walk using Live GPS or use direct controls when the objective permits them.
4. Enter the approach ring; receive habitat/evidence clues and prepare the
   appropriate tool.
5. Enter the interaction ring; observe, photograph, listen, identify, fish, or
   perform the field activity.
6. Save an evidence-labeled Journal record and update the Field Guide/life list.
7. Apply progression and rewards through an idempotent server ledger.

### Session: 10 to 25 minutes

An Expedition offers three to five varied objectives with a visible time and
distance estimate: for example one common observation, one habitat check, one
tool activity, one new or improved record, and one optional route/shore task.
The director avoids repeating the same action or species and always provides a
safe stop/return path.

### Day, week, season, and long term

- **Daily:** first Field Note, a rotating local task, companion bond actions,
  and a short optional expedition. Missed days do not erase progress.
- **Weekly:** distance, habitat diversity, one route or shoreline survey, and a
  choice of specialist objective. Progress is cumulative and has a grace path.
- **Seasonal:** region/hemisphere life list, migration and weather variation,
  community surveys, themed research, and an atlas page that remains as history.
- **Long term:** Explorer rank, naturalist specialties, species mastery,
  observation-quality tiers, route badges, region atlases, companion bonds, and
  educational/conservation records.

Repeat observations must have value without becoming a grind. They can improve
photo/audio quality, add a new region/season/behavior/life stage, advance
specialty mastery, validate a community survey, or contribute to a capped daily
research objective. Exact same-region repeats do not endlessly mint currency.

## Platform and bounded-world contract

World Explorer is a browser game whose Earth authority loads one bounded fixed
location. The field game must respect that architecture:

- Phase A is foreground-only and requires a secure context, visible permission
  state, fresh fix, active screen, and explicit session controls. Permission
  denied, unavailable, timed out, poor accuracy, offline, and restored-permission
  journeys have complete explanations and manual-play fallbacks.
- An Expedition can offer only objectives whose complete approach geometry lies
  within the current published world and safety margin. The director must not
  create an objective that requires invisible streaming or crossing the existing
  recenter/hard-pause boundary.
- Recenter closes the current spatial segment and opens a new segment under the
  same user-visible field session. Aggregate eligible distance can continue;
  proximity proofs and objectives migrate only when their versioned policy
  explicitly permits it. No reward can be claimed against a disposed snapshot.
- A route must fit one published snapshot, or be deliberately split into safe,
  resumable legs. Route detail shows distance, estimated time, elevation/access
  evidence, start distance, reversibility, download state, and known limitations.
- Background steps, push notifications, native health data, and geofenced alerts
  stay **not implemented** until a platform decision records browser/PWA/native
  behavior, permission and store policies, battery cost, abuse controls, data
  retention, account consent, and an equivalent no-background progression path.
- Ecology/content packs are downloadable by bounded region and release version.
  Core session state, selected objectives, catalog references, and pending
  records tolerate network loss; authoritative rewards reconcile idempotently
  after reconnect.

## Authority architecture

These are logical owners. They can be introduced behind adapters before files
are reorganized, but two owners may not coexist indefinitely.

### `FieldSessionAuthority`

Owns session start/stop, consent version, movement source, GPS trust state,
accuracy, speed, distance ledger, foreground/background state, pause reason,
safety state, and eligibility class. Raw fixes remain in bounded memory by
default; persistent records store only the minimum generalized proof needed for
a reward or user-visible Journal entry.

Movement classes:

- `gps_walk` — eligible for walking/proximity objectives when accuracy and speed pass.
- `gps_fast` — visible travel and world following; not eligible for walking rewards.
- `manual_direct` — default World Explorer controls; eligible only for objectives that allow virtual exploration.
- `accessibility_assist` — declared accommodation policy with equivalent but explicitly classified objectives.
- `test_simulated` — non-production verification only; never accepted by production reward functions.

### `InputActionAuthority`

Defines semantic actions such as `move`, `look`, `interact`, `jump`, `run`,
`brake`, `ascend`, `descend`, `cast`, `reel`, `open_backpack`, `open_field_today`,
`back`, and `pause`. Keyboard, touch, pointer, gamepad, and accessibility devices
map to actions; gameplay systems never depend directly on a fake keyboard event.

The shipped default remains the current direct-control style. GPS follow is a
separate player-selected movement source. Switching authority is explicit,
reversible, and visible in the HUD.

### `MobileScreenLayoutAuthority`

Owns exactly one focused full-screen activity, one modal stack, one optional
side/bottom sheet, HUD safe zones, bottom navigation, and control surfaces.
Every open/close operation must register focus, restore focus on exit, and obey
the same Back/Escape hierarchy. A panel cannot make itself visible solely by
toggling a CSS class outside this authority.

This is a hardening boundary, not a current mobile navigation redesign. Live GPS
stays in the mobile Games menu unless later observed user testing demonstrates a
specific navigation failure.

### `ProximityAuthority`

Consumes the field session, world position, GPS accuracy, published traversal
surfaces, public/safe-access constraints, and objective policy. It publishes
states such as `distant`, `nearby`, `approach`, `interactable`, `accuracy_hold`,
`unsafe_speed`, `access_blocked`, and `complete`.

Initial tuning values are proposals, stored in a versioned server manifest and
changed only after field testing:

- reveal/signal: roughly 120–250 m depending on density and privacy;
- approach: roughly 50–80 m;
- interact: normally 20–30 m, never tighter than a justified combination of
  GPS accuracy, mapped access, and activity needs;
- exit hysteresis: wider than entry so ordinary GPS drift does not flap state;
- no precision interaction when reported accuracy exceeds the activity limit.

Straight-line distance alone is insufficient. The authority must reject unsafe
speed, inaccessible sides of barriers/water, private or excluded areas where
known, and targets with no eligible published approach surface.

### `BiodiversityCatalog`

Owns canonical taxon ID, accepted/common/scientific names, taxonomy version,
region, habitat, season/time traits, conservation/sensitivity flags, gameplay
traits, media/3D asset IDs, licenses, attribution, provenance, and evidence
labels. Wildlife, Field Guide, encounters, fishing, underwater schools, photo
mode, and challenges reference the same ID.

### `RegionalEcologyPack`

Precomputes bounded spatial cells (H3, S2, or an equivalently documented grid)
for a versioned season/content release. Each cell contains candidate taxa,
habitats, confidence, observation recency/quality summaries, sensitivity
generalization, and provider provenance. The client does not query global
occurrence APIs per frame or disclose sensitive exact records.

### `FieldStationAuthority`

Selects service nodes from stable mapped place identity plus verified public/
safe approach evidence. A Field Station can issue research, provide bounded
virtual supplies, anchor a route, record a first visit, host an approved event,
or show an educational place card. It cannot infer public access from a name or
place category alone. Nodes have cooldown, retirement, correction, density,
moderation, accessibility, and provenance state.

Where eligible mapped places are sparse, the system offers a portable Personal
Field Desk and broader habitat objectives with equivalent progression ceilings.
It does not fabricate a landmark or require a player to drive to a city.

### `EncounterDirector`

Selects procedural opportunities from the ecology pack using habitat, season,
local time, weather, novelty, recent encounters, player specialty, session
budget, density, accessibility, cooldowns, and event manifest. It emits a stable
encounter ID and evidence class but cannot directly grant rewards.

The director also owns spatial-equity policy: per-cell opportunity floors and
ceilings, data-confidence fallbacks, recent-action diversity, cooldowns, and a
no-objective result when access or ecological evidence is insufficient. It
never resolves sparse data by inventing a named species, public place, or safe
route.

### `ExpeditionAuthority`

Owns research and mission lifecycle: eligibility, objective graph, accepted
event types, progress, completion, cancellation, expiry, reward policy,
multiplayer contribution, migration, and version. Daily, weekly, seasonal, and
special research use the same event contract instead of separate counters.

It consumes existing `ExplorerEvent` records through a versioned adapter. Old
events remain readable, and migrated progress is reproducible from immutable
events plus versioned projections rather than copied into parallel counters.

### `RewardLedger`

Validates idempotent event IDs, field-session class, plausible distance/speed,
proximity proof, objective version, caps, and prior claims. It owns points,
items, badge progress, challenge credit, and any future currency. The client can
show a pending result but cannot mint final progression.

The ledger defines reward classes and caps before launch: Explorer rank credit,
specialty/mastery, badges, research supplies, gear capability, cosmetics,
companion bond, catches, and explicitly tradeable virtual finds. It does not
introduce premium proximity, paid accuracy, pay-to-win species odds, hard field
energy, or loot-box biodiversity.

### `FieldGuideAuthority`

Stores taxon, evidence class, observation count, generalized place, region,
season, behavior/life stage, media quality, first/last date, and mastery. It
clearly separates a real-world observation record, a habitat-plausible
procedural encounter, and a virtual specimen or companion.

### `FieldMediaAuthority`

Owns optional photo/audio capture consent, local draft state, file limits,
metadata stripping, media quality signals, upload state, rights/attribution,
content safety, retention/export/deletion, visibility, moderation, and coarse
place disclosure. Camera or microphone refusal never blocks the base
identification/Journal loop. Automated quality checks can score framing or
signal clarity but cannot certify species identity without a separately reviewed
identification policy.

### `ContentReleaseAuthority`

Owns signed/versioned ecology, Expedition, Field Station, reward, season, event,
localization, safety-exclusion, and feature manifests. It provides staged
rollout, region/device targeting without discriminatory rewards, preview,
approval, activation/expiry, audit history, emergency disable, rollback, client
compatibility, and migration. Runtime modules consume this publication; they do
not embed one-off event dates or species overrides.

### `WaterAndFishPopulationAuthority`

Consumes the existing published water registry and owns waterbody identity,
fresh/marine/estuary class, shoreline eligibility, depth/salinity/current where
available, regional fish candidates, season/time/weather modifiers, bait/gear
compatibility, catch evidence, and boat/shore access. The boat game, shore
fishing, underwater schools, Field Guide, and catch record share it.

## Distinct field mechanics

Every released activity needs a real verb and observable consequence. Shared
session plumbing is desirable; identical play with renamed text is not.

| Activity | Required interaction | Evidence/result | Failure and accessibility path |
| --- | --- | --- | --- |
| Wildlife observation | Respectful-distance tracking using bearing, movement/sign clues, binocular zoom, and a stable observation window | Species/habitat-plausible record with behavior, time, region, and evidence class | Target leaves, signal quality drops, or access becomes unsafe; audio/text/haptic clue equivalents |
| Photography | Player frames a virtual subject or habitat and chooses a shutter moment | Optional local image plus computed framing/visibility quality; never proof of real species | Camera denied uses an in-game viewfinder without device capture; no mandatory upload |
| Audio survey | Direction/interval recognition for a virtual or licensed call with explicit audio provenance | Soundscape/call record and listening-quality score | Muted/deaf path uses synchronized visual/haptic rhythm and equivalent credit |
| Insect/microfauna study | Locate a habitat clue, then use a macro inspection view with scale/behavior details | Life-stage, morphology, habitat, and season record | No forced device camera; reduced-motion and magnified static inspection alternatives |
| Track/sign analysis | Compare prints, scat/feather/shed or feeding signs against bounded candidate clues | Evidence-based identification with confidence; no assertion the animal is currently present | Wrong identification gives explanation and another attempt, not a punitive loss |
| Habitat survey | Sample several distinct mapped/derived habitat facts inside a safe small route | Habitat-quality field note with source truth labels | Incomplete data yields an honest partial record; no invented environmental measurement |
| Geology/fossil work | Select a virtual outcrop/specimen, use the correct tool motion, expose diagnostic features, and identify | Virtual specimen or observation depending on activity policy | Real collecting/excavation is never instructed; accessible timed/untimed alternatives |
| Fishing | Select shore/boat position, tackle and cast target; manage hook, tension, direction, stamina, landing/release | Virtual catch/loss event linked to waterbody, regional pool, gear, and Field Guide | Unsafe/ineligible bank, incompatible tackle, broken line, escaped fish, cancel, and assisted controls |
| Community survey | Contribute one independently valid observation/task to a shared bounded objective | Personal record plus exact-once aggregate contribution | A failed group target never removes individual earned progress; asynchronous contribution allowed |

An encounter publishes a lifecycle: `signaled`, `selected`, `approaching`,
`interactable`, `active`, `resolved|failed|expired|canceled`, and `cooldown`.
Every transition records its allowed movement/evidence classes, timeout, safe
cancel behavior, resume policy, animation/audio ownership, and reward event.

## Progression, supplies, and return design

The current four ranks and tool unlocks remain the migration baseline. New
progression must define curves and reward purpose rather than adding counters:

- Explorer rank reflects broad account experience; specialties reflect Nature,
  Earth, Places, fishing, photography/audio, and future reviewed disciplines.
- Species mastery values first identification, new region/season/behavior/life
  stage, improved media/evidence quality, and capped research contribution.
- Habitat and regional atlases combine breadth across taxa and activities; a
  single farmable species or action cannot complete them.
- Field Stations and Daily Field Notes can provide bounded virtual research
  supplies. Supplies support choice and preparation, not an energy timer that
  prevents ordinary exploration.
- Gear progression unlocks capabilities, alternate techniques, cosmetics, and
  convenience within fair ceilings. Better gear cannot falsify evidence or make
  unsafe GPS accurate.
- Bait/lures affect the virtual fishing/encounter model only. A Research Beacon
  advertises a temporary game event to nearby players; it never says real
  animals were attracted.
- Companion bond has daily capped care/walk/assist actions and permanent levels
  that do not decay. Real wildlife cannot be fed, adopted, battled, traded, or
  treated as owned.
- First-of-day and weekly completion bonuses have grace and catch-up. No broken
  streak wipes progress, no notification shame, and no midnight exploit across
  time zones.
- Any future currency, premium item, inventory capacity, trading expansion, or
  marketplace requires a separate economy/security/consumer-protection review.

## Biodiversity truth and data pipeline

Recommended provider strategy:

- GBIF occurrence data for terrestrial, insect, plant, and freshwater regional
  plausibility, subject to record quality, age, coordinate uncertainty,
  licensing, dataset rights, and sensitive-species generalization.
- OBIS for marine species occurrence and checklist evidence, with dataset-level
  provenance and policy compliance.
- HydroBASINS/HydroATLAS as a candidate global watershed and hydro-environment
  frame for freshwater pack compilation, subject to pinned-version, attribution,
  redistribution, and derived-data review. Watershed geometry is context, not a
  fish-presence claim.
- Reviewed national/regional authorities where they materially improve a pack,
  such as USGS native-range and nonindigenous aquatic datasets in the United
  States. Regional additions use provider adapters and may not become hidden
  city conditionals.
- eBird regional/summary data only where its access and product terms permit the
  intended use; never scrape the public site.
- Existing OSM, land cover, water, terrain, weather, and time authorities for
  habitat context—not as proof of current organism presence.
- A curated licensed media pipeline. Do not scrape images, audio, or 3D models.
- Taxonomy versions are pinned. Synonyms migrate to stable internal IDs without
  rewriting a player’s historical record.

The offline build pipeline is explicit:

1. ingest only approved dataset releases and record dataset/license/attribution;
2. normalize taxonomy and preserve provider record IDs plus accepted synonyms;
3. reject or down-weight invalid coordinates, excessive uncertainty, fossils,
   captive/cultivated records where inappropriate, implausible dates, duplicate
   records, and unsupported occurrence bases;
4. generalize sensitive records and compute age, coverage, sample-density, and
   provider-diversity diagnostics;
5. join habitat, water class, watershed/coastal region, season/time traits, and
   native/introduced/stocked/migratory status without converting correlation
   into presence or abundance;
6. run automated anomaly checks and expert review on the candidate regional pack;
7. publish a signed immutable pack plus coverage card, known gaps, attribution,
   compatibility range, and rollback pointer;
8. compare the deployed pack with later corrections through a migration that
   preserves historical Journal truth.

Each release region needs a coverage card by major taxonomic group and habitat:
candidate count, reviewed count, recent/high-confidence evidence fraction,
unknown/sensitive fraction, media quality tier, supported seasons, localization
coverage, and known sampling bias. A minimum total count cannot hide zero useful
insects, freshwater fish, marine fish, nocturnal species, or rural content.

Every displayed opportunity carries one truth class:

- `observed_regional` — derived from generalized, dated occurrence evidence;
- `regional_seasonal_model` — modeled from region/season/habitat evidence;
- `habitat_plausible` — broadly plausible from habitat and range;
- `procedural_game_encounter` — generated for gameplay with no live-presence claim;
- `user_observation` — recorded by the player and labeled unverified unless a
  separate review/identification workflow validates it.

The product must never say “this animal is here now” unless it is describing the
player’s own current observation. Sensitive species use coarser geography,
delayed timing, or omission according to provider and conservation policy.
Absence of records means `data_insufficient`, not species absence. Common names
are localized display data; pinned scientific name and stable internal taxon ID
remain the cross-language identity.

## Creature, animal, insect, and fish quality

One generic mesh tinted into many species is not acceptable. Content ships in
quality tiers with visible provenance and a fallback that never mislabels a
generic blob as a specific species.

1. **Hero species:** bespoke licensed or commissioned GLB/PBR model, accurate
   scale, rig, locomotion/idle/alert/flee/feeding behavior, audio, collision,
   multiple LODs, photo pose, and expert review.
2. **Modular families:** scientifically compatible shared skeleton/archetype,
   species-specific silhouette, proportions, materials, behavior parameters,
   sounds, scale, and reviewed variants.
3. **Microfauna/insects:** efficient instanced field presentation plus a
   dedicated macro inspection view; accurate scale and locomotion matter more
   than forcing a distant full character rig.
4. **Fish:** species-specific body/fin silhouette, scale, swim style, schooling
   traits, habitat, catch portrait, and underwater identity from one catalog.
5. **Reference fallback:** a licensed, high-quality still/illustration and
   honest Field Guide entry when no vetted 3D asset exists. Do not block catalog
   breadth on weak 3D or lower the identification quality to claim a count.

Each asset gate covers anatomy, scale, gait/wingbeat/swim, surface contact,
habitat behavior, audio, lighting/PBR, animation transitions, LOD popping,
mobile frame/memory cost, rights, attribution, and scientific review.

Proposed content milestones—not current counts or marketing claims:

- vertical slice: at least 60 vetted taxa around one pilot region, including at
  least 15 insects/arachnids and 20 locally plausible fish;
- regional beta: at least 300 vetted taxa across seven representative release
  regions, with useful habitat/season variety in each;
- worldwide release claim: at least 1,000 vetted taxa across major biomes and at
  least 250 fish, backed by an ongoing pack-generation/review pipeline.

Counts never override quality. A smaller correct regional pack is preferable to
thousands of unreviewed names attached to generic models.

## Fishing from every eligible shore and boat

“All bodies of water are fishable” means every published waterbody can be
evaluated by one policy; it does not mean every bank is safe, public, reachable,
or ecologically supported.

Shore fishing eligibility requires:

1. a published waterbody identity and water class;
2. an eligible published walking/standing surface adjacent to that water;
3. a cast corridor intersecting the water surface without crossing a known
   building/barrier/exclusion;
4. safe slope/height and a recoverable exit position;
5. access and local-rule data where available, otherwise an honest
   `access_unknown` label rather than invented permission;
6. a regional fish pool with evidence/confidence and a non-empty compatible
   tackle path.

Every waterbody receives one explainable result: `shore_eligible`,
`boat_only`, `access_unknown`, `no_safe_bank`, `private_or_excluded`,
`seasonally_dry_or_ice`, `protected_or_closed`, `insufficient_ecology`, or
`not_supported`. The game must not turn missing access/regulation data into
permission, and closures can disable rewards without deleting the mapped water.

Boat and shore players use the same cast, bite, fight, catch/loss, Field Guide,
population, and reward events. Access method changes depth, distance, species,
gear, and risk; it does not fork the fishing game.

Fish selection considers waterbody/region, watershed or coastal ecoregion,
fresh/marine/estuary class, season, local time, weather, temperature where
available, salinity/current/depth evidence, habitat, bait, lure, gear, prior
pressure/cooldown, rarity, and event manifest. Missing evidence widens the pool
and lowers confidence instead of fabricating precision.

The fish record distinguishes native range, introduced/established, stocked,
migratory/seasonal, vagrant, and unknown where supported. These labels affect
education and pack confidence, not moralized score. Occurrence history never
becomes modeled abundance or a promise that a fish will bite.

The existing 60-entry local catch history and 14-species IDs require a migration
adapter into `ExplorerEvent`, Field Guide, account sync, and the unified fish
catalog. Old virtual catches remain visible with their original
`simulated-estimate` measurement truth; catalog upgrades do not rewrite species,
size, place, or date.

Tackle has explicit rod/reel/line/hook/lure/bait capabilities, legal/safety
disclaimers, compatible habitat/depth ranges, durability decision, acquisition,
repair/reset, inventory cap, and accessibility controls. Until those rules are
approved, the starter fishing rod remains functional and no consumable bait or
premium tackle is introduced.

Catches are virtual game outcomes. The UI should support catch-and-release
education and local regulation links where dependable, but it must not present
game sizes, abundance, legal limits, or safety guidance as authoritative local
law without a maintained official source.

## Mobile control system

### Default profiles

- **Direct Explorer (default):** left movement control, right look/camera area,
  contextual interact, jump/run or mode-specific primary/secondary actions.
- **Live GPS:** GPS owns translation; touch retains camera, interact, tool,
  Field Today, Backpack, recenter, pause GPS, and stop GPS. Manual translation
  cannot silently fight GPS.
- **Driving/boat/plane/drone/ocean/space:** semantic mode actions derived from
  the same action map, with a clear switch indicator and safe return profile.
- **One-hand left/right:** moves essential actions into a reachable zone without
  hiding Back, Stop GPS, or emergency reset.
- **Accessibility:** toggle/hold alternatives, sensitivity/dead-zone controls,
  reduced motion, optional haptics, high contrast, larger targets, and supported
  external switch/gamepad mappings.

### User configuration that must be real

Users can remap actions, drag controls within safe zones, resize, change
opacity, select handedness, tune camera sensitivity/dead zones, choose
hold/toggle behavior, enable/disable haptics, save named profiles, restore the
mode default, and reset all controls.

The editor operates on semantic actions and writes a revisioned profile. It
previews collisions and unreachable controls, prevents hiding required escape/
safety actions, validates duplicate exclusive bindings, and always exposes a
hardware/browser-independent recovery gesture. Saving is not accepted until a
test action changes the actual gameplay action state.

The control schema records:

- stable action ID, context (`global`, `walk`, `drive`, `boat`, `plane`,
  `drone`, `ocean`, `space`, `Live GPS`, `panel`, or `activity`), input type,
  label/help, required/optional status, and exclusivity group;
- digital press/release, analog vector/axis, pointer region, gesture, hold,
  toggle, repeat, chord, sensitivity curve, inversion, dead zone, and haptic
  feedback without converting them into synthetic keyboard events;
- visual control ID, normalized safe-zone position, size, opacity, handedness,
  z-order, portrait/landscape variant, and per-mode visibility;
- profile ID/version, device class, created/updated time, local/account sync
  scope, base-default version, migration result, and last-known-good recovery;
- conflict and precedence policy. Global Back/Cancel, Stop GPS, pause, and reset
  cannot be shadowed; contextual Interact resolves one visible action owner;
  panels suspend gameplay actions; releasing focus/visibility clears all held
  digital and analog state.

The first migration wraps the existing keyboard/gamepad handlers and fixed
mobile profiles behind the new action reader while preserving their default
feel. Only after parity tests pass does the touch editor write custom profiles.
Removing the direct `appCtx.keys`/Space-key coupling is a measured migration,
not a one-file rewrite.

### Screen and navigation rules

- Only one full-screen panel/activity may own interaction at once.
- Backpack, Field Guide, Field Today, Settings, controls editor, fishing, AR,
  and activity screens all have an always-visible close/back action within safe
  area and a tested browser Back/Escape path.
- Opening a panel suspends world touch input and releases held virtual actions.
- Closing restores focus to the launcher and restores the correct control
  profile without a stuck key/pointer.
- Portrait and landscape are composed separately; elements are not merely
  scaled down. Notches, home indicators, browser chrome, virtual keyboards,
  200% text, and split-screen/resize are part of the layout contract.
- Primary touch targets aim for at least 44×44 CSS pixels and 48×48 for frequent
  gameplay actions, while also meeting WCAG 2.2 Target Size (Minimum) and
  spacing exceptions.

## Mobile R&D and proof matrix

No configurable-control feature ships from a settings screenshot. R&D produces
instrumented prototypes and observed results.

### Prototype questions

1. Fixed dual control versus floating movement origin.
2. Dedicated look pad versus drag-anywhere camera region.
3. Context button placement for one-hand left/right use.
4. Live GPS camera control while walking without encouraging eyes-on-screen use.
5. Whether any existing full-screen panel needs a bounded usability fix; do not
   redesign accepted mobile navigation without observed evidence.
6. Portrait/landscape policy per traversal mode.
7. Haptic and audio confirmation without battery or accessibility regressions.

The default is the best-performing direct-control profile that preserves the
current game feel. Alternatives are opt-in saved profiles, not untested toggles.

Observed R&D records task completion, error/mis-touch rate, time to recover,
camera overshoot, simultaneous-input success, one-hand reach, comfort/fatigue,
motion sickness, eyes-on-screen time during GPS play, preference, battery, FPS,
and accessibility barriers. A default is accepted only after representative
players complete walk, look, interact, mode switch, Backpack, GPS stop/recenter,
and one fishing fight without facilitator correction.

### Required devices and journeys

Test at minimum: a small iPhone-class viewport, standard and large iPhone,
low/mid/high Android phones, iPad/tablet, landscape short viewport, desktop
touch/hybrid, keyboard/mouse, and gamepad where supported. Real-device Safari
and Chrome are required; viewport emulation alone is not a mobile release gate.

For every device/profile, verify:

- fresh install → Live GPS entry → consent allow/deny/retry → controllable world;
- direct walk/look/jump/run/interact, then GPS start/pause/recenter/stop and
  return to direct controls;
- open/scroll/equip/close Backpack with UI restored and no stuck input;
- Field Today → nearby signal → approach → interaction → Journal → reward;
- shore fishing cast/fight/catch/loss/exit and boat fishing using the same events;
- every traversal mode, settings/remap/save/reload/reset, browser Back, rotation,
  app background/foreground, virtual keyboard, offline/reconnect, and low battery;
- left/right one-hand reach, 200% text, reduced motion, contrast, screen reader,
  external keyboard, and switch/gamepad routes where supported.

Automated tests assert DOM/action state; field tests use real motion and GPS.
Every claimed control setting must be proven by reading the saved mapping,
driving the rendered control, and observing the intended gameplay action/result.

## Safety, privacy, and abuse prevention

- Never require interaction while moving at vehicle speed. Fast travel pauses
  walking rewards and offers a clear passenger/non-reward state.
- Do not place objectives across unsafe barriers, in water without the matching
  activity, on private/excluded land where known, or where no eligible approach
  surface exists.
- Weather/emergency alerts, darkness, seasonal closure, construction, tide/ice,
  wildfire/flood, and access data can suppress or warn where a maintained source
  exists. Missing live safety data is never presented as proof that a route or
  shoreline is safe.
- No objective instructs players to touch, feed, pursue, corner, handle, capture,
  disturb, collect from, or approach real wildlife. Observation distances and
  prompts become more conservative for sensitive/large/dangerous taxa.
- Provide awareness reminders at session start and context changes, then keep
  the ordinary walking HUD glanceable instead of repeatedly demanding attention.
- Store raw location only in bounded session memory by default. Persistent
  reward proof uses generalized cells, distance totals, timestamps, accuracy/
  trust summaries, event IDs, and consent version. Publish retention/deletion.
- Server challenge manifests and reward events are signed/versioned,
  idempotent, replay-resistant, speed/accuracy checked, and rate limited.
- Spoof suspicion withholds competitive/reward credit; it does not erase a
  user’s local Field Guide without an explainable appeal/recovery path.
- Player photos/audio strip EXIF and precise coordinates before any upload.
  Visibility defaults private; public media, captions, postcards, showcases,
  and routes require report/block/moderation, rights confirmation, retention,
  export/deletion, and appeal paths.
- Child accounts, social discovery, gifts/postcards, shared routes, public media,
  nearby parties, notifications, and location visibility remain disabled until
  separate guardian/privacy/age-assurance and abuse reviews pass.
- Accessibility objectives provide equivalent challenge/reward ceilings for
  mobility, visual, hearing, dexterity, cognitive, and energy limitations. The
  accommodation policy is server-declared and private; it does not publicly
  label or rank players by disability.

## Performance and telemetry

Measure FPS, p50/p95/p99 frame time, >33 ms stalls, draw calls, triangles,
programs, textures, JS/WASM heap, GPU memory where available, network bytes,
provider requests, GPS/battery usage, thermal throttling, load time, and teardown
retention. Creature count alone is not a useful performance result.

Release rules:

- no field feature may regress the same-device/mode Firebase production baseline;
- named low-tier phones must maintain a measured playable floor of 30 FPS, while
  mid/high tiers target 60 FPS where the display/browser allows it;
- encounter density, animation LOD, shadows, particles, audio voices, and macro
  inspection quality may scale before mapped world identity/detail is reduced;
- ecology packs are downloaded by bounded region/version and cached with quota,
  integrity, eviction, offline, and deletion behavior;
- sustained 20-minute GPS expeditions, dense encounter sessions, shore fishing,
  ten panel cycles, and five world replacements must show bounded resources.

Telemetry is privacy-minimized and answers product questions: first meaningful
action, expedition completion, new/improved observation rate, weekly field
sessions, safe walking distance, panel trap/back failure, remap success/reset,
crash, load, FPS/battery tier, and return rates. It does not store raw routes or
use punitive streaks.

## Delivery sequence and acceptance gates

### Phase 0 — Contracts, migrations, and feasibility

- Freeze current `ExplorerEvent`, Journal/Guide/Backpack, catch-history, control,
  GPS, waterbody, and account snapshots as migration fixtures.
- Write versioned schemas for input actions/profiles, field sessions, proximity
  proofs, Expeditions/objectives, rewards, taxa, ecology packs, Field Stations,
  water/fish populations, media, content releases, and localized display data.
- Decide foreground web/PWA/native capability boundaries and keep unsupported
  background/health/push features out of release claims.
- Define reward/supply policy, spatial-equity metrics, location/media retention,
  child/social gates, Field Station selection, route safety, operator roles,
  incident disable, and rollback before UI production work.
- Record the current Firebase production performance/artifact baseline and a
  seven-region ecology/access/data-coverage baseline.

Exit: schemas validate fixtures, migration round-trips lose no current Journal,
Guide, Backpack, companion, rank, tool-unlock, or catch data, and every authority
has one owner, trust boundary, persistence class, failure state, and release gate.

### Phase A1 — Configurable control foundation

- Implement semantic input profiles first; preserve the accepted mobile
  navigation and harden screen/modal ownership only where regression evidence
  requires it.
- Wrap existing keyboard, gamepad, Earth/Space key-state, contextual action, and
  touch profiles behind semantic actions with parity tests before removing any
  legacy coupling.
- Add edit/preview/save/reload/conflict/default/reset and last-known-good recovery
  for walk and Live GPS first, then every traversal/activity profile.
- Run observed one-hand/accessibility/control R&D and choose versioned defaults
  based on task evidence.

Exit: current defaults feel and perform no worse, a saved touch change alters the
intended gameplay action after reload, every mode clears held input correctly,
and reset/recovery always returns to the shipped direct-control profile.

### Phase A2 — Trusted field-session vertical slice

- Implement field session, proximity state, safe bounded-world targeting,
  reward-event IDs, server reconciliation, and one Expedition lifecycle.
- Adapt the existing Activities/Current Goal/Recent Journal surface into Field
  Today; preserve existing events, ranks, specialties, regional progress, and
  tool unlocks.
- Add Field Station selection plus Personal Field Desk fallback and prove
  equivalent urban/rural opportunity ceilings.
- Deliver consent allow/deny/retry, poor accuracy, unsafe speed, recenter,
  background/foreground, offline/reconnect, and accessibility-assist journeys.

Exit: a player can start GPS, walk to three safe varied objectives, record them
through the existing Explorer spine, receive each eligible reward exactly once,
and understand every held/ineligible/pending state without test URLs or manual
database edits.

### Phase A3 — Reviewed Baltimore ecology and mechanics slice

- Build one reviewed Baltimore ecology pack and 60-taxon content slice with
  coverage cards, insects/microfauna, freshwater/marine fish, media rights,
  sensitive-species policy, localization seed, and pack rollback.
- Ship distinct observation, photography, track/sign, insect macro, habitat,
  geology, and community-survey mechanics with their accessible alternatives.
- Prove encounter lifecycle, density/diversity/cooldown policy, creature quality
  tiers, media-private default, and no-live-presence language.

Exit: the slice is useful across urban, park, shoreline, freshwater, and rural
test cells; each mechanic plays differently, evidence labels are correct, weak
data produces honest fallback, and every visual/media asset passes quality,
rights, attribution, mobile, and teardown gates.

### Phase A4 — Unified shore and boat fishing

- Introduce one fish catalog/population authority and migrate all existing catch
  records without changing their historical truth.
- Evaluate every published pilot waterbody and implement one eligible shoreline
  plus boat journey using the same cast/fight/catch/loss/record/reward events.
- Add tackle capability, waterbody outcome explanations, regional pool evidence,
  seasonal/access/closure state, Field Guide integration, and assisted controls.

Exit: eligible shores work, ineligible shores explain why, boat and shore catches
share identity/progression, and a 390×844 physical-phone player can customize a
control, fish, exit, reload, and restore the default without stuck input.

### Phase B — Seven-region beta and durable progression

- Expand to the representative release matrix and at least 300 reviewed taxa.
- Add daily/weekly/seasonal research, routes, companion bond, specialties,
  collection challenges, Field Stations, Research Beacons, social field parties,
  postcards/showcases only after their privacy gates, offline pack handling, and
  moderation/rollback for authored routes/events/media.
- Add real-device accessibility, battery, privacy, abuse, and performance gates.

Exit: every region has useful habitat/season variety and fishing where eligible;
two players can contribute to a shared field objective; repeat observations
remain valuable; rewards reconcile exactly once; no region uses a city patch.

### Phase C — Worldwide pack pipeline and live operations

- Scale the reviewed catalog/packs toward the worldwide targets.
- Add versioned season/event/localization/safety manifests, migrations, rollback,
  content review, sensitive-species policy, provider outage behavior, coverage
  cards, operational dashboards, incident disable, and audit history.
- Consider background distance only after explicit platform/privacy/battery and
  abuse acceptance; foreground play remains complete without it.

Exit: the pipeline can build, review, publish, monitor, roll back, and retire a
regional/seasonal pack; worldwide claims match actual audited coverage.

## Definition of complete

This program is complete only when the normal production UI on supported real
phones proves all of the following:

- physical proximity and eligible walking cause the intended objectives and
  server-validated rewards;
- manual/GPS/accessibility/vehicle authority is explicit and cannot double-credit;
- regional species are plausible, licensed, provenance-labeled, sensitive-data
  safe, and visually appropriate for their shipped quality tier;
- every eligible waterbody evaluates shore/boat access through one water/fish
  authority and offers regionally defensible fish choices;
- daily, weekly, seasonal, social, companion, specialty, and life-list systems
  create extended progression without punitive manipulation;
- Backpack, Field Today, Field Guide, controls, GPS, fishing, AR, and every
  traversal mode have complete mobile entry/action/exit/recovery journeys;
- saved control changes alter real gameplay, survive reload, validate conflicts,
  and always provide a reset/recovery path;
- security, privacy, accessibility, performance, battery, offline, teardown,
  migration, rollback, and representative-world gates pass the same immutable
  artifact that is deployed.

## Research and primary references

Location-game comparison:

- [Pokémon GO: Types of Research](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/45-types-of-research/)
- [Pokémon GO: Adventure Sync](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/3265-adventure-sync/)
- [Pokémon GO: Routes](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/4175-what-are-routes/)
- [Pokémon GO: PokéStops and Gyms](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/117-visiting-pokestops-and-gyms/)
- [Pokémon GO: Buddy Adventure](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2155-buddy-adventure/)
- [Pokémon GO: Party Play](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/4310-what-is-party-play/)
- [Pokémon GO: Raid Battles](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2187-what-are-raid-battles/)
- [Pokémon GO: Collection Challenges](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/4392-what-are-collection-challenges/)
- [Pokémon GO: Weather Boosts](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/53-what-are-weather-boosts/)
- [Pokémon GO: Levels and Medals](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/101-how-do-i-level-up-and-earn-medals/)
- [Pokémon GO: Finding specific Pokémon](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2345-how-do-i-find-specific-pokemon/)
- [Pokémon GO: Today View](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2852-the-today-view/)
- [Pokémon GO: Seasons](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2793-what-are-seasons/)

Biodiversity and mobile standards:

- [GBIF occurrence API](https://techdocs.gbif.org/en/openapi/v1/occurrence)
- [GBIF terms](https://www.gbif.org/terms)
- [OBIS API](https://api.obis.org/)
- [OBIS data access](https://portal.obis.org/data/access/)
- [OBIS data policy](https://portal.obis.org/data/datapolicy/)
- [eBird data download guidance](https://support.ebird.org/en/support/solutions/articles/48000838205-download-ebird-data)
- [W3C WCAG 2.2: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Android accessibility: touch target size](https://developer.android.com/guide/topics/ui/accessibility/apps#touch-targets)
- [Apple Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [MDN: Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)

Any additional commercial dataset, especially a non-commercially licensed fish
catalog, requires explicit license review before it enters the provider registry.
