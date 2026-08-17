# World Explorer AR Platform — Architecture and R&D

Date: 2026-08-16
Status: implementation baseline

## Product decision

AR is a presentation capability of World Explorer, not a new environment, a second discovery database, or a separate wildlife game. The existing accepted `WorldSnapshot`, `EnvironmentContextPublication`, Discovery profile, companion instances, catalog IDs, and model factories remain authoritative. AR receives references to those records and never creates substitute ownership.

Contextual entry points are the only production entry points:

- an owned companion card can open that exact companion instance;
- a compatible Field Guide or Collection record can open that exact catalog model;
- Explore can offer a habitat-qualified Field Challenge;
- unsupported devices receive the same content in a bounded interactive 3D viewer.

There is no persistent global AR button and no AR-only inventory, currency, map, animal catalog, or location provider.

## Repository audit

| Concern | Existing owner | AR integration rule |
| --- | --- | --- |
| World identity and sequence | immutable accepted `WorldSnapshot` and Living World publication | retain request ID, sequence, and stable world identity; never query another world provider |
| Habitat | `discovery/environment-context.js` | use the current cell's compiled context bands |
| Companion identity, care, training | Discovery profile store and companion runtime | pass the exact `instanceId`; model is presentation only |
| Specimens and observations | Discovery Collection and Field Guide | pass exact `instanceId`/`catalogId`; no duplicate record |
| Animal and geology visuals | Discovery model factories | instantiate bounded presentation copies and dispose them on exit |
| Live position and motion | Live GPS runtime | read only an already-running snapshot; never request GPS from AR |
| Camera permission and stream | new AR session service | one owner, one user-initiated permission flow, all tracks stopped on every exit |
| WebGL world renderer | runtime kernel | suspend while AR owns its dedicated transparent renderer; do not draw Earth behind the camera |
| UI language | World Explorer V4 interface tokens | full-screen only while invoked; compact controls and contextual launch actions |

No previous camera, MediaStream, device-orientation, or WebXR owner was present. Live GPS provides the established permission, visibility, speed, and cleanup patterns.

## Browser capability contract

The runtime detects features rather than browser names.

1. **Spatial AR** — secure context plus `navigator.xr.isSessionSupported('immersive-ar')`; requests `local-floor` and optionally hit-test, anchors, and DOM overlay.
2. **Camera overlay** — secure context plus `mediaDevices.getUserMedia`; the rear camera is preferred. This mode is labeled honestly and does not claim surface anchoring.
3. **Interactive 3D** — camera is absent, denied, or unavailable. Content remains usable without AR.

WebXR is limited-availability and requires a trustworthy, active, focused document and user intent. Hit testing is an optional `immersive-ar` feature, and anchors are optional and may be emulated. Camera and orientation permission are requested only from an explicit user action. Relevant standards and platform material:

- https://immersive-web.github.io/webxr-ar-module/
- https://immersive-web.github.io/hit-test/
- https://immersive-web.github.io/anchors/
- https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API
- https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Permissions_and_security
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static
- https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/

The Apple material describes immersive WebXR on visionOS, not handheld iPhone/iPad `immersive-ar`; therefore handheld Safari is expected to use the camera-overlay or 3D path unless feature detection proves otherwise.

## Session and rendering lifecycle

`idle → preview → starting → active → ending → idle`, with `error` returning to preview or idle. Only the service may own a camera stream or XR session. It must:

- reject incompatible environment and moving-vehicle starts;
- acquire capability only after the contextual user gesture and disclosure;
- pause/end when the page becomes hidden;
- stop every MediaStream track, XR session, animation loop, listener, renderer, material, and geometry;
- restore the normal world canvas and runtime;
- publish a small diagnostic snapshot without camera frames or precise physical-world data.

Camera frames stay inside the local video/rendering pipeline. They are never uploaded, persisted, analyzed, or placed in telemetry. No microphone is requested. Screenshots are not implemented in the baseline.

## Coordinate and placement model

AR is intentionally a separate presentation coordinate space. Logical content retains World Explorer IDs while its presentation gets a disposable AR transform.

- Spatial AR uses the XR `local-floor` reference space. A hit-test pose can move a reticle; placement copies that pose. Without hit-test, the object stays in a bounded viewer position and the UI says surface placement is unavailable.
- Camera overlay uses meters-like scene units in front of a perspective camera. Drag rotates; pinch or the size control scales within catalog limits. It never converts pixels into claimed world coordinates.
- Interactive 3D uses the same bounded presentation contract with no camera feed.

The first version does not persist physical anchors. This avoids false cross-session precision and keeps camera/world coordinates from leaking into the authoritative map.

## Eligibility registry

One registry decides if and why an entry point appears. It covers:

- owned companion inspection: Earth, stationary, exact owned instance;
- tabletop specimen: allowlisted visual model, exact recorded record;
- habitat field challenge: Earth, stationary, current compiled cell is wetland/riverbank/fresh-water/coast/beach;
- deferred experiences (detector sweep, portal scale, multiplayer spectator) remain explicitly unavailable rather than appearing as placeholders.

## Habitat-aware waterfowl slice

The first Field Challenge is a fictional, deterministic mallard photo survey. Habitat selects eligibility; it does not claim real animals are present. Targets are virtual-only and generated from a seed containing world identity, cell ID, and challenge version. Input is touch/click on the rendered target; there is no weapon control, firing language, or connection to real animals. Results are session-local in the baseline.

Conservation boundaries are enforced in data and copy:

- `realAnimalImpact: false` and `virtualTargetsOnly: true` are invariant;
- the default and currently shipped mode is `photo-survey`;
- no real-world hunting advice, protected-species targeting, lures, calls, routes, or occurrence claims;
- the challenge does not activate in a moving vehicle or request Live GPS;
- the retriever companion, when present, is a celebratory visual helper and does not retrieve real wildlife.

## Performance budgets

- one AR renderer and one presentation scene;
- pixel ratio capped at 1.5 (1.25 in reduced mode);
- one companion/specimen, or at most four waterfowl actors;
- existing bounded procedural models; no runtime asset downloads;
- no post-processing, Earth scene, shadows, camera-frame copies, CV, or recording;
- adaptive scale and reduced animation after sustained slow frames.

## Acceptance boundary

Automated tests can verify contracts, deterministic habitat behavior, lifecycle cleanup, contextual UI, camera mocks, and 3D fallback. Completion on real hardware additionally requires manual acceptance on at least one supported Android WebXR device, one handheld Safari camera-overlay device, one denial path, one background/resume path, and one unsupported desktop. Until those checks are performed, the implementation is code-complete but real-device acceptance remains explicitly pending.
