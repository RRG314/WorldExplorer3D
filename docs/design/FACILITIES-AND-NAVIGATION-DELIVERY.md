# Airports, waterfronts and spaceports

October 11, 2026. Extends the existing world-coherence roadmap's transport,
world presentation and release gates. This document is an implementation ledger;
planned content is not a released feature.

## Starting findings (before this change)

- Exact airport intake retains aeroway geometry but discards fences and access
  gates. The facility compiler has no perimeter/access representation. Drawing
  fencing without fixing these paths would create a second source of truth.
- Facility visuals draw several area boundaries as narrow ribbons. A site boundary
  is not automatically a paved route or a fence. Terminals/hangars are surfaces
  here; generated terminal fallback is a solid box, not a walkable interior.
- The aviation catalogue has boarding, flight, runway and collision behavior,
  but its aircraft are still procedural recipes. Artwork replacement needs the
  same physical dimensions, door locations, landing gear and moving parts.
- Maritime custody and the licensed research vessel/sub are working locally.
  This does not make every port a complete dock, passenger terminal or shipyard.
- Airport arrival can currently start an aircraft above a searched destination;
  that is a game travel shortcut, not a terminal-to-gate departure simulation.
- The six bottom menus and several independent right-hand panels obscure the
  world and bury Journal in Backpack. New location services must use existing
  interaction/panel owners instead of adding another permanent HUD.
- The public page uses the 5.5 gallery. Local careers, marine wildlife and newer
  interiors are not fully represented. Local-development images must not be
  presented as already deployed capabilities.

## Completion order and acceptance

1. **Mapped facility boundary and access.** Preserve exact fences/gates through
   source intake and compilation. Scope ancillary objects to a mapped facility.
   Never turn aerodrome/port outlines into pavement or invented fenced rectangles.
   Use a licensed modular kit, bounded instances and the same collision geometry.
   Leave mapped gates and crossing road/runway/taxi routes passable. No invisible
   fences when an asset fails. Prove slope handling, gaps, replacement, late loads,
   resource plateau and desktop/touch visibility before moving on.
2. **One complete airport journey, then airport classes.** Actual landside arrival,
   entrance, terminal route, gate/boarding, aircraft cabin or pilot seat, taxi,
   takeoff, landing and exit. Replace aircraft and terminal art with reviewed,
   licensed assets; define landing gear, doors, passenger walk areas and collision
   envelopes from the assets. Ground vehicles, signs, lighting, windsocks, apron
   equipment, perimeter access and emergency/service space belong to the layout.
   Start with BWI plus a small airfield and heliport; then validate other climates,
   scale, mapped-data absence and streaming. Do not copy BWI's layout worldwide.
3. **One complete port journey, then waterfront classes.** Walking from shore to
   a valid quay, gangway and deck; boarding/piloting appropriate vessels, berth
   departure and safe return. Berth length/depth, tide/water height, gangway slope,
   hull clearance and ownership govern admission. Add licensed bollards, fenders,
   ladders, cranes, containers and terminal assets only where the site supports
   them. A marina is not a container terminal; an inland dock is not a cruise port.
   Verify Rotterdam cargo, Baltimore harbor and a small marina independently.
4. **Reviewed real launch sites.** Kennedy LC-39, Kourou ELA4, and later regional
   packs use public site references, explicit dates and operators. NASA's historical
   Shuttle gantry is not a present-day Ariane or SpaceX installation. Public
   visitor paths, mapped roads, pads, assembly buildings, crawler/service routes,
   lighting/protection towers and control rooms need separate spatial roles.
   Replicated exhibits can be explored; a playable launch must have a complete
   boarding/checklist/departure/return chain through the existing spacecraft owner.
   Do not suggest live launch operations or access to actual restricted facilities.
5. **App navigation redesign, preserving the game's visual identity.** Keep the
   dark blue/black palette, typography and world-first presentation. One compact
   context HUD, one objective, one interaction and one active side panel. A single
   navigation row should expose Explore, Journeys, Journal and Create. Explore
   contains places, travel, equipment and Live Earth; Menu contains settings and
   social/account management. Use plain descriptions and capability-aware actions. Keep free roam
   immediately available. Keyboard shortcuts and existing actions remain usable.
   Prototype desktop/phone using the real journeys, then implement after facility
   flows are stable. Test focus, keyboard, touch, safe areas, back/close, saved
   selection and panel competition in Earth, ship, ocean and planetary modes.
6. **Current public story and media.** Capture real current-build scenes after the
   preceding changes are verified. Show the playable loop, not just scenery:
   choose place, explore, board/depart, research, progress, create/share. Refresh
   matching gallery categories, add absent ones, include capture/build receipts
   and update alt text/captions. Keep public deployment claims tied to that build;
   clearly label any local-development previews. No synthetic gameplay pictures.

Existing unfinished world streaming, geographic creative storage, terrain/farms,
careers/CERN and fallback compatibility retain their original acceptance gates.
This work does not automatically close those gates or discard existing saves.

## Source references and asset intake

- [FAA airport design teaching material](https://www.faa.gov/adc/7_12_module_2)
  explains perimeter access together with unobstructed runway/approach areas.
- [FAA runway safety areas](https://www.faa.gov/airports/engineering/incursions_excursions/rsa)
  makes clearance depend on aircraft and runway conditions; do not use one global
  decorative fence offset as a real safety-area model.
- [Poly Haven Modular Chainlink Fence](https://polyhaven.com/a/modular_chainlink_fence),
  by James Ray Cock and Amal Kumar, is available under
  [CC0](https://polyhaven.com/license). The 1K source kit was retrieved with all
  provider checksums verified. The accepted local kit is 2,194,820 bytes, 1,461
  triangles and 1K maps. Provenance and output hashes ship beside the GLB.
  Authored opacity is retained in the wire material; no generated box substitute.
- [NASA Kennedy fact sheets](https://www.nasa.gov/kennedy/about-kennedy/fact-sheets/)
  and [mobile launcher](https://www.nasa.gov/humans-in-space/exploration-ground-systems/mobile-launcher/)
  distinguish the pad, assembly and transfer systems.
- [ESA Ariane 6 launch zone](https://www.esa.int/Enabling_Support/Space_Transportation/Ariane/Ariane_6_the_launch_zone)
  describes the distinct ELA4 infrastructure; do not reuse a Kennedy asset there.
- [NASA 3D resources](https://www.nasa.gov/3d-resources/) offer source artwork;
  individual provenance, date and media guidelines still need review.

## Shared implementation rules

| Concern | Existing authority and required behavior |
| --- | --- |
| Real geography | The facility compiler consumes attributed source records. Exact mapped polygons/paths can control physical geometry; approximate center points and generalized vectors cannot invent detailed layouts. |
| Site artwork | Each admitted kit needs a source, rights, hash, dimensions, materials, browser budget and reviewed door/deck/walk areas. A historical asset must not silently represent a current installation. |
| Ground and water | Use accepted ground and water queries. Unknown ground suppresses physical detail; berth admission needs depth, datum, tide and uncertainty before matching a hull. |
| Walking and vehicles | Existing actor, surface and travel owners perform movement and entry. Rendered obstacles and collision publish and retire together. Art does not independently grant a vehicle or teleport a player. |
| Journeys and progress | The current journey/Journal owners record successful actions once. Loading failure, cancelled travel, duplicate clicks and a failed save cannot create a false arrival or replay the trip. |
| Streaming and memory | World-session ownership, leased assets, near-player instance caps, bounded source caches and cancellation apply to every site pack. Unloading retires its callbacks, meshes and collision. |
| Menus and permissions | Reuse current interaction and panel arbitration. Availability comes from environment/vehicle/room rules, with a clear reason when unavailable. No second save, reward or permission system. |

Port detailing must be driven by berth identity, usable length/depth and the
ship/shore interface. Bollards, fenders, ladders, access routes and gangways have
physical roles; filling a coastline with repeated cranes is not a port layout.
The [Port of Rotterdam information guide](https://www.portofrotterdam.com/sites/default/files/2022-02/port-information-guide.pdf),
[water depths and tides guidance](https://www.portofrotterdam.com/sites/default/files/2024-01/port-call-optimisation-water-depths-tides.pdf),
and [ship/port interface guide](https://www.portofrotterdam.com/sites/default/files/2021-05/ship-port-interface-guide.pdf)
are design references. They do not certify the game as a navigation simulator or
supply a live fleet. Store uncertainty and data dates instead of inventing a
safe draught from a harbor name.

NASA's [mobile-launcher model](https://science.nasa.gov/3d-resources/mobile-launcher/)
and [historical gantry](https://science.nasa.gov/3d-resources/gantry/) are reviewed
candidates, not admitted assets. Check individual credits and the
[NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
before bundling. They do not complete current Kennedy, SpaceX or ESA site packs.

## Delivered locally on October 11

- **Mapped boundary layer:** common source retention now preserves actual fences,
  gates, crossing access paths and complete multipolygon site boundaries, including
  holes and reversed member ways. Site extents no longer render as concrete
  ribbons. Unmapped boundaries are not inferred as fenced rectangles.
- **Licensed rendering and physics:** the Poly Haven kit uses three instanced draw
  calls, capped at 256 nearby bays on desktop and 128 on touch. Gate, ground-road,
  runway and taxiway crossings stay open. Excessive slopes, discontinuities and
  unknown ground cannot publish hidden walls. Missing models remain absent.
- **Ownership and bounds:** the world loader passes the active actor/collision
  context. Delayed terrain and return from an interior restore the correct owned
  collision. Leaving/disposal retires it. Ring-edge indexing bounds detailed
  boundary work; the source cache holds at most two airport entries / 120,000
  elements. Recursive source requests share a 30-request / 240,000 returned-element
  budget, failing without partial publication when exceeded.
- **Airport transfer correction:** only a published destination and successful
  aircraft entry record an arrival. Failed loads, changed destinations, rejected
  movement and stale searches no longer pretend to succeed. This retains the
  existing destination-transfer flight, not a new cabin-to-cabin journey.
- **Large-vessel framing:** the overview camera fits the vessel dimensions and
  viewport. Normal chase, helm and fishing camera behavior remains unchanged.
- **Navigation study:** [open the interactive proposal](navigation/index.html).
  Desktop and phone versions show the four navigation entries, one tracked
  objective, one interaction and a bounded panel. [The review](navigation/REVIEW.md)
  maps every group to existing owners and defines the action-parity gate. The
  live HUD is not replaced by this study.
- **Current marine media:** four actual local-app captures show the licensed
  research ship, deck, deployed submarine and diver. The landing page includes
  them in a clearly labeled development-preview section. Capture metadata and
  checksums are in `config/development-gallery.json`. These are normal UI/camera
  views, without substituted scenery or a claim of measured global bathymetry.

## Landing-page review and remaining media acceptance

The release gallery still describes released 5.5. It should not be overwritten
with unpublished capabilities while the Play link opens production. The new
marine section shows the local work with an explicit preview label; it is a
partial refresh, not a completed full-site media package.

For the coordinated release, use three clear starting choices—Explore Earth,
Research the ocean, Journey into space—then show one short playable sequence for
each. Put guided careers beside Free roam. Show a real first action, a discovery
and saved progress, rather than another long feature inventory. Keep creation,
rooms and Live Earth visible below these entry routes. Describe limitations in
place: coverage varies, observed data differs from simulated content, and global
terrain editing is not finished.

Replace each matching old gallery slot with a verified candidate capture and
add the lab/Journal, careers and personal workspace categories. Keep one reviewed
image inventory for landing, README, release notes and GitHub Pages. Capture the
new HUD only after its implementation passes parity. Check desktop, Android,
keyboard, reduced motion, image payloads, broken links and the actual Play route.
No artwork/mockup may be labeled as gameplay.

## Evidence ledger

Production identity checked at the start of this work:
`5.5.0+d8775a392c42.88e67f97c00bb4c2.production`; 80 production Functions reported
ACTIVE. These are inventory observations, not release certification. Nothing was
deployed. Existing saves, history, dist and retained candidates were preserved.

| Evidence | Result and limits |
| --- | --- |
| Focused contracts | Source retention, multipolygons/holes, gates, ground, budgets, lease lifecycle, delayed terrain, restored collision, airport transfer and camera projection. Final `verify:pr` passes 2,436 tests with zero failures, plus dependency, source, ownership, boundary-type, unresolved-name, test-inventory and sensitivity checks. |
| Fence browser component | `output/facilities-20261011/perimeter/report.json`: 10 passing checks. Real bundled GLB, shared collision and keyboard client over controlled map geometry; inspected close/overview images. 69 visible bays and matching colliders, three asset draw calls. |
| Actual app assembly | `world-integration/report.json`: 5 passing checks. Real app startup/world loader with one explicitly controlled facility map response at Iowa coordinates. Actor repositioning tests retirement/return. Inspected in-app image; no page/graphics errors. This is not real Iowa geography or worldwide coverage. |
| Dialog and layout | `navigation/report.json`: 13 passing checks, including load failure/retry, duplicate clicks, stale search, focus, free roam, Ocean/Space context and bounded phone sheet. Actual airport dialog uses controlled load results; navigation remains a prototype. |
| Marine captures | `marine-capture/report.json`: actual app deck → helm/overview → deck/cradle → sub → diver sequence, four inspected captures, no page/graphics errors. Authored fallback depth is identified; no live worldwide bathymetry or wildlife completeness claim. |
| Landing display | `landing/report.json`: 12 passing checks for capture hashes, image decoding, unreleased labeling, desktop/phone fit and keyboard expansion. Both viewport captures inspected. |
| Public gallery consistency | `node scripts/sync-public-gallery.mjs --check` passes for the existing 12 released images. Development images have their separate capture receipt. |

All relative receipt paths in this table are under ignored
`output/facilities-20261011/`. Failed attempts are retained separately: the first
actual-app adapter incorrectly looked for the Ocean canvas; the corrected run
uses the actual Earth renderer and preserves the game's text-state reader. A
landing assertion also needed to account for its existing uppercase text styling.
The final fence preparation consumes the catalog budget and reproduces the
reviewed GLB hash exactly; its 10 focused contracts pass after that tooling change.
Component checks exposed and fixed a lost opacity channel; final source/assembly
review exposed and fixed the missing world-context connection.

Live BWI/map refresh attempts received OSM HTTP 429 and public Overpass 406/429.
Requests were stopped. Historical Logan backend-isolation fixtures remain
checksum-verified recordings; their newly requested ancillary fence/access data
is explicitly **controlled-empty**, not claimed as newly captured map data. The
separate fence fixtures exercise that new data. Live provider and real-site
acceptance remain open.

## Remaining work — no broad completion claim

1. Validate boundary data and traversal at real BWI, a small airfield, a marina
   and a port under normal provider availability, with streaming and touch.
2. Deliver the complete airport journey and licensed aircraft/terminal art in
   phase 2. Current procedural aircraft, solid fallback terminals, incomplete
   cabin routes and apron equipment are not accepted final artwork.
3. Deliver the berth/gangway/deck journey and port assets in phase 3; audit quay
   walk surfaces and water depth against the existing marine owners first.
4. Deliver geographically reviewed launch-site packs and the complete launch /
   space / Earth-return chain in phase 4. No launch-site pack is implemented here.
5. Adopt the navigation proposal only through its action-parity and journey
   gates, then complete all release gallery categories on that verified build.
6. Retain all earlier roadmap gates and prove save-compatible fallback, current
   cloud/rule compatibility, physical-phone behavior and release rollback before
   production deployment. This local checkpoint is not a production candidate.
