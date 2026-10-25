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

## Staging follow-up before production

The first compiled staging journey passed car controls, tilt, two layout center
hit checks and aircraft tilt/touch override, with no page errors. Its spacecraft
assertion incorrectly read the Earth action's jump instead of the existing
spacecraft key channel. The corrected check observes that channel and the actual
space controller's thrust state, after launch readiness and a rendered frame.

Screenshot inspection also rejected the apparent post-rotation layout pass:
mobile shrink-to-fit retained an old 844px canvas width on a 360px portrait screen.
A minimal installed-Chrome reproduction confirms `innerWidth`/scrollWidth stays
844 without bounds and becomes exactly 360 with canvas max-width:100vw. Main and
existing auxiliary renderer owners now bound their own canvases to the viewport.
The layout check requires the requested viewport width as well as hit targets.
Original failed evidence is retained; no overall staging pass is claimed yet.

## Final acceptance and delivery

The corrected frozen candidate is source `52d5f246f5add2c7eb6066fcb9bafc8d40105d61`.
39 focused control cases and 11 existing renderer/lifecycle cases passed. Source
and ownership checks passed. Ordinary staging completed all six vehicle checks,
but its overall run failed on an external `reCAPTCHA Timeout (o)`; keep that result.
The supported registered staging App Check test provider then qualified the exact
compiled artifact on loopback, with actual staging services, all six checks and
zero page/console errors. The temporary credential was revoked and removed.
These are synthetic sensor samples in desktop Chrome, not physical-phone feel.

Actual car, aircraft and rendered spacecraft gameplay screenshots were inspected.
The supplied skill's choreography used the existing owned renderer and frame hook.
No source changes occurred while measuring. No original game-wide, native or
historical city performance sequence was repeated.

PR131 passed required checks and merged as `358dfd3a673d541bd1fd6faaeba42470dd137a25`;
the reviewed and merged trees match. Production build is
`5.6.1+52d5f246f5ad.25a6fdc42a0cb4c1.production`, Hosting `ab107ddad5effe6a`.
Staging is `5.6.1+52d5f246f5ad.1f94b7fc123029fc.staging`, Hosting `d654414d6d60fe66`.
The artifacts differ only in the three expected Firebase environment files.
All 15 changed production files match served bytes; 766 preceding files,
all world assets and Hosting configuration are preserved. Native version 4 needs
no rebuild: close/reopen the installed app to fetch the hosted game update.

`qualification.json`, `protected-release.json`, `parity.json`,
`production-live-bytes.json` and the activation receipts in the evidence directory
bind this acceptance. Original failed attempts remain. Superseded current/staging
packages have full hash-verified recovery overlays, retaining all four existing
basis/raw package slots. Source/dist/assets/history/player data are preserved.

A new body-parser security advisory surfaced during source publication; it is
tracked as a separate backend dependency repair, not resolved by this frontend.
