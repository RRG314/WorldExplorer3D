# World Explorer 3D 4.1 Acceptance Contract

Production safety baseline:
`3.1.0+0354194baf2f.774a91ee84b96fd6.production`. The implementation sequence
is governed by
[`RELEASE_4_1_REBASE_PLAN.md`](RELEASE_4_1_REBASE_PLAN.md); current 4.1 is a
parity/evidence source and is not eligible for promotion.

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
| Performance | installed-Chrome reference-Mac gameplay run | ordinary play is visibly smooth and responsive; load time, FPS, frame pacing, draw calls, triangles, and resources are recorded against the candidate and 3.1 reference |
| Resource stability | three warmed location/destination cycles | zero pending disposal, no canvas/frame-owner growth, and retained heap within 10% of the warm plateau |
| Product journeys | browser journeys on desktop and mobile layouts | title→Earth, location replacement, walk/drive/drone/plane, water return, Earth↔Moon/Mars/Space, editor, account, and multiplayer compatibility complete without fatal errors |
| Provider degradation | blocked-provider fixtures | the world either enters through its documented OSM/terrain fallback or reports a recoverable failure; it never switches to a second ordinary-vector renderer |
| Operations and safety | clean candidate release gate | zero known critical advisories, all high advisories resolved or explicitly reviewed, rules/emulator checks pass, artifact identity/size/attribution/rollback pass |
| Human approval | fixed geography screenshots | a numerically passing report cannot approve a visibly broken frame |

## Fixed geography matrix

The release candidate uses representative classes instead of testing only the
place that most recently failed:

- Baltimore: dense downtown, ordinary roads/buildings, river context;
- Sydney: dense southern-hemisphere city with rooftop-contaminated urban DEM
  stress, irregular streets, tunnels, and elevated distributor roads;
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

Sydney is a release-blocking fixture, not an exception. Its terrain, roads,
buildings, spawn, and camera must consume one validated district ground field.
A report that proves road presence while the inspected frame shows rooftop
ridges, artificial ramps, or building/ground disagreement fails.

## Phase 5 production-readiness checklist

Phase 5 is complete only when every applicable row below has machine-readable
evidence from the exact candidate commit. A location is evidence for a data
class, never a key for runtime correction. A software browser may verify logic
and budgets, but it cannot approve a visibly broken frame or substitute for the
required reference-Mac and Windows GPU checks.

### Architecture and visual correctness

| Area | Pass condition |
| --- | --- |
| Building exterior owner | One compiler owns foundations, massing, parts, roof forms, wall surfaces, openings, material provenance, and render batches. Legacy facade shaders, generated window textures, streaming facade materials, and blank-extrusion presentation fallbacks are unreachable and deleted. |
| Material claims | Brick, sandstone, marble, stone, concrete, metal, glass, and rendered colors are used only when mapped provenance supports them. Unmapped buildings use one restrained neutral palette and never claim a premium material. |
| Building occupancy | Ordinary solid volumes do not occupy road cores, mapped water, or a different vertical layer. Foundations meet the compiled occupied surface without floating or terrain intrusion. |
| Terrain geometry | Adjacent tile edges share positions and normals; invalid/missing samples cannot become spikes, folded triangles, visible cracks, or zero-height cliffs. Mountain silhouettes and slope shading remain continuous through LOD changes. |
| Atmosphere | Sky, fog, haze, clouds, and post-processing show no screen-space stripes, color bands, stale depth bands, or environment leakage at daylight, dusk, night, rain, mountain, ocean, Moon, Mars, or Space. |
| Shadows | One Earth shadow policy owns type, resolution, bias, normal bias, radius, frustum, update cadence, and quality-tier fallback. Building shadows are stable, soft on balanced/high, free of acne/peter-panning, and do not crawl during ordinary travel. |
| Camera | One stateful solver per traveler family prevents penetration, flipping, collapsed chase distance, grade-layer capture, and visible frame-to-frame oscillation. |
| Surface contract | Spawn, collision, navigation, placement, camera, rendering, and traveler height agree on generation, kind, layer, provenance, confidence, and traversal permissions. |

### Runtime and performance evidence

Performance is measured during complete installed-browser gameplay, after the
location has loaded and initial shader compilation has settled. Frame counters
support the decision; they do not replace visual and control-response review.

| Profile | Frame pacing | Dense-city renderer ceiling | Resource ceiling |
| --- | --- | --- | --- |
| Desktop high | target 60 FPS; no repeated visible hitching during travel | ≤2,000 draw calls; ≤3.5 M triangles | ≤320 textures; ≤2,800 geometries; ≤160 programs |
| Desktop balanced | target 60 FPS; no repeated visible hitching during travel | ≤1,400 draw calls; ≤2.5 M triangles | ≤256 textures; ≤2,200 geometries; ≤128 programs |
| Desktop performance | target 60 FPS and materially lighter than balanced | ≤900 draw calls; ≤1.5 M triangles | ≤192 textures; ≤1,600 geometries; ≤96 programs |
| Mobile balanced | target 30 FPS with usable touch response | ≤700 draw calls; ≤1.1 M triangles | ≤160 textures; ≤1,200 geometries; ≤80 programs |

Additional gates:

- dense cold load ≤20 seconds and dense warm load ≤12 seconds;
- ordinary cold load ≤12 seconds and ordinary warm load ≤8 seconds;
- no simulation catch-up above two fixed updates per display frame;
- input, actor, vehicle, and camera remain visually synchronized;
- actor/car do not clip below their selected traversal surface;
- no repeated long-task sequence during ordinary travel;
- three warmed destination cycles and five mode/environment cycles retain heap
  within 10% of the warm plateau with no canvas, frame-owner, geometry,
  texture, listener, timer, or pending-disposal growth;
- hidden or backgrounded gameplay stops world rendering and resumes without a
  time-step burst;
- WebGL context loss is recoverable or produces an explicit recoverable state.

### Product gameplay journeys

Journeys use ordinary controls in the installed browser. They must travel far
enough to leave the spawn block, exercise the named transitions, and reveal
stutter, clipping, stale LOD, or controller drift. Exact distance and duration
quotas are diagnostic tools, not release criteria.

| Journey | Required production scenario |
| --- | --- |
| Walk | Leave spawn, turn through multiple blocks, cross an intersection and slope/curb transition, meet a collision, and change camera mode |
| Drive | Travel a multi-block route with turns, braking/reverse, a smooth ramp, and representative bridge/elevated/tunnel surfaces |
| Drone | Climb from close terrain to aerial LOD, travel away from spawn, yaw/descend, verify ground striping is absent, and confirm close detail returns |
| Plane | Take off or enter flight, climb, bank, travel beyond the initial district view, descend, and exit cleanly |
| Boat/Ocean | Depart a shoreline, sustain water travel, change camera, and return to Earth |
| Moon/Mars | Move, jump or exercise gravity, change camera, and return to Earth |
| Space | Enter controlled travel, complete a destination/environment transition, and return cleanly |

Required transition loops:

- title → Earth → replacement Earth location → title;
- walk → drone → plane → drive → walk;
- Earth → Ocean → Earth;
- Earth → Moon → Earth → Mars → Earth → Space → Earth;
- foreground → hidden/background → foreground during each traveler family;
- pause → resume and main-menu → resume without duplicate runtime owners;
- phone portrait → landscape and tablet/desktop layout changes without lost
  controls, stuck inputs, incorrect pixel ratio, or canvas growth.

### Platform, failure, and release gates

- Reference Mac: installed Chrome hardware run passes visual, sustained-route,
  frame-time, memory, shadow, and context-loss gates.
- Windows: Windows Chromium CI passes all deterministic journeys and layout
  contracts; an installed Chrome or Edge GPU run is required before public
  promotion.
- Mobile: iPhone portrait/landscape, Android phone, and tablet emulations pass
  touch/control/layout/resource budgets; at least one real mobile hardware
  smoke is required before public promotion.
- Keyboard, mouse, touch, gamepad mapping, focus loss, resize, fullscreen, and
  reduced-motion/accessibility behavior remain usable.
- Blocked terrain, land-cover, weather, imagery, account, analytics, and
  realtime providers fail recoverably without changing world authority.
- Zero uncaught errors, unhandled rejections, WebGL errors, duplicate-owner
  warnings, stale-generation commits, or critical security advisories.
- Full tests, release verification, immutable artifact verification,
  attribution, rollback rehearsal, changelog/version identity, and human
  screenshot approval all bind to the exact candidate commit.

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

Phase 5 is a local release-candidate build. It is not production-promotable
until the open hardware and sustained-journey rows below have evidence bound to
the final commit. Older 4.1.0 reports are historical input, not Phase 5 proof.

| Area | Exact Phase 5 evidence | Status |
| --- | --- | --- |
| Continuous World removal | Phase 3 ownership scan across 385 executable sources | pass |
| Building exterior architecture | legacy shader and fake window/normal/roughness generators deleted; five static facade atlases cover mapped material families and a restrained type-inferred fallback; near geometry retains mapped footprints and mid LOD retains a bounded polygonal silhouette | pass in Baltimore and Paris visual probes |
| Terrain geometry | Swiss Alps glacier classification, shared-edge positions/normals, and final daylight drone frame | pass for the tested high-relief class; global source accuracy remains bounded by provider quality |
| Shadow/atmosphere | single shadow owner, stable texel anchor, one cloud draw owner, installed-Chrome daylight/night frames | pass on the reference Mac visual run |
| Runtime interpolation | fixed-step previous/current actor and car pose contract with teleport rejection | pass |
| Dense renderer ceiling | installed Chrome at the Los Angeles interchange after the facade/shadow batching correction: 705 calls, 1.97 M triangles, 496 geometries, 157 textures, 33 programs | pass for the balanced count/resource ceiling |
| Installed-Chrome frame pacing | current cadence varied between 30 and 60 FPS in the controlled selected tab; final settled sample was 30 FPS with clean logs | open for an uninstrumented physical-device approval run; automation cadence is recorded, not promoted as 60 FPS |
| Earth gameplay journeys | sustained automation: walk 120 s/1.44 km, drive 120 s/6.47 km, drone 120 s/3.39 km, plane 60 s/2.47 km; surface contact and mode exit contracts passed; installed Chrome also exercised walking, driving, drone, and camera reset | pass for candidate automation and installed-browser controls |
| Planetary/ocean transitions | Earth→Moon→Earth and Earth→Ocean→Earth deterministic journeys pass without console errors | pass for transitions; sustained Moon/Mars/Space durations remain open |
| Mobile layouts/controls | iPhone portrait, iPhone landscape, and Android portrait deterministic journeys pass | pass for emulation; real mobile hardware smoke remains open |
| Windows | deterministic Chromium gates are portable, but no Windows GPU evidence is attached | open before public promotion |
| Security and rules | 45/45 Firestore rules checks pass | pass |
| Fixed geography | exact-candidate matrix passes Baltimore, Paris, Monaco, Swiss Alps, Sahara, Sydney, Golden Gate, Holland Tunnel, and the Judge Harry Pregerson interchange; the latter verifies 41 real stacked crossings with 5.689 m minimum separation | pass for covered classes |
| Version/artifact/promotion | local identity is `4.1.1-rc.1`; immutable artifact verification is required below; deployment remains intentionally unauthorized | candidate only; no production promotion |

Current artifacts:

- `output/playwright/world-matrix/phase5-rc1-representative/report.json`
- `output/playwright/world-matrix/phase5-rc1-representative/baltimore-drone.png`
- `output/playwright/world-matrix/phase5-rc1-representative/swiss_alps_custom-drone.png`
- `output/playwright/world-matrix/phase5-rc1-representative/pregerson_interchange_custom-drone.png`
- `output/playwright/phase5-sustained-earth/report.json`

The public site remains on the immutable 3.1 production baseline. Phase 5 does
not authorize a Firebase promotion.

`test-phase5-sustained-earth.mjs` and
`measure-phase5-performance.mjs` are optional diagnostics. They are not merge
or release gates and cannot overrule ordinary-control browser gameplay.
