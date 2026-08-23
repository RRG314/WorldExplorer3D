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
  interaction radii, hold-to-observe behavior, Journal and Field Guide records,
  a Backpack projection, companions, goals, and Explorer points.
- Wildlife already has deterministic ambient slots, basic approach/flee
  behavior, a capped visible population, and several interaction paths.
- Fishing has a real cast/fight/catch loop, equipment state, catch records, and
  a 14-species catalog.
- A shared Backpack model, screen-layout service, semantic input actions,
  desktop controls, and hard-coded touch profiles already exist.
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
- Field records contain only a handful of wildlife/plant entries. Four Explorer
  ranks, simple points, one goal chain, and shallow unlock thresholds cannot
  sustain extended play.
- There are no daily field notes, weekly expeditions, routes, habitat mastery,
  seasonal surveys, collection challenges, distance rewards, research chains,
  meaningful repeat observations, or community field events.
- Normal discovery claims receive a server receipt, but the server does not
  independently validate location, movement, proximity, or session eligibility.
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
| Field, special, timed, and level-up research | One shallow goal chain and activity records | Daily Field Notes, authored Expeditions, timed Community Surveys, and rank/specialty Research Chapters |
| Background/weekly walking progress | Foreground GPS only; no distance progression | Foreground field-session distance first; background distance only after a separate privacy, platform, battery, and abuse review |
| Routes with rewards and badges | Navigation exists; no field-route lifecycle | Curated and moderated survey routes, safe start/end, route objectives, habitat diversity, badges, and rollback-able publication |
| Buddy relationship and daily capped actions | Companion ownership/adoption exists | Separate virtual Companion Bond with walk, care, photograph, assist, mood, capped daily bond, and explorer perks |
| Rotating seasons, weather, events, and regional pools | Month/hemisphere metadata exists but barely affects species | Versioned seasonal ecology and event manifests with hemisphere, local time, weather, habitat, migration, and regional constraints |
| Collection challenges and medals | Field Guide and four ranks | Life-list challenges, observation-quality goals, habitat/region medals, specialist mastery, and seasonal atlas completion |
| Scheduled cooperative location encounters | Room activities exist separately | Community survey windows, bioblitzes, cleanup/education events, and shared route objectives; no claims about live animal presence |
| Local showcases and party challenges | Leaderboards and rooms are fragmented | Optional local photo/record showcases and 2–4 player Field Parties with shared, non-exclusive objectives |
| Delayed distance rewards | No equivalent | Virtual specimen incubation/research processing where thematically suitable; never eggs or removal of real wildlife |
| A Today view communicating current reasons to play | Status is spread across panels | One Field Today surface: nearby signals, current expedition, daily note, weekly distance, season, event, companion, and safety state |

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

### `EncounterDirector`

Selects procedural opportunities from the ecology pack using habitat, season,
local time, weather, novelty, recent encounters, player specialty, session
budget, density, accessibility, cooldowns, and event manifest. It emits a stable
encounter ID and evidence class but cannot directly grant rewards.

### `ExpeditionAuthority`

Owns research and mission lifecycle: eligibility, objective graph, accepted
event types, progress, completion, cancellation, expiry, reward policy,
multiplayer contribution, migration, and version. Daily, weekly, seasonal, and
special research use the same event contract instead of separate counters.

### `RewardLedger`

Validates idempotent event IDs, field-session class, plausible distance/speed,
proximity proof, objective version, caps, and prior claims. It owns points,
items, badge progress, challenge credit, and any future currency. The client can
show a pending result but cannot mint final progression.

### `FieldGuideAuthority`

Stores taxon, evidence class, observation count, generalized place, region,
season, behavior/life stage, media quality, first/last date, and mastery. It
clearly separates a real-world observation record, a habitat-plausible
procedural encounter, and a virtual specimen or companion.

### `WaterAndFishPopulationAuthority`

Consumes the existing published water registry and owns waterbody identity,
fresh/marine/estuary class, shoreline eligibility, depth/salinity/current where
available, regional fish candidates, season/time/weather modifiers, bait/gear
compatibility, catch evidence, and boat/shore access. The boat game, shore
fishing, underwater schools, Field Guide, and catch record share it.

## Biodiversity truth and data pipeline

Recommended provider strategy:

- GBIF occurrence data for terrestrial, insect, plant, and freshwater regional
  plausibility, subject to record quality, age, coordinate uncertainty,
  licensing, dataset rights, and sensitive-species generalization.
- OBIS for marine species occurrence and checklist evidence, with dataset-level
  provenance and policy compliance.
- eBird regional/summary data only where its access and product terms permit the
  intended use; never scrape the public site.
- Existing OSM, land cover, water, terrain, weather, and time authorities for
  habitat context—not as proof of current organism presence.
- A curated licensed media pipeline. Do not scrape images, audio, or 3D models.
- Taxonomy versions are pinned. Synonyms migrate to stable internal IDs without
  rewriting a player’s historical record.

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

Boat and shore players use the same cast, bite, fight, catch/loss, Field Guide,
population, and reward events. Access method changes depth, distance, species,
gear, and risk; it does not fork the fishing game.

Fish selection considers waterbody/region, watershed or coastal ecoregion,
fresh/marine/estuary class, season, local time, weather, temperature where
available, salinity/current/depth evidence, habitat, bait, lure, gear, prior
pressure/cooldown, rarity, and event manifest. Missing evidence widens the pool
and lowers confidence instead of fabricating precision.

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
- Provide awareness reminders at session start and context changes, then keep
  the ordinary walking HUD glanceable instead of repeatedly demanding attention.
- Store raw location only in bounded session memory by default. Persistent
  reward proof uses generalized cells, distance totals, timestamps, accuracy/
  trust summaries, event IDs, and consent version. Publish retention/deletion.
- Server challenge manifests and reward events are signed/versioned,
  idempotent, replay-resistant, speed/accuracy checked, and rate limited.
- Spoof suspicion withholds competitive/reward credit; it does not erase a
  user’s local Field Guide without an explainable appeal/recovery path.
- Child accounts, social discovery, shared routes, and location visibility need
  separate guardian/privacy review before release.

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

### Phase A — Authorities and Baltimore vertical slice

- Implement semantic input profiles first; preserve the accepted mobile
  navigation and harden screen/modal ownership only where regression evidence
  requires it.
- Implement field session, proximity state, reward-event IDs, Field Today, and
  one expedition lifecycle.
- Build one reviewed Baltimore ecology pack and 60-taxon content slice.
- Unify one shoreline and boat fishing journey through the water/fish authority.
- Prove the complete 390×844 physical-phone journey and desktop direct controls.

Exit: a player can start GPS, walk to three varied objectives, record credible
evidence, improve progress, fish from an eligible shore, close every screen,
customize a real control, reload it, and return to the default—without manual
database edits, test URLs, fake GPS in production, or duplicate rewards.

### Phase B — Seven-region beta and durable progression

- Expand to the representative release matrix and at least 300 reviewed taxa.
- Add daily/weekly/seasonal research, routes, companion bond, specialties,
  collection challenges, social field parties, offline pack handling, and
  moderation/rollback for authored routes/events.
- Add real-device accessibility, battery, privacy, abuse, and performance gates.

Exit: every region has useful habitat/season variety and fishing where eligible;
two players can contribute to a shared field objective; repeat observations
remain valuable; rewards reconcile exactly once; no region uses a city patch.

### Phase C — Worldwide pack pipeline and live operations

- Scale the reviewed catalog/packs toward the worldwide targets.
- Add versioned season/event manifests, migrations, rollback, content review,
  sensitive-species policy, provider outage behavior, and operational dashboards.
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
