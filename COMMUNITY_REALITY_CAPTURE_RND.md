# Community Reality Capture — R&D Decision

Status: local V1 implementation exists; end-to-end reconstruction proof is not complete. Nothing in this work was deployed or pushed to GitHub.

## Decision

Use phone photos as private capture inputs, AliceVision Meshroom as the first reconstruction pipeline, Blender as an isolated cleanup/GLB export step, and the current World Explorer mapped building as the permanent identity, placement, collision, entrance, property, POI, and fallback authority.

The capture is a reviewed visual representation. It never becomes the building record and raw photogrammetry never becomes collision or navigation.

## Current-code audit

- `app/js/world/load-building-pass.js` creates stable source building IDs and canonical mapped footprints.
- `app/js/world/building-facade-entrances.js` and `app/js/building-entry.js` own exterior-door association and proximity-based entry.
- `app/js/interiors.js` and `app/js/interiors/runtime.js` own mapped/generated interior shells, walking surfaces, and proxy collision.
- `app/js/editable-world/runtime.js` already suppresses individual faces in batched building meshes, so community visuals share reference-counted presentation suppression instead of deleting the procedural building.
- `functions/index.js`, Firestore, Auth, the account admin workspace, and the existing moderation role are the correct trust boundary. The older contribution API accepts a caller-provided photo URL and is not suitable for private interior originals.
- The current model catalog is static and curated. Community assets therefore use a separate dynamic `buildingRepresentations` registry with the same stable-ID, provenance, budget, review, and collision-policy principles.

## Tool comparison

| Candidate | Fit | Decision |
| --- | --- | --- |
| AliceVision Meshroom | Complete photogrammetry graph, headless `meshroom_batch`, configurable nodes for meshing/decimation/texturing, MPL-2.0 | Selected for V1. It gives one reproducible open pipeline without binding the application to a copyleft runtime library. |
| COLMAP | Excellent BSD-licensed SfM/MVS, CLI and official Docker images | Strong fallback. It needs more pipeline assembly for cleanup, texture production, and export than Meshroom for this first proof. |
| openMVG | Good MPL-2.0 SfM building block | Not selected alone because V1 also needs dense reconstruction and textured output. |
| OpenMVS | Capable dense reconstruction | Rejected for the initial product pipeline because its AGPL-3.0 obligations add avoidable distribution/service review. |
| RealityCapture / Metashape / hosted scanning APIs | Mature commercial output | Not selected as the authority: cost, account terms, upload privacy, and vendor dependence conflict with the first local/reproducible proof. They remain benchmark candidates only. |
| NeRF / Gaussian splat pipelines | Can preserve view-dependent appearance | Deferred. Current World Explorer navigation, collision, mobile budgets, and GLB runtime are mesh-oriented. |

AliceVision describes Meshroom as a photogrammetric reconstruction pipeline with a command line and releases AliceVision under MPL-2.0. COLMAP documents a general-purpose SfM/MVS CLI, BSD licensing, and Docker images. [AliceVision](https://github.com/alicevision/alicevision), [Meshroom manual](https://meshroom-manual.readthedocs.io/en/latest/), [COLMAP](https://github.com/colmap/colmap), [COLMAP CLI](https://colmap.github.io/cli.html).

## Capture strategy

V1 captures one object at a time:

- exterior: 20–48 normalized photos across eight sides;
- one room: 18–48 normalized photos across the door, walls, and corners;
- every coverage section needs at least two photos;
- guidance asks for roughly two-thirds overlap and warns about blur/exposure;
- a room also records manual width, length, height, and door direction;
- the browser re-encodes accepted camera images to JPEG at a maximum 4096-pixel long edge, stripping EXIF/GPS before upload;
- unfinished normalized photos remain in that browser's IndexedDB until upload or explicit deletion.

The camera control uses the standard file input `capture="environment"` so it works as a progressive mobile capture surface without requiring a long-lived live camera stream. A future live view must remain HTTPS and permission-gated because browser camera access is restricted to secure contexts. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Security and privacy model

The design assumes every image and every client field is untrusted.

1. Auth establishes the account; App Check attests the web client.
2. The backend creates the capture ID and immutable upload prefix.
3. Storage Rules allow that owner to create only random 32-hex `.jpg`/`.webp` objects while the capture is writable. Client read, list, overwrite, metadata update, delete, and all processed-path access are denied.
4. Client re-encoding removes metadata, then the backend independently lists objects, validates count, size, content type, dimensions, and JPEG/WebP magic bytes before queueing.
5. Original files and processed interiors stay private. Backend access is checked against the generic space authority before a 60-second read URL is created. Signed URLs are treated as bearer secrets, because Google documents that anyone holding one can use it until expiry. [Cloud Storage signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls).
6. Moderator photo/model URLs use the same short lifetime and `private, no-store` response policy.
7. Approved public exteriors receive only a ten-minute brokered model URL. Raw photos are never public runtime assets.
8. All client Firestore writes for captures, spaces, grants, requests, and representations are denied; trusted functions own state changes.
9. Owner deletion is allowed only before approval and removes storage objects plus member/session/one-time/request records. Approved removal requires an audited admin workflow.

Firebase supports file-name, size, content-type, metadata, and Firestore-document checks inside Storage Rules. App Check's web guidance recommends reCAPTCHA Enterprise and sending the token in the `X-Firebase-AppCheck` header rather than a URL. [Storage Rules conditions](https://firebase.google.com/docs/storage/security/rules-conditions), [App Check for web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [custom backend protection](https://firebase.google.com/docs/app-check/web/custom-resource). The upload allowlist, random file names, size limits, signature check, quarantine, and later scanning gate also follow the [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

### Interior authority

`privateSpaces/{spaceId}` is deliberately generic and can later cover homes, bases, ships, clubs, or storage rooms. Current modes are:

- `PRIVATE`: owner only;
- `INVITE_ONLY`: active owner-granted members;
- `GUEST_LIST`: persistent co-owner, household, or guest membership;
- `SESSION_GUESTS`: persistent membership or a room-bound session grant;
- `PUBLIC`: authenticated public entry after the owner deliberately changes the mode.

One-time grants are atomically consumed. Session grants are tied to the multiplayer room ID. A public exterior flag never changes this policy.

## Processing architecture

The implemented local worker is `scripts/reality-capture/process-capture.cjs`:

`queued capture → transactional claim → private temporary directory → trusted revalidation → Meshroom → Blender cleanup/decimation/texture resize/normals → embedded GLB → GLB gate → private upload → review_required`

Cleanup removes loose/tiny disconnected components, targets 450,000 triangles, resizes textures to at most 2048 px, regenerates normals, and exports a self-contained GLB. The worker hard-rejects output above 20 MB, 500,000 triangles, an invalid GLB 2 header/scene, or external buffers/images. The Khronos validator is the recommended additional container gate before production. [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator).

The worker is manual for the proof. The production-shaped next host is one Cloud Run Job execution per capture, with one service account limited to capture reads, processed writes, and capture-state updates. Cloud Run Jobs are designed to run and exit; current documentation allows up to seven days per CPU task and one hour for GPU tasks. [Cloud Run Jobs](https://cloud.google.com/run/docs/create-jobs).

No shell receives user-controlled command text. File names, paths, tool binaries, and arguments are server-derived; child processes use `shell: false`; temporary originals use mode `0600` and are removed in `finally`.

## Alignment and representation selection

The draft stores canonical world/building IDs plus a bounded geographic footprint snapshot and mapped entrance when available. The moderator compares the protected model with that footprint, adjusts X/Y/Z offset, Y rotation, and uniform scale, and approves only after visual inspection. The server bounds every transform.

Exterior priority is:

`approved specific community capture → existing curated/specific presentation → procedural mapped building`

The community loader suppresses the old exterior only after the GLB loaded and passed the browser geometry budget. If it fails or the world changes, it is disposed and the procedural geometry remains/restores. Collision, doors, terrain sampling, property, POI tenancy, and world-editor records continue to use the original building.

An authorized interior is drawn inside the existing interior shell. The scan replaces generated visual meshes after load, while current room dimensions, walking surface, exit marker, and simplified colliders remain authoritative. A denied account receives no URL and entry stops at `Private Residence`.

## V1 budget and measurement plan

Current provisional hard gates are 20 MB embedded GLB, 500,000 triangles, 2048 px textures, and 1.5 million browser vertices. Approval should normally target less than 15 MB and 250,000–400,000 triangles; these targets remain provisional until both controlled scans are measured on desktop and a representative phone.

For each proof record: input count/bytes/resolution, registered cameras, reconstruction time/CPU/GPU/memory, raw and final triangles, texture dimensions, GLB bytes, desktop/mobile decode time, peak JS/GPU memory where measurable, frame time near/inside the asset, and visual/alignment defects.

## Bounded Phase 2 ranking — research only

Phase 2 must not begin until the exterior and room proofs pass.

| Rank | Candidate | Benefit | Complexity / compatibility | Decision |
| --- | --- | --- | --- | --- |
| 1 | Smart coverage and quality score | High; prevents doomed uploads on every phone | Medium; can start with local feature/overlap and coverage evidence | First follow-up candidate. Keep advisory until field-calibrated. |
| 2 | Better semi-automatic alignment | High; reduces moderator time | Medium; use footprint, entrance, room dimensions, and reconstruction cameras | Prototype after two proof datasets establish error bounds. |
| 3 | Capture freshness and community corrections | Medium-high for long-term accuracy | Medium; fits representation versioning/moderation | Add after replacement/removal operations exist. |
| 4 | Optional camera pose capture | Potentially high for initialization/alignment | High on the web; pose and camera frames are not uniformly exposed together | Progressive enhancement only, never required. |
| 5 | Automatic two-point measurement | Useful for scale | High and browser/device dependent; keep manual dimensions | Test WebXR hit-test accuracy on supported devices before product work. |
| 6 | Depth-assisted capture | High for difficult rooms | High; WebXR Depth Sensing remains a draft and native ARCore depth varies by device | Optional native/WebXR experiment, not a web baseline. |
| 7 | Automatic capture shutter | Convenience, but safety/blur risks | Medium | Consider only after smart coverage can reliably gate frames. |
| 8 | Structural extraction / multi-room interiors | High eventual value | Very high and touches navigation/privacy | Defer beyond early Phase 2. |
| 9 | Multi-contributor fusion / exterior-interior linking | Broad coverage | Very high identity, consent, merge, and moderation cost | Defer until versioned replacement is proven. |
| 10 | Contributor rewards / captured POIs / change detection | Engagement and freshness | High abuse/economy/truth risk | Research only after moderation metrics exist. |
| 11 | Gaussian splats | Visual potential | Poor current mobile/collision/GLB fit | Do not adopt as the building authority. Benchmark later. |

WebXR Depth Sensing is still an editor's draft and requires device support; ARCore likewise documents device-specific depth capability. That makes depth an enhancement, never a requirement. [WebXR Depth Sensing](https://immersive-web.github.io/depth-sensing/), [ARCore Depth](https://developers.google.com/ar/develop/depth), [WebXR hit testing](https://developer.mozilla.org/en-US/docs/Web/API/XRHitTestSource).

## Known limitations and proof gate

- The staging Firebase project has no initialized Storage bucket or registered App Check key.
- This Mac has no Java runtime, so the new Storage/Firestore emulator rules suite cannot execute here.
- Meshroom, Blender, and Docker are not installed in this work environment.
- No controlled exterior or permitted room photo set was supplied, so reconstruction time, real output quality, scale error, and phone runtime budget are not measured.
- The local implementation therefore does not meet the prompt's final V1 success/stop condition yet. It is a testable, security-shaped implementation awaiting provisioning and two controlled proofs.

No automatic approval, semantic recognition, public raw-photo browsing, scan-derived collision, multi-room capture, rewards, or live crowdsourced merge was added.
