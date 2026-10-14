# Venue access, waterfront and space-site repair — 13 October 2026

Work is local on the architecture-evaluation checkout. Existing production and the saved consolidation candidate are preserved. This is a repair ledger, not a release announcement.

## Reproduced defects

- A Baltimore launch north of downtown loads the National Aquarium footprint but excludes its entrance from the origin-centred door catalog. The near-venue launch admits the same building. Both were reproduced in native Chrome against the local emulator backend.
- The aquarium inherited a residential facade, wooden door and awnings. The Peale inherited two storeys instead of its photographed three-storey Federal facade. A material-family change alone is insufficient visual acceptance.
- Player and ambient vessel movement checked water containment but omitted building collision, allowing over-water structures to be crossed.
- Water bed shaping applies a soft bank to engineered shorelines too. Existing quay/pier presentation does not supply a vertical retaining face.

## Initial verification (historical)

`output/venue-harbor-repair/aquarium-district-baseline` records the failed entrance. `aquarium-district-fixed` records successful normal walking and E entry after diagnostic placement outside the far district's door. This is not a continuous 2 km journey. `museum-district-fixed` records successful gameplay but a verifier routing-cleanup failure; the process itself is not a passing gate. Seven focused entry/obstacle regression tests pass. Full build/release/device acceptance has not run for these edits.

## Architecture decisions

Retain source footprint, collision and admission as one authority. Reviewed venue identities can retain detailed doorway rendering inside an already-loaded district; names alone cannot grant this privilege. Vessel obstruction uses the existing building collision broad phase and an oriented hull narrow phase, including bridge vertical clearance. Earth obstacles never query the separate Ocean scene. Quay treatment is limited to mapped quays and the reviewed built Inner Harbor; natural coastlines keep their banks. Water polygons and transport geometry remain authoritative.

## Reference material

- National Aquarium public entrance and campus: https://aqua.org/visit and https://aqua.org/visit/accessibility/audio-tour
- Campus outline: https://www.openstreetmap.org/relation/14162263 (ODbL, existing mapped identity).
- Peale front and building history: https://thepeale.org/directions/ and https://thepeale.org/history/
- Baltimore waterfront OSM review: source/version/coordinates in `output/venue-harbor-repair/reference/baltimore-waterfront-osm.json`. No surveyed harbor depths are claimed.
- NASA official model repository: https://github.com/nasa/NASA-3D-Resources
- NASA media/model usage guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
- VAB dimensions/history: https://www.nasa.gov/kennedy/partnerships/vehicleassemblybuilding/
- Historic public facility plan: https://www.nasa.gov/wp-content/uploads/static/history/afj/ap08fj/pdf/sa503-flightmanual.pdf

Public photos guide reconstruction; they are not redistributed as material textures. NASA assets are factual facility representations with source credits, never an endorsement. Historic shuttle gantry models must not be passed off as current Artemis launch facilities.

## Initial acceptance checklist (historical)

Visible and usable doors from near and distant starts; exterior reference comparison; harbor bank/collision and boat scale inspection; vessel control and safe clearance; authentic launch-site implementation with enterable public-reference interior; lifecycle cleanup; focused source, browser and packaged-build checks. No check is complete merely because a model or test exists.

## Additional root cause and current functional checks

The aquarium-wide camera ray identified `FarMappedBuildingInstances` as the surviving duplicate. The regional exclusion used the streets/land-use radius while detailed buildings use a larger, separately queried metric circle. `detailed-building-domain.js` now supplies the building domain; the exact circular filter still protects corners and distant coverage. Native Chrome `aquarium-harbor-fixed` confirms the duplicate blocks are gone and normal E entry/exit works. This fixes a geographic ownership mismatch rather than deleting neighboring building coverage.

The passenger-launch journey drives into a real Inner Harbor bank through normal DOM controls and the runtime's functional fixed-step hook, stops 8.94 world units from the wall and reverses to 18.38. This is collision/control evidence, not frame-pacing certification. The chase camera's poor roof framing was separately observed in its screenshot and corrected for small cabin vessels.

`museum-quay-fixed` passes Peale entry/exit and the same harbor journey. Its screenshot exposed a 6.27 m provider height inconsistent with the three-storey public facade; a narrowly identified photo-derived correction now retains the original provider value as evidence. This latest height correction still needs another image check.

Quay terrain relief now uses the existing bounded structure-cut shader, raycast and support owner, composed with existing tunnel masks rather than replacing them. Wet-side bed strips remove the coarse DEM's interpolated beach while dry land remains unchanged. Fourteen quay/portal parity tests pass. Wall tops now sample the published terrain; this latest alignment correction still needs browser inspection.

## NASA scope recorded during implementation

Kennedy's Vehicle Assembly Building and Launch Complex 39B are the first named NASA facilities. Official NASA GLBs are being prepared as locally owned assets. The VAB ground-floor circulation follows the published high-bay / transfer-aisle / low-bay organization. No current operational control, exact full campus survey, partnership or current movable-equipment state is claimed. The historic Shuttle gantry reference is not used as an Artemis structure. Facility entry must use the existing building/scene movement, support, interaction and exit owners; a separate locomotion system is not acceptable.

## Completed local gameplay checks

The receipts below are native Chrome with the existing emulator backend and real
provider world data. Normal DOM controls drive the game through its fixed-step
functional hook. Diagnostic placement/cameras are called out; these are not FPS,
physical-phone, production App Check or end-to-end continuous-travel certificates.

| Receipt under `output/venue-harbor-repair/` | Result and scope |
| --- | --- |
| `aquarium-quay-collision-final` | PASS: ordinary near-venue walking, E entry and E exit; real harbor throttle, quay contact and reverse; no page errors. Images inspected. Canonical door identity remains intact while collision uses the reviewed architectural volumes. |
| `peale-facade-final` | PASS: distant loaded district, diagnostic placement seven units outside its door, ordinary walking and E entry/exit; no page errors. Three-storey seven-bay facade, entrance columns, sash windows, arches and cornice inspected against the public photograph. |
| `kennedy-full-tour` | FAIL: test route went through the assembly lectern after closing its panel. No game collision was disabled. Test routing now returns through the marked transfer aisle. |
| `kennedy-full-tour-final` | PASS: ordinary exterior entry, all four station approaches, panel open/close, incorrect then correct preparation/assembly/rollout sequence, continuous walk back and E exit. NASA crawler loaded; no page errors. Roof, floor, crawler and panels inspected. |
| `launch-pad-first`, `launch-pad-diagnostic` | Movement PASS, visual review FAIL: generic Overture building towers duplicated the reviewed lightning masts, and the hardstand floated above terrain. Receipts retained. |
| `launch-pad-ground-final` | PASS: same continuous south approach rises onto the rendered hardstand; no page errors. Inspected lattice masts and supported grass embankment. The three exact duplicate tower identities are replaced; nearby buildings remain. |

Aquarium/harbor latest contact left the boat center 8.94 world units outside the
quay and reverse moved it to 18.26. The near-aquarium actual ambient fleet also
contains `harbor-passenger-launch` at its mapped ferry stop. This is a 16.8-metre
catalog-class adaptation, not a scan of a specific Baltimore Water Taxi boat.
The underlying vessel renderer retains the game's established world scale.

The missing wall was also a visibility ownership defect: its geometry spans the
harbor but its root is at the world origin. Furniture distance culling now uses
that root's published geometry bounds. Wet-side terrain cuts compose with tunnel
cuts and retain the original water footprint; natural beaches are unaffected.

## Named NASA implementation and sources

VAB exterior: the official NASA model, with its main high bay fitted to published
134.72 × 157.89 × 160.02 m dimensions. The model owns its resources and cancels
late attachment after scene retirement. The entry is a visible, accessible
interpretive visitor doorway under the existing admission owner. The mapped
Transfer Isle road remains; it no longer deletes this enclosing reviewed hangar.
The ground-floor interior uses the mapped perimeter, four high bays, 28 m transfer
isle, low bay, roof transitions, steelwork, platforms, cranes, markings, floorplan
and four working stations. The crawler is the NASA source model, simplified to
145,309 triangles and six material draws with a bounded single-exhibit lifetime.
It is a static exhibit, not a new drivable crawler mode.

LC39B: mapped hardstand/ramp, flame trench, three 182.88 m lightning masts at their
mapped positions, catenary wires, sound-suppression water tower and grass slopes.
Triangle-based contact, render geometry and the bounded trench terrain cut share
one disposable facility owner. No launch simulation or working propellant system
is claimed. Mound slopes, equipment placement and tour circulation are interpreted,
not a survey of current restricted infrastructure. Other NASA campuses are not
being relabeled as reconstructed interiors by this change.

Additional primary references:
- https://www.nasa.gov/reference/launch-complex-39b/
- https://www.nasa.gov/missions/artemis/lightning-towers-stand-tall-at-nasa-kennedys-launch-pad-39b/
- https://www.nasa.gov/wp-content/uploads/2022/01/artemis_i_stack_in_vab-1.jpg
- https://thepeale.org/wp-content/uploads/2022/06/IMG_0575_small.jpg
- https://aqua.org/assets/landscapes/mission-impact-numbers-header_4-7-2020_2500x1667.jpg

## Important remaining limits

This repairs the named Baltimore venues and implements the first two named NASA
locations; it is not a photographically exact reconstruction of every museum,
aquarium or spaceport. Peale collection displays remain the existing interpretive
museum experience, not its real collection. Aquarium interiors remain the
Pavilion/Blacktip Reef visit. Their prior performance failures remain recorded in
`docs/aquarium-expansion/VERIFICATION.md`. Exterior finishes, surrounding generic
utility buildings and wider urban scenery can still look stylized.

Live Overpass timeout/cooldown and a weather-provider 429 were observed in separate
NASA runs. Fallback world loading and the reconstructed visits worked; those
provider failures are not deleted or presented as a clean live-service pass.
Production, hosted/device acceptance and the full release matrix are separate.

Source validation before the packaged review: `npm run verify:pr` PASS, 2,600 tests, zero failures/skips,
plus dependency/module identity, context ownership, boundary types, runtime names,
inventory and sensitivity checks. Log: `/tmp/we3d-venue-pr-final.log`.

## Packaged visual findings and final corrections

The first immutable package, `venue-harbor-kennedy-20261013`, passed normal aquarium
admission, harbor contact/reverse and the complete VAB tour, with no page errors
or failed local assets. It did **not** pass visual acceptance: the moving circular
`BoatWaterPatch` bypassed the mapped shoreline and appeared over the promenade.
Its `packaged-aquarium-harbor/quay-stop.png` retains that failure. Mapped boating now
uses the already-animated mapped surface; only an explicit synthetic Ocean or
transition candidate can activate the separate patch. A component regression
checks no allocation over five mapped water kinds, synthetic Ocean activation,
return to harbor, reuse and deactivation. The harbor journey now also requires
mapped wave shaders to remain compiled and the overland patch to be hidden.

The full source chain passes again: **2,601 tests, no failures/skips** in
`/tmp/we3d-venue-pr-shoreline.log`. A subsequent VAB finish adjustment removes the
excessive dark albedo tint and improves indirect light. Its five component tests
and native Chrome `kennedy-lighting-final` full tour pass; entry-floor and crawler
screenshots were inspected. This was a visible arrival problem, not a changed
test threshold. Final immutable package journeys remain to be recorded below.

The second package, `venue-harbor-kennedy-final-20261013`, fixes the overland water:
`final-aquarium-harbor` passes normal admission, quay contact/reverse, hidden local
patch and 124 compiled mapped-wave surfaces. The quay remains dry in its inspected
image. `final-museum` passes distant-district Peale admission/return with zero page
errors or failed local assets. The photo comparison nevertheless exposed coplanar
concrete over two lower aquarium pavilion faces. A raycast reproduced concrete
and glass at the same depth: the strict polygon test excluded shared boundaries.
The replacement now includes perimeter points within 0.02 world
units. Raycasts across all six pavilion edges require glazing without concrete;
five focused exterior/admission tests pass. Concrete tint is also lighter to
avoid darkening an already weathered diffuse map twice. This keeps the same
footprint, collision owner, entrance and neighboring coverage.

## Ocean regression found before promotion — 14 October

`venue-harbor-kennedy-reviewed-20261013` passes all four named venue journeys with
zero page errors and failed local assets. Its additional Ocean check fails before
gameplay: `reviewed-ocean` and `reviewed-ocean-ready` retain the rejected launch.
Waiting for selector readiness did not fix it. The actual new clearance check
sampled the previously active water without supplying the incoming candidate;
fresh Ocean entry returned NaN, which `??` does not replace. Start, reposition and
movement now sample the explicit incoming candidate. A validated independent
surface arrival cannot collide with the outgoing Earth frame; its prior land
visit is preserved and its meshes retire through the existing transfer owner.
Regular mapped-water hull/building collision remains required.

`ocean-admission-fixed` then passes fresh/airborne arrival and scuba, but exposes a
real portrait framing defect: hull avoidance can reverse the camera bearing while
the old HUD offset still follows the swimmer's heading. The diver's head is hidden
by the control panel. `frameOceanDiverLookTarget` now derives screen-right from the
resolved camera and scales framing by distance/FOV/aspect. Projection tests cover
five bearings, three distances and two portrait sizes without changing collision.
`ocean-framing-fixed` passes the complete seven-case connected journey, including
deck recovery, submarine deployment, menu exit and saved-voyage resume. Images of
arrival, portrait diver and submarine were inspected. The ship's open-water
surface remains visible. Controlled GEBCO entry and desktop portrait emulation
are not live bathymetry or physical-phone certification. Local App Check/default
provider failures are recorded separately from these gameplay results.


## Terrain recovery found by final Kennedy acceptance — 14 October

The b17 immutable package passes `accepted-ocean` (seven connected cases),
`accepted-aquarium` (admission and harbor) and `accepted-museum` (distant district).
`accepted-kennedy` and `accepted-kennedy-retry` both fail before gameplay. Nine
material sets and an optional local rendering script time out; a detailed terrain
image fails, the map loader retries a larger query, and the transport height-parity
check rejects the inconsistent surface. No safety threshold was removed.
`kennedy-network-diagnostic` subsequently passes the complete visit on the exact
same bytes. That success does not erase the two earlier failures or establish the
cause of the broader local asset delay. Direct local script delivery took 20 ms;
the failed terrain URL returned HTTP 200 in 255 ms in a separate read-only probe.

Code inspection of the reproduced failure identifies two recovery defects:
near-terrain publication awaited only one image attempt, bypassing the tile
owner's bounded retry policy; and a regional-terrain rejection was treated as a
map-query failure. Publication now joins the existing bounded tile owner and
rechecks its generation before attachment. Exhaustion remains a terminal surface
failure; it cannot enlarge the map query or publish transport against incomplete
near terrain. Source regressions cover recovery, exhaustion, terminal error
classification and prevention of road compilation on failed terrain. The
instrumented journey retains request timings and supports a clearly labeled
single-request terrain fault followed by real-provider recovery.


## Final source and immutable build — 14 October

`npm run verify:pr` passes **2,607 tests, zero failures/skips**, plus the complete
architecture/source chain. The exact log is preserved at
`output/venue-harbor-repair/final-source-validation.log`.

Runtime commit: `2d96261cf456`; candidate:
`output/hosting-validation/venue-harbor-ready-20261014`.
Build: `5.6.0+2d96261cf456.bc6a5c36dfa8b2c8.staging`.
734 packaged files; asset manifest SHA-256:
`f19f7bcbab148089789e7017ccee2b9fdd538689a63946e7258a5b8929744ce8`.
Build and package verification pass, with clean source at build time. The
production package, saved consolidation package and four recognized rollback
packages remain intact. Three superseded task packages were removed after their
manifest identities were checked and copied to
`output/venue-harbor-repair/superseded-package-manifests/`; their source commits,
images and failed/passing reports remain. This recovered approximately 900 MB.

`ready-kennedy-recovery` passes exterior walking, E entry, all four stations,
assembly sequence and normal exit on this final package. The controlled request
`15/9045/13669` fails once (`net::ERR_FAILED`) and then successfully downloads in
131 ms. No terrain is fabricated and no height-parity threshold is relaxed.
`ready-launchpad` passes the continuous south approach through five intermediate
positions, rising from world Y 6.43 to 15.23. Both have zero page errors and
failed local assets; the intentional external terrain fault is recorded separately.
VAB interior/station and LC39B overview/walking images were inspected.

### Scope and remaining release limitations

These changes cover the National Aquarium's reviewed Pier 3 forms and entry,
The Peale's exterior/entry, the engineered Inner Harbor shore and passenger launch,
and Kennedy's VAB ground-floor visit plus LC39B. They do not reconstruct every
museum, NASA campus or restricted operational interior. Upper VAB levels are not
playable. The Peale gallery content remains interpretive; it is not a reproduction
of the Peale's current collection. The reviewed exteriors replace generic building
forms, but material fidelity, surrounding utility buildings and landscape detail
are still simplified and should not be advertised as photoreal or survey-exact.
The quay bed cut is a bounded presentation/contact model, not a depth survey.

Provider outages, ordinary hosted App Check, physical-device behavior, sustained
frame pacing and the previously recorded aquarium performance gap remain distinct
release concerns. Functional fixed-step desktop checks do not certify those.
The two earlier VAB startup failures remain in their original receipts. The
bounded recovery defect is fixed and tested; the wider transient local texture
and optional-script timeouts were not reproduced by the successful diagnostic
run, and their cause is not proven. No GitHub publication or production deployment
has occurred in this follow-up.


## Final facade ownership correction

All five `ready-*` journeys pass on 2d96261c, including aquarium/harbor contact
(center clearance 8.94; reverse 18.23; 124 mapped wave surfaces), distant Peale
entry/return and all seven Ocean connected cases. Final image inspection catches
one additional visual conflict in `ready-museum/door.png`: the moving generic
frontage-detail owner adds a second nameplate and trim above the authored Peale
surround. Reviewed venue identities are now excluded from generic decoration
selection, preserving their footprint, admission, authored detail and all ordinary
neighboring building candidates. The browser receipt explicitly checks that the
venue has no overlapping generic mapped sign. This is a cosmetic ownership fix;
no terrain, vessel, doorway collision or NASA activity logic changed.


`995665b4/museum` correctly fails the new duplicate-sign assertion. The detail
cache retained the Overture ID but omitted the stable metadata mapping used to
recognize the Peale's OSM identity. The correction now resolves the reviewed
venue while the complete source metadata exists and stores only that small
classification in the travelling cache. `facade-owner-source` passes distant
walking, entry and exit with zero duplicate generic venue signs; the doorway image
was inspected and shows the one authored nameplate. No name-based matching or
neighbor deletion was introduced.

This run also captures the delayed local PBR resources: image responses can take
about 13 seconds, exceeding the existing four-second procedural fallback. This
helps explain why material fidelity differs between otherwise passing runs.
Material-loading/late-upgrade polish remains an explicit limitation; this follow-up
does not claim to have resolved the entire graphics loading pipeline.
