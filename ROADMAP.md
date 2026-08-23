# Current Product Roadmap

Last audited: 2026-08-23 against World Explorer 3D 4.3.1 at stable commit
`9b28e2952cf22b7bb0d40be655ef9a194d0af75f`.

This is a roadmap for the current codebase. Historical release work belongs in
[CHANGELOG.md](CHANGELOG.md); it is not repeated here as future work. A module,
button, schema, or preview is not considered a complete product feature unless
the normal player path works in the assembled application and the release
pipeline verifies the outcome.

For the current ownership and execution model, see the
[system inventory](docs/SYSTEM_INVENTORY.md) and
[architecture map](docs/ARCHITECTURE_MAP.md). The detailed implementation
contract for Live GPS field play, regional ecology, shore fishing, extended
progression, and configurable controls is the
[Field Exploration and Mobile Control Plan](docs/FIELD_EXPLORATION_AND_MOBILE_CONTROL_PLAN.md).

## Status language

- **Released and gated** — ships in 4.3.1 and has a current production journey.
- **Released, gate incomplete** — ships through the normal UI, but the release
  pipeline does not yet prove the complete interaction.
- **Partial** — part of the end-to-end behavior exists, but a required authority,
  workflow, coverage area, or failure path is missing.
- **Not implemented** — there is no supported product path. A label, type, or
  editor field alone does not change this status.
- **Intentional limit** — behavior is deliberately outside the product contract.

## Product rules that every checkpoint must preserve

- Earth is a bounded, selected-location experience. It is not and will not
  become a continuously streaming world.
- Mapped identities, geometry, height, and provenance remain authoritative when
  available. Inferred content is labeled and is never described as surveyed.
- Each world layer and physical surface has one owner for data selection,
  publication, rendering, collision, and traversal.
- Performance work removes duplicate ownership, releases retained resources,
  defers optional systems, batches compatible geometry, and scales effects
  before changing mapped world detail.
- Player and non-player actors may use only eligible published surfaces.
  Vehicle-road centerlines cannot fabricate sidewalks or crossings, and people
  may not be placed on vehicle-only or engineered transport surfaces.
- New work is worldwide unless the underlying licensed data is explicitly
  regional. No city-specific geometry or test-only camera may define success.
- A count-only check is not visual evidence. Final frames must contain the full
  assembled game, including terrain, water, buildings, transport, population,
  atmosphere, HUD, collision, and player control.
- One bounded authority change is completed, inspected, documented, and
  checkpointed before the next begins.

## What the current codebase already contains

| Product system | Current 4.3.1 implementation | Status |
| --- | --- | --- |
| Fixed-location Earth | Atomic selected-location loading, cancellation, immutable world publication, fixed regional context, and explicit teardown | Released and gated |
| Terrain and land cover | 41 integrity-checked accepted-ground artifacts, datum/provenance contracts, WorldCover, polar surfaces, far terrain, seam authority, and labeled fallback terrain | Released; accepted-ground coverage is partial |
| Roads and structures | One compiled transport surface for roads, junctions, bridges, ramps, elevated roads, overpasses, underpasses, and tunnels | Released and gated, with source-data limitations |
| Buildings and facades | Overture/OSM selection, stable identity, mapped height preservation through LODs, roofs, street-facing entrances, storefront glass, and facade-integrated detail | Released and gated |
| Interiors | Mapped indoor rooms/corridors where available plus deterministic generated multi-floor interiors with stable floor IDs, stairs, elevators, collision, entry, and exit | Released; mapped multi-level ingestion gate incomplete |
| Traversal | Walk, car, drone, plane, boat, underwater, rover, astronaut, rocket, environment transitions, and mode-aware cameras | Released and mostly gated |
| Living world | Mapped-path pedestrian eligibility, varied traffic, parked vehicles, entrances, collision, and bounded LOD publication | Released and gated for representative Earth locations |
| Urban Sandbox | One six-slot Backpack model, equipment actions, ammunition, vehicle entry/exit and doors, actor collision, civic responders, custody, mapped police/hospital recovery, and room authority | Released, gate incomplete |
| Explorer and Discovery | Deterministic local activities, a small wildlife/catalog foundation, field equipment, Journal, Field Guide, collection, goals, progression, companions, and account-backed item/trade services | Released foundation; complete field-game loop and ecology are not implemented |
| AR | Capability-aware WebXR, camera overlay, and interactive-3D fallback for companions, specimens, and habitat-gated virtual wildlife surveys | Released, gate incomplete |
| Water and Ocean | Published water ownership, surface boat, waves, wakes, shoreline transfer, underwater mode, bathymetry evidence, generic fish life, and boat-only fishing with 14 catalog species | Released foundation; bathymetry, regional fish ecology, shore fishing, and journey coverage are partial |
| Live Earth and Live GPS | Observed and modeled provider registry, aircraft, satellites, earthquakes, weather, marine/water-level context, street imagery, and bounded foreground GPS following | Released; Live GPS movement is gated, but proximity-backed field progression is not implemented |
| Games and progression | DeFlock Hunt, fishing, flower challenge, Paint Town, activity discovery, Explorer progression, shared room activities, and several leaderboards | Released, gate incomplete |
| Multiplayer | Bounded authenticated rooms, private codes, public discovery, presence, chat, artifacts, blocks, world edits, activities, social data, and two-client convergence | Released; resilience and moderation are partial |
| Creation tools | Overlay editor, local drafts, backend submission/moderation, public overlay layer, activity creator, activity library, creator profile, editable rooms, and block builder | Mixed: overlay workflow partial; activity publishing local-only |
| Moon, Mars, Space, and universe | Planetary traversal, surface vehicles, tracks, catalog stars, solar-system navigation, spacecraft, deep-sky destinations, encounters, and return lifecycles | Released and environment-lifecycle gated |
| Account, admin, and security | Authentication, account management, entitlements, admin operations, analytics link, moderation surfaces, security rules, emulator tests, and immutable release builds | Released and security gated |
| UI, mobile, and accessibility | Responsive title/game shell, working mobile Live GPS access under Games, hard-coded touch profiles, partial screen-layout ownership, semantic labels/live regions, and keyboard/gamepad inputs | Released; configurable control and accessibility gates are incomplete |
| Public landing and documentation | Public launch flow, current gameplay gallery, GitHub Pages, source/data/limitations documentation, and release identity | Released; gallery refresh remains planned |

## What is genuinely missing or incomplete

The following findings come from the current source, not the historical roadmap:

- **Crafting is not implemented.** There is no recipe, ingredient, crafting
  transaction, or crafted-item authority in the current product path.
- **A unified mission and economy system is not implemented.** “Missions” exists
  as navigation language and individual games have rewards/scores, but there is
  no authoritative mission lifecycle, wallet, currency, pricing, or economy.
- **Live GPS is not yet a complete field game.** It follows a foreground device
  through the bounded Earth world, but there is no trusted field-session ledger,
  accuracy-aware proximity reward authority, route lifecycle, daily/weekly field
  work, seasonal encounter operation, or server validation of walking evidence.
- **Regional biodiversity is not production-complete.** Discovery uses a small
  local deterministic grid and a few generic wildlife archetypes; it does not
  have one licensed, versioned catalog and regional population pipeline for
  animals, insects, plants, fish, seasons, habitats, provenance, or sensitive
  species.
- **Fishing is boat-only and ecologically broad.** The 14-species catalog uses
  water-kind and latitude filters. Shoreline access, waterbody identity,
  regional/seasonal fish pools, and a shared boat/shore/underwater population
  authority are missing.
- **Mobile controls are not configurable.** Existing touch profiles emulate
  fixed keys; users cannot remap semantic actions, move/resize controls, choose
  handedness, save profiles, validate conflicts, or prove that a saved setting
  changes the underlying gameplay action.
- **Complete physical player embodiment is not implemented.** Equipment has
  first-person/world visuals and the walking actor is visible, but there is no
  single full-body/hand interaction contract covering every traversal mode,
  item action, camera, collision, and multiplayer representation.
- **Generated multi-floor interiors are implemented.** The remaining indoor gap
  is different: mapped indoor ingestion currently selects one mapped level
  before publication, while generated eligible buildings can publish multiple
  floors with stairs and an elevator.
- **Activity publishing is not production-complete.** Authored activities are
  stored in a local browser library and the UI explicitly says backend
  publishing comes later. Built-in and room activities are separate paths.
- **Overlay editing is more than a mock, but still beta.** Submission,
  moderation, admin review, and public overlay code exist; the release pipeline
  does not yet prove the entire non-admin-to-admin-to-second-client workflow.
- **Current feature verification is narrower than the feature set.** The release
  pipeline proves the assembled Earth world, JFX surface ownership, representative
  locations, actor/vehicle contact, environment ownership, Live GPS, security,
  and two-client multiplayer. It does not yet run full Discovery, AR, interior,
  fishing, DeFlock, creator, civic-response, or accessibility journeys.
- **Terrain is not globally accepted bare earth.** The catalog contains 41
  reviewed fixed-location artifacts; the documented global fallback has a mixed
  vertical datum that is not proven uniform.
- **Ocean depth coverage is limited.** Depth evidence and fallback labeling are
  implemented, but the reviewed bathymetry experience is not yet globally
  consistent.
- **Performance has mechanisms but no public numeric budget matrix.** On-demand
  modules, cancellation, batching, lifecycle scopes, and teardown exist; named
  desktop/mobile hardware budgets for load time, frame time, memory, network,
  draw calls, and teardown retention still need to be measured and enforced.
- **Accessibility is implemented unevenly.** Many controls have labels, live
  regions, keyboard/touch equivalents, and layout protection, but there is no
  end-to-end keyboard, focus, contrast, reduced-motion, text-scaling, and
  screen-reader release gate.

## Current completion program

### CP0 — Make release evidence match the current product

**Status: In progress — first priority**

Current evidence already covers source integrity, provider pinning, immutable
artifacts, security rules, two-client multiplayer convergence, the assembled
Earth world, JFX, worldwide representative locations, actors/vehicles, Live GPS,
and Moon/Mars/Space/Ocean ownership.

Required work:

1. Add normal-input immutable-candidate journeys for Discovery, companions, AR
   fallback, generated multi-floor interiors, mapped interiors, fishing,
   DeFlock, Urban Sandbox equipment, vehicle entry/exit, civic response, overlay
   submission/moderation, and activity creation/testing.
2. Add desktop and mobile viewport coverage for every retained primary screen.
3. Require final screenshots only after the matching runtime checks pass; inspect
   complete frames rather than isolated feature scenes.
4. Remove or correct stale program-status metadata whenever a release changes
   the actual product state.

Done when:

- Every public 4.3.1 feature claim maps to a current runtime journey, a security
  contract where applicable, and a named failure report.
- A feature without a passing journey is labeled partial or removed from public
  claims until completed.

### CP1 — Preserve one deterministic fixed world

**Status: Released foundation; ongoing production hardening**

Required work:

1. Keep one location identity from selection through provider bounds, snapshot,
   scene roots, gameplay systems, multiplayer frame, and teardown.
2. Make provider priority deterministic and independent of response order.
3. Expand accepted-ground coverage only through reviewed artifacts with explicit
   source release, license, correction, datum, confidence, and integrity data.
4. Verify provider outage behavior for buildings, transport, terrain, land cover,
   hydrology, imagery, and Live Earth without erasing unrelated world layers.
5. Retain current mapped building heights and regional detail across every
   quality tier.

Done when:

- Repeated loads of the same accepted snapshot publish the same identities,
  dimensions, surfaces, and scene ownership.
- Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural Iowa, and Tokyo
  pass primary and documented fallback-provider runs, followed by full-frame
  review.

### CP2 — Finish worldwide roads, bridges, and vehicle contact

**Status: Released and strongly gated; known data-dependent limits remain**

Required work:

1. Keep source identity through selection, deduplication, topology, vertical
   constraints, profile reconciliation, structure assembly, publication,
   traversal, collision, and rendering.
2. Maintain solid at-grade road footprints and complete turn/junction enclosure
   without paving unrelated mapped ground.
3. Retain one symmetric physical deck and support relationship for bridge
   landmarks such as Golden Gate.
4. Verify bridge/ramp/overpass/tunnel endpoints under primary and fallback
   provider sequences; classify incomplete mapped connections honestly instead
   of inventing geometry.
5. Keep traffic wheel contact bounded on slopes and keep people off ineligible
   road, bridge, and tunnel surfaces.

Done when:

- The worldwide matrix reports no authoritative discontinuity, infeasible grade,
  folded road triangle, degenerate triangle, junction-coverage gap, duplicate
  physical surface, or vehicle wheel penetration.
- Full gameplay frames show solid road surfaces and structure transitions at the
  same coordinates and paths used by the automated checks.

### CP3 — Complete buildings, street facades, entrances, and interiors

**Status: Released foundation; mapped multi-level and interaction gates partial**

Required work:

1. Preserve mapped height, levels, roof, use, material, name, identity, and
   provenance from provider data through footprint deduplication, budgets,
   batching, LOD, scene attachment, collision, and final visibility.
2. Keep street-facing entrances and storefront glass inside the owning facade
   material; do not add a duplicate facade or building renderer.
3. Verify contextual keyboard and touch entry from an actual street approach in
   dense, sparse, sloped, and non-gridded cities.
4. Extend mapped indoor ingestion to retain multiple mapped levels and explicit
   stairs/elevators where the source supports them. Do not replace mapped rooms
   with generated layouts.
5. Make generated interior variety deterministic by footprint, building use,
   size, entrances, mapped levels, and world identity.
6. Finish indoor overlay publication so authored rooms/connectors affect the
   same interior navigation, collision, and multiplayer anchor authorities.

Done when:

- Exact mapped-tall identities remain visible at authoritative height in all
  LODs.
- A mapped single-level building, mapped multi-level building, generated small
  building, generated high-rise, and moderated indoor overlay each pass door
  approach, entry, stairs/elevator, collision, multiplayer anchoring, exit,
  reload, and teardown journeys.

### CP4 — Unify player, Backpack, Journal, progression, and controls

**Status: Partial**

The current equipment adapter and Discovery inventory both use the shared
Backpack model, but equipment persistence, Discovery profile persistence,
account-owned items, progression events, and UI surfaces still need one explicit
cross-system contract.

Required work:

1. Define one player identity and revisioned state schema for condition,
   position, active mode, Backpack items, hotbar, equipment state, Journal,
   Field Guide, companions, and Explorer progress.
2. Define which fields are anonymous-local, device-local, account-backed,
   room-authoritative, or trusted-server-owned, including migration and conflict
   rules.
3. Introduce one semantic input-action authority. Keyboard, touch, pointer,
   gamepad, accessibility devices, contextual action, pause, editor, AR,
   interior, and multiplayer map into actions instead of manufacturing keyboard
   events inside gameplay systems.
4. Keep the current direct-control style as the shipped default. Add revisioned,
   named user profiles that can remap, drag, resize, change opacity/handedness,
   tune sensitivity/dead zones, choose hold/toggle and haptics, validate
   conflicts, survive reload, restore mode defaults, and always expose a
   recovery/reset path.
5. Prove each setting through actual action state and gameplay results across
   walk, vehicle, boat, plane, drone, ocean/space, and Live GPS profiles. A
   settings toggle or saved JSON value alone is not acceptance evidence.
6. Prevent duplicate rewards by giving every authoritative discovery, game,
   trade, and mission event a stable event identity.
7. Verify account sign-in/out, offline use, reload, device migration, and account
   deletion without losing or duplicating eligible state.

Done when:

- One event creates at most one reward and every UI reads the same player state.
- Walking, vehicle, boat, drone, plane, interior, AR, planetary, editor, and room
  transitions preserve only the state each mode is allowed to own.
- A user can change a touch binding and layout, observe the intended gameplay
  action change, reload and retain it, resolve conflicts, switch modes without
  stuck input, and restore the tested default profile.

### CP5 — Finish the Urban Sandbox as a coherent gameplay system

**Status: Partial**

Current code already includes usable equipment, projectiles, impacts, actor
collision, vehicle claims, driver-side doors, enter/exit transitions, room
authority, responders, civic attention, custody, and mapped facilities.

Required work:

1. Add release journeys for every equipment verb, ammunition/quantity change,
   collision outcome, vehicle claim, door transition, room handoff, civic level,
   responder arrival, arrest, incapacitation, and recovery.
2. Define and implement the retained scope of physical player embodiment. If a
   full body/hand system is not part of the product, remove the stale program
   promise rather than leaving a permanent spike.
3. Make vehicle dynamics, visual doors, active actor ownership, camera, collision,
   and multiplayer pose consume one enter/exit transition.
4. Keep police, hospital, ranger, campus, and other facility behavior tied to
   verified mapped facilities. Missing data must not fabricate a real place.
5. Keep ambient pedestrian eligibility separate from explicit responder
   gameplay, and never spawn people on vehicle-only transport surfaces.

Done when:

- Each interaction works by normal player input in the complete world and
  produces the same result locally and in a supported room.
- No transition duplicates the car, player, responder, Backpack, condition, or
  custody authority.

### CP6 — Build the missing missions, crafting, economy, and engagement layer

**Status: Not implemented as a unified system**

Current games, Discovery goals, trades, scores, catches, collections, and
leaderboards are foundations; they are not a unified mission/economy system.

Required work:

1. Decide whether crafting belongs in the product. If retained, define recipes,
   ingredient provenance, validation, inventory transactions, persistence,
   rollback, UI, and server authority before adding crafting buttons.
2. Define a mission schema with eligibility, objectives, progress events,
   completion, failure/cancellation, rewards, replay policy, location scope,
   multiplayer behavior, and version migration.
   Daily Field Notes, weekly Expeditions, seasonal/community surveys, routes,
   collection challenges, specialties, and companion objectives must use this
   same lifecycle rather than separate counters.
3. Define whether the product needs currency. If retained, add one server-owned
   ledger, transaction idempotency, pricing rules, refunds, abuse limits, and
   clear separation from real money.
4. Consolidate leaderboard submission and display contracts for Flower, Paint
   Town, Fishing, Explorer, and DeFlock while keeping game-specific scoring.
5. Connect built-in and moderated player-created activities to the same mission
   and progression events where appropriate.

Done when:

- The chosen feature scope is explicit. Unsupported crafting/economy promises
  are removed; retained systems work end to end and are security tested.
- Rewards and leaderboard entries cannot be forged, duplicated, or credited to
  the wrong player/location/version.

### CP7 — Complete Live GPS Field Expeditions and regional ecology

**Status: Foundations released; complete system not implemented**

The source of truth for this checkpoint is the
[Field Exploration and Mobile Control Plan](docs/FIELD_EXPLORATION_AND_MOBILE_CONTROL_PLAN.md).
The current GPS follower, deterministic Discovery cells, Journal, Field Guide,
companions, and small wildlife catalog are inputs to this program; none alone is
evidence of the complete real-world field game.

Required work:

1. Add one field-session authority that records consent, movement source,
   foreground state, accuracy, speed class, distance, pause reason, and reward
   eligibility without retaining raw routes by default.
2. Add one accuracy-aware proximity authority using safe/public approach
   surfaces, barrier/access checks, speed rules, hysteresis, and versioned,
   field-tested reveal/approach/interact distances.
3. Add a server-owned, idempotent reward ledger. Discovery encounters cannot
   mint their own progression, and manual, GPS, accessibility, vehicle, and
   simulated movement cannot silently receive the same evidence class.
4. Implement the expedition lifecycle and long-term loop: nearby signals,
   Daily Field Notes, weekly Expeditions, routes, seasonal/community surveys,
   life lists, observation quality, habitat/region specialties, collection
   challenges, companion bonds, social Field Parties, and non-punitive return
   incentives.
5. Build one canonical biodiversity catalog and versioned regional ecology-pack
   pipeline for animals, birds, insects/arachnids, plants, and fish. Preserve
   taxonomy, regional/seasonal/habitat plausibility, licenses, attribution,
   provider provenance, uncertainty, and sensitive-species generalization.
6. Replace species-by-tint quality with reviewed hero, modular-family,
   microfauna, fish, and honest reference-fallback tiers. Each shipped asset
   needs anatomy/scale, behavior/animation, LOD, mobile cost, rights, attribution,
   and scientific review evidence.
7. Deliver the staged content gates in the detailed plan: a 60-taxon Baltimore
   vertical slice, a 300-taxon seven-region beta, and an audited worldwide pack
   pipeline before making worldwide-complete claims.
8. Prove consent allow/deny/retry, safe walking, proximity state, three varied
   objectives, Journal/Field Guide evidence class, exact-once rewards, session
   pause/resume, offline/reconnect, battery, privacy, abuse, accessibility, and
   teardown on real phones and the immutable candidate.

Done when:

- A normal production player can begin from the visible mobile Live GPS action,
  walk into defensible range, complete a multi-objective Expedition, record
  credible regional discoveries, receive each eligible reward exactly once,
  and understand why movement or a target is ineligible.
- Daily, weekly, seasonal, social, companion, specialty, and life-list progress
  provide extended play without claiming a generated animal is physically
  present or using punitive streak loss.
- Regional packs are reviewable, versioned, cache-bounded, migratable,
  rollback-able, provenance-labeled, and validated across representative biomes.

### CP8 — Complete Water, Ocean, fishing, and environmental evidence

**Status: Partial**

Required work:

1. Use one published water-surface registry for visuals, boat selection,
   collision, shoreline transfer, underwater entry, fishing, and exit placement.
2. Expand reviewed bathymetry coverage and preserve measured, modeled, inferred,
   and unavailable evidence labels.
3. Add one water-and-fish population authority shared by the boat game, shore
   fishing, underwater schools, Field Guide, and catch records. It owns
   waterbody identity, freshwater/marine/estuary class, regional candidates,
   evidence/confidence, season/time/weather, salinity/current/depth where
   available, gear/bait compatibility, and population/cooldown rules.
4. Evaluate every published waterbody for shore-fishing eligibility using an
   accessible walking/standing surface, cast corridor, safe slope/height,
   barrier/access evidence, a recoverable exit, and a non-empty defensible fish
   pool. `access_unknown` must not be presented as public or legal access.
5. Reuse one cast, bite, fight, catch/loss, record, reward, and teardown event
   path for shore and boat fishing; access method changes reachable depth,
   species, and tackle rather than forking the game.
6. Validate hull contact, grounding, docking, waves, wakes, camera, shore return,
   underwater descent/ascent, shore and boat catch/loss, and teardown in rivers,
   lakes, harbors, coasts, islands, and open ocean.
7. Ensure generated fish and catches are never presented as observed local
   wildlife or surveyed measurements.

Done when:

- Water journeys pass keyboard and touch tests worldwide without crossing an
  unpublished water surface or spawning an actor below accepted ground.
- Every eligible waterbody receives a deterministic shore-fishing result and
  boat/shore catches draw regionally defensible fish from the same authority.
- Depth, access, and wildlife claims visible to the user match their recorded
  evidence and uncertainty.

### CP9 — Complete multiplayer and creator publishing

**Status: Partial**

Required work:

1. Verify reconnect and conflict behavior for presence, chat, artifacts, blocks,
   world edits, active activities, room deletion, owner departure, token refresh,
   duplicate tabs, and offline recovery.
2. Complete report, mute, block, kick/ban, review, audit, retention, and appeal
   paths with least-privilege backend enforcement.
3. Load-test the supported 2–32 player range on named hardware tiers and publish
   evidence-based recommended room sizes.
4. Verify overlay creation through local draft, validation, submission, admin
   moderation, public publication, second-client visibility, revision, rollback,
   and deletion.
5. Replace local-only activity publishing language with a real moderated backend
   workflow, or explicitly retain activity creation as device-local and remove
   public-publishing claims.
6. Make published creator output consume existing world, interior, activity,
   collision, and multiplayer authorities rather than preview-only geometry.

Done when:

- Reconnect produces one room identity and one copy of each shared object.
- Unauthorized publication fails, approved content appears to another client,
  and rollback does not mutate imported base map data.

### CP10 — Measure and control performance, memory, and data use

**Status: Partial**

Required work:

1. Record immutable 4.3.1 baselines for title launch, first controllable frame,
   location load, steady frame time, peak browser memory, retained teardown
   memory, network transfer, provider request count, cache size, draw calls,
   triangles, and textures.
2. Define named desktop and mobile hardware/browser tiers with numeric budgets.
3. Run sustained street, drone, plane, boat, interior, multiplayer, Live Earth,
   Live GPS field expedition, dense creature, shore-fishing, and planetary
   journeys plus ten location replacements and five complete environment cycles.
4. Inventory every cache, provider result, scene root, listener, worker, timer,
   render target, geometry, material, texture, and Firebase subscription by
   lifecycle owner.
5. Remove duplicate or retained owners first. Do not reduce building height,
   mapped density, distant regional detail, or location coverage to make a
   performance chart pass.
6. Bound external requests and stored data; publish privacy, retention, cache,
   offline, and deletion behavior for account and anonymous sessions.
7. Compare FPS, p50/p95/p99 frame time, stalls, draw calls, triangles, programs,
   textures, memory, network, GPS/battery use, and thermal behavior with the
   last production Firebase artifact on the same devices. Low-tier phones must
   hold a measured playable 30 FPS floor; higher tiers target 60 FPS where the
   browser/display permits it.

Done when:

- Named hardware tiers pass numeric budgets using measured candidate data.
- Repeated journeys show no unbounded owner, resource, request, cache, or
  subscription growth and no lower-detail replacement of the selected world.

### CP11 — Complete UI, accessibility, public presentation, and release identity

**Status: Partial**

Required work:

1. Test title, location selection, traversal, HUD, pause/settings, Backpack,
   Discovery, AR, interiors, games, editor, multiplayer, Live Earth, Ocean, and
   planetary flows with keyboard only, touch, gamepad where supported, and
   screen-reader review.
2. Add visible focus, correct focus trapping/restoration, scalable text, contrast,
   reduced motion, non-color status, touch-target, semantic-name, and live-region
   acceptance criteria.
3. Verify configurable touch controls end to end on small/standard/large phones,
   tablets, short landscape, desktop touch, and keyboard/gamepad: edit, preview,
   save, act, mode-switch, reload, conflict handling, reset, one-hand profiles,
   accessibility settings, and recovery. Preserve Live GPS under the mobile
   Games menu unless user research supports a deliberate navigation change.
4. Refresh the landing gallery with a small curated set of real assembled-game
   captures showing actual plane, drone, driving/action, street, water, and world
   variety. Do not use concept art, synthetic cameras, or test-only scenes.
5. Keep landing, README, controls, data sources, attribution, known issues,
   privacy, security, changelog, and roadmap claims aligned with the candidate.
6. Require the repository commit, release tag, public site, immutable build
   manifest, displayed version, and deployment to identify the same build.

Done when:

- All retained primary journeys pass the accessibility matrix on desktop and
  mobile-sized layouts without protected UI overlap.
- Every public image is traceable to a complete runtime capture and every public
  feature claim has matching production evidence.

## Required checkpoint order

Do not work on these as one large change set. Use this sequence:

1. **CP0: current feature evidence** — expose which released systems actually
   fail before changing behavior.
2. **CP1–CP3: world integrity** — location/provider determinism, transport, then
   buildings/facades/interiors.
3. **CP4: player authority** — one state/event/controls contract before adding
   more player systems.
4. **CP5: Urban Sandbox completion** — finish and verify current interactions.
5. **CP6: missing gameplay layer** — decide and then implement or remove
   crafting, missions, and economy promises.
6. **CP7: field Expeditions and ecology** — trusted proximity, durable
   progression, regional biodiversity, and reviewed creature quality.
7. **CP8: water and fishing completion** — one water/fish authority, eligible
   shoreline access, regional pools, and worldwide journeys.
8. **CP9: online creation** — multiplayer resilience and creator publication.
9. **CP10: measured performance** — enforce memory, network, battery, and
   hardware budgets without reducing mapped detail.
10. **CP11: professional release pass** — configurable-control proof,
   accessibility, landing presentation, documentation, immutable candidate, and
   release identity.

After every confirmed improvement: inspect the complete final frames, update the
progress and regression record, and create a labeled local checkpoint before the
next authority changes.

## Definition of roadmap completion

The current roadmap is complete when:

- Every CP item is either **complete** with its stated evidence or explicitly
  removed from product scope and public claims.
- No beta, local-only, preview-only, scaffold, or unsupported backend path is
  described as a complete production feature.
- The same immutable candidate passes source, security, provider, world,
  transport, building, interior, actor/vehicle, Urban Sandbox, Discovery, AR,
  field Expeditions/proximity/ecology, regional shore/boat fishing, configurable
  controls, game, Ocean, Live Earth/GPS, planetary, multiplayer, creator,
  performance, battery, memory, accessibility, and final-frame review.
- No completion depends on a city-specific patch, fake measurement, duplicate
  layer owner, synthetic gameplay image, or reduced mapped detail.

## Future work outside the current completion program

- Dedicated licensed rail, bicycle, and hiking gameplay. Parsed geometry and
  editor presets alone are not gameplay modes.
- Additional scientifically grounded planetary surfaces and catalog-backed
  destinations.
- Deeper astronomical navigation and flight simulation. Current scale remains a
  playable visual model, not an orbital simulator.
- Historical or reconstructed environments only with adequate provenance,
  uncertainty labeling, and rights.
