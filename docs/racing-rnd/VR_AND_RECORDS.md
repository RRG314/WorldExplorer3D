# Racing views and personal times

Road practice uses the existing transport actor, simulation kernel, VR presentation
owner, Journal and Rankings panel. It does not establish an online race authority.

## Viewing and controls

The race HUD opens the existing VR setup. The phone viewer still requires landscape,
explicit motion permission and a matching screen/lens calibration. Tracked viewing
uses capability detection and the existing WebXR frame lease. Neither head rotation
nor a second guided road activity takes over racing controls. Live GPS must be
stopped before a race starts.

Countdown, position, elapsed time, lap and gate come from the existing controller
snapshot. The caption changes at most at tenths of a second. At completion, **Results**
replaces Start. Selecting it ends the VR presentation, then the existing kernel's
presentation phase opens ordinary results while the race remains paused. No hidden
HTML modal intercepts the viewer trigger. Normal Exit also returns to those results.
Opening the Racing menu first releases VR; world, actor and car-view replacement
invalidate the captured view. Escape is consumed by the tracked view and cannot
also toggle the ordinary pause menu. Finished practice ghosts leave presentation;
a passing ghost containing the cabin/VR eye is hidden while it intersects that
view. The race session still owns their timing and progress.

The BMW retains its authored driver eye. Other fleet bodies currently use an
explicit raised view derived from their normalized envelope. This avoids placing
the BMW eye inside a different body. These views are labelled in setup; they are
not claims of individually prepared interiors. The same camera mount serves normal
driving and VR. A new immutable mount accompanies each successful car adoption.

## Personal times

**Rankings → Racing**, or **My times** from results, reads accepted practice events
from the existing Journal. The panel owns its pause and layout reasons while a
world is active; closing it releases only those reasons. Filters select a course
and car setup. Course, vehicle,
upgrades, starting condition, grip and physics version remain part of the record
identity. Rows are personal bests, not ranks across unlike setups.

New racing event IDs include owner scope and the stable run identity. Pending save
retries keep that ID. Clearing a completion cache cannot cause a later run to reuse
an earlier event. Account changes reject late reads/saves; guest results remain
separate. Journal primary-key prefix reads page through 64 events at a time and
keep the best per setup, including after completion-cache loss or Journal restore.
No database upgrade, separate score store or whole-Journal scan is needed. Legacy
cache references require matching Journal evidence; ambiguous old account records
remain retained rather than being reassigned.

Practice never writes a public leaderboard, pays Credits or becomes a verified
competition result. The existing generic leaderboard writers explicitly reject the
racing type. Server timing, durable online awards and public racing rankings remain
separate release requirements.

## Finish handoff

Practice presentation samples the two latest accepted 60 Hz vehicle frames at
the current session-clock remainder, with one simulation tick of latency. The
player body, its chase/cabin views and practice rivals use that same timeline.
This avoids repeated poses followed by double advances when render intervals
straddle a fixed tick. Sampling does not advance physics, interpolate timing
gates or modify session/result snapshots. Countdown and terminal poses stay
exact; stopping the controller retires its presentation with its existing scope.

A completed player's exact crossing snapshot remains the result evidence. The
road controller returns a stationary final frame through the existing physics
delegate, without changing the finish pose or timing. This makes replay possible
and avoids carrying race velocity into ordinary traffic after reviewing results.
The timed dynamics and practice physics version are unchanged.

## Platform boundaries

Android uses the existing Android Browser Helper/TWA launcher and approved HTTPS
origin. Apple’s current SwiftUI Portal opens the web game with
`UIApplication.shared.open`; it is not an embedded native racing engine. No native
permission, dependency, package identity or launch-origin change is needed for
these web UI/presentation changes. Completed practice history remains in the web
Journal for the current browser profile and origin. These are source integration
facts, not evidence of a new Google Play or Apple distribution acceptance.

## Verification boundaries

Focused source tests cover persistence/retry/account boundaries, bounded reads,
control admission, phone/tracked lifecycle, Results and camera restoration.
Controlled browser checks exercise the actual UI, kernel presentation phase,
IndexedDB, layout at desktop/portrait/landscape sizes and real fleet GLBs in both
stereo implementations. Synthetic tracking/compositor boundaries and illustrative
optics are not physical-device, viewer-comfort or performance acceptance. Native
Android and Apple launch paths remain browser handoffs; platform distribution and
physical-device acceptance must accompany the final coordinated release.
