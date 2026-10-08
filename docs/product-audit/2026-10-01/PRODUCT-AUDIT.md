# World Explorer 3D: product and game-design audit

October 1, 2026 · Current deployed runtime source `1532bdfbb5c11e002d278b058d1ebdba88384f60`

**Recommendation: build a coherent exploration sandbox around the systems you already have. Finish complete, beautiful expeditions before adding more destinations or disconnected activities.**

World Explorer already has substantial machinery: real-location Earth generation, multiple vehicles, shared building, discovery records, skills, simulated commerce, live-data layers, planetary exploration, a walkable starship, and science missions. The largest deficit is the connection between those systems and the experience presented to a player. Visual quality, location identity, progression, and interaction depth vary sharply between environments.

The proposed product promise is: **Explore real Earth and modeled worlds, undertake expeditions, make discoveries, and build places worth returning to—alone or with friends.** Earth remains grounded in real geography. Oceans extend that geography below the waterline. Space combines observed astronomy with clearly identified modeled or fictional environments. One explorer, a consistent interaction language, and a persistent Journal connect them.

This is a design recommendation, not a decision to remove existing work. Preserve saves, locations, games, vehicles, and tools. Reorganize their role and replace weak presentation gradually.

## What this audit actually establishes

This is a product-wide, feature-level audit with deeper implementation inspection of ocean, space, progression, travel, scene presentation, and authority boundaries. It is **not** a line-by-line certification of the whole repository or an assertion that every activity has been newly played to completion.

- Inventoried **828 JavaScript files under `app/js`, across 60 directory groups including root modules**. The inventory records paths, sizes, and hashes; existence is not completion evidence.
- Inspected current code paths and integration points, rather than treating historical design documents as requirements.
- Ran fresh, isolated-browser visits to Ocean, Space, Mars, and Moon on the deployed source's staging package. Each entered its intended environment and accepted a short control-input sequence without a page exception. Captured and inspected arrival and movement screenshots. These are visual/control samples, not full mission acceptance or performance benchmarks.
- Reinspected the approved Baltimore full-world capture from this exact release. This is existing release evidence, not a new Earth playthrough.
- Reproduced two bathymetry sampling problems with an isolated source probe. This is not a live provider-outage test.
- Researched primary sources from Hello Games, Unknown Worlds, NOAA, GEBCO, Open-Meteo, OBIS, Sketchfab, Three.js, and Khronos. References identify design precedents and data limitations; they do not reveal proprietary game-engine internals.
- Prior release evidence includes 62 candidate gates and 13 backend stages. Those establish specific functional contracts; passing them does not establish compelling game design, photorealism, or beginner comprehension.

Live build observed during this audit: `5.4.0+1532bdfbb5c1.319d215f60318297.production`. Fresh browser sample: `5.4.0+1532bdfbb5c1.fe95c383df828633.staging`. No production changes, purchases, save migrations, or gameplay edits were made for this audit.

Read alongside [Ocean and space design](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/OCEAN-AND-SPACE.md), [Ownership and delivery plan](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/DELIVERY-PLAN.md), and [evidence index](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/EVIDENCE.md).

## The main problems, in priority order

### 1. The game presents capabilities before it explains their purpose

The interface exposes exploration, transport, backpack, community, building, field goals, mini-games, live Earth, ship expeditions, and multiple travel methods. Existing Explore/Build/Together walkthroughs are a useful improvement, but cannot alone explain why all the systems belong together. A first-time player needs to understand where they are, what is interesting nearby, what they can do now, and what that action changes.

**Change:** keep free exploration immediately available and add a single active expedition card. Offer a few contextual opportunities, each with a destination, activity, approximate session length, required capability, and concrete outcome. Put optional games in an Activity Board. Keep Live Earth as a map/instrument workspace connected to playable destinations. Avoid another top-level menu for each feature.

**Acceptance:** an uncoached new player can select a destination, do one meaningful action, see the saved result, and explain the next opportunity. Measure this with people, not just selectors in automated tests.

### 2. Important product words promise more than the implementation supplies

The character system describes swimming and a Strong Swimmer trait, and defines dive-kit capabilities. The inspected travel and ocean controllers do not supply the corresponding on-foot swimming/scuba experience. A 78 m research vessel is already in the maritime catalog, but its catalog dimensions and vehicle boarding do not provide an expedition ship with a walkable working deck, equipment stations, and a deployable submersible.

**Change:** treat every public capability as a contract: entry conditions → visible action → physical behavior → outcome → persistence → recovery. A catalog entry, model, interface button, or capability score is only part of that contract. Maintain an explicit status for every feature: playable, limited, experimental, or planned.

### 3. The ocean looks generic because its construction is generic

The underwater renderer builds a fixed-size seabed, repeated primitive reef forms, a primitive submarine, and particles. It supports different launch coordinates and fish population context, so it is not literally limited to one hard-coded coordinate. However, it still uses one scene recipe, one bundled Great Barrier Reef depth grid, a small global sample grid, a 1,200-unit movement radius, and a -210 vertical floor limit. Its procedural reef shape survives regardless of whether the selected location should be a reef, estuary, lake, or abyss.

**Change:** keep useful bathymetry provenance and fish systems. Replace the scene recipe with region-specific seabed tiles, habitat placement rules, local landmarks, authored exploration routes, and a shared surface/underwater water model. Start with a complete coastal expedition and a separate reef destination. Do not spread tropical coral over every water body.

### 4. Some scientific-looking presentation is not scientific data

Confirmed examples:

| Finding | Evidence | Required correction |
|---|---|---|
| Ocean shortcut accepts the selected coordinate without a water eligibility check in that shortcut path | Fresh entry at Baltimore; `globe-selector.js:startSelectedOcean`, `title-screen.js:onOceanShortcut` validate selection/numbers but not submerged suitability | Use the same surface/water eligibility authority as normal travel. Offer a nearby valid site or an explicitly fictional preview when the selected point is unsuitable. Do not silently substitute. |
| The “BATHYMETRY” minimap draws sinusoidal decorative bands | `ocean/hud.js:drawOceanNavigationMap` | Draw contours from the same seabed field used by collision. Mark unknown cells and surveyed coverage; otherwise label it a schematic. |
| Missing bathymetry cells become numeric zero during interpolation | `Number(grid.values[...])`; isolated grid `[null,-80,-80,-80]` returns a modeled 60 m depth at its center | Keep missing data missing; use a documented valid-neighbor policy with confidence, or return unknown. |
| Samples beyond the ±900 grid extent are clamped to its edge | Probe at x=1,100, within the 1,200-unit play radius, returns the edge's depth | Reject out-of-coverage sampling or stream the next tile. Never claim the edge value as a fresh local sample. |
| Real elevations are compressed and blended with invented relief | `mapBathymetryMetersToWorldY` and `sampleSeabedHeight` | Separate real depth from presentation scaling. For accurate local diving, use real meters and a common datum; generated microdetail must remain identified as modeled. |
| Space arrival UI can say “Ready to land” alongside an altitude of 15,227 km | Fresh Space arrival capture; classic fallback checks render-distance while physical journeys have separate eligibility | Use explicit phases: course available, transfer available, approach, landing corridor. Resolve all landing UI through the applicable navigation authority. This is a confirmed wording/scale inconsistency, not a newly verified landing collision bug. |

A coordinate label does not make a scene geographically accurate. A modeled forecast is not a sensor observation, and a generated organism is not evidence of a real animal at that point.

### 5. Progress exists, but the player-facing progression ladder is fragmented

Character specialties/proficiencies, discovery novelty credit, expedition resources, destination mission phases, research fabrication, wallet receipts, property activity, and mini-game rankings already exist. There is real work here to retain. However, several stores and score systems have different meanings, and destination missions share a broad briefing/approach/fieldwork/analysis structure. More mission titles do not create more mechanical variety.

**Change:** keep domain-specific data, but present one Explorer Profile and one Journal. Make advancement unlock useful capabilities, better instruments, new expedition types, customization, and home improvements. Explain the benefit before the task. Do not create a new universal currency or wipe existing balances just to unify the UI. A repeatable scan button with different text is not a new expedition.

### 6. Scene quality has no consistently enforced acceptance bar

Fresh captures show a detailed Mars rover surrounded by broad, sparsely differentiated ground; a substantially simpler Moon rover against soft terrain; and an ocean dominated by repeated primitive forms. The current Baltimore aerial capture has much more geographic content, but repeating façades and weak local composition still limit its sense of place. These observations apply to the inspected views, not every possible location or lighting condition.

**Change:** adopt an art direction and a location completion checklist. Upgrade composition, ground materials, scale, lighting, landmarks, interaction, animation, sound, and habitat distribution together. Replacing one vehicle with a high-detail model will expose the contrast with unfinished surroundings.

### 7. Transition correctness and gameplay continuity must be the same work item

Boat → underwater currently suspends the boat and starts a separate submarine scene. Surfacing may recreate a synthetic surface-water patch. That supports a mode transfer, but not the requested physical research-ship relationship. Space has world addresses, travel sessions, campaigns, pod journeys, and mission phases; these are stronger foundations but still need one understandable travel story.

**Change:** every transfer carries the same entity IDs, destination address, parent vessel, equipment, mission, cargo, orientation, time policy, and return point. Loading may be necessary in a browser; preserve continuity across it. Verify interrupted, cancelled, failed, and rejoined transitions.

### 8. More geometry could worsen the exact stalling you dislike

There is an existing runtime kernel, lifecycle ownership, deferred work policy, asset budgets, and release performance evidence. Keep them. The ambition should be richer visible scenes with predictable loading, not maximum triangles everywhere.

**Change:** load detail around the player, retain a coherent distant world, warm expensive resources before control-critical moments, bound compilation work, and profile frame-time spikes during transfers. Judge new scenery by its visual improvement and worst stalls on target devices. Average FPS alone misses the problem.

## Product-wide coverage and disposition

“Keep” means preserve the investment, not certify that every detail is finished. Rows marked “inspect further” are concrete follow-up requirements rather than confirmed defects.

| System | Current foundation inspected or inventoried | Product role and next work |
|---|---|---|
| Start screen, location selection, tutorials | Globe selector, Explore/Build/Together, contextual controls | Keep; unify arrival briefing and next action. Repair ocean eligibility. Test new-player understanding. |
| Earth coordinates and terrain | Accepted-ground, surface-domain, location sessions, source metadata | Core differentiator. Publish coverage/quality clearly; preserve physical versus visual surface separation. |
| Roads, bridges, tunnels, buildings | Large world-generation and transport-structure subsystems | Keep; finish believable streets and route continuity in showcase districts before adding countless new presets. |
| Regional vegetation and wildlife | Biome profiles, regional ecology, curated animal/vegetation assets | Keep; enforce regional habitat, density, season, and animation rules. Avoid random decorative distribution. |
| Earth lighting and weather | Sky, weather, water evidence, world conditions | Make lighting, clouds, visibility, precipitation, and ground response consistent. Establish time policy shared with gameplay. |
| Walking and character | Collision, held equipment, animation, skills | Add actual swimming/boarding interaction states; unify hands, feet, camera and equipment presentation. |
| Driving, traffic, civic systems | Vehicles, impacts, responders, living-world navigation | Preserve repaired movement. Separate optional action/civic play from peaceful expedition defaults; inspect fairness/recovery. |
| Aircraft and drones | Flight dynamics, airports, facilities, roof contact | Give them exploration jobs: coastal survey, aerial photography, route scouting. Standardize launch, landing, abort and recovery. |
| Surface vessels | Seven maritime catalog types, facilities, handling, damage | Keep boats; upgrade research vessel as a functional mobile expedition base. Large-vessel entry is not a full interior. |
| Underwater world | Bathymetry, fish populations, scene renderer, sub controls | Largest design/visual gap. Build regional environments and real water traversal, not a reef reskin. |
| Fishing | Shore/boat eligibility, population authority, fishing mini-game | Keep as optional expedition activity, with consistent species habitat and Journal/catch outcomes. |
| Space flight and maps | Solar system, celestial catalog, Wayfinder, physical and classic paths | Keep; one navigation vocabulary and travel-phase display across all entry paths. |
| Planetary surfaces | Body-specific environments, surface/world-address authorities, traversal restrictions | Preserve scientific distinctions. Improve terrain, route design and field verbs at a few showcase sites. |
| Exoplanets and deep space | Observed and modeled catalog, generated appearances, missions | Keep uncertainty labels. Build original fictional frontier biomes where artistic freedom is needed. |
| Solis Reach and Pathfinder | 25 rooms, live observation feeds, navigation, equipment, pod cycle | Keep recent traversal repairs. Make rooms support comprehensible expedition operations; don't add decorative rooms as “gameplay.” |
| Crew, ship resources, voyage events | Campaign, long-duration simulation, failure/command authorities | Keep depth available, but introduce gradually. Decide what beginners automate and what experts manage. |
| Research, fabrication and science samples | Workbenches, provenance, cargo and resource costs | Strong candidate for shared expedition progression. Broaden mechanics beyond collecting generic points. |
| Discovery, field tools, Journal | Activity verbs, specimen records, event history, novelty credit | Core loop. Make methods affect evidence quality and next opportunities; distinguish records from owned inventory. |
| Skills and character progression | Attribute milestones, specialties, qualifications, repetition limits | Present useful effects. Remove or qualify capability claims without playable support. Preserve existing progress. |
| Companions | Ownership, training and runtime behavior | Keep optional; test vehicle boarding, water/space restrictions and recovery rather than letting every animal follow everywhere. |
| Mini-games | Free, trial, checkpoint, Paint Town, Flower, DeFlock, GPS paths | Consolidate discoverability, start/stop/results and replay; separate arcade scores from expedition qualification. |
| Nearby authored activities | Schemas, anchors, routes, creator/library/session systems | Turn into the common Activity Board; validate routes against actual reachable surfaces and vehicles. |
| Building and editable world | Blocks, collision, local store, shared sync, suppression/restoration | Keep; make local, room, owned-property and public edits unmistakable. Undo must cover the actual mutation owner. |
| Homes, property, economy | Housing/parcels, property authority, wallet and commerce receipts | Keep optional long-term investment; make simulated ownership explicit. Inspect cross-device continuity and economic balance. |
| Multiplayer and shared expeditions | Room roles, vehicles, world edits, expedition revision handling | Extend existing authorities. Test host loss, late join, concurrent boarding, shared rescue and cargo ownership. |
| Live Earth | Weather, marine, transport, satellite, earthquake, imagery providers | Make it a planning/instrument layer. Live observed entities and spawned game entities need distinct identity and provenance. |
| GPS and AR | Explicit permission and privacy text, bounded field sessions, capability gating | Keep optional. They must not become prerequisites for normal progression or a substitute for location validation. |
| Reality Capture and creator tools | Drafts, capture/review/runtime representations, moderated access | Valuable long-term route to better Earth detail. Require registration, collision, budgets and review before world publication. |
| Rankings and social | Per-activity catalogs, community rooms/chat | Keep opt-in; inspect competitive trust separately from local sandbox records. Moderation and reporting remain product features. |
| Accessibility and controls | Settings, keyboard/mobile policies, focus support | Expand coverage to diving, map use and vessel interaction. Test remapping, touch, captions, motion reduction and non-color cues. |
| Audio | Separate audio implementations found in discovery, ship, action and interception systems | Establish one mixer/ownership policy and environment soundscape standard. No claim that the whole game currently lacks audio. |
| Accounts, billing and entitlements | API clients and backend boundaries inventoried | Preserve. Audit load failures, restoration, cancellation and entitlement messaging before tying advanced expeditions to paid access. |
| Backend, privacy and security | Existing transaction/revision/receipt mechanisms and release checks | Not absent; document ownership and threat boundaries. No comprehensive new penetration test performed. |
| Operations, costs, content rights | Asset catalog budgets/attribution, provider caching, deployment evidence | Maintain per-provider/asset obligations, cost limits and failure behavior. Inspect actual commercial agreements before relying on free endpoints. |
| Documentation and release governance | Exact artifact receipts; stale `CURRENT-STATE.md` observed | Generate current-release pointers from receipts and assign feature owners. Old prose cannot be production authority. |

## What to borrow from established games

There is no single “best” precedent for this hybrid. Borrow a specific successful design pattern and test it in your own game. These comparisons are recommendations, not claims of equivalent scope or proprietary technical knowledge.

| Precedent | Useful pattern | World Explorer adaptation |
|---|---|---|
| No Man's Sky | Discoveries, destination guidance, useful milestones, coherent environmental presentation | Space exploration that leads to capabilities and memorable places; one route and objective through map, ship and surface. |
| Subnautica | Depth and distinct biomes make equipment and vehicles meaningful | Coast → reef/kelp → deeper survey progression; preparation, descent, observation, return. Preserve real marine ecology on Earth. |
| Sea of Thieves | A shipboard table organizes voyages by activity and session scope | Research ship and Solis Reach use comparable expedition planning, while retaining different navigation and physics. |
| Minecraft | Clear building verbs and different resource expectations for creative play | Keep free building understandable; separate creative permissions and competitive progression without fragmenting world identity. |
| Microsoft Flight Simulator | Global coverage with selected detailed places | Broad Earth accessibility plus carefully authored showcase regions; don't imply uniform street-level reconstruction. |
| NOAA exploration practice | Mapping, instrument deployment, observation and interpretation | Marine gameplay based on survey decisions and evidence, rather than collecting objects indiscriminately. |

Supporting sources: [NMS Expeditions](https://www.nomanssky.com/expeditions-update/), [NMS Worlds I](https://www.nomanssky.com/worlds-part-i-update/), [NMS Worlds II](https://www.nomanssky.com/worlds-part-ii-update/), [Subnautica Seamoth](https://unknownworlds.com/en/news/subnautica-seamoth-update-released), [Sea of Thieves Season 11](https://www.seaofthieves.com/season-11), [Minecraft play modes](https://www.minecraft.net/en-us/article/creative-vs-survival-mode), [MSFS detailed locations](https://www.flightsimulator.com/june-8th-2023-development-update/), [NOAA research vessel](https://oceanexplorer.noaa.gov/okeanos/about/).

## A coherent player experience

**Choose a place → find a question or opportunity → prepare automatically where appropriate → travel → explore and act → receive a meaningful result → save or share it → unlock a reason to return.**

Free exploration remains valid at every point. Progression should expand agency instead of forcing chores before the player can see the world. Build/Home supplies a personal anchor; Community supplies optional collaboration; games supply optional skill challenges. Vehicles connect places and activities. Live data changes expedition context without pretending to reconstruct reality perfectly.

A single active objective should identify the next physical action and its location. The Journal should link the result to the subject, region, method, evidence quality, reward, and follow-up. The map, objective card, compass and room briefing must refer to the same target.

## Graphics: what “professional” should mean here

Use believable scale and materials with controlled, readable lighting. Earth should look regionally recognizable; the ocean should show depth, suspended matter, habitat transitions and life behavior; space should have strong silhouettes, atmospheric separation and body-specific terrain. Fictional space worlds may be more stylized and colorful, but use the same material quality and interaction language.

A finished location needs a recognizable arrival, navigable foreground, distinctive middle-distance landmarks, coherent horizon, several meaningful interactions, environmental motion, sound, recovery routes, and a reason to revisit. Detail should cluster where the environment would support it and where players can perceive it. Natural emptiness can be convincing; repeated empty patches with no composition or purpose are different.

Replacing every ocean object with the most detailed Sketchfab model is not the right quality policy. Select a compatible asset family, normalize scale/materials, author animation and collision, and build several LODs. Render small repeated life with instances; keep unique detail for close inspection and major landmarks. Texture memory, material count, transparent overdraw and animation cost matter as much as polygons. [Three.js optimization](https://threejs.org/manual/pages/optimize-lots-of-objects.html) and [Khronos runtime asset delivery](https://www.khronos.org/gltf/) support this browser-oriented approach.

## What I would build first

1. **Repair misleading entry/data behavior and define ownership.** Ocean eligibility, genuine map contours, depth coverage, one current travel/expedition state, and an explicit capability status list.
2. **Deliver one complete ocean expedition.** A usable research ship, automatic swimming/dive equipment, deployable submersible, an attractive geographically appropriate underwater site, meaningful research, recovery, saved results, and a second visit that demonstrates progression.
3. **Deliver one complete space expedition at the same quality bar.** Solis Reach briefing → route selection → flight/transfer → landing → field investigation → shipboard analysis → useful improvement → next destination.
4. **Extend the proven pattern.** Upgrade a flagship Earth district, then expand ocean and space locations through validated content packs. Keep existing destinations available with honest coverage expectations.

These are substantial production slices, not one cosmetic patch. Completing them carefully protects what already works and gives future additions a clear standard to meet.
