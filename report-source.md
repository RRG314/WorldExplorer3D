# Living World Population, Traffic, Signals, and Interaction Research

Audience: World Explorer 3D product and engineering  
Date: 2026-09-06  
Scope: worldwide Earth pedestrian/traffic simulation, mapped road controls,
world clicking, and optional aggregate live-traffic influence. Clothing,
individual real-person tracking, exact real vehicles, and provider procurement
are excluded.

## Direct answer

The game should not download or imitate individual real vehicles or people.
OpenStreetMap remains the authority for road geometry, direction, crossings,
stop lines, and mapped control semantics. World Explorer should own the local
agents, schedules, route choice, intersection phases, interactions, and
performance budgets. An optional licensed traffic provider may later supply a
fresh aggregate speed/congestion snapshot that scales simulation demand and
speed, with deterministic fallback whenever it is absent or stale.

The current sparse feeling is mainly architectural, not an asset shortage:
the quality tier creates 38 pedestrians and 24 traffic vehicles across a broad
area, then relocates completed agents more than 420 world units away. Time of
day only hides a fraction of the fixed pool. Traffic has following distance and
lane direction, but no signal controller, queue state, right-of-way phase, or
activity-based destinations. Traffic-signal meshes are presentation-only. World
canvas clicking is implemented separately by a handful of features and has no
shared semantic target resolver.

## Recommended design

1. Use one demand model for logical population count, active fraction, spawn
   radius, activity type, and optional live-flow influence.
2. Weight pedestrian placement toward mapped/inferred sidewalks, commercial
   and civic entrances, transit/retail/medical/education POIs, and parks rather
   than uniform random scattering.
3. Keep a larger bounded logical pool concentrated around the player, with
   hysteresis and relocation rings. Preserve the current detailed-promotion
   path for nearby interaction and collision.
4. Compile signal controllers from the same traffic graph. Vehicles stop on
   red/unsafe amber, queue behind leaders, resume on green, obey one-way and
   jurisdictional driving-side rules, and never teleport through an approach.
5. Treat a mapped OSM signal node as control semantics. Place the visible pole
   outside the roadway using the associated road cross-section. If no safe
   roadside association exists, retain the control semantics but suppress the
   fixture instead of putting it in the road.
6. Route world-canvas clicks through one click-only raycast resolver with input
   precedence for weapons, building mode, and specialized activities. NPCs,
   traffic, POIs, furniture, and buildings publish semantic click metadata;
   their existing authorities decide the resulting action.
7. Keep live traffic optional. A fresh provider snapshot may change aggregate
   road speed and visible demand. It must not create claimed real-world vehicle
   identities, block world load, or be required for simulation correctness.

## External evidence

- OSM documents `highway=traffic_signals` as a routing/control abstraction and
  recommends approach/stop-line nodes and direction tags for detailed mapping.
  That means the physical fixture must be derived from the road cross-section,
  not rendered literally on the OSM centerline node:
  https://wiki.openstreetmap.org/wiki/Traffic_signal
- OSM stop-control guidance likewise locates `highway=stop` at the stopping
  point and uses direction to identify affected travel:
  https://wiki.openstreetmap.org/wiki/Tag%3Atraffic_sign%3Dstop
- HERE Traffic API v7 provides per-segment current speed, free-flow speed, jam
  factor, traversability, freshness, and shape/location references. It requires
  account credentials and meters advanced traffic separately:
  https://docs.here.com/traffic-api/docs/flow
- TomTom Traffic Flow supplies current/free-flow speed and a quality indicator,
  and its first-party documentation says flow is updated each minute:
  https://developer.tomtom.com/traffic-api/documentation/product-information/introduction
- Mapbox Traffic v1 provides congestion over Mapbox Streets geometry and says
  speed/density updates arrive about every eight minutes. Full traffic datasets
  are separately licensed, so it cannot be assumed available merely because a
  public token exists:
  https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/
  https://www.mapbox.com/pricing
- Three.js documents `InstancedMesh` and `LOD` specifically as draw-call and
  distance-detail tools for large repeated populations. They are appropriate
  for a later far-crowd presentation tier, while close interactive characters
  retain the current curated skinned models:
  https://threejs.org/docs/pages/InstancedMesh.html
  https://threejs.org/docs/pages/LOD.html
- OSM data is ODbL and requires visible attribution and license disclosure:
  https://www.openstreetmap.org/copyright/attribution-guide/

## Claim-to-source ledger

| Claim | Primary source | Confidence | Remaining gap |
| --- | --- | --- | --- |
| OSM signal nodes may describe control/stop positions rather than physical poles | OSM Traffic signal wiki, accessed 2026-09-05 | High | Regional mounting styles still need presentation variants |
| Aggregate flow feeds provide speeds/congestion rather than exact live vehicles | HERE Flow, TomTom Traffic API, Mapbox Traffic v1 | High | Commercial contract terms require provider review |
| HERE can return shapes and current/free-flow speed | HERE Traffic API v7 Flow | High | No project credential exists in this repository |
| TomTom flow is updated every minute | TomTom Traffic API introduction | High | Coverage varies by market |
| Mapbox Traffic v1 congestion updates about every eight minutes | Mapbox Traffic v1 reference | High | Raw traffic dataset access is contact-sales licensing |
| Instancing/LOD reduce repeated-object rendering cost | Three.js InstancedMesh and LOD docs | High | Skinned crowd batching needs a separate measured implementation |

## Stop decision

Discovery stopped after the code ownership gaps and the consequential provider,
signal-semantics, attribution, freshness, and rendering claims had first-party
support. More vendor comparison would not change the immediate implementation:
no traffic credential or approved traffic-data contract is present, so the
provider-neutral aggregate boundary and deterministic local simulation are the
only safe current release path.

## Implemented outcome and QA

The recommended local architecture was implemented without adding a provider
dependency. Balanced play now has a bounded pool of 38 pedestrians and 24
vehicles; quality has 56 and 36. Mapped places and entrances weight existing
routes. Traffic controls are separated into semantic control coordinates and
roadside presentation fixtures. Vehicles obey queues, stop signs, red signals,
and safe amber decisions. Connector interpolation was corrected so the rendered
pose follows connector progress rather than jumping at completion. World clicks
now resolve actors, POIs, street furniture, and individual or batched buildings
to one restrained selection surface.

Installed-Chrome verification at the default Baltimore world measured 30
roadside controls, 29 compiled controllers, 103 controlled lane approaches,
six continuously visible tracked cars, a 1.437 m maximum movement step across
100 ms samples, and no page or console errors. Focused contracts and repository
source verification pass. Evidence is recorded in
`output/verification/living-world-rnd/report.json` and the public implementation
record is `docs/LIVING_WORLD_TRAFFIC_RND.md`.

---

# Community Reality Capture research source — 2026-09-06

## Decision question

How can World Explorer accept phone photographs for stable mapped-building
presentation without turning browser uploads into a public-file, privacy, or
building-authority bypass, and which reconstruction path is realistic for a
first testable local implementation?

## Primary evidence used

- Firebase App Check for web applications and reCAPTCHA Enterprise:
  https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- Firebase App Check for a custom backend, including the request-header rule:
  https://firebase.google.com/docs/app-check/web/custom-resource
- Firebase Storage Security Rules conditions:
  https://firebase.google.com/docs/storage/security/rules-conditions
- Google Cloud signed URLs and their bearer-token security boundary:
  https://cloud.google.com/storage/docs/access-control/signed-urls
- Google Cloud Run Jobs for bounded, run-to-completion processing:
  https://cloud.google.com/run/docs/create-jobs
- OWASP File Upload Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- AliceVision and Meshroom photogrammetry pipeline documentation:
  https://github.com/alicevision/alicevision
  https://meshroom-manual.readthedocs.io/en/latest/
- COLMAP command-line and project documentation:
  https://colmap.github.io/cli.html
  https://github.com/colmap/colmap
- Khronos glTF Validator:
  https://github.com/KhronosGroup/glTF-Validator
- WebXR and ARCore depth/hit-test references used only for Phase 2 ranking:
  https://immersive-web.github.io/depth-sensing/
  https://developers.google.com/ar/develop/depth
  https://developer.mozilla.org/en-US/docs/Web/API/XRHitTestSource

## Claim-to-source ledger

| Claim | Source | Confidence | Local consequence |
| --- | --- | --- | --- |
| App Check belongs in a request header and complements rather than replaces authentication | Firebase App Check custom-resource documentation | High | Capture endpoints require App Check; owner, moderator, and private-space actions also require Firebase Authentication |
| Storage rules can constrain path, size, content type, and write state but do not constitute full content inspection | Firebase Storage Rules; OWASP uploads | High | Direct reads are denied, uploads are normalized/write-once, and the worker revalidates magic bytes and metadata before processing |
| A signed URL is bearer access until expiry | Google Cloud Storage signed URLs | High | The broker issues short-lived URLs only after the backend resolves access; private responses are no-store |
| Photogrammetry is a multi-stage compute workload suitable for an isolated bounded job | Meshroom/AliceVision; COLMAP; Cloud Run Jobs | High | V1 defines a transactional worker rather than attempting reconstruction in the gameplay tab or an HTTP request |
| glTF needs structural and geometry-budget validation before publication | Khronos glTF Validator | High | The worker requires embedded GLB, bounded bytes and triangles, Blender cleanup, and moderator review before approval |
| Browser/device depth can assist capture but is not uniformly available | WebXR Depth; ARCore Depth | High | Depth remains optional Phase 2 research and is not a V1 dependency |

## Stop decision

Research stopped after the security boundary, reconstruction architecture,
portable output, and optional depth questions had primary-source support. The
remaining uncertainty is empirical rather than documentary: real photo-set
quality, worker duration/cost, and alignment accuracy must be measured with one
controlled exterior and one permitted private interior. Adding more providers
or reconstruction techniques before those proofs would not improve the V1
decision.

## Local outcome and unresolved proof

The repository now contains the guided capture client, private quarantine and
data rules, authenticated/App-Checked endpoint boundary, reusable space-access
authority, Meshroom/Blender worker contract, moderation surface, and safe
exterior/interior presentation integration. Local contracts and UI/source checks
pass. No deployment or GitHub operation occurred.

Production acceptance remains intentionally open because the local environment
lacks a Java runtime for the Firebase rules emulator, provisioned Firebase
Storage and App Check, Meshroom/Blender, and controlled exterior/interior photo
sets. Those are evidence gates, not features claimed as complete. Full findings
and the Phase 2 ranking are recorded in `COMMUNITY_REALITY_CAPTURE_RND.md`.
