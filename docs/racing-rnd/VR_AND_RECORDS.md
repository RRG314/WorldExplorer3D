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
invalidate the captured view.

The BMW retains its authored driver eye. Other fleet bodies currently use an
explicit raised view derived from their normalized envelope. This avoids placing
the BMW eye inside a different body. These views are labelled in setup; they are
not claims of individually prepared interiors. The same camera mount serves normal
driving and VR. A new immutable mount accompanies each successful car adoption.

## Personal times

**Rankings → Racing**, or **My times** from results, reads accepted practice events
from the existing Journal. Filters select a course and car setup. Course, vehicle,
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

## Verification boundaries

Focused source tests cover persistence/retry/account boundaries, bounded reads,
control admission, phone/tracked lifecycle, Results and camera restoration.
Controlled browser checks exercise the actual UI, kernel presentation phase,
IndexedDB, layout at desktop/portrait/landscape sizes and real fleet GLBs in both
stereo implementations. Synthetic tracking/compositor boundaries and illustrative
optics are not physical-device, viewer-comfort or performance acceptance. Native
Android and Apple launch paths remain browser handoffs; platform distribution and
physical-device acceptance must accompany the final coordinated release.
