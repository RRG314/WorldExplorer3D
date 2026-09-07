# Reality Capture and AR: audit and implementation gates

Date: 2026-09-07. Audited baseline: `9565df35`, branch `steven/building-exteriors-local`.
Status: staging capture infrastructure and real upload/dispatch are deployed. Full real-house/room acceptance is still open. Production and GitHub have not been changed.

## Superseding development direction — September 7, 2026

Use [Reality Reconstruction Development Plan](REALITY_RECONSTRUCTION_DEVELOPMENT_PLAN.md) as the current product roadmap and [Reconstruction Decision](REALITY_RECONSTRUCTION_DECISION.md) for the provider evaluation. The owner now requests a serious exterior/interior product plan, with TRELLIS reserved for individual object creation. Do not interpret historical milestones below as completed functionality.

The first public benchmark execution `capture-meshroom-vgwdk` was cancelled at 18:07:36 UTC after roughly 18 minutes of container time without an output. Cancellation was verified; only its matching capture/lease was marked failed/released. No GPU job was restarted during the planning pass. The revised GPU-feature image built successfully (`sha256:2a03f1b5c74b0ae4625867283b7d2d0cc18d3e2862964d359d4f979bcc62c53b`), but it has not established reconstruction quality.

Local, not yet staging-synced: photo thumbnails/removal and failed-job retry; one shared placement helper across the private viewer, moderation and world renderers; captured building-local footprint/entrance/height-evidence snapshot; broker passes context without declaring it server-verified geography; moderation uses a revision-checked transaction and rejects superseded room reviews. The separate continuously spinning/recentered moderation renderer was removed. Current checks: 45 local tests, 14 browser UI checks (labelled transport doubles and synthetic GLB), source/import validation, and inspected phone-sized photo/placement screenshots. These are integration checks, not a real-house/room or physical-phone acceptance claim.

## Staging implementation — current on 2026-09-07

- Test site: `https://we3d-staging-20260712.web.app/app/capture.html`; desktop world uses the same staging host at `/app/`.
- Staging has its own Auth, Firestore, private default Storage bucket, reCAPTCHA Enterprise App Check, capture HTTP endpoints, queue trigger and recovery scheduler. Google sign-in was already enabled; actual email/password sign-in and App Check attestation have now been exercised without debug tokens or auth doubles.
- `reserveRealityCapturePhoto` authorizes at most 48 write-once original names per capture. Storage rules enforce that reservation and owner identity. Backend submission fully decodes the pinned object generation, checks real dimensions/count/bytes, and commits an immutable input manifest with queue admission. Eight drafts/account/day and 32 drafts/project/day bound staging intake; processing admits at most 12 jobs/project/day. These are operational budgets, not licensing locks or a guaranteed dollar cap.
- One lease coordinates queued → processing → review-required/failed. Recovery releases expired work. Cloud Run uses one L4, 4 CPU, 16 GiB, one task, 30-minute timeout and zero task retries. There is no always-on GPU service. The worker identity has no broad Firestore or photo-bucket role: an authenticated backend broker supplies capture-scoped, generation-pinned URLs and a single output upload URL. The old broad-Admin fixture worker entry point now delegates to that worker instead of maintaining a second runtime path.
- `staging-cloud.cjs` is explicitly locked to the existing staging project. Worker build `0c364172-a169-4063-bdf5-b36a9a362446` succeeded. Image digest: `sha256:c891a72ba300ed6675ba4b6b9a8a26827011415beb13ab5cc5384b01e38a79c4` (Meshroom 2023.3.0 and Blender on Ubuntu 22.04). The stable 2025.1.0 GitHub release had no downloadable assets; the existing released 2023.3.0 binary was used, not a silently changing nightly.
- The live browser test exposed missing cross-service IAM despite passing local rules tests. Added the Firebase Rules Firestore Service Agent role to the **staging Storage service agent**, then verified actual uploads. No anonymous/public storage rule was introduced. Shared CORS now accepts App Check headers; private model CORS permits only staging hosts.
- The live phone-sized browser has uploaded 24 normalized images from AliceVision's public `dataset_monstree` benchmark, passed real backend validation, and started execution `capture-meshroom-vgwdk` automatically. This is a private benchmark under a clearly labelled test identity, not a mapped-house or room acceptance claim. Reconstruction/result inspection is still in progress at this checkpoint.
- UI adds a lazy private GLB viewer (orbit, touch zoom, keyboard buttons), automatic 15-second progress checks only while active, cancellation/account-change cleanup, and narrow-screen error wrapping. It never starts a second Earth renderer. Pending captures resume on either device under the same Firebase UID.
- Temporary room grants now expire; returning to PRIVATE blocks old grants; revocation invalidates temporary grants too. These changes have focused execution tests and require the final staging source sync.
- Current focused tests: 40 Node checks; 12 browser UI checks using explicitly labelled transport doubles; two real Storage/Firestore emulator cases. The live cloud path is a separate test and is not replaced by those results. A generic browser check rendered the real staging sign-in page; Chrome reported a third-party `requestStorageAccess` denial, but real sign-in and App Check still succeeded.

Still not accepted: one real house and private room from a physical phone; reconstructed-room wall/floor/door collision alignment; video-tour extraction; private owner review/in-world use/withdrawal as a complete user journey; TRELLIS inference. The private viewer is not evidence that a generated collision proxy matches a scan. Do not call the entire capture/AR feature complete on the basis of this staging upload test.

The earlier dated audit/checkpoint sections below are historical findings. This section supersedes their former “not provisioned” statements; it does not retroactively turn their fixture tests into cloud reconstruction evidence.

Owner clarification: integrate into the app without licensing locks or staging-only feature restrictions; the owner will decide when publication permissions are sufficient. The milestones below are work/verification tracking, not software unlocks. Normal account authorization, capture review and private-home protections remain.

## Current deployment direction (owner clarification, 2026-09-07)

Use the existing **separate staging project** `we3d-staging-20260712` for all test hosting, Auth, database, photo storage, functions and processing. Do not deploy the new capture endpoints, storage rules or game release to production. No production changes have been made.

Billing update (2026-09-07): the owner explicitly approved linking staging to the existing production billing account. The staging billing link was applied and independently read back: `billingEnabled: true`, same billing account as production. Production billing was read before and after and was unchanged. This enables staging pay-as-you-go usage; it is not a fixed-price allowance or a hard spending cap. No GPU job, capture service or app deployment was started by this operation. Earlier unprovisioned-state findings below are historical; storage, App Check, capture endpoints and a real reconstruction worker still need setup and verification.

Phone and desktop must use the same staging URL and staging account during testing. The owner may use the same Google identity, but staging has separate account records and game data; do not copy production users/saves or point staging to live data to avoid that separation. This follows [Firebase's separate-environment guidance](https://firebase.google.com/docs/projects/dev-workflows/overview-environments).

Real local Storage/Firestore emulator verification now runs with installed Java 21 at `/opt/homebrew/opt/openjdk@21/bin/java`. The previous test failed before touching rules because it called a nonexistent `.app()` method on `RulesTestContext`. Replaced it with the supported `.storage()` API and tightened denied assertions to require `storage/unauthorized` rather than any exception. Both emulator cases pass: own write-once upload succeeds; original reads/overwrites, wrong owner/metadata, unsafe MIME and client processed-output writes are denied. Emulators were shut down after the check. This is actual rule execution, not cloud App Check, GPU or physical-phone acceptance.

Earlier predeployment findings: the missing `X-Firebase-AppCheck` CORS header is now repaired. Production has not been provisioned for capture; its earlier API findings do not authorize enabling production services.

## Implemented in this checkpoint

### Phone / desktop continuation (local follow-up, 2026-09-07)

The same Firebase UID owns a capture on both devices. There is no second account, wallet, pairing identity or capture database. Desktop creates the existing private capture, displays a locally rendered QR/link, and the phone signs into the same account before the owner-only `getMyRealityCapture` endpoint resolves building, room and uploaded-photo IDs. The URL contains only a capture ID in its fragment, not a login token, email, photo URL or grant. Wrong-account and nonexistent captures both return 404. Localhost/insecure phone links are rejected because they cannot deliver this computer's app to a phone.

`app/capture.html` is a lightweight capture/account page without the Earth renderer, reachable from Account. It uses the existing capture panel, Firebase Auth and upload API. Partial photo sets can be saved without starting processing; explicit refresh sees progress on either device. Upload retries reconcile against uploaded IDs. Local drafts are UID-scoped; account changes close the panel and cancel active upload work. Async photo work is fenced to its originating session. Unowned legacy local drafts are preserved but are not silently adopted by another signed-in user. Batch import no longer falsely advances coverage sectors.

Actual phone-test provisioning findings (authenticated read-only Google APIs, 2026-09-07):

- Staging web app exists: `we3d-staging-20260712`.
- Cloud Functions API returns 403 `SERVICE_DISABLED`.
- Default Firebase Storage bucket lookup returns 404.
- Billing API returns `billingEnabled: false` and no linked billing account.
- No cloud resources, billing changes or hosting deployment were made. No real reconstruction worker is running.

Execution order to reach the requested outdoor test:

1. **Local cross-device flow:** implement and browser-check desktop → phone sign-in → exact capture → partial upload/retry → desktop progress; test owner-only HTTP boundary separately. Implemented; verification scope below is explicit.
2. **Private test infrastructure:** obtain a spend ceiling and billing-account choice; provision storage/functions/App Check and a reachable HTTPS preview in the same test project. Both devices must use that preview/project. Production accounts and staging accounts are separate environments; do not pretend a localhost production-config session is that preview.
3. **Trusted processing:** freeze decoded upload inputs, bounded job admission/dispatch, restricted processing credentials, timeout and retry budgets. Connect the existing worker to a real GPU and verify on permitted exterior photos. An adapter script is not a running processor.
4. **Playable room:** build the reviewed, measured collision/door/floor representation through the existing interior authority, then validate a real room scan. Current visual overlay does not establish matching room collision and cannot be described as a completed walkable reconstruction.
5. **Physical acceptance:** one actual phone exterior and one actual private room, upload interruption, cross-device resume, private-media denial, real processing result, review and in-world use. Only then call the full feature ready for the owner to test outside.

Remaining limitations: uploaded-photo progress is refreshed explicitly rather than continuously watched; simultaneous device writes still need immutable finalization/job admission hardening; server photo metadata is not decoded-image proof. Video frame extraction, automatic GPU dispatch, private access-grant expiry/revocation and scan-matching room collision remain open. No new licensing gate was introduced.

Local verification: 37 focused Node checks passed, including actual owner-only HTTP handler execution against isolated storage/Firestore doubles. The repaired capture browser test passed 12 checks: desktop QR/link, phone same-account sign-in, wrong-account denial, real JPEG normalization/IndexedDB, honest sector selection, interrupted upload/retry, cross-device progress, reload deduplication, logout cleanup, phone-width layout, 20-photo fixture submission and exact room handoff/permission. Auth and upload transports are explicit doubles; these are not Firebase deployment or GPU acceptance. Desktop, phone and room screenshots were inspected. Source-graph verification found and corrected a duplicated API module-version identity. The old obsolete-startup-selector UI test was replaced, not accepted as evidence.

Research: [Firebase browser authentication persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) is device/origin scoped; sign into the same account on each device rather than transferring credentials in a QR. [node-qrcode](https://github.com/soldair/node-qrcode), pinned at 1.5.4 and locally bundled with its MIT license, creates the handoff QR without a third-party QR web service.

### Earlier integration checkpoint

- Raw-photo access is separated from shared model access in the actual HTTP handler. Interior sharing checks the current approved capture. Finalization queue/failure writes check owner, state and document version transactionally; invalid requests cannot create/regress captures.
- AR operations are cancellation-aware across capability, camera and XR awaits; late camera streams are stopped; backgrounding includes startup; missing hit testing offers explicit 3D fallback. Disposal releases singleton ownership. Existing curated assets and game suspension remain.
- Removed the old `stagingProvisioned` runtime prerequisite; presentation is available by default with normal service-error/procedural fallback. An explicit operator `publicationEnabled: false` remains an operational override, not a license gate.
- Existing worker now selects Meshroom, TRELLIS.2 image generation or TRELLIS.2 mesh texturing. All converge on the same Blender/GLB inspection/review pipeline. Python adapter follows the inspected upstream APIs; CUDA dependencies are not installed and inference is NOT verified.
- Worker output records provider/evidence class, selected reference image, optional model/revision and fixture provenance. TRELLIS uses ONE explicitly selected reference photo, not an asserted multi-view reconstruction. Meshroom uses the submitted set. Output paths are attempt-specific and completion is fenced against deletion/newer attempts. Child processes have an operational timeout; no license checks disable them.
- 36 focused Node checks pass. Of 17 endpoint regression tests, 16 fail against the pre-repair baseline and all pass against current handlers. This establishes real regression sensitivity, not cloud security acceptance.
- Browser: final run passed ten checks including runtime availability; a real phone-width Three.js viewer opened/closed with no page errors. The specimen is visibly rendered; existing quartz material is very bright and is not treated as proof of capture quality. Camera/XR inputs and app context are isolated doubles; full Earth gameplay return and physical AR still need verification. Generic skill initially captured a black startup canvas and finally the globe menu; neither is capture/AR acceptance evidence.
- Source/import graph passes. No transport source changes, cloud deployment or GitHub update.

## Product decision

Keep one Community Reality Capture pipeline. AR is a way to view game content through a device camera; capture deliberately records permitted real surroundings; reconstruction processes submitted observations into candidate assets. These are related capabilities, not interchangeable implementations.

| Concern | Existing owner / integration decision |
| --- | --- |
| Mapped building, footprint, geography, doors, property | Existing world/property/entrance authorities remain authoritative. Capture attaches a versioned representation, never another building. |
| Approved visual assets | Existing capture publication and curated asset loaders; share identity, provenance, budgets, disposal and authorization contracts where relevant. Do not merge unrelated model caches blindly. |
| Player inventory, companions, discoveries | Existing discovery and inventory systems. AR already consumes companion and specimen data; no AR wallet or duplicate progression. |
| Permissions | Existing backend private-space authority, repaired and tested; raw-media permission remains distinct from permission to enter/view a room. |
| Device camera and XR | Existing `app/js/ar/session-service.js`; one exclusive device-session lifecycle, explicit consent and cancellation. Camera display does not grant capture/upload consent. |
| Capture UI and drafts | Existing `app/js/reality-capture/`; account-scoped local media, explicit submission. Reuse validated measurements, not camera screenshots posing as scans. |
| Reconstruction | Existing backend capture/job state and worker, with replaceable provider adapter. Never run it in the Earth render loop or phone. |
| Alignment | Explicit transforms between geographic/building-local coordinates and capture-local metric coordinates. XR session coordinates are temporary and must not overwrite geography. |

Do not create a broad new spatial framework simply to connect these features. Add a shared contract only with named consumers and an actual demonstrated duplication.

## What exists, and what it does not prove

- `app/js/reality-capture/ui.js`: building selection, exterior/room photo guidance, local drafts, upload/status UI. Sector labels and photo counts do not prove real coverage; batch import auto-advances sectors. No complete video-tour reconstruction flow.
- `functions/community-reality-capture.js`, `functions/reality-capture-authority.js`: authenticated endpoints, state transitions, private spaces, moderation, signed asset delivery, representation records. APIs existing does not establish deployed security or reliable processing.
- `storage.rules`: owner-only, write-once photo admission and no direct reads for capture media; aggregate abuse protection and deployed App Check still need verification.
- `scripts/reality-capture/process-capture.cjs`: manually invoked Meshroom → Blender → inspected GLB worker. No demonstrated automatic remote dispatch, recoverable worker lease, or real house reconstruction in this audit.
- Exterior runtime uses an overlay and procedural fallback. Interior runtime displays the scan over generated-room interaction/collision geometry. That does NOT establish a physically playable captured room.
- `app/js/ar/`: shared curated animals, specimens, virtual waterfowl survey; capability tiers for spatial AR, camera overlay and interactive 3D. Main runtime suspends normal simulation while AR owns presentation. This is useful existing separation, not a reason to replace AR.

## Findings and ordered repair work

Severity here concerns the inspected implementation. This audit did not establish which endpoints are deployed or prove an exploit occurred.

### Gate 1 — security before any pilot

1. **High: raw media disclosure through model permission.** `getRealityCaptureAssetAccess` authorizes public exterior viewers or interior guests, then lets `assetKind=original` choose a path under the capture. Restrict originals to their contributor; explicit moderator review remains a separate audited endpoint. Only approved derivatives may be shared, and interior assets must match the space's current capture. Unknown asset kinds and paths outside their exact class must fail closed.
2. **High: unauthorized state mutation on failed finalization.** `finalizeRealityCaptureUpload` catches ownership/state errors and writes `processing_failed` to the requested ID. Missing IDs can create phantom records; rejected requests can regress approved captures. Validate identity first; final queue/failure writes must recheck owner, version and state transactionally, never overwrite concurrent progress.
3. **High: private-space revocation incomplete.** Member revocation does not revoke outstanding one-time/session grants. Grants need expiry, policy version and current session validation; entry and asset delivery need one coherent short-lived authorization decision. Do not equate online-at-grant-time with continued session access.
4. **High: untrusted media/worker boundary.** Supplied image dimensions and magic bytes are insufficient. Decode with pixel/time/memory limits in isolation; validate actual dimensions; reserve upload bytes and photo slots before accepting storage; freeze an exact object-generation/hash manifest. Heavy worker must not inherit broad Firebase admin credentials. Approved URLs must never be permanent Firebase download-token URLs for private data.
5. **High: identity and ownership semantics.** Current capture identity includes launch-world origin; client-supplied building claims are not a trusted map lookup. Bind a canonical source entity plus representation/room version, independent of camera/world origin. Resolve through the existing mapped authority. Virtual property ownership does not prove permission to scan a real home.
6. **High: local draft account separation.** `draftIdFor` includes kind/world/building, not signed-in UID. IndexedDB stores photos by that key. Prevent restoring another account's private draft on shared devices; define logout disposal and deliberate local retention/deletion. Do not silently discard existing user media during migration.
7. **High: fixture provenance and worker completion.** Worker accepts `--fixture-glb` without an environment-specific publication prohibition and does not label synthetic acceptance evidence distinctly. Fixtures may test plumbing only; prohibit their production approval. Add fenced job attempts, timeouts, retry limits, cancellation/deletion tombstones, and compare-and-set completion so stale workers cannot republish deleted captures.
8. Browser availability is not security enforcement. The former staging-only requirement is removed per owner instruction. Keep ownership, moderation, media authorization, request validation and quota accounting in trusted backend code; do not substitute UI switches for those protections.

Privacy design: raw photos private; derived candidates private; exterior publication explicitly opted in after review; rooms owner-only by default. Broader sharing must not expose raw photos, pose metadata or unrelated rooms. Human access to private candidates requires a disclosed, authorized review process. Warnings/redaction assistance for faces, plates, screens, documents and neighbors cannot guarantee detection. Provide contributor withdrawal and asset retirement, retention periods, deletion verification, and minimal audit logs without image bytes or bearer URLs. Revocation stops new access; it cannot erase a model already downloaded by an authorized person.

### Gate 2 — AR reliability, without conflating AR and scanning

Source-confirmed branches to reproduce and repair in `session-service.js` / `presentation.js`:

- `end()` can run while `getUserMedia`, capability detection, or XR initialization is pending. There is no operation-generation check after those awaits. Late completion can install a stream/presentation after cancellation or interfere with a new request. Timeout cleanup alone covers only the timeout case.
- Visibility cleanup only handles phase `active`, not `starting`; page-hide during the permission prompt is uncovered.
- Hit test is optional, but entering spatial mode hides content until placement. With no hit-test source the session reports active, placement button is hidden, and content can remain invisible. Require placement capability or explicitly fall back, not an empty view.
- `activePlatform` is a singleton bound to its original app context and is not reset on disposal. Verify actual app lifecycle before changing it; don't infer duplicate initialization from two callers alone.
- Capability advertises surface placement from immersive-AR support before a usable hit-test source is obtained. Report capability vs actual session availability separately.
- Field challenge is intentionally virtual and local-session-only. No persistent survey reward should be claimed without the existing discovery authority recording it.

Desktop mobile emulation is NOT physical AR evidence. Acceptance includes real supported Android spatial AR, iPhone camera fallback, permission denial, close during permission prompt, background/foreground, rapid reopen, orientation change, pointer cancellation, camera-track shutdown, no upload requests, one active renderer, and return to the game with controls/camera restored. Unsupported devices must have an understandable 3D fallback. Do not run a whole Earth/space matrix repeatedly to investigate a camera-lifecycle race.

### Gate 3 — reconstruction provider benchmark, not a new app

Selected architecture: observation-based geometry/texture projection for buildings and rooms, with generative enhancement optional and explicitly synthetic. The existing Meshroom/Blender baseline and TRELLIS adapters now share the worker. A COLMAP challenger is research only, not implemented. No provider is yet accepted on real quality/cost evidence.

- Exterior first preference: align calibrated photo observations to authoritative building-local geometry and project supported facade textures; use photogrammetric candidate geometry only where it fits mapped bounds and does not interfere with doors/collision. Unseen sides retain procedural appearance, not invented evidence.
- Room: overlapping translated views recover candidate surfaces; review a simplified metric floor/wall/door/obstacle proxy against them. That proxy must integrate through the existing interior/navigation authority. If it cannot represent the scanned room safely, reject playable publication and retain the default interior; a click-through panorama is not acceptance.
- TRELLIS.2 image-to-3D generates assets from an image; it is not proof of measured unseen building geometry. Its existing-mesh texturing example is worth a controlled comparison, including whether normalization/remeshing changes the input shape. Do not let generated materials become mapped truth.
- TRELLIS1 has lower published memory requirements but does not solve scene fidelity, privacy or navigation. Don't switch simply because it fits a smaller GPU.
- Apple RoomPlan can optionally supply parametric room evidence from compatible LiDAR devices, but is a native Swift/ARKit capability, not something the existing browser AR session already supplies. Native capture/export would be a later explicit adapter, not a prerequisite or extra app built now.

Provider input contract to add to the existing worker: immutable capture/attempt ID; canonical target and representation version; object generations/checksums; capture kind; consent/provenance; optional calibrated poses; metric constraints; explicit budgets. Output: private candidate artifact references/hashes, provider/container/model revisions, observed vs inferred regions, calibration/alignment, quality failures, actual processing costs and optimization results. A provider cannot approve, publish, change ownership, or send executable game scripts.

### Gate 4 — licensing and deployment qualification

Checked primary sources on 2026-09-07; this is a technical license inventory, not blanket legal clearance:

| Component | Result / decision |
| --- | --- |
| TRELLIS.2 repository and Microsoft 4B weights | MIT at inspected upstream; retain notices. This does not license all transitive components. |
| Default `pipeline.json` | References Meta DINOv3 and BRIA RMBG-2.0; both need their own review/access. |
| BRIA RMBG-2.0 | Published weights are noncommercial; commercial self-hosting requires agreement. Do not upload private photos to its API as an unapproved workaround. |
| `setup.sh` nvdiffrast v0.4.0 | Inspected pinned license limits use to noncommercial research/evaluation. Current default stack is not cleared for commercial deployment. |
| `setup.sh` nvdiffrec `renderutils` branch | Inspected NVIDIA license also limits use to noncommercial research/evaluation. |
| DINOv3 | Custom license and gated access, not inherited MIT. Full obligations remain a release gate. |
| Other Python/CUDA libraries, Meshroom/AliceVision, Blender, COLMAP and exporters | Require exact pinned-version dependency inventory and distribution/notice review before shipping the worker. Not declared fully cleared here. |

No TRELLIS inference or texturing benchmark has run. The thin adapter is implemented; no fork is selected. A pinned remote environment and real benchmark remain. Licensing findings are information for the owner, not runtime enforcement. A fork would not remove restrictions; replacement dependencies require license/output review. Output rights are not guaranteed merely by an MIT model header; source-media rights and provider/model terms still apply.

### Gate 5 — bounded remote processing

Preferred pilot target, not provisioned: Google Cloud Run GPU Jobs in the approved staging Google project, using a short-lived job identity and private object access. This fits the existing Firebase environment and avoids sending house interiors to an additional provider by default. Benchmark L4 24 GB first if the selected pinned pipeline fits; do not promise it based on model size alone. Jobs need at least 4 CPU / 16 GiB RAM for L4; CPU/RAM/storage/egress and initialization add to GPU charges.

Cloud Run's published no-zonal-redundancy L4 GPU rate is approximately $0.672 per GPU-hour ($0.0001867/second), before other charges and regional differences. A 10-minute job would therefore use about $0.112 in GPU time alone, NOT a quoted house reconstruction price. Compare measured complete jobs with Runpod Flex or Modal only if needed and privacy terms are approved. Do not buy credits or provision an always-on instance.

Before launch: user-approved dollar ceiling; reserve worst-case allowance at admission; one pilot job at a time; enforced timeout and retry cap; idempotent dispatch; no automatic higher-cost GPU fallback; billing alerts in addition to app-enforced limits; private artifacts, limited logs and cleanup. Measure cold start, download, reconstruction, optimization, peak RAM/VRAM, failure and retry cost separately. Required user decisions: staging project/budget authorization and permitted test imagery. No private sample transfer without consent.

### Gate 6 — usable phone capture and playable publication

Exterior pilot instructions (not a claim the current UI implements all coaching): select the exact mapped house, confirm permission, choose exterior; remove people/plates/private-window content from the intended capture area; in even light walk safely around accessible sides with roughly two-thirds overlap and translated viewpoints; keep zoom/lens consistent and include corners/doorway; review sharpness and missing coverage. Start within current 20–48 image limit, but do not claim that count guarantees success. Mark inaccessible/unseen sides for procedural fallback. Do not enter roads, neighboring land or climb for roof photos. Review private media and explicit exterior sharing before submission. After processing, review alignment at the same map entity, test door/collision, revisit and withdraw to verify fallback.

Room pilot instructions: select that building and one permitted room; keep sharing PRIVATE; clear people/documents/screens and personal items, use steady lighting, walk a slow overlapping loop with translated views of walls/corners/floor/doorway rather than rotating at one point; capture useful furniture surfaces without opening private storage. Stay within current 18–48 photo limit for the first trial; video ingestion is not implemented acceptance. Record measured dimensions and identify the entrance. Review private photos before submit. After processing, verify metric size, floor contact, walls/obstacles, doorway/exit and camera behavior. Test owner, denied second account, explicitly invited account, revocation, reload and fallback. A visually attractive mesh with mismatched collision fails.

### Gate 7 — optimization and publication performance

Existing per-file GLB limits are not a complete runtime budget. Validate geometry/buffer bounds, NaNs, primitive modes, external resources/extensions, decompression/texture budgets and malicious files before runtime. Review decoded memory, not just download size. Apply bounded nearby interest sets, LOD, cancellation, aggregate texture/mesh limits and eviction to existing overlay loading; no whole-world scan fetch on every load. Private room assets load only after authorization and entry intent. Failed loading must dispose partial resources and leave procedural visuals and interactions intact.

### Gate 8 — real acceptance and stop

Run one real house exterior and one real private room through phone capture → authenticated upload → isolated validation → real remote provider → optimization → review → publication → reload → use → withdrawal/fallback. Compare TRELLIS reconstruction and mesh texturing with observed reconstruction on permitted data; record failures honestly. Gate general users on actual staging Auth/Storage/Firestore/App Check/access tests, quotas/revocation/deletion, physical phone AR tests, browser visual/interaction evidence, and bounded performance. Source assertions and fixture GLBs are not these tests.

Object scanning, auto-furnishing, a second marketplace, native scanning app, and new gameplay economies remain future work, not implementations in this slice.

## Primary research references

- [TRELLIS.2 repository](https://github.com/microsoft/TRELLIS.2), [MIT license](https://github.com/microsoft/TRELLIS.2/blob/main/LICENSE), [4B model](https://huggingface.co/microsoft/TRELLIS.2-4B), [default pipeline dependencies](https://huggingface.co/microsoft/TRELLIS.2-4B/raw/main/pipeline.json), [installation pins](https://raw.githubusercontent.com/microsoft/TRELLIS.2/main/setup.sh), [mesh texturing example](https://raw.githubusercontent.com/microsoft/TRELLIS.2/main/example_texturing.py).
- [BRIA terms/model card](https://huggingface.co/briaai/RMBG-2.0), [DINOv3 model terms entry](https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m), [nvdiffrast v0.4.0 license](https://raw.githubusercontent.com/NVlabs/nvdiffrast/v0.4.0/LICENSE.txt), [nvdiffrec renderutils license](https://raw.githubusercontent.com/JeffreyXiang/nvdiffrec/renderutils/LICENSE.txt), [TRELLIS1](https://github.com/microsoft/TRELLIS).
- [COLMAP reconstruction and capture guidance](https://colmap.github.io/tutorial), [Apple RoomPlan](https://developer.apple.com/augmented-reality/roomplan/), [WebXR surface hit testing](https://www.w3.org/TR/webxr-hit-test-1/).
- [Cloud Run GPU Jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu), [Cloud Run prices](https://cloud.google.com/run/pricing), [Runpod serverless prices](https://docs.runpod.io/serverless/pricing), [Modal prices](https://modal.com/pricing).
- [OWASP upload protections](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [Firebase App Check](https://firebase.google.com/docs/app-check).
