# Shared racing acceptance — October 29, 2026

The fixed finish line remains `FINISH_GOAL.md`. These accepted checks do not
need another complete race unless their owning code changes. This is staging
evidence; the racing package has not been deployed to production.

## Controlled oval format — October 30

Reviewed profiled courses can now retain a station-varying bank lane separately
from their physical apron. The new oval format rolls four shared vehicles in
two columns before green through the existing fixed-step session. Ordinary
standing starts keep their previous rules and record classes. Oval records use
a separate, versioned rolling-start class.

Controlled gameplay checks cover lane holding over two laps, formation input
isolation, practice staging, network interpolation, impact/disconnect cautions,
brake-based pace control, one penalty per passed rival during a restriction,
and clear versus occupied apron merges. Browser, socket-service and Functions
rules reproduce the same caution and penalty results. White and chequered flags
follow actual lap/completion state. These are original game rules: 10 m/s apron
and caution pace, five-second cautions and five-second order penalties.

The moving four-car render uses the licensed M3 race asset. A separate deliberate
wall-impact render visibly changes yellow to green; its driver continues holding
the wheel into the boundary and remains stopped. It proves the displayed flag
transition, not wall recovery or native-venue smoothness. A failed screenshot
capture was diagnosed and retained before the successful composed-HUD capture.

Oval aerodynamics now apply a speed-squared drag force through the shared planar
physics delegate. The original coefficient is 0.0004/m, scaled by the vehicle's
width and height relative to 2.7 m². This is a game estimate, not factory data.
A nearby aligned car on the same bank and elevation can reduce that force by
less than 30%; wakes cannot stack, operate under yellow or grant energy while
coasting. The session samples all actors before each tick; local prediction uses
the same calculation. Formation, apron, caution and two-lap checks still pass
with this force. Ordinary courses retain their exact previous calculation.

Fourteen focused checks include browser/service/Functions replay, coasting,
wake exclusions and network prediction. The three post-green render captures
show two following licensed M3s drafting, with no contacts or WebGL errors. Input
is held throttle with controller steering; this is not another native smoothness
test. An initial coasting fixture hit a curved boundary after its observation
window grew too long; the retained diagnosis separates collision braking from
aerodynamic deceleration, and the corrected check has zero boundary contacts.

The shared course contract now admits a separate reviewed pit path with two
main-loop joins, complete profiled pavement, bounded length and join heights
within one centimetre. Canonical references, reconstruction and class identity
retain that geometry. Pit timing planes lie on the actual branch, including a
finish line inside it; ordered pit checkpoints must precede their timing credit.
The car never follows a synthetic timing pose.

A shared junction briefly retains two bounded gate cursors until the simulated
body takes a distinguishable branch. Main-track cars retain their original
progress. Pit pavement supports the same body through the existing physics
delegate, with member containment at overlapping entry/exit pavement, rather
than clamping whichever centreline is closest. Ordinary projection and physics
retain their previous calculation and allocation behavior.

The oval pit class has controlled checks for complete entry/checkpoints/exit and
finish, a finish inside the pit path, no false main-track entry, speed and passing
penalties, occupied exit clearance, canonical geometry rejection, backend replay
and network prediction. The 25 focused checks pass. Entry, midpoint and exit
renders show the licensed M3 with zero boundary contacts, penalties and WebGL
errors. Their initial fixture content limit was below the already admitted
four-car asset budget; the same captures were rechecked against the real model
and cabin ceiling. This is not a native moving-scene performance acceptance.

Daytona now offers private oval practice under construction. Native publication
qualifies all 139 spans: 127 main-loop spans and 12 pit spans, with no rejections.
The 619.84 m pit branch retains 40 ordered checkpoints. Its bounded native-core
plane fit keeps the existing crossfall/fidelity fences; ordinary exploration uses
the same existing four-wheel solve on the privately adopted pit roads. All 369
measured native pit-driving frames retained four contacts, no missing telemetry
and a maximum 1.54 cm wheel-fit gap. The larger canonical facts round-trip through
three existing storage chunks; browser, service and Functions reconstruct the
same course and key.

Frozen `f37ddb8e` completed the native 4.01 km one-lap oval, full pit branch and
exit through the normal session, Results and Journal. Controlled analogue actions
entered the existing input port; no pose or clock was replaced. The finish had
161 timing gates, one pit visit, zero barrier contacts and zero penalties. Its
3:40.08 includes an initial idle period and is not a record/benchmark claim.
The eight-minute page guard closed after the saved finish; the subsequent trace
export and extra grid screenshot could not run. The completed journey is retained
and does not require another lap for that capture failure.

Daytona pit dressing now includes 27 original game stall bays, edge lines,
PIT/22 pace cues and an entry arrow, clipped to the actual published pavement.
The native follow-up exposed missing fragments on thin transverse paint under
non-MSAA rendering. The existing marking material now optionally filters the
physical strokes over their pixel footprint; ordinary paint retains its prior
path. Controlled aliased comparisons and both changed native views confirm
continuous bars and lettering. Road support, walls, collision and the completed
lap remain unchanged. The normal rolling grid also visibly contains the real
M3 E92 race car and Carrera 4S alongside the original BMW. These accept the
changed paint and grid-presentation boundaries, not the surrounding venue pack.

Complete venue presentation, changed live multiplayer/catalogue acceptance and
the final moving-scene budget remain open; no major pack is accepted. Circuit
pit gameplay is still explicitly unavailable.

Three mapped Daytona garage exteriors also passed publication in the actual
loaded world: three roots and three replacement colliders, with no remaining
generic representation under those source identities. Two car views and a
precisely admitted walking view show their terrain fit and closed façade detail.
The normal restore helper snapped the first two attempted north-garage views to
a service road; those views are retained as framing failures. No pit driving or
full venue acceptance is inferred from these placements. Nearby generic service
buildings remained a presentation failure and are being replaced separately.
Six additional mapped service, inspection, media and club exteriors have since
passed actual publication: nine total roots and replacement colliders, no
remaining matched shells or generic building centres inside those footprints,
and six admitted walking views. Background generic buildings and existing entry
labels remain visible; this does not accept the whole paddock presentation.

Four additional low pit canopies now replace the exact retained Overture blocks:
13 reviewed paddock roots in total. Native publication retains their canonical
canopy type, excludes interior entry, retires all four matched shells and uses
128 post/wall/roof component colliders with open passage below the roofs. The
controlled render caught a brown concrete texture; the repaired painted finish
uses that image only for bump detail. Both the repaired render and native canopy
view were inspected. Generic background buildings and remaining pit dressing are
still presentation work. Normal practice now uses the admitted M3 E92 race car
and Carrera 4S as its two default opponents, preserving their source paint. Native
scene inspection confirms those actual loaded model IDs.

## Actual city and deployed services

Frozen browser build: `5.6.1+f2d621309ecd.1b27b746bce01a83.staging`.
Authority source: `283bfe2`, ready Cloud Run revision `00002-gdp`.

The current Monaco city district retained 10,097 buildings and 11,533 roads.
Qualification exported 148 usable spans and 907 surface samples, with retained
OpenStreetMap and Copernicus provenance. The approved 698.252 m city sprint is
**not** the Monaco Grand Prix circuit.

The creator completed a server-timed private qualification, submitted it through
the actual game interface, and a disposable reviewer approved it in Account.
The temporary reviewer claim was restored and its refresh tokens revoked.

Two disposable authenticated room members then joined the approved course via
live TLS, Auth and App Check. The browser drove the owned DeLorean through normal
keyboard input; the second client used the existing control protocol and BMW
rules without running a second city renderer. Both used the real server clock.

| Accepted outcome | Evidence |
| --- | --- |
| Two finished participants | BMW 43.713 s; DeLorean 84.350 s |
| Immutable competitive receipt | Persisted by the deployed authority |
| Existing wallet awards | 250 and 150 Credits; no second currency |
| Browser Journal | Online result and Journal saved feedback |
| Shared comparable records | Actual view read the live DeLorean class and rendered 84.35 s |
| World return | Normal walking admission followed by keyboard movement |
| Runtime errors during accepted race | Zero page or console errors |

Car class includes vehicle, upgrades, starting condition, grid row and physics.
The two different cars do not belong on one comparable-time board. Their order
in the individual race result is separate from those class-specific records.

Walking approach was controlled test setup through the existing typed surface
travel owner. Model adoption, room admission and timed driving were real. This
does not claim ordinary approach driving, two physical devices, Play Integrity,
or headset comfort. Earlier qualification, lease/proximity, browser timeout and
verification-driver failures are retained in private evidence.

## One performance window

The same accepted race supplied one 60,000.3 ms desktop measurement:

| Metric | Result |
| --- | ---: |
| Average frame rate | 40.45 FPS |
| 95th percentile | 34.1 ms |
| 99th percentile | 50.0 ms |
| Worst frame | 100.1 ms |
| Frames over 250 ms | 0 |
| Moving time | 41.43 s |

This meets the existing 30 FPS desktop floor, 35 ms p95, 50 ms p99 and 250 ms
maximum. One isolated frame exceeded 100 ms; the existing hitch guard passed.
It is not a physical-phone thermal/memory measurement or acceptance of unbuilt
major venues. Earlier slower runs remain retained rather than being relabelled.

## Shared vehicle handback correction

Inspection after the race exposed two separate representation contracts:

- Gate/timing poses are ground contact. Room vehicles require chassis-root Y,
  pitch and roll. Renew/release now project the authoritative numeric vehicle
  frame, retain the lobby's existing pose, and preserve immutable ground timing.
- A shared personal BMW uses a personal category rather than the ordinary sedan
  category. Personal identity now selects the registered model and asset through
  the existing catalogue and model lease owner. Unknown/mismatched personal
  definitions are rejected rather than rendered as another sedan.

Twelve focused transaction/reconciliation checks passed. Two older VM checks
initially failed because their import stripping ignored the current second
import; the harness now supplies the real control policy. Two selected service
regressions passed. Actual BMW and DeLorean GLBs were rendered in a controlled
scene, both matched their registered IDs, and model leases returned to zero.
The shared-times view also read the live accepted result. Those are focused
component/service checks, not another city run or a full styled gameplay screen.

The source gate also detected existing mixed module URLs for vehicle settings
and BMW preparation. Imports now use their canonical versions; this changes no
handling constants or competitive record keys.

## Still outside this acceptance

The balanced major-venue register still has twelve researched layouts and zero
complete playable packs. It needs rights-cleared geographic content, discipline
rules and actual complete venue acceptance. A final coordinated artifact and
its changed distribution paths remain required. Absent Apple and VR hardware
are disclosed limitations, not repeated approval questions.

## Terminal network input

A later first-party curation qualification retained two `race_not_running` replies
from controls sent just before the crossing. A completed session now validates
and consumes those late controls without changing its actor, queue, clock or
receipt. Existing sockets retain only their immutable completed-session context
until Leave/close; active room leases and race slots are released as before.
Broadcasts require the socket's current race association, so leaving an old result
cannot publish its snapshot into a replacement lobby. Disconnect and service
shutdown release that context. Invalid controls and forged finish messages remain
rejected. There is no new scheduler or result store.

The focused case failed before the terminal handoff repair; an additional
replacement-lobby assertion reproduced the routing boundary. Six selected service
cases then passed, covering terminal input/receipt immutability, replay, old
socket isolation, host/reconnect behaviour, failed-acknowledgement retry and the
socket gateway. No accepted city race or performance minute was repeated.


## Profiled bank and apron contract

`profiled-road-pavement-v1` retains the original geographic source line while
qualifying the entire asymmetric physical pavement from uploaded triangles.
Each height row retains its lateral observations and bank racing-line offset;
the road declares a separate usable racing width. Grid placement, timing,
vehicle boundaries, AI targets, event paint and equipment use those same facts.
Publication revalidation checks the full apron and racing line, including areas
beyond the centre and wheel probes. Existing slope and vertical fences remain.

The class uses `earth-profiled-pavement-2026-10-30.1`. Ordinary and previous
banked-road identities and record classes retain their existing versions.
Browser, socket-service and Functions bundles reconstruct matching courses and
session states in the focused integration check. Canonical storage retains the
profile. A controlled GPU journey uses the existing licensed BMW M3 racing
visual and shared controller on an uploaded bank/apron mesh. These checks do
not confer finished-venue admission, live deployment or final network release
acceptance; native full-profile qualification remains a separate boundary.

Profiled pavement uses shared source-node transects for compiler probes and
height lookup. Adjoining selected ways derive their end transects from the same
pinned nodes. Their connected continuations own grading beyond those transects,
so an old end plane cannot flatten the next banking transition. Terrain
construction shares equivalent existing vertices within publication precision
and splits each incident face at every logical edge station. The source line,
packed height owner and physical footprint remain intact.

Variable-width export collapses common knots at each row's actual boundary.
The unraised profiled class fits on the existing canonical coordinate/height
grid, retaining the 3 mm measured error budget, 32-point limit and crossfall
fence. Centre and wheel witnesses retain canonical precision. A bounded grid
search resolves rounding allocations at narrow patches; a larger discontinuity
rejects. Ordinary roads and earlier banked/raised-edge fitting retain their
existing paths.

Focused regressions cover the original 8.2 cm graded-bend jump, retained native
knee and clustered-cut witnesses, connected-bank grading ownership, variable
bounds, and slope preservation through canonicalisation. Thirty selected checks
pass. Complete layout topology cases use explicit zero heights. Inspected GPU
checks cover the curved pavement and a licensed M3 using the shared racing
controller on the exported apron; these remain controlled component evidence.

The latest actual native boundary drive used continuously held acceleration and
braking through the repaired knee. It retained four wheel contacts and zero
penetration over 19.3 world units; maximum rigid-body wheel gap at the crease was
0.06153 world units (68.3 mm). Both views were inspected. The subsequent native qualification passes all 127 original spans with no
rejections, invalid raw heights or invalid canonical heights. All 127 retain
full profiles through the 668,691-byte storage round trip, with at most 19
lateral points and measured fit error below 3 mm. Maximum departure from the
compiled surface is 44.5 mm; this is local agreement, not survey accuracy.
The affected source-join view was inspected. No major venue pack is accepted.

The oval's original frontstretch game timing reference now qualifies and starts
private practice through the normal menu. A continuously held acceleration
check crosses the first gate with no race barrier contacts; leaving returns to
exploration. This is circuit-style practice, not completed oval rules or an
official surveyed timing line.

Permanent outside wall and curved catch fencing publish through the existing
post-transport exterior owner: 32 bounded sections and 557 indexed wall
colliders. An actual outward approach remains inside the wall. Six impact
correction frames omit complete wheel telemetry, so that check does not certify
four contacts throughout an impact or final pacing. The wall footing reads
actual published contacts, with a four-centimetre nearest-triangle limit at
clipped caps; road contact and qualification tolerances are unchanged.

Native frontstretch and 31-degree-bank views show the double yellow boundary,
white outside line, wall and fence. Paint uses the existing road-marking depth
policy and clips to published triangles. Newly refined terrain vertices resolve
retained mapped cover through the existing mapped-ground owner rather than
inheriting a coarse urban neighbour. Focused regressions cover narrow lawns,
material weights and detailed-source priority; native sampled lawns retain
grass material while unclassified adjacent ground retains its prior class.
Pit architecture, further landscape detail, oval discipline, complete venue
play and final performance remain open. These improvements are not finished
pack or production acceptance.
