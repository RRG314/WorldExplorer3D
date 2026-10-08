# Simulation and presentation time

Earth's runtime kernel accepts one bounded interval before running simulation. Input and nearby-road readiness run first. Player motion consumes that interval; fixed population steps consume the same accumulated interval, with less than one fixed step retained for the next frame. With the current two-step, 60 Hz configuration, a delayed frame accepts at most 1/30 second, including its existing remainder. Raw wall-clock frame intervals remain available to performance diagnostics: the clamp does not hide a browser stall.

Pause, a hidden document and unavailable required collision accept no simulation time. Paused time is not repaid on resume. Existing focus/visibility handlers clear held keyboard, touch and Space input. Road refinement can continue while the actor waits, and a failed refinement provides a Retry roads action that captures the current Earth session and reloads it. Collision is never bypassed. Readiness diagnostics record wait count and total duration independently from frame duration.

Ocean and Space use the same maximum accepted interval through their renderer adapters. Space camera damping is expressed in elapsed time, calibrated from the existing 60 Hz blend. Its overview and chase position responses match at 30/60/120 Hz in the actual camera implementation. Collision and motion remain under their existing actor controllers; camera smoothing does not own the physical pose.

Server lease time is separate. Shared marine leases use a monotonic server-relative clock and conservative network uncertainty, and transport heartbeats use wall-clock timers. Pausing local simulation does not extend a server lease. UI and provider timestamps retain their declared real-time meaning.

Verification distinguishes deterministic controlled-clock tests from actual browser journeys and hardware performance. Clock tests inject 100/250/1,000 ms stalls, nested readiness/pause and multiple cadences. These establish bounded, consistent accepted time; measured hitch frequency and loading targets belong to package 4.
