# World Explorer 3D — Product Capability and Maturity Map

Status: authoritative user-facing capability inventory for version 4.3.0 release source, inspected 2026-08-17. Status terms come from `SYSTEM_INVENTORY.md`.

## 1. Product surfaces

| Surface | Status | Primary user |
| --- | --- | --- |
| landing site | Implemented and user-accessible | visitor deciding whether to launch |
| title/location/globe hub | Implemented and user-accessible | player selecting a destination or mode |
| 3D game | Implemented and user-accessible | desktop/mobile explorer |
| account center | Implemented and user-accessible | signed-in player/creator/supporter |
| consolidated admin | Implemented and user-accessible for authorized admins | operator/moderator |
| focused moderation page | Deprecated/legacy compatibility surface | moderator |
| legal/about/GitHub explainer | Implemented and user-accessible | public/project reader |

The current landing page represents the player as the explorer, current Earth discovery/build/multiplayer capability, and Earth-to-orbit scope. Landing screenshots are a separate presentation layer and must be refreshed whenever they no longer represent the current playable UI.

## 2. Entry, world selection and loading

| Capability | Status | Notes |
| --- | --- | --- |
| preset cities | Implemented and user-accessible | Baltimore, Hollywood, New York, Miami, Tokyo, Monaco, Nürburgring, Las Vegas, London, Paris, Dubai, San Francisco, Los Angeles, Chicago and Seattle |
| interactive globe | Implemented and user-accessible | rotate/select and launch Earth location |
| text place search | Implemented and user-accessible | Nominatim-dependent |
| custom coordinates | Implemented and user-accessible | validated latitude/longitude |
| browser geolocation start | Implemented and user-accessible | permission/secure-context dependent |
| shared location link | Implemented and user-accessible | normalized fixed-location identity |
| rapid selection cancellation | Implemented but internal | prevents superseded publication |
| fixed-world loading transition | Implemented and user-accessible | phase/progress UI; no movement streaming |
| seamless worldwide precision | Planned only / not a product claim | current product loads one bounded selected world |

## 3. Earth world

| Capability | Status | Maturity/limits |
| --- | --- | --- |
| accepted-ground terrain | Implemented and user-accessible | authority varies by accepted artifact/fallback region |
| detailed local terrain | Implemented and user-accessible | fixed selected core |
| regional horizon/context | Implemented and user-accessible | one-time 14 km generalized context |
| mapped roads and paths | Implemented and user-accessible | provider/tag coverage varies |
| junctions/markings/surfaces | Implemented and user-accessible | compiler-owned |
| bridges/elevated roads/ramps | Implemented and user-accessible | structured traversal/collision/camera; landmark/regional tests exist |
| tunnels/portals | Implemented and user-accessible | floor/shell/lighting/camera/terrain aperture |
| buildings and roofs/facades | Implemented and user-accessible | mapped plus explicitly inferred details |
| selected landmarks | Implemented and user-accessible | authored/catalog coverage, not every landmark worldwide |
| mapped water/coast/waterways | Implemented and user-accessible | hydrology owns visible/navigation surfaces |
| vegetation/land cover | Implemented and user-accessible | representative derived populations |
| POIs/place semantics | Implemented and user-accessible | map filters and inspection |
| polar cryosphere | Implemented and user-accessible | latitude/domain-specialized fallback |
| open-ocean Earth start | Implemented and user-accessible | surface/ocean arrival avoids land feature assumptions |

## 4. Living World

| Capability | Status | Maturity/limits |
| --- | --- | --- |
| pedestrian population | Implemented and user-accessible | bounded derivation from entrances/navigation context; ten procedural roles |
| traffic vehicles | Implemented and user-accessible | nine bounded road-graph families; all can promote to detailed local actors |
| multiple pedestrian archetypes | Implemented and user-accessible | procedural catalog, not photoreal scanned characters |
| multiple vehicle archetypes | Implemented and user-accessible | compact, sedan, SUV, pickup, taxi, passenger/delivery van, box truck and city bus |
| contextual NPC/object actions | Local implementation / acceptance pending | Talk, Take, Inspect and condition reactions use one contextual prompt |
| equipment and object impacts | Local implementation / acceptance pending | collapsed five-slot session loadout; room condition changes are server-transaction-owned, while account equipment/ammunition remain untrusted session state |
| navigation graphs | Implemented and user-accessible | published-world derived; no separate network provider |
| persistence across visibility | Partial | population is runtime presentation, not a durable global NPC simulation |
| continuous MMO population | Planned only / not architecture | rooms synchronize bounded players, not worldwide agents |

## 5. Movement and vehicles

| Mode | Status | Key constraints |
| --- | --- | --- |
| walk | Implemented and user-accessible | character/camera/surface/collision; desktop and touch |
| drive | Implemented and user-accessible | vehicle dynamics, road/ground/structure surfaces, chase camera |
| drone | Implemented and user-accessible | bounded free flight and world interaction policies |
| plane | Implemented and user-accessible | flight controls and lifecycle tests |
| surface boat | Implemented and user-accessible | valid water surface; waves and fishing access |
| astronaut | Implemented and user-accessible | Moon/Mars destination traversal |
| planetary rover | Implemented and user-accessible | destination gravity/terrain |
| space expedition craft | Implemented and user-accessible | transformed scale, landing routes |
| submarine | Implemented and user-accessible | underwater Ocean environment |
| Live GPS walker ownership | Implemented and user-accessible | consent, foreground, filtering and fixed-world boundary |

## 6. Maps and information

| Surface/capability | Status |
| --- | --- |
| title globe map | Implemented and user-accessible |
| Earth minimap with zoom | Implemented and user-accessible |
| large Earth map with filters/legend | Implemented and user-accessible; legacy shell styling remains |
| properties/POIs/historic info | Partial/provider-dependent |
| navigation target aid | Implemented and user-accessible; not turn-by-turn navigation |
| interior/activity/overlay/memory/game markers | Implemented and user-accessible |
| Moon map | Implemented and user-accessible |
| Live Earth globe/layers | Partial/provider-dependent |
| Ocean depth/sonar HUD | Implemented and user-accessible |
| inner/full solar-system maps | Implemented and user-accessible |
| deep-space catalog/navigation UI | Experimental |

## 7. World Discovery and exploration loop

| Subsystem | Status | What is actually complete |
| --- | --- | --- |
| environment/habitat context | Implemented and user-accessible indirectly | compiled from published fixed world without movement provider queries |
| encounter pacing/rarity | Implemented and user-accessible | deterministic bounded slots and progressive opportunity bands |
| metal detecting | Implemented and user-accessible | sweep, signal, classify, trowel/shovel excavation, reveal, collect/leave |
| field tools in hand | Implemented and user-accessible | detector, excavation and compatible held-tool presentation |
| geology/natural history | Implemented and user-accessible | inspect/reveal/sample records and reference imagery where licensed |
| wildlife encounters | Implemented and user-accessible | habitat-context virtual subjects, field photography/observation |
| plants | Partial | plant records/reference content exist; breadth and unique world models are catalog-limited |
| Journal | Implemented and user-accessible | event history with filters/location evidence |
| Field Guide | Implemented and user-accessible | identification index, observation/region evidence |
| Collection | Implemented and user-accessible | virtual owned objects only; observations are excluded |
| progression | Implemented and user-accessible | Explorer rank/specialties/goals, new-ID/new-region credit |
| tools/unlocks | Implemented and user-accessible | eligibility/entitlement/tutorial handling |
| trusted collectibles/trading | Implemented and user-accessible when signed in/backend configured | server claims, ownership and transactional trades |
| companions | Implemented and user-accessible | 3 dogs, 3 cats, 2 birds, fox; catalog scale and behavior |
| long-tail activities/jobs | Partial | contextual catalog/shared field loop; not all are unique minigames |

Discovery UI is normally collapsed during play. A quick-tool/field prompt appears only when activity context requires it. Journal/Guide/Collection/Gear/Progress are one coherent Explorer surface rather than always-visible duplicate dashboards.

## 8. Augmented Reality

| Capability | Status | Limits |
| --- | --- | --- |
| device capability detection | Implemented and user-accessible indirectly | selects spatial, camera overlay or 3D fallback |
| companion AR | Experimental | owned companion, Earth/stationary eligibility |
| tabletop specimen AR | Experimental | recorded allowlisted models only |
| habitat-aware waterfowl AR challenge | Experimental | virtual targets in eligible habitat context |
| WebXR hit-test placement | Experimental | device/browser support required |
| camera overlay | Experimental | screen-relative, not a scanned persistent anchor |
| interactive 3D fallback | Implemented and user-accessible | no camera required |
| camera recording/upload | Not implemented by design | frames are not stored |
| detector/portal/multiplayer AR | Planned only/deferred | explicitly not current capability |

## 9. Games, missions and activities

| Mode | Status |
| --- | --- |
| Free Explore | Implemented and user-accessible |
| Time Trial | Implemented and user-accessible |
| Checkpoint Run | Implemented and user-accessible |
| Paint the Town | Implemented and user-accessible; room sharing optional |
| Witnessed civic response | Implemented locally: contextual dispatch/search/contact replaces the retired standalone Police Chase toggle; production acceptance remains open |
| Flower Challenge | Implemented and user-accessible; leaderboard optional |
| DeFlock Hunt | Implemented and user-accessible; mapped/fallback data and room claims |
| Live GPS Explore | Implemented and user-accessible on eligible device/context |
| Fishing | Implemented and user-accessible from a stopped valid surface boat |
| custom activities | Implemented and user-accessible | create/library/discover/complete; depth depends on schema action |

The gameplay registry owns one main plugin at a time. Discovery and auxiliary services use explicit coexistence policies; opening a UI does not silently start every system.

## 10. Creating and editing

| Capability | Status | Boundary |
| --- | --- | --- |
| block builder | Implemented and user-accessible | 14 pieces, 8 colors, bounded 200-piece local cap |
| local memories/flowers/tracks | Implemented and user-accessible | device-local with backup where applicable |
| activity creator | Implemented and user-accessible | schema/validation/library/guide |
| contribution submission | Implemented and user-accessible when backend configured | trusted moderation required |
| overlay editor | Implemented and user-accessible | draft/revision/submit/moderate/publish |
| Edit This World local | Implemented and user-accessible | suppress/restore base buildings plus safe semantic objects |
| Edit This World room shared | Implemented and user-accessible by role | transaction/listener convergence and ownership rules |
| direct OSM/provider mutation | Not implemented by design | all edits are World Explorer fictional layers |
| universal exact interiors | Planned only/not a claim | generated/mapped subset only |
| multi-floor building traversal | Planned | existing interior owner will gain stable floor IDs, stairs/elevators and bounded floor streaming; current runtime is single selected level |

## 11. Multiplayer and social

| Capability | Status |
| --- | --- |
| rooms (2–32, recommended 8–14) | Implemented and user-accessible with Firebase |
| private invite code/public city rooms | Implemented and user-accessible |
| featured rooms | Implemented and admin-curated |
| player presence/ghosts | Implemented and user-accessible |
| chat/report/state | Implemented and user-accessible |
| friends/recent players/invites/My Rooms | Implemented and user-accessible |
| shared blocks/artifacts/activities | Implemented and user-accessible by role |
| shared Paint Town/DeFlock/editable world | Implemented and user-accessible by role |
| global authoritative scene streaming | Not implemented by architecture |
| voice chat | Not implemented |

## 12. Account, admin and analytics

| Capability | Status |
| --- | --- |
| email/password and Google auth | Implemented and user-accessible |
| profile/creator identity | Implemented and user-accessible |
| trial/plan/account overview | Implemented and user-accessible with backend |
| Stripe checkout/customer portal/receipts | Implemented and user-accessible when configured |
| account deletion | Implemented and user-accessible with recent auth/server cleanup |
| consolidated admin overview | Implemented and authorized-only |
| moderation queue/details/actions | Implemented and authorized-only |
| user and room administration | Implemented and authorized-only |
| landing/site content draft/publish | Implemented and authorized-only |
| operations snapshot/activity audit | Implemented and authorized-only |
| Firebase Analytics event tracking | Partial/configuration-dependent |
| product decision dashboards/retention conclusions | Partial | require real production data quality and consent context; code presence is not insight quality |

## 13. Onboarding, responsive UI and accessibility

| Capability | Status | Notes |
| --- | --- | --- |
| progressive tutorial state | Implemented and user-accessible | event-driven, persisted v2 state |
| contextual field tutorials | Implemented and user-accessible | tool/Guide/Collection help without teaching everything at once |
| creator guide | Implemented and user-accessible |
| controls/help/settings | Implemented and user-accessible |
| collapsible play UI | Implemented and user-accessible | activity panels close to recover full view |
| mobile controls/safe-area layout | Implemented and user-accessible | current Chromium/WebKit journeys exist |
| keyboard controls | Implemented and user-accessible |
| AR/GPS permission explanation | Implemented and user-accessible |
| semantic labels/live regions | Partial | substantial ARIA/status coverage; legacy inline map shell still needs full accessibility/design-system normalization |
| full formal WCAG conformance | Unknown | no claim supported by the inspected test inventory |

## 14. Diagnostics and performance

| Capability | Status |
| --- | --- |
| startup/runtime error capture | Implemented but internal |
| runtime kernel system/timing snapshot | Implemented but internal |
| provider health/freshness/fallback | Implemented and user-accessible in relevant views/internal diagnostics |
| F8 performance panel | Implemented but internal |
| debug overlay/state rendering | Implemented but hidden/internal |
| machine-readable browser state | Implemented but internal/test-facing |
| memory/title-release journey | Implemented but current final-candidate evidence still required |
| continuous production session replay | Not identified in current source |

Debug facilities are not trusted backend operations. They must remain gated in production presentation and must not retain extra world geometry/listeners when closed.

## 15. Maturity summary

| Maturity band | Systems |
| --- | --- |
| production-shaped core | fixed Earth load, primary movement, core world compiler, maps/HUD, account/rules/functions structure, immutable build pipeline |
| production-shaped but provider/backend dependent | Live Earth, multiplayer/social, billing, overlays/moderation, GPS, property/history context |
| recently integrated and focused-test covered | World Discovery, progression, tools, wildlife/geology, companions, AR capability ladder, consolidated account/admin/tutorial polish |
| experimental/device dependent | WebXR/camera AR, deep-space navigation/effects |
| partial breadth | plants, long-tail contextual jobs/activities, global landmark fidelity, universal interiors, analytics decision maturity |
| explicit non-capabilities | continuous global streaming/MMO, exact scientific simulator, live AIS, physical DeFlock control, provider mutation, camera recording, voice chat |

## 16. Player-journey reconstruction list

A functionally complete replacement must let a user:

1. understand the product on the landing page and launch without signing in;
2. select any preset or valid coordinate and receive one atomic fixed Earth world;
3. walk, drive, drone, fly and boat across the correct owned surfaces;
4. use the globe, minimap and large map without confusing them as separate worlds;
5. start/stop each main mission cleanly;
6. discover wildlife/geology/finds, use an in-hand tool, and understand Journal vs Guide vs Collection;
7. progress without receiving every item immediately and use correctly scaled companions;
8. enter AR only after device/privacy/eligibility explanation and always have a 3D fallback;
9. build/edit locally without altering provider truth;
10. sign in, manage an account and join/create permitted rooms;
11. use creator/moderation/admin flows only at the appropriate trust level;
12. travel to Moon, Mars, Space and underwater Ocean and return without leaked renderers or lost Earth identity;
13. see explicit source/freshness/model/fallback language for real-world and live-data claims;
14. run on supported mobile controls with panels collapsible away from the primary play view.
