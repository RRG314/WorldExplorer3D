# Reality reconstruction: adapt the engine, build the integration

Decision record — September 7, 2026. Audience: World Explorer owner and implementation maintainers. Scope: building exteriors, private playable rooms, and optional household objects. Staging only; no production or GitHub publication.

## Decision

**ADAPT**, provisionally. Reuse established reconstruction, registration and texturing algorithms. Build World Explorer's capture guidance, entity association, evidence review and representation lifecycle around them. Do not create another SfM/MVS engine. Do not select a final reconstruction provider until the same real house and room pass comparative tests.

The existing Meshroom worker is an integration baseline, **not an accepted quality winner**. Its first 24-image public benchmark was cancelled after CPU-forced feature extraction. Subsequent runs exposed Blender operator and resized-texture export defects, now corrected with a textured installed-toolchain preflight. The v4 run completed at 19:59 UTC on September 7, producing a textured 18.5 MB GLB from the public AliceVision tree-stump sample. The actual protected result was visually inspected in phone-sized and separate desktop browser profiles. This establishes the processing/delivery path, not building fidelity or registration. No private house or room dataset has been supplied. TRELLIS inference has not been executed.

September 7 implementation continuation: staging now includes a live camera with framing/previous-frame overlays, explicit facade scope (no forced hidden-side labels), shared-account capture, protected uploads and private preview. These are a pilot slice of the roadmap, not registered facade-patch publication or a scan-matched playable room. Current test instructions and boundaries: [Phone pilot](REALITY_CAPTURE_PHONE_PILOT.md).

## Work plan and evidence boundaries

1. Completed: inspect current capture, provider, publication, AR, building provenance and interior authority paths.
2. Completed: primary-source comparison, including current capabilities that contradict older assumptions about COLMAP texturing, Meshroom geolocation and Scaniverse access.
3. Completed bounded local repairs: shared placement preview/runtime helper, footprint/entrance/height-evidence snapshot, thumbnail review, failed-job retry and revision-fenced moderation. 45 local and 14 labelled browser checks passed; phone-sized preview screenshots were inspected. These repairs have not been production-deployed and do not complete the reconstruction pipeline.
4. Pending: same-input house/room benchmark, measured registration, doorway/collision and phone acceptance. Source contracts, synthetic UI models and the public benchmark cannot close this step.

The planning tool is unavailable in this session; this record is the maintained plan. No substantial new reconstruction engine is authorized by this provisional decision.

The owner's newer request is now the [complete development plan](REALITY_RECONSTRUCTION_DEVELOPMENT_PLAN.md). That plan is ready; its implementation milestones remain open. Reconstruction selection still requires actual house/room input and measured outputs.

## What the app knows and what is missing

| Existing authority | Verified code | Remaining responsibility |
| --- | --- | --- |
| Mapped geometry, identity, height provenance, parts and foundation | `app/js/world/load-building-pass.js`, `building-provenance-model.js` | Capture must retain the same geometry reference; inferred height is not a measurement. |
| Door/building association and generated interior layout | `app/js/building-entry.js`, `app/js/interiors/` | A scan needs its own verified floor/wall/opening layout integrated into this authority. |
| Auth, private originals, reserved uploads, immutable manifests, worker queue | `functions/community-reality-capture.js`, `reality-capture-processing.js`, `storage.rules` | Keep one trusted publication path, revision fencing, scoped media and withdrawal. |
| Same-account phone handoff and local draft recovery | `app/js/reality-capture/capture-session.js`, `ui.js`, `local-draft-store.js` | Real physical-phone testing and useful geometric capture feedback. |
| AR spatial/camera/3D presentation | `app/js/ar/` | Presentation is not pose-synchronized scanning. Reuse lifecycle/capability detection, not an assumed reconstruction capability. |
| GLB visual replacement and procedural fallback | `app/js/reality-capture/runtime.js`, `interior-runtime.js` | Current room collision remains generated; a rendered scan is not a playable captured room. |

Audit findings: capture strips all EXIF, including useful camera intrinsics and pose hints; the broker previously passed only photos/kind, not the mapped context. Review uses default yaw/scale/offset rather than solved registration. Its spinning/recentered preview does not show those placement values. World identity includes the launch origin, which can divide representations of the same source entity. The runtime suppresses an entire procedural exterior, unsuitable for partial facade observations. These are integration defects, not proof that photogrammetry is the wrong technology.

## Technical requirement

Exterior: recover observed facade appearance and any supported surface detail; register observations to the existing geographic footprint, foundation and height evidence. Keep unseen sides procedural. Never stretch a model arbitrarily to fit an uncertain height, shift a real building, or turn generated windows into mapped facts.

Interior: obtain metric scale, gravity/floor, connected walls, actual door openings and obstacles; match the visible reconstruction to the same collision/navigation layout and entrance graph. Splats, textured meshes and generated room geometry are distinct representations with different purposes.

Initial **proposed acceptance thresholds**, not measured claims: a reviewed house registration within 0.5 m of control points and 2 degrees of independently checked orientation; doorway/floor collision alignment within 0.10 m for a walkable room; no blocked entry, open floor holes or spawn overlap. GIS uncertainty may exceed these targets; flag conflict and review it instead of deforming the scan. Measure withheld points, not just the landmarks used to fit the transform.

## Provider evidence

- **TRELLIS.2:** retain as optional generated object/material work. Its official single-image mesh generation and existing-mesh texturing are not calibrated multi-view reconstruction. Normalized model coordinates and voxel resolution do not establish real dimensions. Linux/NVIDIA requirements and published H100 timings do not establish latency on our L4. [Official repository and requirements](https://github.com/microsoft/TRELLIS.2), [texturing example](https://github.com/microsoft/TRELLIS.2/blob/main/example_texturing.py).
- **COLMAP:** strongest next challenger for explicit camera/registration control. Known intrinsics/poses, geographic priors and robust similarity registration already exist. Current documentation also includes mesh simplification and texture mapping. [FAQ](https://colmap.github.io/faq.html), [tutorial](https://colmap.github.io/tutorial.html).
- **OpenMVG + OpenMVS:** established camera/GCP/geographic registration plus dense mesh refinement and texturing. Not a missing engine. OpenMVS's AGPL obligations need review before distribution/service use; this is dependency selection, not a runtime license lock. [OpenMVG geodesy](https://openmvg.readthedocs.io/en/latest/software/Geodesy/geodesy/), [OpenMVS](https://github.com/cdcseacave/openMVS).
- **Meshroom/AliceVision:** keep the existing bounded worker for baseline measurement. Scaling, GPS transforms and geographical plugins already exist; first test those, rather than inventing georegistration. [SfMTransform](https://meshroom-manual.readthedocs.io/en/latest/feature-documentation/nodes/SfMTransform.html), [MrGeolocation](https://github.com/meshroomHub/mrGeolocation).
- **Splats/NeRF:** candidate appearance layer, not automatically collision or metric truth. Nerfstudio accepts ordinary photos/video via pose processing; Spark offers a Three.js splat renderer, but compatibility with the app's old Three r128 needs measurement before adding it. PlayCanvas offers generated splat collision, which still requires metric scale and doorway/floor checks. [Nerfstudio inputs](https://docs.nerf.studio/quickstart/custom_dataset.html), [Spark](https://github.com/sparkjsdev/spark), [splat collision](https://developer.playcanvas.com/user-manual/splat-transform/collision/).
- **Depth/VIO:** optional native capture adapter, not a requirement for ordinary browser upload. RoomPlan can supply LiDAR room structures/dimensions on supported Apple hardware; ARCore depth has device and missing-data limits. `getUserMedia` is not a synchronized WebXR camera pose feed. [RoomPlan](https://developer.apple.com/augmented-reality/roomplan/), [ARCore](https://codelabs.developers.google.com/codelabs/arcore-rawdepthapi), [WebXR raw-camera explainer](https://github.com/immersive-web/raw-camera-access/blob/main/explainer.md).
- **Scaniverse/Niantic:** useful comparison and optional exported-scan input, not the mandatory backend. Classic on-device capture remains free; the current NSDK is native and requires a business account. New cloud plan commercial rights differ from Classic. Verify applicable terms/device features before embedding. [Pricing](https://www.nianticspatial.com/pricing), [NSDK](https://www.nianticspatial.com/docs/nsdk/downloads/).

## The building-specific alternative is real

Prefer testing calibrated photo projection onto the existing facade shell before replacing it with an arbitrary whole-building mesh. Texture2LoD3 already studies low-detail building models plus image-derived facade reconstruction. SVI2LoD3 similarly combines LoD2 and street imagery, but explicitly excludes geometric accuracy from its evaluation. These are relevant prior art, not proof that either accepts a few ordinary phone photos end-to-end. Their publicly visible repositories do not establish a reuse license by themselves. [Texture2LoD3 paper](https://arxiv.org/abs/2504.05249), [SVI2LoD3 paper](https://arxiv.org/html/2608.29992v1).

## Selected architecture

Same authenticated capture → immutable private photo/metadata manifest → replaceable reconstruction adapter → established registration against versioned world constraints → observed/inferred/synthetic surface record → optimized visual asset plus separately verified interaction geometry → private preview → explicit reviewed, server-authorized representation revision → same mapped entity for all authorized players.

The missing custom product layer is the above coordination and evidence handling, not feature matching, bundle adjustment, meshing or basic registration. It can eventually be extracted as a package by passing a versioned world-context input and returning a representation bundle; keep Firebase, Three.js and property authorization in host adapters. Do not fork whole engines before a reproducible incompatibility justifies it.

## Capture and validation sequence

Start with one house and one room owned/authorized by the contributor. Keep a private original dataset outside the public world asset, with explicit consent for useful metadata. Compare pipelines on identical files and record their hashes. Ordinary browser capture currently uploads normalized JPEGs, not original EXIF-bearing files, so this metadata requirement remains implementation work.

For the first manual experiment: overlapping translated views in even light, no digital zoom/lens switching, include corners and entrances, avoid moving people and reflective/textureless-only frames. Aim for approximately 70% overlap; do not equate a sector counter with solved coverage. Photograph only accessible sides and leave unseen surfaces procedural. For a room, include wall-floor edges and open doorways, and measure a clearly identifiable distance. The current 20-exterior/18-room minimum is an intake rule, not a demonstrated minimum for reconstruction. [Capture principles](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture).

Collect: registered-photo fraction, held-out landmark error, footprint/height/door residuals, observed coverage, elapsed capture and processing time, peak RAM/VRAM, bytes/triangles/textures, mobile frame time and actual traversal failures. A developer-only manual alignment step is acceptable for this experiment, not a claim of automatic registration.

## Latency, cost and global changes

Show uploaded photos and job status immediately. Show a private processed candidate when ready. Public changes become visible only after their representation revision is committed and nearby clients refresh it; local IndexedDB is never public authority. Exterior visibility never grants room access. Do not promise immediate full 3D reconstruction from sparse uncalibrated photographs.

Current staging worker: one on-demand L4, four CPUs, 16 GiB, 30-minute limit, no task retries. At published non-redundant rates of $0.0001867/GPU-second, $0.000018/vCPU-second and $0.000002/GiB-second, this is approximately $1.05/hour or $0.52/30 minutes, excluding startup, builds, storage, network, taxes and other services. This is a calculated infrastructure estimate, not an invoice or accepted per-house cost. [Cloud Run pricing](https://cloud.google.com/run/pricing).

## What is not complete

No supplied real-house/room dataset has passed; no phone hardware acceptance, TRELLIS inference, final provider ranking, scan-matched room collision, automated facade projection, progressive partial replacement, origin-independent publication migration, or video/VIO capture is established. The research hard stop has **not** been reached. Potential research lies in evidence-aware, minimal-capture progressive world updates, but novelty is not claimed: relevant facade/GIS and next-best-view literature already exists.
