# World Explorer 3D 4.1 Acceptance Contract

This document fixes the release criteria for 4.1. A test failure may reopen the
system owner named below, but it may not change the criteria or create a
location-specific runtime exception.

## Release scope

4.1 is a stabilization release for the existing product:

- selected-location Earth loading from OSM;
- deterministic destination/session lifecycle and cancellation;
- materially faster dense-location entry;
- visible roads and consistent structure/surface ownership;
- stable, soft Earth shadows on supported hardware;
- retained Earth, Ocean, Moon, Mars, Space, mobile, account, editor, and
  multiplayer journeys;
- a reproducible, attributable, rollback-capable hosting artifact.

Continuous World is removed. Regional facade reconstruction, advanced water
and vessel simulation, pilotable spacecraft, orbital gameplay, and historical
Earth layers are future feature releases. They cannot delay 4.1 unless an
existing retained journey is broken.

## Fixed production gates

| Gate | Evidence | Pass condition |
| --- | --- | --- |
| Source and runtime ownership | dependency, reachability, lifecycle, and transaction contracts | OSM is the only ordinary Earth vector source; one active destination and one location transaction own publication; stale work cannot commit |
| World integrity | contract probes plus hardware screenshots | roads are present and legible; ordinary buildings do not occupy road cores or water; actor, camera, paths, bridges, and tunnels agree with the selected surface |
| Rendering | shadow policy contract plus daylight/dusk hardware captures | medium/high use soft shadows; no obvious block staircase or unstable crawling; no blank, clipped, or wrong-canvas frame is accepted |
| Performance | installed-Chrome reference-Mac run | dense cold load ≤20 s, dense warm load ≤12 s, median ≥58 FPS, 1% low ≥45 FPS, no sustained sequence above 33 ms |
| Resource stability | three warmed location/destination cycles | zero pending disposal, no canvas/frame-owner growth, and retained heap within 10% of the warm plateau |
| Product journeys | browser journeys on desktop and mobile layouts | title→Earth, location replacement, walk/drive/drone/plane, water return, Earth↔Moon/Mars/Space, editor, account, and multiplayer compatibility complete without fatal errors |
| Provider degradation | blocked-provider fixtures | the world either enters through its documented OSM/terrain fallback or reports a recoverable failure; it never switches to a second ordinary-vector renderer |
| Operations and safety | clean candidate release gate | zero known critical advisories, all high advisories resolved or explicitly reviewed, rules/emulator checks pass, artifact identity/size/attribution/rollback pass |
| Human approval | fixed geography screenshots | a numerically passing report cannot approve a visibly broken frame |

## Fixed geography matrix

The release candidate uses representative classes instead of testing only the
place that most recently failed:

- Baltimore: dense downtown, ordinary roads/buildings, river context;
- Los Angeles: large urban basin;
- Tokyo: dense international city;
- Monaco: steep coast and mapped water;
- Swiss Alps: mountain terrain and paths;
- Sahara: sparse desert;
- Iowa farmland: rural geometry;
- Lake Tahoe: elevated inland water;
- North Atlantic: open-water entry;
- Golden Gate Bridge and Holland Tunnel: grade-separated structures.

Shinjuku remains a diagnostic stress fixture, not a location-specific
implementation target. It may not be featured in the curated Places list while
its shared terrain-composition result is visually rejected.

## Test layers

1. Pure contracts verify deterministic owners, geometry rules, cancellation,
   security, and data normalization on every pull request.
2. Focused browser journeys verify the complete user action affected by a
   change, including intermediate states and cleanup.
3. Installed-Chrome hardware runs measure frame pacing, memory, camera/surface
   safety, and WebGL output.
4. The fixed geography matrix runs at the release-candidate gate.
5. Humans inspect the generated gameplay frames before artifact promotion.

The bundled software-WebGL multi-canvas capture is diagnostic only because it
is known to select a black or wrong canvas. It cannot approve or reject
production visual quality by itself.

## Current status

| Area | Status |
| --- | --- |
| Continuous World removal | complete locally |
| OSM-only selected-location runtime | complete locally |
| Dense Baltimore cold load | passing at 12.9 s on the reference hardware run |
| Shadow policy | implemented; first Baltimore hardware frame accepted, wider time/location gate open |
| Road visibility | clean committed 11-class fixed-geography matrix passes and affected frames are accepted for stabilization scope |
| Surface/occupancy and mountain paths | Swiss Alps structural blocker cleared: mapped OSM footway spawn at 11.9°, four rendered path meshes, and no unsupported steep land-cover slabs; thin distant terrain edges remain a known fidelity limitation |
| Sustained Baltimore walk/drive | straight and S-turn profiles pass at ~59.9 FPS median; fixed camera geography now rejects a collapsed chase view and Monaco retains 10.7 m clearance |
| Repeated resource stability | passing: three destination cycles retain canvas/frame ownership; five mode cycles retain identical reachable resources and finish at 96.2% of the warm heap median |
| Retained product journeys | focused destination, title/planetary, plane/interior, editor/multiplayer, account service, and mobile device-layout journeys pass |
| Dependency/security review | reviewed: zero critical advisories; the Firebase/Google transitive high chain is conditionally accepted with controls in `docs/RELEASE_4_1_SECURITY_REVIEW.md` |
| Version, notes, immutable artifact, preview, rollback | 4.1.0 identity and release notes prepared; clean artifact, preview, and rollback checks remain open |

The clean committed fixed-geography report is
`output/playwright/world-matrix/4.1-release-candidate-green/report.json`.
Golden Gate is structurally coherent and loads inside its 20-second budget.
Holland Tunnel's generated entry/interior/exit traversal is coherent, its
ordinary arrival selects a safe mapped pedestrian surface outside the
subgrade shell and mapped water, and boat availability is suppressed
immediately while tunnel water occlusion owns the scene.
