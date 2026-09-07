# World Explorer Reality Reconstruction

## Development plan — buildings, rooms and personal objects

September 7, 2026 · Owner-directed planning baseline · Current branch: `steven/building-exteriors-local`

**This document describes the product to build, not functionality already completed.** Implementation status and research evidence are separated below. No production deployment, public-repository update, or destructive restart is part of this plan.

Implementation continuation, September 7: see [Phone pilot](REALITY_CAPTURE_PHONE_PILOT.md). Live guided-camera capture, previous-frame overlay, explicit facade-only intake, frozen-manifest polling and retry recovery are implemented. Physical-phone/house acceptance, registered facade patch publication, scan-derived interior collision, and TRELLIS inference remain open. Do not equate this pilot with all M0–M8 milestones passing.

### The product decision

Build a World Explorer reconstruction product around established reconstruction tools. Its distinctive job is to improve **the same real building already in the world**, preserve its identity and gameplay, and make approved improvements available to other players.

Do not rebuild COLMAP, Meshroom or Scaniverse. Do not force one reconstruction method to serve buildings, rooms and generated objects. Build the integration, capture guidance, geographic registration, evidence review and publication software that World Explorer actually needs.

The three supported workflows are:

1. **Improve a building:** photographs improve the observed exterior of a mapped building. Inaccessible or unseen parts retain an appropriate existing representation.
2. **Recreate an authorized interior:** captures produce a private, correctly scaled space with matching appearance, walls, floors, doors and navigation.
3. **Create an object:** TRELLIS helps create an individual item for a user's spaces. A generated chair is an asset, not evidence about a real building.

Outdoor environment reconstruction, terrain replacement, vegetation, street reconstruction and city-wide environmental scans are future scope. Capture must not change existing roads or terrain to make a model fit.

## 1. What success means

An ordinary user selects the correct building, gets understandable phone instructions, captures what they can safely see, uploads once, and receives a useful result or an actionable explanation of what is missing.

An approved exterior is visible to another account arriving from a different starting location, on another device, after a reload. The building remains the same property and POI with the same entrances. A private room stays private; visitors receive only the access its owner deliberately granted. A generated object can be placed, saved and used through existing inventory and world-editing authorities.

“Uploaded,” “reconstructed,” “aligned,” “approved,” “published” and “playable” are separate milestones. No progress label may imply a later milestone has passed. A private preview is not a published world change. A convincing scene is not automatically a walkable room.

The opportunity to compete with larger products is **game-ready integration with an existing mapped world**, not a claim that our reconstruction algorithms or capture quality already outperform theirs. Prove that advantage through capture effort, alignment accuracy, time to useful world update, reliable traversal and delivery cost.

## 2. Preserve useful work; retire the wrong assumptions

| Current component | Decision | Required action |
| --- | --- | --- |
| Firebase accounts and same-account phone handoff | Keep | Retain one account across devices within an environment. Test account switching, interrupted upload and signed-out links. |
| Private reserved photo storage, server validation and immutable input manifests | Keep and extend | Preserve the isolation; add consented capture metadata, retention, resumable session completion and deletion verification. |
| Bounded worker queue, attempt fencing and private media broker | Keep and harden | Add per-stage artifacts, progress, execution IDs, cancellation, costs and restartable checkpoints. |
| Existing building provenance, footprint, foundation and entrance systems | Keep as world authorities | Reference them; never replace them with a second capture-owned property/geography database. |
| Meshroom adapter | Keep as an unproven baseline | Compare against a pinned COLMAP route on identical real inputs. Replace the provider if evidence favors the alternative. |
| TRELLIS adapters | Keep for object/material experiments | Move their product entry point to object creation. Do not present generated geometry as measured house reconstruction. |
| AR presentation and device capability checks | Reuse selectively | Share camera lifecycle and capability handling. They do not yet provide a native scanning/VIO pipeline. |
| Whole-building visual suppression | Replace for partial captures | Introduce surface-scoped replacement so a front photo does not remove the back, roof or entrance visuals. |
| Generated room collision under a scanned visual | Replace before playable-room acceptance | Scanned visuals and structural collision must agree; existing room controllers consume the validated layout. |
| Launch-origin-based capture world identity | Migrate | Same real source entity must resolve to the same published representation regardless of where a session began. Preserve aliases and existing records. |
| Fixed eight-side capture checklist and fixed counts | Replace as quality authority | Counts are intake limits, not measured coverage. Support inaccessible sides and genuinely partial contributions. |
| Silent default room dimensions and yaw-only alignment | Replace as evidence | Unknown measurements stay unknown. Registration must handle full orientation and explicit scale with measured residuals. |
| Independent spinning moderation renderer | Retired locally | Shared viewer now uses the same placement helper as the runtime; no continuous spin/recentering of the model. Full in-world review is still needed. |

Deletion rule: remove a superseded runtime path only after its replacement passes the same user journey, saved data has a migration, and rollback is available. Remove misleading tests rather than carrying two contradictory acceptance systems. Do not discard private captures or working authorities as part of a cosmetic cleanup.

## 3. Non-negotiable system rules

1. **One canonical place identity.** Captures, properties, POIs, entrances and representations refer to the same source entity. Capture sessions and provider jobs do not invent new buildings.
2. **One publication authority.** Only the trusted backend promotes a validated representation revision. A worker, browser, local save or successful model export cannot publish.
3. **One active revision per representation scope.** Keep history, but do not render multiple competing exterior replacements for the same surface.
4. **Evidence stays distinguishable.** Record observed, geometrically fitted, inferred, synthetic and unknown regions. Fitting to GIS does not turn a guessed window into observed evidence.
5. **Partial improvement is valid.** Improve supported regions; retain the baseline elsewhere. Do not force unsafe access or fabricate coverage to finish a checklist.
6. **Photos and private interiors are private by default.** Exterior sharing, interior entry and original-photo access are independent decisions.
7. **Virtual property ownership is not permission to scan a real residence.** Collect explicit contributor permission statements; support review, disputes and withdrawal.
8. **Gameplay and appearance must agree.** Rooms require validated structural geometry. Objects require appropriate scale, placement and interaction rules.
9. **Performance is budgeted before publication.** A correct-looking model that overwhelms nearby users' phones is not acceptable.
10. **Failures preserve work.** Users retain their saved capture and a clear recovery route. Retries cannot double-charge, duplicate publication or resurrect deleted content.
11. **No production dependency during staging tests.** Separate storage, accounts, permissions and backend configuration. Staging is not merely a different front-end URL pointing at production data.

## 4. Architecture and authority boundaries

```text
World Explorer mapped entity + existing geometry/provenance
                         │
Desktop selection ── same-account phone capture
                         │
                Private capture session
                         │
      Validated photos + versioned metadata manifest
                         │
                Reconstruction adapter
          ┌──────────────┼─────────────────┐
      Exterior       Interior          Object creation
      observations   visual + layout   TRELLIS candidate
          │              │                 │
      Geographic     Metric room       Asset scale and
      registration   registration      interaction fit
          └──────────────┼─────────────────┘
             Asset preparation + verification
                         │
              Private review / correction
                         │
          Trusted versioned publication or private use
                         │
     Existing world/interior/object runtime authorities
```

Keep the reconstruction adapter independent of Firebase and Three.js. Its input is a bounded manifest and scoped artifact access; its output is a versioned artifact bundle, processing measurements and quality findings. It cannot set visibility, transfer property, approve content, or call arbitrary game code.

Registration is a separate step even if implemented by the same provider. Asset optimization is another step. This permits changing the solver without rewriting uploads, accounts, moderation or runtime loading.

Do not deploy six microservices simply to mirror this diagram. Begin with logical modules and one bounded job pipeline. Split execution services only where isolation, hardware or measured scaling requires it.

## 5. Geographic identity and coordinate design

### Identity

Use the existing mapped provider/entity identifier as the lookup basis, with a server-resolved canonical entity record and versioned geometry snapshot. Maintain aliases when providers or IDs change. OSM outlines, building parts, Overture entities and nearby POIs are not automatically interchangeable.

Model a building hierarchy: site/complex → building → part → facade/roof surface; separately building → entrance → floor → unit → room. Multiple shops or private units can share one building. Capturing a facade does not grant access to any unit. A room capture must name its entrance/unit association rather than replacing every interior behind the building.

Geometry changes require reconciliation: compare the new footprint/version with the capture's reference; re-register when safe, otherwise retain the last compatible revision and flag review. Never silently attach an old scan to a different building after an ID migration.

### Coordinates

Store geodetic position, coordinate reference system, units and vertical datum explicitly. Use building-local metric coordinates for assets and physics, with a versioned transform to the world. Preserve full rigid orientation and uniform scale; do not use per-axis stretching to conceal a bad fit.

Document the current game's local projection and origin conventions. Test translated world origins, negative coordinates, building rotations, altitude offsets and large structures. An AR session's local coordinates, EXIF GPS altitude and terrain height are not assumed to share a datum. Preserve measurement uncertainty and the source of every constraint.

Registration uses established tools: camera/GCP correspondences, gravity/ground alignment, similarity transforms and robust fitting. Measure held-out landmarks and facade/door residuals. A footprint alone cannot resolve every symmetry or reveal hidden geometry. An entrance or identifiable corner can disambiguate a rotated rectangular building.

## 6. Exterior reconstruction: progressively improve surfaces

### First useful product

Start with one accessible facade of a low-rise building. Recover camera poses where possible, identify the observed wall, rectify/project image evidence onto the mapped facade, and preserve the existing footprint and gameplay. Add recovered geometry only when it is supported and does not contradict doors or collision.

Benchmark this against an aligned full photogrammetric mesh. A new arbitrary mesh is not automatically better than a geographically correct existing shell with accurate facade appearance.

### Surface-scoped publication

Each exterior revision records which facade/roof regions it changes, source photographs, geometry version, registration transform, confidence, and representation type. A facade can contain observed material, separately modeled architectural detail and procedural remainder. Prevent seams, depth fighting, double shadows and duplicated doors at boundaries.

Prefer projected textures/material layers for supported flat walls, compact geometry for verified protrusions, and full mesh replacement only for sufficiently complete, registered objects. Curved or irregular facades may require reconstructed patches rather than planar projection. Do not bake moving people, vehicles, temporary scaffolding or vegetation into permanent building geometry.

### Tall buildings and difficult access

| Situation | Product behavior |
| --- | --- |
| Only street-level floors are visible | Improve those visible floors; retain upper floors and roof. Never stretch street-level pixels over the tower. |
| Upper facade visible from a safe distant viewpoint | Guide an additional view, retain lens information and reject insufficient detail rather than inventing it. |
| Repeating windows create ambiguous matches | Use mapped constraints and stable landmarks; request a disambiguating corner/entrance view; do not trust a visually plausible wrong-floor alignment. |
| Glass, mirrors or reflective cladding | Prefer constrained structure plus reviewed appearance; reflections are not building geometry. |
| Adjoining buildings or a courtyard | Separate source entities and accessible surfaces; no mandatory full orbit. |
| Roof cannot be seen | Keep mapped/procedural roof, explicitly unobserved. |
| Several people photograph the same tower | Combine compatible observations by surface and capture date; preserve contributor provenance; resolve conflicts before replacing an active revision. |
| Drone/aerial imagery later becomes available | Accept through a separate authorized input adapter with altitude/pose provenance; do not require climbing or drone ownership for ordinary users. |

Tall-building support begins with partial surface contributions. A complete skyscraper scan is a later dataset/registration milestone, not a prerequisite for useful community updates.

## 7. Interiors: a room is more than a visual scan

The deliverable is a **visual representation plus a structural layout**: metric floor surfaces, walls, ceiling, openings, obstacles, entry spawn and room connectivity. Windows are not automatically walk-through holes. Mirrors and screens must not create false rooms or exits.

Support candidate appearance routes—textured mesh or Gaussian splat—without making either the collision authority by default. Evaluate depth-assisted layouts and generated collision candidates against observed imagery. Connect the approved structural layout to existing walking, camera, doorway and navigation systems; do not hide an unrelated generated room beneath a scan.

First supported interior: one room, one validated entrance, no stairs or multiple floors. Next: connected rooms with a doorway graph. Later: multi-floor buildings, stairs, elevators, shared corridors and private units. Each expansion needs its own real walkthrough evidence.

Validate floor continuity, head clearance, doorway width, camera near-wall behavior, object collision, mobile controls, entry/exit and spawn placement. Test looking through windows without exposing other private spaces. A failed layout can remain a private inspectable model; it must not be described as a finished playable room.

Room updates create revisions. Existing placed furniture and belongings need explicit anchors and migration rules: retain positions if compatible, offer repositioning if the floor changes, and never drop items through a new wall/floor. Real photographed possessions are not automatically usable inventory objects.

## 8. TRELLIS object creation

Provide a separate “Create an object” flow from the user's asset library or space editor. Input images and resulting candidates remain private initially. TRELLIS produces a generated candidate with an explicit scale/unit step; its inference does not prove unseen surfaces match the photographed object.

Preparation includes background removal where useful, generation, mesh/material validation, simplification, texture compression, orientation, pivot, grounded placement, dimensions and a simplified collision shape. The user previews the object in a known-size scene before saving it.

Use existing inventory, Backpack, placement and persistence services. Do not create a second item catalog or wallet. Begin with static decorative objects. Interactivity is an approved existing capability—such as seat or storage—not arbitrary model-supplied scripts. A generated lamp cannot gain code execution merely by declaring itself a lamp.

Sharing an object is separate from publishing a home or its photos. Later public asset sharing requires attribution, provenance, abuse reporting, versioning, withdrawal and a moderation path. Object generation budgets are separate from building reconstruction budgets so one cannot exhaust the other's queue.

## 9. Capture experience and device support

### Desktop → phone → desktop

Select building → choose exterior, room or object → explain what is already known → create authenticated capture session → QR/deep link → sign into the same account on the phone → resume the exact target. The link identifies a session; it is not an access token.

The phone shows the selected building and scope before taking photos. Account switching must not reveal another user's local draft. A desktop sees uploaded progress and the same result; unsent local photos are clearly identified as device-only.

### Guidance

Use simple quality advice: maintain overlap, move between views rather than only pivoting, avoid digital zoom/lens changes, include corners and entrances, use even light, and retake obvious blur. These initial heuristics must not masquerade as measured 3D coverage.

Replace fixed eight-side completion with surface-aware states: captured, needs another viewpoint, inaccessible, unknown. A user can finish an accessible front facade without lying about the back. True next-best-view prompts require estimated poses and reconstruction uncertainty, not merely a compass sector counter.

Preserve useful intrinsics, lens, orientation, timestamps and optional depth/poses in a private, typed metadata manifest with explicit consent. Public derivatives omit original GPS/device/household metadata. Define behavior for browsers that cannot supply calibration or decode HEIC. Do not promise iPhone WebXR scanning because camera upload works.

### Support tiers

- **Universal first:** ordinary HTTPS browser, JPEG/photo picker/camera, resumable private uploads, preview and same-account continuation.
- **Video input:** later bounded keyframe extraction, blur/duplicate filtering, timestamps and documented pose recovery; no promise that an ordinary tour video already contains metric tracking.
- **Optional native/depth capture:** RoomPlan/ARKit or ARCore adapter on supported devices. This improves evidence but is not required to contribute a facade.
- **External scan import:** investigate supported mesh/splat/depth bundles through the same quarantine, identity, registration and privacy pipeline, not an unrestricted “upload any model into the world” bypass.

All core controls need touch targets, keyboard access, screen-reader status, non-color-only progress, reduced motion, recoverable permission denial, low-bandwidth behavior and background/resume handling. No compulsory continuous camera use or infinite capture tutorial.

## 10. Stored data and publication lifecycle

### Durable records

Reuse existing collections where their semantics fit; extend them deliberately rather than adding equivalent parallel stores.

| Record | Required content |
| --- | --- |
| Canonical target reference | Existing source identity, alias/version, building/part/surface or room scope, trusted geometry reference |
| Capture session | Owner, consent, target, scope, device sessions, state, limits, timestamps |
| Photo/metadata manifest | Immutable object generations, hashes, dimensions, approved metadata, camera/pose availability and uncertainty |
| Processing attempt | Provider/container/model revision, stage, execution ID, lease, retry lineage, resources, elapsed time and failure reason |
| Candidate bundle | Visual assets, optional collision/layout, transforms, quality metrics, evidence coverage and checksums |
| Review | Scope, reviewer, privacy/quality/registration findings, requested corrections, decision, source revision |
| Representation revision | Canonical target, immutable asset manifest, visibility policy, active/superseded/withdrawn state |
| Access policy | Owner/household/guests, time/session bounds, policy version and revocation |

Original captures, working artifacts and published derivatives have separate retention and authorization. Never use a public model bucket as the originals archive. Backups and retention policies must include deletion/withdrawal semantics; do not promise immediate erasure from backups or already-downloaded copies.

### State flow

Draft → uploading → validated → queued → reconstructing → registering → preparing assets → private candidate → review → approved revision → active publication.

Failures keep their stage, saved inputs and a retry/correction route. A retry references the frozen inputs and a new attempt ID. A deleted/withdrawn capture cannot be resurrected by a late worker. A user changing visibility does not trigger an unbounded rebuild.

### Global world updates

Publish an immutable manifest, then atomically switch the active revision pointer for the relevant entity/surface. Nearby clients discover revisions through a bounded spatial index and invalidate only affected representations. The map entity remains stable across different launch origins. Never require loading all captures or maintaining a listener on every building worldwide.

Keep the previous representation visible until its replacement is fully loaded and validated. Swap atomically; on failure retain the previous compatible visual or procedural fallback. Do not disturb someone currently inside a room with an in-place wall-layout swap: apply at safe re-entry or a coordinated transition.

Withdrawal retires the active revision and invalidates private delivery as appropriate. If it contained several contributors' observations, track dependencies and remove/rebuild only affected portions when possible. Retain minimal audit records, not unnecessary private image copies.

## 11. Review, conflicts and privacy

Public exterior publication needs explicit contributor intent plus authorized review. The first pilot uses human review. Later low-risk appearance-only updates may use automated checks and trusted-contributor expedited review, backed by rollback and sampling—not universal auto-publication from any account.

A review screen must show the candidate and current world representation together, mapped identity, observed surfaces, registration residuals, entrance overlap, changes to previous revisions and privacy concerns. A moderator cannot determine metric alignment from a separately spinning model and a separate 2D footprint alone.

Resolve incompatible contributions by scope and evidence, not simply last write wins. Newer does not automatically mean more accurate. Retain capture date for renovations, seasonal appearance and temporary objects. Conflicting footprints, wrong-building matches or uncertain rights require resolution rather than automatic world mutation.

Residential interiors default to private capture, private processed assets and owner-only entry. Private, invited, persistent guest, session guest and deliberately public modes remain independent from public exterior visibility. Time-limited delivery must recheck authorization. Revocation stops future access but cannot make an already viewed model unknowable.

Define a report/withdrawal/dispute workflow before broad contributions. Faces, license plates, personal documents, screens and intimate/private household details require redaction or rejection. Automated detection is assistance, not a guarantee. Do not distribute raw private photos to third-party reconstruction services without an explicit approved processing arrangement.

## 12. Security and operational design

- Threat-model account takeover, QR guessing, cross-account access, malicious files, decompression bombs, upload spam, worker compromise, model dependency URLs, path traversal, stolen signed links and abusive publication.
- Keep authorization in trusted backend logic; App Check supplements authentication rather than replacing it. Reviewers and operators need separately scoped roles and auditable actions.
- Decode and inspect untrusted media in bounded isolation. Disallow executable payloads, external model dependencies and arbitrary provider command arguments. Pin provider revisions and scan dependencies/images.
- Workers receive capture-scoped input access and scoped output destinations, not general photo/database credentials. Use bounded CPU/GPU/memory/time and restricted outbound access where practical.
- Enforce aggregate bytes, photo/session limits, queue admission, concurrent jobs and retry budgets server-side. Track the actual execution so cancellation reaches the compute job, not just its UI label.
- Make job dispatch, completion, review and publication idempotent and revision-fenced. Compensation/recovery must cover partial asset uploads and database failures.
- Observe queue age, stage time, failure reason, registered-image fraction, costs and memory. Logs must not contain photos, bearer URLs or sensitive interior metadata.
- Test backup/restore, revocation, cancellation, deletion and rollback. Prepare an incident runbook and emergency publication pause that preserves ordinary world play.
- Review data licenses and software obligations before public use. Do not add misleading “permission obtained” flags or artificial licensing locks to the gameplay runtime.

## 13. Runtime and cost budgets

Define budget profiles for facade patches, small buildings, complex buildings, rooms and objects. Budget by the visible scene and device tier, not only by individual file size. A 20 MB asset can be acceptable alone and disastrous across a street.

Measure network bytes, decoded texture memory, triangles, draw calls, shader cost, frame-time percentiles and loading stalls on representative phones and desktops. Set final thresholds from those measurements; do not advertise invented universal FPS.

Use near-field streaming, LODs, shared materials where compatible, compressed textures and explicit eviction. Keep procedural/far representations cheap. Private assets must never be placed in public caches to improve performance. Do not introduce another perpetual renderer/animation loop in the background.

Begin with existing on-demand staging processing. No always-on GPU. Record cold start, download, pose solve, reconstruction, registration, optimization, upload and failure costs separately. Do not assume published H100 inference timings apply to an L4 or include a building pipeline. Establish per-user quotas and project spending alerts before inviting broad capture traffic; application admission is not a guaranteed cloud billing cap.

## 14. Development sequence and exit gates

Each milestone ships a vertical workflow, not only contracts or empty modules. The order is deliberate: prove usable reconstruction before scaling community infrastructure.

| Milestone | Build / validate | Exit evidence |
| --- | --- | --- |
| **M0 — Baseline and decision** | Audit actual authorities, isolate staging, record keep/replace map, cancel bad test jobs, preserve a clean checkpoint | Decision record, explicit unknowns, no orphaned compute or production changes |
| **M1 — Reference captures and reconstruction bake-off** | One authorized house facade/exterior and one room; frozen identical inputs; compare current Meshroom with a pinned COLMAP route; manual registration allowed | Real outputs, source hashes, recovered views, scale/alignment error, time/resources/cost, selected first provider with reasons |
| **M2 — Exterior slice in the actual world** | Surface-scoped representation, same canonical entity across origins, projected facade or aligned supported mesh, door preservation | One photographed facade visible to a second account after reload; other surfaces unchanged; withdrawal restores baseline |
| **M3 — First playable private room** | Metric layout, visual/collision correspondence, one doorway, existing movement/camera integration and private delivery | Owner enters and walks the real room; unauthorized account cannot fetch it; camera/door/floor tests pass; guest revoke and return to Earth work |
| **M4 — Usable capture product** | Surface guidance, retakes, partial/inaccessible capture, same-account handoff, upload recovery, meaningful progress and review UI | A non-developer completes capture without operator database edits; phone/desktop recovery works; failures explain next steps |
| **M5 — Community publication** | Active revisions, spatial discovery, contribution conflicts, consent/withdrawal, review tools, retention and operational controls | Multi-user publish/update/reject/withdraw/rollback lifecycle with no duplicate representations or raw media disclosure |
| **M6 — Complex buildings and connected rooms** | Tall facades, building parts, repeating/glass surfaces, adjacent buildings, multi-room graph, then floors/stairs | Representative difficult cases with no fabricated unseen coverage, identity drift, blocked entries or geometry/collision mismatch |
| **M7 — TRELLIS objects** | Separate generated-object flow, scale/pivot/collision, optimization, existing inventory/placement persistence | User creates and places an object in their space, reloads, moves/removes it; object does not modify mapped building truth |
| **M8 — Wider pilot and release** | Device/load/security tests, support docs, measured costs, rollback rehearsal and user acceptance | Controlled invited pilot passes; owner tests staging before any production release |

M7 can run after the shared secure asset pipeline is proven; it must not delay M1–M3 or create a parallel wallet/library. Advanced native capture, learned next-best-view and engine forks require benchmark evidence before being scheduled. Do not begin outdoor-world reconstruction in these milestones.

### First development backlog

1. Freeze current inputs/contracts and known failures; finish saving the current local fixes.
2. Acquire the two authorized reference captures and measured distances. Preserve a private original set; do not label public benchmark images as the user's house.
3. Pin the provider versions and run the same-input comparison once with stage logging and a bounded compute budget. Investigate failures before rerunning unchanged tests.
4. Replace default scale/yaw approval with measured full registration; integrate existing registration tools rather than new matching mathematics.
5. Fix canonical entity lookup across launch origins and add a migration for existing captures/space aliases.
6. Implement one facade-scoped world revision and prove second-account visibility and rollback.
7. Implement one measured room layout through existing interior authority and prove actual walking/privacy.
8. Expand phone guidance and community review from evidence gathered in those real journeys.

## 15. Acceptance matrix and test discipline

| Dimension | Required cases |
| --- | --- |
| Exteriors | Detached house; row house/party wall; corner building; irregular footprint; storefront; tower with partial upper visibility; reflective facade; building parts; inconsistent mapped height |
| Interiors | Textured room; plain wall; mirror/window; narrow doorway; furniture obstacles; connected rooms; later stairs/floors; private unit in shared building |
| Identity | Same building from two launch origins; two providers with aliases; neighboring buildings; changed map geometry; multiple POIs per building |
| Accounts/privacy | Same user two devices; wrong user/guessed link; sign-out during upload/load; revoked/session-expired guest; public exterior plus private room; withdrawal |
| Failures | Offline/resume; partial upload; duplicate submit; process timeout/cancel; lost callback; late completion; deleted capture; failed asset swap; denied storage request |
| Runtime | Enter/exit; walk into walls; open doors; camera near surfaces; object placement; reload; mobile touch; low-memory eviction; old/new revision swap |
| Accessibility | Keyboard-only, screen-reader progress, zoomed text, reduced motion, touch targets, permission denial and understandable recovery |
| Operations | Bounded cost/concurrency; actor audit; backup/restore; migration/rollback; raw media not public; malicious media rejection |

Use small unit tests for math/state/permissions and actual endpoint tests for transactions. Use real cloud checks to establish IAM and storage behavior. Use actual browser actions and visual inspection for UI/world integration. Use physical phones for camera/depth/WebXR claims. Keep each evidence class labelled.

Acceptance records identify source commit, deployment, device/browser, dataset hashes, pipeline revision, steps, observations, screenshot/model artifacts, metrics and unresolved defects. Tests that only search source strings for a feature cannot establish usability. Re-run relevant tests after a change; do not repeatedly run the whole Earth/space suite to investigate a capture issue.

## 16. Staffing, scheduling and extraction

The work spans computer vision/geospatial registration, backend security/operations, real-time 3D/gameplay, and mobile UX/testing. One developer can stage it, but these are distinct skills and validation responsibilities. Do not estimate it as a simple upload-page feature or promise a Scaniverse-quality platform in a few coding sessions.

Schedule dates after M1 measures input quality, failure rate and processing constraints. If M1 needs repeated manual cleanup, resolve that before adding contributors. If ordinary room photos cannot produce acceptable structure, adopt a depth-assisted/native input option or a reviewed structural-layout step instead of falsely marking rooms playable.

Keep a documented adapter boundary now; extract a standalone reconstruction package only after M2 and M3 work inside World Explorer. Extraction should preserve reusable capture manifests, provider/registration adapters, asset preparation and validation, while leaving Firebase accounts, property permissions and runtime rendering in World Explorer adapters. A separately testable package is valuable; a premature fork with no successful real captures is not.

## 17. Current status and next evidence

**Already present:** mapped building/provenance systems, generated interiors, capture/account UI, same-account handoff, private staging storage, image validation, queue/broker and baseline reconstruction adapter. These need extension rather than wholesale replacement.

**Locally improved in the current work:** thumbnail review/removal, failed-job retry, shared review/runtime placement, bounded geographic-context snapshots, and transactional moderation that rejects stale/deleted/newer-room conflicts. Focused checks: 45 local tests and 14 browser checks passed; the latter uses transport doubles and an explicitly synthetic GLB. Source/import validation passed. The phone-sized thumbnail and placement screenshots were inspected. This does not establish physical phone capture or a finished room.

**Actual processing evidence, updated September 7 at 20:00 UTC:** after correcting CPU-forced features and two real Blender export failures, v4 execution `capture-meshroom-ksgg7` completed the frozen 24-photo public AliceVision tree-stump benchmark. Its 18.5 MB textured GLB reached private review and was visually inspected through protected delivery in phone-sized and separate desktop browser profiles, without page errors. This is a real reconstructed output, not a synthetic test model; it is also not a building-quality or room-navigation acceptance. Current focused checks are 48 Node and 17 interface checks, plus synthetic-camera lifecycle/input checks. The broader development milestones below remain open.

**Unproven:** real-house and real-room reconstruction, automatic registration, partial facade publication, scan-matched room physics, final provider choice, TRELLIS inference and a complete multi-user global-update journey. Source work above has not been pushed or deployed to production. Do not treat this plan or test counts as a completion certificate.

The next external input needed for M1 is an authorized house and room photo set with a few measured reference dimensions. That is missing evidence, not another cloud permission request. Existing staging infrastructure can be reused.

## Evidence behind the technology choices

The accompanying [reconstruction decision](REALITY_RECONSTRUCTION_DECISION.md) records the earlier audit and experiment boundary. Current primary sources checked September 7, 2026:

- [COLMAP FAQ](https://colmap.github.io/faq.html) and [tutorial](https://colmap.github.io/tutorial.html): known cameras, geographic constraints, registration and current reconstruction/texturing capabilities.
- [Meshroom SfMTransform](https://meshroom-manual.readthedocs.io/en/latest/feature-documentation/nodes/SfMTransform.html) and [MrGeolocation](https://github.com/meshroomHub/mrGeolocation): existing alignment/scaling/geographic tooling to evaluate before custom replacements.
- [OpenMVG geographic workflows](https://openmvg.readthedocs.io/en/latest/software/Geodesy/geodesy/) and [OpenMVS](https://github.com/cdcseacave/openMVS): alternative established camera-to-textured-mesh route.
- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) and [shape-conditioned texturing](https://github.com/microsoft/TRELLIS.2/blob/main/example_texturing.py): generated objects/materials; not evidence of measured building reconstruction.
- [Texture2LoD3](https://arxiv.org/abs/2504.05249): prior art for imagery and existing lower-detail building models. The broad GIS/facade concept is not a new invention.
- [Nerfstudio custom inputs](https://docs.nerf.studio/quickstart/custom_dataset.html), [Spark](https://github.com/sparkjsdev/spark), and [PlayCanvas collision generation](https://developer.playcanvas.com/user-manual/splat-transform/collision/): candidate scene appearance/rendering and separate collision preparation.
- [Apple RoomPlan](https://developer.apple.com/augmented-reality/roomplan/), [ARCore Raw Depth](https://codelabs.developers.google.com/codelabs/arcore-rawdepthapi), and [WebXR raw-camera explainer](https://github.com/immersive-web/raw-camera-access/blob/main/explainer.md): native/depth capability and browser limitations.
- [Niantic pricing](https://www.nianticspatial.com/pricing) and [NSDK downloads](https://www.nianticspatial.com/docs/nsdk/downloads/): current external-service comparison, not a mandatory enterprise dependency.
- [POp-GS next-best-view research](https://openaccess.thecvf.com/content/CVPR2025/html/Wilson_POp-GS_Next_Best_View_in_3D-Gaussian_Splatting_with_P-Optimality_CVPR_2025_paper.html): geometric guidance is a real research area, distinct from counting photos.
- [Cloud Run pricing](https://cloud.google.com/run/pricing): cost estimates must include actual worker resources and duration, not just model inference time.

These sources support feasibility and constraints. They do not establish that the proposed World Explorer workflow has already been implemented or benchmarked successfully.
