# Ownership, acceptance, and delivery plan

October 1, 2026 · Proposed implementation backlog; no gameplay changes made by this audit

The goal is to finish existing systems into a coherent product. This plan does not authorize deleting features, resetting saves, buying assets, or replacing the engine. It is structured so a finished slice can be reviewed and released without exposing incomplete replacement systems.

## Rules for future development

1. A feature has one accountable domain owner, explicit inputs/outputs, and a complete player journey. UI and meshes never become independent authorities for persistent game state.
2. Existing authorities are extended or adapted before new ones are invented. Retain the runtime kernel, environment coordinator, world addresses, provider contracts, commerce transactions, expedition command engine, asset catalog and lifecycle scopes where they fit.
3. Every feature declares its environment, travel-mode compatibility, save scope, multiplayer scope, failure behavior, costs and evidence requirements.
4. Every new game action has a clear start, feedback, completion/abort, result, and recovery. Do not call it finished because the button renders.
5. A map label, catalog field, rights declaration or test filename is a claim to validate, not proof of implementation.
6. Preserve existing saves through versioned migration, backup and rollback. Give players a coherent view of their progress without flattening unrelated histories into one score.
7. Preserve geographic and artistic truth classes: observed, modeled, procedural/game-authored, unknown. An unavailable provider must not become a false zero or fabricated certainty.
8. Make no engine migration or giant rewrite a prerequisite for finishing ocean gameplay. Prove any proposed engine/renderer change on one representative scene with measured benefit first.

## Authority map

“Authority” means the component that decides what is true and permitted. Client authorities handle immediate simulation; backend authorities handle shared ownership and valuable persistent mutations. Merely accepting a client report on a server does not independently verify the underlying action.

| Domain | Existing starting point | Required ownership rule |
|---|---|---|
| Session/environment | `session-coordinator.js`, runtime kernel/lifecycle scopes | One active environment session. Exit, cancellation and publish order are explicit. Late async results cannot mutate a replacement session. |
| Place and coordinate frame | Earth location sessions; planetary `world-address.js`; astronomy frames | One canonical address plus local transforms. Body, region, datum and scope accompany coordinates. Floating render origin never rewrites real coordinates. |
| World surfaces/collision | Accepted-ground, world-surface and planetary surface authorities | A collision query identifies support, water volume, obstacle and source. Rendering may simplify, but cannot invent walkable ground. |
| Water | Waterbody contract, surface registry, optics evidence, marine provider | One water sample supplies surface level, immersion, depth, currents and presentation inputs. Missing coverage is explicit. |
| Character locomotion | Walk, control-action policy, travel mode | One locomotion state per player. Walking/wading/swimming/diving/aboard/vehicle states cannot fight for position or camera. |
| Equipment and capability | Backpack, capability resolver, condition/upgrade models | Resolve available/loaned equipment and requirements before transition. The avatar reflects actual applied gear. Skills tune supported behavior, not fabricate it. |
| Vehicles and parent attachment | Maritime/aviation catalogs, vehicle claims, space craft identity | Persistent vessel/sub/occupant IDs; one control lease; stable deck-local attachment; explicit detach and inherited motion. |
| Travel/expedition | Space journey, campaign, pod journey, destination missions | A single expedition context connects briefing, travel, fieldwork and return. Free movement and autopilot are policies within it. |
| Time | Runtime clock, voyage simulation, provider valid times | Keep simulation time, real UTC, accelerated voyage time and provider observation time distinct. Pause cannot corrupt freshness or multiplayer state. |
| Mission and reward | Mission authorities, explorer event pipeline, profile store | Completion event ID is idempotent; consumers derive Journal/XP/unlocks. Do not reward independently from three panels. |
| Save and sync | Local/IndexedDB stores; connected player state; shared expedition revisions | Explicit local-only/pending/cloud-saved/conflict states. Sign-in, offline, reload, failed write and cross-device behavior are defined. |
| Economy/property | Existing server transaction/receipt authorities | Credits, item ownership, purchases and rentals change through authenticated transactions. Cosmetic progress stays separate from competitive trust. |
| Shared world/building | Block shared-sync, room roles, property and edit authorities | Declare local/room/property/public scope. Authorization, conflict resolution, replay and Undo operate on that same scope. |
| World data | Provider registry, provenance contracts, stale caches | Version, license, resolution, valid time, coverage, failure policy. Live entities do not silently become controllable game entities. |
| Presentation and assets | Renderer owners, model catalog, visual recipes | Presentation subscribes to state. Asset failure selects a tested fallback and reports degradation; it does not change gameplay rules. |
| Input/camera/UI/audio | Control actions, pause/focus, camera owners, existing audio implementations | One input/camera focus owner; consistent action names; one audio mixing/lifecycle policy. Menus cannot leak movement input. |
| Content publishing | Creator drafts/review, capture approval, admin policies | Draft → validated → reviewed → published → versioned rollback. User-generated content has ownership, moderation and budgets. |

Do not implement this as 17 new giant managers. Map these responsibilities onto existing modules, identify actual conflicting writers, and add narrow interfaces only where needed. Begin with water, character traversal, vehicle attachment and expedition state because the first ocean slice crosses all four.

### Minimal contracts to specify before implementation

- **Location:** stable world/body/region identity, coordinate kind, lat/lon or body-local position, vertical datum, source coverage, instance scope and time context.
- **Water sample:** volume ID, surface height and normal, bottom/depth or unknown, current vector and convention, wave time, environment/habitat, provenance/confidence.
- **Traversal transition:** old/new locomotion, eligibility reason, equipment resolution, attachment parent, target pose, camera/input ownership and rollback pose.
- **Expedition:** ID, route, vehicle/crew/equipment, objective states, survey evidence, cargo, return anchor, save revision, abort/recovery policy.
- **Completion event:** ID, subject, place, method, outcome, evidence class, authority class, timestamp, eligible rewards and deduplication key.
- **Content pack:** region/biome rules, assets/LODs, license ledger, deterministic placement seed/version, collisions, interactions, streaming bounds and quality budget.

These should be tested pure data contracts with adapters around existing systems. Adopt typed boundaries where they prevent coordinate/unit/ownership mistakes; a whole-project language conversion is not a prerequisite.

## Sequenced implementation backlog

Priorities below are product priorities, not security severity labels. “Done” always includes player-visible verification and recovery, not just passing component tests. Effort descriptions express uncertainty and relative size, not calendar promises.

| ID | Priority / scope | Work and dependencies | Definition of done |
|---|---|---|---|
| P01 | Immediate · focused | Ocean entry eligibility; use existing surface evidence, not finite coordinates alone | Known land, valid coast, open sea, unknown/provider-down and stale selection cases behave honestly; no generic seabed under an invalid selection. |
| P02 | Immediate · focused | Bathymetry missing-cell and bounds handling | Null/NaN/partial coverage remain validly classified; missing-corner and out-of-grid probes no longer publish invented local depth; provider and browser outage checks pass. |
| P03 | Immediate · focused | Real seabed minimap and source labeling; depends P02 | Map contours derive from collision/seabed samples; north/heading/scale/depth/datum correct; unknown coverage visible; decorative “bathymetry” removed. |
| P04 | Immediate · bounded design/integration | Capability truth inventory and source-of-truth map | Every public mode/capability tagged playable/limited/experimental/planned with owner, persistence and current acceptance evidence; inaccurate copy repaired. |
| P05 | Foundation · medium | Consistent expedition/objective/navigation presentation | Existing Explore/Build/Together remains; current objective, map and result agree; optional games discoverable without dominating entry. |
| P06 | Foundation · medium | Progress/save contract across existing stores | Guest, local, signed-in, pending, offline and cross-device rules documented and tested; no lost/duplicate rewards in retries or migrations. |
| P07 | Ocean · substantial | Water sample authority and coordinate/datum integration; P01–P04 | Visual waterline, collision, buoyancy, immersion, fishing and depth readouts agree under waves/tides and provider changes. |
| P08 | Ocean · substantial | Player swimming, diving, automatic gear; P07 | Real avatar/controller/animation, shore/ladder entry, equipment rules, touch parity, depleted-resource recovery and reload support. |
| P09 | Ocean · substantial | Research ship playable deck and stations; P07 | Walk/helm transitions, collision-safe deck, mooring, bridge/chart, lab and dive platform work with vessel motion. |
| P10 | Ocean · substantial | Persistent sub deployment/recovery; P08–P09 | Same sub and ship survive launch/dive/return/cancel/reload; no overlap, teleport duplication or lost cargo; safe lost-vessel recovery. |
| P11 | Ocean · substantial art/data | First geographically appropriate marine content pack; P02, P07 | Terrain/habitat/lighting/assets/animation/sound/landmarks meet visual checklist; local provenance and coverage supported; browser budgets measured. |
| P12 | Ocean · complete product slice | First research outing and meaningful upgrade; P05–P11 | A new player finishes and understands the result; can abort/recover; next outing uses the earned improvement; review includes above/below water. |
| P13 | Space · medium/substantial | One map/course/landing eligibility presentation | Classic and physical paths use appropriate labels and consistent target; no distant “ready to land” contradiction; manual takeover preserves journey. |
| P14 | Space · substantial | Complete polished planetary field mission; P05–P06, P13 | Briefing → departure → landing → varied field actions → return → analysis → improvement; next destination makes use of progression. |
| P15 | Space · substantial art | Moon/Mars visual standard and distinct fictional-world pack | Terrain/lighting/vehicle styles coherent; real versus imagined data clear; no repeated empty template disguised by names. |
| P16 | Earth · substantial art/content | One flagship district and surrounding route | Recognizable streets/landmarks, coherent materials, vegetation and street life, enterable-space quality, transport continuity, purposeful activities. |
| P17 | Cross-product · medium | Unify mini-game lifecycle and reward presentation | All games have contextual start, rules, abort, result, replay and Journal; no overlapping HUDs or orphaned pause/input ownership. |
| P18 | Multiplayer · substantial | Extend room authority to marine expeditions; P08–P12 | Two clients, role/seat conflicts, late join, host loss, underwater reconnect, shared cargo and rescue all tested; no trust in UI alone. |
| P19 | Operations · medium | Provider/asset terms, costs and resilience | Service plans verified; request fan-out bounded/cached; dated last-good fallback; asset rights, content review and budgets retained with artifacts. |
| P20 | Release · recurring | User comprehension, accessibility, device and performance gates | Complete slices reviewed at playable camera height on supported devices; source/visual/runtime evidence match release; rollback ready. |

P01–P06 should precede broad expansion. P07–P12 form the first major ocean release. P13–P15 form the first major space release. P16–P20 extend and sustain the standard. Art research and source-rights checks can precede implementation, but final assets must be tested against working interaction/collision requirements.

Do not assign reliable dates until P04 identifies integration cost and one swim/boat/underwater transition proves the technical path. A real swimming controller, moving ship deck, sub docking system and geographically meaningful ocean are multiple substantial features. Shipping a scaffold to meet a premature date would repeat the current problem.

## Acceptance: what makes a slice finished

### Player and gameplay

- Three complete paths: first-time onboarding, returning-player continuation, and failure/abort/recovery.
- New players can identify where they are, the next action, why it matters, and whether progress saved.
- Meaningful choice: method, route, target, preparation or interpretation affects the result.
- One completed session changes a later session in a visible way.
- Free exploration and optional activities remain accessible without compulsory resource grind.
- Contextual tutorial adapts to the actual mode; Earth-driving tips cannot masquerade as diving or rover instruction.

### Ocean/space transitions

- Same world address, parent craft, cargo and mission on both sides of a transition.
- Boundary testing: shoreline, head crossing waves, boat deck, ladder, sub hatch, pod bay, airlock, landing corridor, body frame and tile edge.
- Cancel while loading; leave and immediately re-enter; provider timeout; tab background/resume; browser reload; asset unavailable.
- Unknown bathymetry/habitat is not treated as a real measured value.
- Local simulation and shared-room permissions cannot both claim exclusive ownership.

### Visual and sound quality

- Review wide arrival, normal play distance, close interaction, submerged/surface boundary, harsh/night lighting and mobile framing.
- Consistent scale, normals/material color space, contact, shadows, texture density and animation style.
- Scene hierarchy: recognizable destination, route cues, landmarks and natural empty space.
- Habitat/geology governs placement; repeated assets are varied without contradicting biology or coordinates.
- Critical interaction cues remain readable with fog, particles, low light and color-vision differences.
- Mix machinery, environment, movement and interaction audio coherently; support mute, captions/visual equivalents where needed and avoid runaway audio contexts.

### Browser performance and loading

Use the existing release budgets as the initial regression baseline. The owner's priority is fewer visible stalls, not perfect FPS. Benchmark exact routes before and after content changes on the actual target devices, including at least one physical phone before mobile quality claims.

Record p50/p95/p99 frame times, long frames, input delay, first usable control, transfer duration, peak memory/texture residency, shader compilation and repeated-entry retention. Set per-scene budgets after measuring representative assets; do not call guessed polygon limits a universal standard. New artwork must not introduce new reproducible control stalls or unbounded retention. Stream nearby detail, not every asset in every biome.

Retain distant continuity when reducing near detail. Test slow connection, failed downloads, lost WebGL context and device rotation. WebGPU or a new engine is an optional measured investigation, not a promise of free visual quality.

### Persistence and shared trust

- Completion IDs and mutation requests are retry-safe.
- Tests distinguish a local record, a server receipt, and independently validated competitive progress.
- Save migrations preserve unknown/legacy fields or explicitly map them with backups; users never discover a reset by opening their Backpack.
- Rejoin and offline recovery retain the authoritative vessel/mission state.
- Logout/account change cannot transfer local rewards or ownership to the wrong user.
- Shared work has visible pending/saved/conflict feedback and an owner for resolution.

## The product work often missed in feature development

| Concern | Required action |
|---|---|
| Audience and tone | Default to accessible exploration with optional deeper operations. Keep competitive action separate from peaceful research rules. Validate this positioning with intended players. |
| Content production | Build a repeatable location pack workflow, reference board, review owner and quality rubric. New destinations must inherit standards, not just a menu slot. |
| Accessibility | Remappable actions, keyboard/touch parity, readable text, motion reduction, non-color markers, captions and assisted traversal. Actual devices matter. |
| Localization | Separate units/text from game logic; ensure long labels and translated instructions fit. Depth, altitude, speed and heading conventions must remain consistent. |
| Multiplayer abuse | Clear ownership/permissions, moderation/reporting, undo/recovery for shared edits, and competitive eligibility distinct from sandbox freedom. |
| Privacy | Keep GPS/camera opt-in and bounded; do not log exact personal locations or private interiors for product analytics. |
| Economics | Connect costs and rewards to meaningful utility; audit inflation/duplication before adding new currencies or trading loops. |
| Running costs | Track provider quotas, cache hit rates, storage/egress, reconstruction jobs and multiplayer writes. Add service-specific graceful degradation. |
| Support | Build-specific diagnostics, non-sensitive error reports, last safe restore point, known-limit messaging and reproducible support recipes. |
| Release governance | Artifact identity, feature status, current evidence and rollback tracked together. Generate current state instead of maintaining conflicting historical summaries. |
| Success measurement | Consent-respecting aggregates: first meaningful action, session completion/abort, return visits, save failures, transition failures and stalls. Avoid collecting raw GPS trails. |

## Recommended working rhythm

For each slice: capture the actual starting experience, specify rules and desired screenshots, implement one complete interaction chain, inspect it in the assembled world, test recovery and save behavior, measure it, and review it with an uncoached player. Promote only the complete slice through the existing release process.

Keep an evidence ledger with source commit, artifact ID, scenario, device, result, screenshot and limitations. A green technical matrix remains necessary; add explicit visual and comprehension acceptance so “all tests pass” can no longer be mistaken for “the game is coherent.”


## October 2 scope addition: public Live Earth cameras

The owner requested extensive live/still camera coverage inspired by WorldCam. [LIVE-EARTH-CAMERAS.md](LIVE-EARTH-CAMERAS.md) defines the accepted scope, verified reference research, source ownership, complete player journey and C01–C05 gates. C01 research can proceed now; implementation joins P16 after the existing P06 foundation and ocean/space sequence, with P19 provider and P20 release requirements. This is distinct from mapped ALPR locations and user-device capture. No camera imagery capability or worldwide coverage is claimed yet.


## Delivery boundaries and current closeout

October 2 owner direction: finish phases without letting them grow indefinitely. P08 is now **development-complete** against its movement/equipment/ladder/recovery/local-resume contract; see SWIMMING.md for measured evidence and eligibility limits. P09 is development-complete: playable research deck, helm/mooring, chart/lab stations and dive platform; see RESEARCH-DECK.md. P10 owns persistent parent ship/sub/cargo and reload. P11 owns the regional art/ecology upgrade. P20 owns release-wide physical-device/geographic coverage. A completed development phase is not a production release claim, and later-phase work does not reopen it without a specific regression.

P10 is development-complete for the local marine deployment/recovery contract described in MARINE-VOYAGE.md. The last voyage preserves ship/sub state; Backpack and Journal remain the cargo/reward authorities. P12 adds the research-outing content and P18 shared marine ownership. P11 is the next unfinished phase; do not reopen P08–P10 for unrelated regional-art expansion.

P11 is **development-complete for the first Coral Shelf content pack**; see MARINE-HABITAT.md for assets, rights, coordinate/habitat limits, collision, sound, rendering budgets and actual-browser evidence. Unknown ocean coordinates remain honestly unverified. The remaining first-ocean-product phase is P12: one complete research outing with a persistent useful upgrade.


## P12 development closeout — October 3

The first Coral Shelf outing is complete: normal location-entry gate, wet-lab briefing, three stationary scans, partial recovery/reload, saved report and Scanner II used on a subsequent dive. Progress derives from stable existing Journal events, with no new currency or independent upgrade authority. All 1,708 registered tests, eight actual-app research cases, eighteen existing marine cases and source checks pass; desktop/phone and prescribed-client images are inspected. See MARINE-RESEARCH.md for scope and evidence. P13 space navigation consistency is next. No production deployment.


## P13 development closeout — October 3

HUD and landing actions now share selected-target resolution, physical eligibility and explicit compressed-distance presentation. Unknown/mismatched physical targets fail closed; unsupported universe targets cannot land on another world. Local proximity remains independent of course selection. 1,713 registered tests and actual course/manual-takeover/Wayfinder/phone/disposal and six boundary browser checks pass. See SPACE-NAVIGATION.md. P14 field mission/progression is next; planetary art remains P15. Production unchanged.


## P14 development closeout — October 3

The existing Proxima b field mission now closes through partial recovery/redeployment, three saved instrument procedures, actual ship-lab analysis, a readable completed report and Field Link II used at 24 m on the next fictional world. Failed saves remain retryable; duplicate submission cannot duplicate the completion reward. All 1,719 registered tests and source checks pass. The assembled-app browser verifies the journey, an injected field-save failure, desktop/phone report, next-world use and real reload. Prescribed-client state and images are inspected. See PLANETARY-RESEARCH.md for fixture and local-save boundaries. P15 planetary visuals is next. Production unchanged.


## P15 development closeout — October 3

Three-site planetary presentation is complete for Moon, Mars and Copper Dawn: local geology, terrain-map raster, readable owned lighting, spacesuit/rover selection, collision and phone return control. Existing measured terrain and real/modeled/fictional labels remain authoritative. All 1,729 registered tests, source checks, actual three-site browser collision/exit checks and inspected prescribed-client visuals pass. See PLANETARY-ART.md for scope, short rendering samples and limitations. P16 Earth district/cameras is next; production unchanged.


## P16 camera C01–C03 closeout — October 3

Regional public camera stills are implemented and verified: Fintraffic Finland catalogue (809 admitted sites at test time), clustered map/search/pages, real timestamped images, view/camera switching, source attribution, failure/retry, phone layout and Explore here coordinate handoff. Closing/hiding cancels work. All 1,736 registered tests, source checks, actual-provider browser and inspected prescribed-client evidence pass. See LIVE-EARTH-CAMERAS.md for boundaries: no global/live-video parity, no remote visit reward, no Finland world-load claim. P16 Earth district remains active; C04 breadth/multi-view and C05 release remain open. Production unchanged.


## P16 waterfront slice — October 3

Fresh Baltimore inspection led to context-qualified generated vessels, corrected berthed waterlines, an original bounded rig on the reviewed Constellation hull, and a three-stop promenade walk in the existing Activities system. The actual browser walks both legs with keyboard controls and records one local completion; the route camera line and unreachable phone details/result were found and fixed. Full 1,741 registered tests and source checks pass; full-world desktop/phone and prescribed rig-client images/state are inspected. See EARTH-DISTRICT.md. This completes the waterfront slice, not all P16: street/promenade art, night readability and interior/transport acceptance remain. P17–P20 and camera C04/C05 remain open. Production unchanged.

## P16 district development closeout — October 3 continuation

The bounded Inner Harbor district acceptance is complete: terrain-following continuous paving, budgeted furniture/vegetation, actor-selected night lights, existing facade and usable-door coverage, honest enterable directory, a labeled fictional orientation lobby, exterior-obstacle restoration, actual keyboard route/entry/exit and walk/drive/walk continuity. All 1,747 registered tests pass; source, actual-world and prescribed presentation-client evidence is recorded in EARTH-DISTRICT.md. This closes the flagship district scope, not a city-wide art or production gate. P17 is next; P18–P20 and camera C04/C05 remain open.


## P17 development closeout — October 3 continuation

Existing route and standard-game lifecycle is complete within GAME-LIFECYCLE.md: explicit travel rules, correct selected replay, truthful idempotent Journal save/retry, common phone result/pause ownership, active-time clocks, road-height targets and safe delayed/failed starts. All 1,761 registered tests and source checks pass; actual Baltimore keyboard and controlled game-boundary journeys plus prescribed-client screenshots are inspected. Fishing/field specialized authorities remain intact. P18 shared marine expeditions is next. P19–P20 and camera C04/C05 remain open. Production unchanged.
