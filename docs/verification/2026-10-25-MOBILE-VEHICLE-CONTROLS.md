# Mobile vehicle controls — October 25, 2026

The owner confirmed that the Motorola Play version 4 update installed and opened
successfully, then reported difficult car steering. This work addresses phone
input through the existing action reader, frame owner and lifecycle scopes.
Native package/signing, transport admission, geographic coverage, saved progress,
multiplayer and world ownership are unchanged.

## Behavior

- Cars have a horizontal steering pad and independent Accelerate and Brake /
  reverse pedals. Braking opposes forward motion before reverse engages. The
  existing handbrake and responder/planetary/context actions remain available.
- Progressive steering gives small thumb movements a gentler response. At road
  speeds, mobile steering authority decreases; full parking lock remains. Hardware
  steering keeps its existing tuning. Walking and maritime input are unchanged.
- Controls → Enable tilt is explicit for this session. Recenter establishes a
  comfortable neutral hold; screen rotation, travel/context suspension and stale
  sensor recovery require a fresh neutral. Portrait and landscape axes agree.
- Tilt controls car steering, aircraft bank/pitch and spacecraft yaw/pitch.
  Independent flight throttle buttons remain available. Optional **car speed by
  tilt** accelerates when tipped forward and service-brakes when tipped back;
  it never selects reverse or handbrake drift. Touch and hardware remain usable.
- No motion is uploaded. No compass/magnetometer or new native permission is
  requested. Unsupported/denied/no-data browsers retain touch input. Permission
  promises cannot reactivate a disabled/disposed input owner.
- No sensor polling timer, render loop or transport-position setter is added.
  Input-frame context refresh changes the UI only at mode/readiness/overlay
  transitions, restoring controls after world loading and clearing held pointers.

Browser requirements: [MDN permission API](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static),
[W3C device/screen coordinate definitions](https://www.w3.org/TR/orientation-event/).

## Evidence ledger

`output/research/mobile-vehicle-controls-2026-10-25/` preserves each attempt.

- 39 focused Node cases passed: touch/walking/hardware behavior, car pedal and
  speed response, existing aircraft/space controls, sensor coordinates, neutral,
  dead zone, smoothing, freshness, mode/overlay release, screen rotation,
  permission races and controller-trigger precedence.
- Source ownership guard passed. The source/module graph check passed after
  updating every shared mobile-policy import to the same cache identity.
- First focused run failed three test expectations (gravity pitch bounds and the
  existing lifecycle snapshot's `resources` field). Original failure retained.
- First actual browser run loaded Baltimore but found controls hidden after
  readiness. The guard originally hid input during loading without a subsequent
  UI refresh. The existing input frame now refreshes only changed input contexts.
- Second source-browser run proved actual car movement/turning, independent
  pedals/steering and pointer cancellation, synthetic tilt speed/braking/recenter/
  stale-data release, and center hit targets at 844×390 and 360×740. Screenshots
  were inspected. No page errors. The final supplied-client action burst failed
  because the harness selected all six canvases instead of the owned renderer;
  the selector is now explicit. That attempt is not labelled an overall pass.
- Loopback source runs recorded real Firebase App Check/reCAPTCHA and associated
  provider failures. They are not live-service acceptance or evidence that motion
  controls failed. Release qualification uses the deployed staging origin.

Frozen/staging verification, protected source review and production activation
remain pending at this source checkpoint. Physical phone sensor feel/performance
requires owner testing; desktop synthetic samples cannot establish it. Existing
whole-game evidence is retained; no unrelated historical matrix is repeated.
