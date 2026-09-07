# Phone and computer capture pilot

September 7, 2026. Staging only. This is a private capture/reconstruction pilot, not acceptance of the complete world reconstruction roadmap.

## Start on your computer

1. Open https://we3d-staging-20260712.web.app/app/ and sign in with your staging account. Staging does not use your production account saves.
2. Enter an Earth location. In walking mode, click a mapped building and choose **Improve this place**.
3. Check the selected building. Choose **Exterior** or **One room**. For a room, enter its measurements and confirm permission; do not treat the default dimensions as measurements of your house.
4. Choose **Continue on phone**. Scan the QR code and sign in with the same staging account. The link identifies the capture; it does not grant access to another account.

You can also return to https://we3d-staging-20260712.web.app/app/capture.html on either device to find your account's captures. The page links back to the world to select a building.

## Take photos

**Open guided camera** opens the rear camera in the app with framing corners and a grid over the live image. After the first saved shot, **Show previous photo** overlays that frame translucently to help overlap. Blur/exposure warnings appear after capture; **Retake last** removes that local photo so you can replace it. These warnings are estimates, not a reconstruction-quality certificate. **Done**, closing the dialog, changing accounts or leaving the page stops the camera. If permission is denied or the camera is unavailable, **Add photos from your library** remains available.

The expandable diagram explains example positions and the direction to face. It is not a measured map. The live camera uses the selected view label; close it to change that label before photographing a different side.

- Move between shots while keeping substantial shared detail. Aim for about 70% overlap; avoid changing lenses, zoom or orientation during a pass.
- Stop moving before taking each photo. Avoid strong reflections, changing lighting, moving people and private documents/screens.
- Exterior: capture accessible sides with overlapping corner views. Photograph lower and upper rows for taller facades, retaining shared details between rows. Never climb, enter traffic or trespass to capture a roof or hidden side.
- Room: work on one room, with consistent furniture/lighting. Include corners, floor–wall boundaries and the doorway; add overlapping upward/downward views.
- Review local thumbnails and remove unusable photos before uploading. The on-device blur/exposure indicators are heuristics, not proof that reconstruction will succeed.

New exteriors default to **One facade / accessible wall only**. This permits 20 overlapping photos of one visible wall, without demanding hidden sides. Whole-building mode retains its eight view labels; rooms retain six labels and an 18-photo minimum. Labels are user supplied, not solved camera poses. **Save photos to account** permits an incomplete set. Never relabel duplicate views to satisfy intake.

Facade scope persists with the server capture across devices. A facade result is a private surface candidate: it cannot replace the entire mapped exterior through the old whole-building publication path. Registered, clipped facade-patch publication remains development work.

Guidance draws on [Apple's photogrammetry capture guidance](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture); this does not imply an Apple reconstruction engine or building-quality guarantee.

## Upload and inspect

**Save photos to account** saves inputs without starting reconstruction. **Upload for processing** validates the submitted inputs and requests a bounded cloud job. The same record and progress are available on both devices. A failed job keeps its validated photos, with an explicit retry action; accepted retries remain visible if a subsequent progress request loses its connection.

When a real output is ready, **View my 3D result** opens a private interactive preview with rotate, zoom and reset controls. Processing is not instantaneous, and success must be established from the actual output—not from reaching a queued state.

## Evidence and unfinished acceptance

### September 7: first owner building result and next work

The owner's 21-photo exterior capture reached private review, but the supplied result screenshot shows only one gable end, not the requested complete five-unit, two-story complex. Cloud camera initialization confirms all 21 inputs. Facade scope is not passed as a geometry-cropping instruction to Meshroom. Successful input delivery is not successful registration of all views. The worker currently discards its camera-pose/component diagnostics with its temporary directory, so the exact registered-photo count cannot be recovered from the stored GLB alone. Do not blame the photos or prescribe a retake without evidence.

The actual run used one fallback camera-intrinsics group and the default 45-degree initial field of view after normalization removed EXIF. This is a calibration weakness, not a proven sole cause. Blender also removes small disconnected mesh components; before changing filtering, compare pre/post meshes and solved cameras on the same saved inputs. Do not claim a blind retry fixes coverage.

Reference dimensions supplied by the owner: brick-to-brick door opening 40 inches (1.016 m), door leaf width 36 inches (0.9144 m), exterior frame height 82 inches (2.0828 m). Five doors belong to a long two-story complex with a pitched roof. These are user-reported references, not yet applied calibration or verified GIS facts.

Next reconstruction work: retain private per-attempt camera-registration and component diagnostics; distinguish submitted from matched photos; preserve useful non-location calibration metadata under the existing privacy policy; compare raw and optimized results; report partial/unverified coverage visibly; support supplemental views without replacing saved inputs. Full-building coverage requires a geometry/observed-surface check, not only a minimum photo count or valid GLB.

### Check feedback and notification plan

The manual check now gives immediate busy feedback, last successful check time, in-place network failure/recovery, and reveals/focuses the preview action when a model exists. Concurrent manual checks join an existing poll. There is no fabricated percentage or completion estimate. Browser scenarios cover pending, unchanged, failed/recovered and ready states; auth/storage are explicit test doubles.

Background notifications are **planned, not implemented**. Use one authenticated device-subscription authority with opt-in per device, unsubscribe/account-switch cleanup, bounded subscriptions, and server-owned capture completion/failure events. Notifications must contain no address, photo, asset URL or private room detail; clicking opens the authenticated capture, never bypasses access checks. Retry attempts need distinct event identity and deduplication; notification delivery failure must not change reconstruction success. Use the existing Firebase backend with a push service worker that does not cache private capture responses. Validate closed-page delivery, denied permission, expired tokens, cross-account isolation and repeat delivery before claiming desktop/mobile support. On iOS/iPadOS, explain Home Screen installation before requesting permission. In-page status remains available when push is unsupported or declined. No pretend push toggle or unsolicited permission prompt is added in this change.

- Current local browser exercise: 17 focused checks, real DOM/canvas/IndexedDB/QR/viewer, deliberately doubled auth/storage transports. Includes live-camera saving through the existing local capture store and exact-photo retake. Mobile exterior/room guide screenshots visually inspected. Separate actual media/canvas/dialog checks use Chromium's synthetic camera, including frame capture, previous-frame overlay, closing/stopping tracks, session abort and denied permission. A physical phone has not been tested.
- Actual staging Earth selection reached a mapped building. The selection button's overflow and tutorial overlap were then corrected and visually checked at phone width. An explicit selection persists until dismissed; unknown OSM presence tags no longer appear as a building name. Capture loads on demand from the world click router.
- Current focused Node suite: 48 checks passed, including owner isolation, immutable upload validation, retry, facade publication boundaries and private result access. Submitted progress reads use the frozen manifest instead of rereading every photo's Storage metadata.
- Capture uses a native modal and the existing named pause service when opened over the world. Browser checks verify keyboard/gamepad actions are suppressed while capture is active, resume normally afterwards, and a held gamepad action does not fire on close. Other pause reasons are not cleared.
- Actual staging sign-in/App Check, private upload, GPU reconstruction, protected model delivery and browser preview succeeded. The 24-photo public AliceVision `dataset_monstree` sample produced an 18,503,236-byte textured GLB (224,999 triangles, three textures). Phone-sized touch and separate desktop input profiles displayed the same saved model, with rotate/zoom controls and no page errors; both screenshots were inspected. This tree-stump benchmark is not the owner's house or room.
- No physical phone capture, real-house fidelity, full registration, scan-derived room collision or automatic shared-world replacement has been accepted. TRELLIS object inference is not accepted. None of those gaps is closed by the interface tests.

The second real reconstruction reached a textured Meshroom output but exposed a Blender operator mismatch. The next reached textured export but exposed a resized EXR/image-buffer mismatch. The revised build check executes a textured OBJ + 4096px EXR through the actual installed Blender and verifies an embedded 2048px image. Geometry-only export checks were insufficient and are superseded. A live retry also exposed a test predicate that mistook “Processing stopped” for a running state; it now requires the actual retry response and structured state.

The v4 execution `capture-meshroom-ksgg7` completed on September 7 at 19:59 UTC (approximately 22 minutes from execution creation). Its result reached `review_required`; this is private inspection, not world publication. Evidence is in `output/verification/capture-staging-live/report.json` and the two `private-result` screenshots. The subsequent desktop verification reopened that saved output without launching another GPU job. Runtime import validation also caught and corrected a duplicate screen-layout module version; source health and the 17 interface checks passed after correction.

Before broader use, the remaining operations work includes execution-backed cancellation and cleanup of late/orphaned artifacts. Deleting a capture currently fences database completion but is not proof that its compute job has immediately stopped. Do not represent this pilot as the completed privacy/deletion or global-publication acceptance gate.

See `REALITY_RECONSTRUCTION_DEVELOPMENT_PLAN.md` for the remaining development milestones. Production and GitHub publication are outside this pilot.
