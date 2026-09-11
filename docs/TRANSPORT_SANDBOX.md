# Transport Sandbox

World Explorer 3D should represent roads, airports, marinas, working harbors,
and ports as parts of one persistent exploration sandbox. This plan expands the
current game without replacing working traversal or adding competing vehicle
systems.

## Product goal

The player should be able to arrive at a mapped transport facility, see activity
that fits the place, enter an appropriate vehicle, travel with class-specific
handling, and understand its condition from both its behavior and appearance.
The default Driving Mode car remains a dependable exploration tool. Other
vehicles can be damaged, recovered, repaired, or replaced without trapping the
player.

The simulation is a playable interpretation of mapped infrastructure. It does
not claim that a generated aircraft, vessel, route, cargo, passenger service, or
accident is happening in the real world.

## Current-state audit

| Area | Evidence in the current source | Decision |
| --- | --- | --- |
| Mode control | `transport/controller-registry.js` and `physics/mode-dispatch.js` select one active movement owner | Keep; every expansion must register through this authority |
| Active actor | `transport/actor-contract.js` provides one projection for cameras, HUD, presence, and handoff | Keep and extend with shared identity and condition fields |
| Road handling | `engine/vehicle-catalog.js` defines nine families and the current controller consumes family performance values | Keep; tune and verify classes rather than creating per-car controllers |
| Road visuals | Living World instancing and promoted urban vehicles construct their bodies separately | Consolidate their inputs into one visual recipe with high, medium, and low render tiers |
| Impact response | `urban-sandbox/crash-physics.js` owns mass, impact energy, severity, and post-impact motion | Keep as the shared impact calculation; add class coefficients and damage zones |
| Damage presentation | Promoted vehicles currently use paint darkening and a totaled tilt | Incomplete; add readable staged body, glass, light, wheel, smoke, and handling cues |
| Default car durability | Driving Mode is not yet declared separately from ordinary vehicle condition | Add an explicit `exploration_unlimited` durability policy; impacts remain visible and physical but never strand the player |
| Aviation | One expedition plane and one plane controller exist | Preserve the controller and replace the hard-coded fleet assumption with an aircraft catalog and airport operations adapter |
| Maritime | One expedition boat, water query, dynamics, and shore transfer exist | Preserve them and add a vessel catalog, mapped facilities, class-scaled dynamics, and maritime operations adapter |
| Facility data | The bounded Earth query does not currently request aeroways, marinas, ports, berths, ferry routes, or seamarks | Add one bounded provider request/compile path; do not query continually during movement |
| Population lifecycle | Ambient road actors can be promoted for interaction, but city changes can expose heavy post-ready work and incomplete teardown | Make all transport populations session-owned and cancellable before adding more fleets |
| Civic custody | Local and shared-room incident resolution can leave different owners active after Continue | Resolve and clear the authoritative incident before release; prove that custody cannot immediately replay |

## One transport simulation authority

The expansion uses one shared stack:

1. The session coordinator owns location changes and teardown.
2. The world compiler normalizes mapped transport facilities and publishes one
   facility graph with road, aviation, and maritime domains.
3. One catalog schema describes road vehicles, aircraft, and vessels.
4. One entity state describes pose, velocity, controller, occupants, condition,
   damage, route, service role, and lifecycle.
5. One population manager promotes the same entity through dormant, ambient,
   interactive, player-controlled, and released states.
6. Existing road, plane, and boat controllers remain domain adapters beneath
   that shared state.
7. Cameras, HUD, companions, rooms, recovery, and persistence continue to read
   the active actor contract rather than domain-specific globals.

An ambient vehicle must never be duplicated when promoted. A location switch
must cancel provider work, remove scene roots, release geometry and materials,
clear subscriptions and timers, empty domain pools, and prevent an older load
from publishing into the new world.

## Shared catalog and visual language

Every catalog entry needs:

- stable generic identity, transport domain, class, and service role;
- dimensions, mass, wheelbase or hull/draft/rotor/wing geometry;
- performance envelope, braking, steering, grip, stability, and recovery rules;
- capacity, doors, boarding points, cargo/passenger presentation, and companion
  travel position;
- durability policy, damage zones, thresholds, and class-specific consequences;
- one visual recipe for silhouette, panels, glazing, lights, wheels or landing
  gear, materials, interior hints, and damage variants;
- promoted, ambient, and distant LOD budgets with a mobile limit;
- asset provenance, rights, attribution, and visual-review evidence.

The road fleet keeps its nine existing gameplay families. The same recipe must
produce both the promoted model and its instanced ambient silhouette, ending the
current quality mismatch without adding a third renderer.

Reference sheets will be generated only after the catalog shapes are locked:

1. generic road families across clean, worn, damaged, and critical states;
2. general-aviation aircraft, utility helicopter, light jet, passenger jet,
   airport equipment, and facility language;
3. small craft, workboats, sailboats, ferry, tug, service vessel, container
   ship, bulk carrier, tanker, marina, harbor, and large-port language.

Generated images are design references, not automatically shippable game
assets. The shipped geometry must meet performance, licensing, attribution, and
review requirements. Branded or copyrighted replicas are outside this plan.

## Facilities and truthful data use

OpenStreetMap is the global mapped-feature source. Aviation compilation may use
`aeroway=aerodrome`, `heliport`, `runway`, `taxiway`, `apron`, `terminal`,
`helipad`, `hangar`, `parking_position`, and `gate` when present. Maritime
compilation may use mapped harbors, marinas, port land use, piers, docks,
berths, ferry terminals and routes, and supported seamark harbor categories.

Mapped detail varies. An aerodrome point does not prove that runways, gates, or
helipads are completely mapped. A harbor boundary does not prove current ship
occupancy, schedules, cargo, access, or navigable depth. Missing detail remains
unknown; the game may add clearly game-generated activity but may not present it
as surveyed or live fact.

All OpenStreetMap use retains `© OpenStreetMap contributors` and an ODbL link.
Public Overpass instances are shared, rate-limited infrastructure, so the game
will make one bounded, cached facility request during location assembly instead
of movement-time or vehicle-by-vehicle queries.

FAA aeronautical data can later enrich reviewed United States airport packs on
its 28-day cycle. NOAA ENC-derived layers can later enrich reviewed United
States ports. Historical NOAA AIS may inform offline route-density archetypes,
but it is not a real-time vessel feed and must never be labeled as one. These
regional sources cannot be treated as worldwide coverage or as certified
navigation guidance.

Primary references:

- [OpenStreetMap aeroways](https://wiki.openstreetmap.org/wiki/Aeroway)
- [OpenStreetMap harbors](https://wiki.openstreetmap.org/wiki/OpenSeaMap/Harbours)
- [OpenStreetMap harbor categories](https://wiki.openstreetmap.org/wiki/Key:seamark:harbour:category)
- [Overpass API use and limits](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
- [FAA aeronautical data](https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/)
- [NOAA ENC Direct to GIS](https://nauticalcharts.noaa.gov/learn/encdirect/)
- [NOAA vessel traffic data](https://www.coast.noaa.gov/digitalcoast/data/vesseltraffic.html)

## Facility and simulation tiers

| Tier | Capability | Required truth boundary |
| --- | --- | --- |
| 0 | Mapped facility geometry and labels | Only mapped facts are presented as mapped |
| 1 | Bounded ambient operations on compiled routes | Activity is labeled and treated as game-generated |
| 2 | Nearby entity promotion, inspection, boarding, and interaction | Stable identity; no duplicate ambient/promoted actor |
| 3 | Player control, full collision, condition, damage, recovery, and companion boarding | One active controller and actor authority |
| 4 | Reviewed regional enrichment | Source, date, license, coverage, migration, and rollback recorded |

Large vessels use class-scaled acceleration, stopping distance, turning radius,
draft, channel, and berth behavior. Container ships and tankers cannot handle
like small boats. Large merchant ships can become visible, route-following, and
boardable before player command is enabled; any player-command mode must meet
the same collision, route, recovery, camera, HUD, and mobile acceptance rules as
other vehicles.

Aircraft spawn and operate from compiled aviation facilities. Helicopters use
mapped heliports, helipads, or suitable airport aprons when available. Fixed-
wing aircraft use compiled runway, taxiway, apron, and parking connections. The
game must not invent a precise gate, schedule, or access rule and present it as
mapped fact.

## Damage and recovery

One impact result feeds domain-specific damage zones. Damage advances through
healthy, worn, damaged, critical, and disabled states. Each transition must have
at least one visible cue and one behavior cue where appropriate:

- displaced or darkened panels and localized impact marks;
- cracked glazing, failed lights, tire or landing-gear state;
- smoke or leak-style game effects at critical condition;
- steering pull, reduced grip, power loss, longer braking, or control limits;
- clear HUD condition language and a recovery action before the actor is lost.

The default Driving Mode car uses `exploration_unlimited`: collisions still
produce forces, sound, camera response, temporary marks, and NPC/civic outcomes,
but permanent degradation cannot disable it. Claimed, ambient, civic, aircraft,
and vessel entries use their catalog policy. Damage is readable game physics,
not an engineering or forensic accident model.

## Release implementation sequence

### Slice 0 — lifecycle and authority boundary

- Reconcile the current uncommitted city-switch and custody experiments with
  the shared session lifecycle.
- Keep the loading image visible until required gameplay owners are ready.
- Prevent repeated location input from queuing loads.
- Tear down old populations and resources before the replacement world can
  publish.
- Resolve local or room civic incidents through the owning authority, then
  prove Continue restores movement and does not replay custody.

Exit: three in-session city changes remain playable, a held location key causes
one transition, old owners cannot publish, and a complete arrest/release/move/
second-event journey works.

### Slice 1 — shared road foundation

- Introduce shared catalog/entity/damage/visual-recipe contracts.
- Adapt the existing nine road families and both current render tiers.
- Declare the default car's exploration durability.
- Add staged visible damage to other road vehicles.

Exit: no duplicate renderer or controller; every family has distinct measured
handling, matching near/far identity, impact response, condition cues, entry,
exit, recovery, and mobile budgets.

### Slice 2 — mapped facility compilation

- Extend the single bounded world request and compiler for aviation and maritime
  features.
- Build airport and maritime graphs with provenance and completeness flags.
- Render facility geometry before adding moving fleets.

Exit: reviewed airport, helipad, marina, harbor, ferry, and large-port locations
show their supported mapped structures with no movement-time provider calls or
invented facility claims.

### Slice 3 — aviation operations

- Add catalog entries and class handling for a general-aviation prop plane,
  utility helicopter, light jet, and narrow-body passenger aircraft.
- Add bounded ambient routes, promotion, entry/exit, player control, companion
  travel, condition, recovery, cameras, and HUD integration.

Exit: runway takeoff/landing, taxi/apron movement, helipad takeoff/landing,
vehicle switching, damage/recovery, city teardown, and 390x844 play all pass in
the actual game.

### Slice 4 — marina, harbor, and port operations

- Add small craft, sailboat, workboat, ferry, tug, port-service vessel, and
  large merchant-ship families.
- Compile marina, ferry, harbor-basin, pier, berth, channel, and port operations.
- Add class-scaled ambient routes, promotion, boarding, control where supported,
  companion travel, condition, recovery, cameras, and HUD integration.

Exit: a marina journey, working-harbor journey, ferry journey, and large-port
journey visibly retain water under vessels, correct class handling, safe shore
transfer, and clean city teardown on desktop and mobile.

### Slice 5 — integrated release candidate

- Complete rights, attribution, performance budgets, persistence migration,
  rollback, accessibility, mobile heat/memory, and multiplayer boundaries.
- Reconcile the System Inventory and Architecture Map with what is actually in
  the immutable artifact.
- Run the complete release matrix once against that exact artifact.

Exit: the exact desktop/mobile candidate passes owner review. Production and
GitHub remain unchanged until explicit approval.

## Verification workflow

Development does not restart the full release suite after every edit.

1. Before a slice, capture a focused failing gameplay journey and the owning
   state transitions.
2. During implementation, run source checks and focused contracts only for the
   changed authority.
3. At the slice boundary, run one real installed-Chrome desktop journey and one
   390×844 journey for the affected path, then inspect the captures.
4. Re-run a previous slice only when a shared contract it owns changes.
5. Run the complete System Inventory and Architecture release matrix once, after
   the immutable candidate is built.

Existing tests are evidence only when their setup, assertion, and visible game
path match the current contract. A stale test is corrected or retired; it is not
used to force the game back to an obsolete behavior.

## Exact next implementation point

Begin Slice 0 by reviewing the uncommitted lifecycle and custody experiments
against the session coordinator. Keep only changes that establish one cleanup
and incident-resolution boundary. Do not start road visual, airport, aviation,
marina, harbor, port, boat, or ship implementation until the Slice 0 exit
journeys pass.
