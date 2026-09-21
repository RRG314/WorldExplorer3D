import {rememberCaptureIntent,clearCaptureIntent} from './capture-intent.js';
import {mountCaptureStep} from './workspace-navigation.js';
import {captureWorldScope,sameCaptureBuilding,captureBuildingKey} from '../../../functions/capture-target.mjs';
import './capture-theme.js';
import {captureWorkflow,captureLabel} from './workflow-presentation.js';
import {mountCaptureActivity} from '../../../js/capture-activity.js';
import { worldModificationIdentityForLocation } from '../editable-world/model.js?v=1';
import {
  createRealityCaptureDraft,
  getMyRealityCapture,
  listMyRealityCaptures,
  getRealityCaptureAssetAccess,
  saveRealityCaptureHybridPreview,
  submitRealityCaptureHybrid,
  retryRealityCapture,
  deleteRealityCapture,
  finalizeRealityCaptureUpload,
  normalizeCapturePhoto,
  uploadRealityCapturePhoto
} from '../../../js/community-reality-capture-api.js?v=4';
import { getCurrentUser, observeAuth, signInWithGoogle, signInWithEmailPassword, signOutUser } from '../../../js/auth-ui.js?v=55';
import { captureDraftKey, capturePhoneUrl, mergedCapturePhotos, captureIsEditable } from './capture-session.js?v=1';
import {
  deleteLocalCaptureDraft,
  deleteLocalCapturePhoto,
  loadLocalCaptureDraft,
  saveLocalCaptureDraft,
  saveLocalCapturePhoto
} from './local-draft-store.js?v=1';
import { resolveCanonicalMappedBuilding } from './runtime-contract.js?v=2';
import { captureBuildingContext } from './alignment.js?v=1';
import { photoGuideMarkup } from './photo-guide.js?v=1';
import { getScreenLayoutService } from '../ui/screen-layout.js?v=2';

const EXTERIOR_SECTORS = Object.freeze(['Front', 'Front right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Front left']);
const INTERIOR_SECTORS = Object.freeze(['Door', 'Wall 1', 'Corner 1', 'Wall 2', 'Corner 2', 'Opposite door']);
const MAX_PHOTOS = 48;
let current = null;
let openGeneration = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isCurrent(session) {
  return current === session && getCurrentUser()?.uid === session.uid && !session.abort.signal.aborted;
}

function assertCurrent(session) {
  if (!isCurrent(session)) throw new Error('Capture paused. Reopen it using the same account to continue.');
}

function setBusy(session, busy) {
  session.busy = busy;
  if (isCurrent(session)) render();
}

function allPhotos() {
  return mergedCapturePhotos(current?.photos, current?.remotePhotos);
}

function processingDescription(capture) {
  if(capture?.hybridSubmission||capture?.status==='rejected'){const flow=captureWorkflow(capture);return `${flow.title}. ${flow.note?`Reviewer: ${flow.note} `:''}${flow.next}`;}
  if (capture?.hybridSubmission?.status === 'approved') return 'Your submitted photo walls were approved.';
  if (capture?.hybridSubmission?.status === 'review_required') return 'Your saved photo walls are awaiting approval.';
  if (capture?.status === 'uploaded') return 'Ready to match photos to walls. No reconstruction was started.';
  if (capture?.status === 'queued') return 'Queued for reconstruction. You can close this page and return later.';
  if (capture?.status === 'processing') return 'Processing your 3D model. Your photos are saved; you can return on either device.';
  if (capture?.status === 'review_required') return 'Your reconstruction is ready to inspect below.';
  if (capture?.status === 'processing_failed') {
    const capacity = /capacity/.test(capture.failure?.code || '');
    return capacity ? 'Processing capacity was unavailable. Your photos are still saved for manual placement.' : 'The earlier reconstruction stopped. Your saved photos can still be used for manual placement.';
  }
  return String(capture?.status || 'draft').replaceAll('_', ' ');
}

function renderProgress(session) {
  if (!isCurrent(session)) return;
  const panel = ensurePanel();
  const box = panel.querySelector('[data-capture-processing-status]');
  box.hidden = !session.serverCapture;
  if (!session.serverCapture) return;
  const status = session.serverCapture.status;
  const active = ['queued', 'processing'].includes(status);
  const ready = !!session.serverCapture.processed?.optimizedModelPath;
  const checking = !!session.checkingProgress;
  box.dataset.state = session.progressError ? 'error' : ready ? 'ready' : status;
  box.setAttribute('aria-busy', String(checking));
  panel.querySelector('[data-capture-refresh]').textContent = checking ? 'Checking…' : 'Check uploaded photos and progress';
  panel.querySelector('[data-capture-refresh]').disabled = session.busy || checking;
  panel.querySelector('[data-capture-progress-title]').textContent = checking ? 'Checking your capture…'
    : session.progressError ? 'Could not check right now'
    : session.serverCapture.hybridSubmission ? captureWorkflow(session.serverCapture).title
    : ready ? 'Preview ready · coverage needs review'
    : status === 'processing' ? 'Reconstruction in progress'
    : status === 'queued' ? 'Waiting to start'
    : status === 'processing_failed' ? 'Needs attention' : captureWorkflow(session.serverCapture).title;
  panel.querySelector('[data-capture-server-status]').textContent = session.progressError
    ? 'The status could not be refreshed. This does not mean your upload was lost. Check again when your connection returns.'
    : session.serverCapture.reconstructionSourceCaptureId ? 'This reconstruction test reused your earlier photo set. Choose Open my original photos below to view them or take more.'
    : `${session.remotePhotos.length} photos uploaded · ${processingDescription(session.serverCapture)}`;
  const stamp = session.lastCheckedAt ? new Date(session.lastCheckedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
  panel.querySelector('[data-capture-checked]').textContent = stamp ? `Last successful check: ${stamp}` : '';
  panel.querySelector('[data-capture-progress-help]').textContent = session.serverCapture.hybridSubmission ? captureWorkflow(session.serverCapture).next
    : ready ? 'Choose View my 3D result below to inspect it.'
    : active ? 'This page checks every 15 seconds while visible. You can close it and return later. No reliable percentage or finish time is available yet.'
    : status === 'processing_failed' ? 'Use Match photos to building sides below. Public reconstruction is not available.'
    : 'Choose Save and place photos to match your pictures to this building. No 3D reconstruction is started.';
  panel.querySelector('[data-capture-progress-meter]').hidden = !active || !!session.progressError;
}

function ensurePanel() {
  let panel = document.getElementById('realityCapturePanel');
  if (panel) return panel;
  panel = document.createElement('dialog');
  panel.id = 'realityCapturePanel';
  panel.className = 'realityCapturePanel';
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('aria-label', 'Improve this place with photos');
  panel.setAttribute('role', 'dialog');
  panel.innerHTML = `
    <header><div><span>COMMUNITY REALITY CAPTURE</span><strong>Improve this place</strong></div><button type="button" data-capture-close aria-label="Close">×</button></header>
    <div class="realityCaptureScroll">
      <section class="realityCaptureTarget"><span>SELECTED MAPPED BUILDING</span><strong data-capture-label></strong><small data-capture-id></small></section>
      <section class="realityCaptureHandoff">
        <strong data-capture-account></strong>
        <p>Take or choose photos, place them, then submit your saved improvement for review—all on this device. Saving alone does not submit it.</p>
        <details><summary>Use another device (optional)</summary>
        <p>Your saved photos stay with this account. You do not need a computer.</p>
        <button type="button" data-capture-phone>Create a phone link</button>
        <div data-capture-link-box hidden><canvas data-capture-qr aria-label="Scan to continue this capture on your phone"></canvas><a data-capture-link></a><button type="button" data-capture-copy>Copy phone link</button></div>
        </details>
        <button type="button" data-capture-refresh hidden>Check uploaded photos and progress</button>
        <section data-capture-processing-status class="realityCaptureProcessingStatus" role="status" aria-live="polite" aria-atomic="true" hidden>
          <strong data-capture-progress-title></strong>
          <p data-capture-server-status></p>
          <progress data-capture-progress-meter aria-label="Reconstruction in progress; completion percentage unavailable" hidden></progress>
          <small data-capture-checked></small>
          <p data-capture-progress-help></p>
        </section>
        <button type="button" data-capture-retry hidden>Retry reconstruction with my saved photos</button>
        <button type="button" class="captureGuidedCameraButton" data-capture-source hidden>Open my original photos</button>
      <section data-capture-additional hidden><p>Your submitted version stays unchanged. Continue editing a new version with your saved photos and placements.</p><button type="button" class="captureGuidedCameraButton" data-capture-new-set>Continue improving this building</button></section>
      </section>
      <section data-capture-result hidden aria-label="Your reconstruction">
        <h2>Reconstruction preview</h2>
        <p>This is your private result. Inspect coverage before it is reviewed for use in the world. Missing surfaces are not automatically filled with invented details.</p>
        <p data-capture-registration role="status"></p>
        <button type="button" data-capture-preview>View my 3D result</button>
        <div data-capture-viewer></div>
        <div data-capture-viewer-controls hidden>
          <button type="button" data-viewer-action="rotate">Rotate</button>
          <button type="button" data-viewer-action="closer">Zoom in</button>
          <button type="button" data-viewer-action="farther">Zoom out</button>
          <button type="button" data-viewer-action="reset">Reset view</button>
        </div>
      </section>
      <button type="button" data-capture-hybrid hidden>Match photos to building sides</button>
      <div class="realityCaptureKinds" role="tablist" aria-label="Capture type">
        <button type="button" data-capture-kind="exterior" role="tab">Exterior</button>
        <button type="button" data-capture-kind="interior_room" role="tab">Home interior</button>
      </div>
      <label class="realityCaptureConsent" data-facade-choice hidden><input data-exterior-facade type="checkbox" checked> <span>Photograph only the sides you can safely access.</span></label>
      <details data-building-details class="captureVisualGuide"><summary>Advanced · building details and measurements (optional)</summary>
        <p>Leave unknown details blank. These are your observations, not verified map data. They do not automatically resize the building or reconstruction.</p>
        <div class="realityCaptureGrid">
          <label>Floors<input data-building-floors type="number" min="1" max="200" step="1"></label>
          <label>Units<input data-building-units type="number" min="1" max="2000" step="1"></label>
          <label>Building height (m)<input data-building-heightMeters type="number" min="1" max="1200" step="0.01"></label>
          <label>Roof shape<select data-building-roofShape><option value="unknown">Not sure</option><option value="flat">Flat</option><option value="gabled">Pitched / gabled</option><option value="hipped">Hipped</option><option value="other">Other</option></select></label>
          <label>What did you measure?<input data-building-referenceLabel maxlength="100" placeholder="Door frame, brick to brick"></label>
          <label>Reference width (m)<input data-building-referenceWidthMeters type="number" min="0.01" max="2000" step="0.001"></label>
          <label>Reference height (m)<input data-building-referenceHeightMeters type="number" min="0.01" max="2000" step="0.001"></label>
        </div>
        <p>Measurements are saved with this capture. After it is shared to your phone, these details are read-only for this draft.</p>
      </details>
      <section class="realityCaptureSafety">
        <strong data-capture-safety-title>Capture only from places you may legally access.</strong>
        <p data-capture-safety-copy>Stay on safe public access, do not photograph people, license plates, screens, documents, or security details. Photos are normalized on this device to remove EXIF and GPS metadata before upload.</p>
      </section>
      <section class="realityCaptureRoom" hidden>
        <p>Design the floor plan on a grid, then enter each room and choose photos for its walls and floor.</p>
        <details><summary>Advanced · starting room measurements</summary><div class="realityCaptureGrid">
          <label>Room name<input data-room-label maxlength="100" value="Living room"></label>
          <label>Room type<select data-room-type><option value="living_room">Living room</option><option value="bedroom">Bedroom</option><option value="kitchen">Kitchen</option><option value="office">Office</option><option value="other">Other</option></select></label>
          <label>Width (m)<input data-room-width type="number" min="1.5" max="80" step="0.1" value="4"></label>
          <label>Length (m)<input data-room-length type="number" min="1.5" max="80" step="0.1" value="6"></label>
          <label>Height (m)<input data-room-height type="number" min="1.8" max="12" step="0.1" value="2.7"></label>
          <label>Door direction<input data-room-direction type="number" min="0" max="359" step="1" value="0"></label>
        </div></details>
        <label class="realityCaptureConsent"><input data-room-permission type="checkbox"> <span>I have permission to capture and upload this interior.</span></label>
      </section>
      <section class="realityCaptureGuide">
        <div><span>PHOTOS</span><strong data-capture-count>0 photos</strong></div>
        <p data-capture-instruction></p>
        <details class="captureVisualGuide" open><summary>Where to stand and how to frame photos</summary><div data-capture-photo-guide></div></details>
        <div class="realityCaptureSectors" data-capture-sectors></div>
        <button type="button" class="captureGuidedCameraButton" data-capture-live-camera>Open guided camera</button>
        <label class="realityCaptureCamera"><input data-capture-video type="file" accept="video/*" capture="environment"><span>Record or choose a short video</span></label>
        <p>Video: up to 90 seconds / 150 MB. Keep one lens and walk slowly around corners. Frames stay on this device until you upload them; no video or audio is uploaded. Review the extracted photos—frame count does not prove complete coverage.</p>
        <label class="realityCaptureCamera">
          <input data-capture-input type="file" accept="image/*" multiple>
          <span>Add photos from your library</span>
        </label>
        <button type="button" data-capture-reuse>Reuse saved or device photos</button>
        <p class="realityCaptureQuality" data-capture-quality>No photos leave this device until you save or upload them.</p>
        <details data-capture-gallery><summary>View saved and new photos</summary><div data-capture-photo-grid></div><button type="button" class="captureGuidedCameraButton" data-photo-prev>Previous photos</button><span data-photo-page></span><button type="button" class="captureGuidedCameraButton" data-photo-next>Next photos</button></details>
      </section>
      <label class="realityCaptureConsent"><input data-public-contribution type="checkbox"> <span>After review, I want this capture considered as a public visual improvement. This never makes a residential interior public.</span></label>
      <section class="realityCaptureActions">
        <button type="button" data-capture-cancel>Delete draft</button>
        <button type="button" data-capture-save>Save photos to account</button>
        <button type="button" data-capture-upload class="primary">Save and place photos</button>
      </section>
      <div class="realityCaptureProgress" data-capture-progress hidden><span></span><i></i></div>
      <p class="realityCaptureStatus" data-capture-status role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(panel);
  // Keep the mode, its primary action and any permission/error together.
  // Reuse the existing controls and authority; do not create a second launcher.
  const workspace=document.createElement('section');workspace.dataset.captureWorkspace='';workspace.className='realityCaptureHandoff';
  const help=document.createElement('p');help.dataset.captureWorkspaceHelp='';
  const permission=panel.querySelector('[data-room-permission]').closest('label');permission.dataset.captureWorkspacePermission='';
  const launch=panel.querySelector('[data-capture-hybrid]');launch.classList.add('captureGuidedCameraButton');launch.style.width='100%';launch.style.minHeight='48px';
  workspace.append(panel.querySelector('.realityCaptureKinds'),help,permission,launch,panel.querySelector('[data-capture-status]'));
  panel.querySelector('.realityCaptureTarget').after(workspace);
  if(['localhost','127.0.0.1'].includes(location.hostname)){const diagnostic=document.createElement('p');diagnostic.textContent='Local preview · account operations require browser verification. Use the staging app to test saving across devices. ';const staging=document.createElement('a');staging.href='https://we3d-staging-20260712.web.app/app/capture.html';staging.textContent='Open staging contributions';diagnostic.append(staging);workspace.append(diagnostic);}
  const library=document.createElement('button');library.type='button';library.textContent='My contributions';library.dataset.captureLibrary='';
  panel.querySelector('.realityCaptureScroll').prepend(library);
  library.onclick=()=>{if(current&&!current.busy)void openRealityCaptureLibrary(current.appCtx);};
  panel.addEventListener('cancel', event => { event.preventDefault(); closeRealityCapture(); });
  panel.querySelector('[data-capture-close]').addEventListener('click', closeRealityCapture);
  panel.querySelector('[data-capture-cancel]').addEventListener('click', clearDraft);
  panel.querySelector('[data-capture-upload]').addEventListener('click', () => uploadDraft(true));
  panel.querySelector('[data-capture-save]').addEventListener('click', () => uploadDraft(false));
  panel.querySelector('[data-capture-input]').addEventListener('change', addPhotos);
  panel.querySelector('[data-capture-reuse]').onclick=async()=>{const session=current;if(!session||session.busy)return;if(!captureIsEditable(session.serverCapture)){panel.querySelector('[data-capture-status]').textContent='Choose Continue improving this building before adding photos to a submitted version.';return;}try{const {chooseReusablePhotos}=await import('./photo-reuse.js');const files=await chooseReusablePhotos({uid:session.uid,building:session.target,captureId:session.serverCapture?.captureId,kind:session.kind,signal:session.abort.signal});assertCurrent(session);if(files.length)await addPhotos({target:{files,value:''}});}catch(e){if(isCurrent(session))panel.querySelector('[data-capture-status]').textContent=e.message;}};
  panel.querySelector('[data-capture-video]').addEventListener('change', importVideo);
  panel.querySelector('[data-exterior-facade]').addEventListener('change', () => {
    if (!current || current.serverCapture) return;
    current.exteriorScope = panel.querySelector('[data-exterior-facade]').checked ? 'facade' : 'building';
    render(); persist().catch(error => { panel.querySelector('[data-capture-status]').textContent = error.message; });
  });
  panel.querySelector('[data-capture-live-camera]').addEventListener('click', async () => {
    const session = current;
    if (!session || session.busy || !captureIsEditable(session.serverCapture)) return;
    try {
      const { openCaptureCamera } = await import('./live-camera.js?v=1');
      assertCurrent(session);
      await openCaptureCamera({ kind: session.kind, viewLabel: sectors()[session.activeSector], signal: session.abort.signal,
        onPhoto: async file => {
          if (!isCurrent(session)) return 0;
          const accepted = await addPhotos({ target: { files: [file], value: '' } });
          const last = session.photos.at(-1);
          return { accepted, id: accepted ? last?.id : '', quality: accepted ? last?.quality : null };
        },
        onRetake: async id => {
          assertCurrent(session);
          if (session.uploadedPhotoIds.has(id) || !captureIsEditable(session.serverCapture)) throw Error('This photo is already uploaded and cannot be retaken here.');
          await deleteLocalCapturePhoto(session.draftId, id);
          assertCurrent(session);
          session.photos = session.photos.filter(photo => photo.id !== id);
          await persist(session); render();
        } });
    } catch (error) { if (isCurrent(session)) panel.querySelector('[data-capture-status]').textContent = error.message; }
  });
  panel.querySelector('[data-capture-phone]').addEventListener('click', continueOnPhone);
  panel.querySelector('[data-capture-refresh]').addEventListener('click', refreshCapture);
  panel.querySelector('[data-capture-source]').addEventListener('click', () => {
    const id=current?.serverCapture?.reconstructionSourceCaptureId;
    if(id)void openRealityCaptureSession(id).then(()=>{
      if(location.pathname.endsWith('/capture.html'))history.replaceState(history.state,'',`#capture=${encodeURIComponent(id)}`);
    }).catch(error=>{panel.querySelector('[data-capture-status]').textContent=error.message;});
  });
  panel.querySelector('[data-capture-new-set]').addEventListener('click', async () => {
    const session=current;if(!session||session.busy)return;
    setBusy(session,true);
    try {
      const response=await createRealityCaptureDraft({...draftInput(session),sourceCaptureId:session.serverCapture.continuationReady===false?session.serverCapture.sourceCaptureId:session.serverCapture.captureId,publicContributionRequested:false});
      assertCurrent(session);
      await openRealityCaptureSession(response.capture.captureId);
      if(location.pathname.endsWith('/capture.html'))history.replaceState(history.state,'',`#capture=${encodeURIComponent(response.capture.captureId)}`);
      ensurePanel().querySelector('[data-capture-status]').textContent='Your editable version is ready with your saved photos and placements. The submitted version is unchanged. Add photos or continue editing.';
    }catch(error){if(isCurrent(session))panel.querySelector('[data-capture-status]').textContent=error.message;}
    finally{setBusy(session,false);}
  });
  panel.querySelector('[data-capture-gallery]').addEventListener('toggle',()=>{if(current)render();});
  for(const [selector,delta] of [['[data-photo-prev]',-1],['[data-photo-next]',1]])panel.querySelector(selector).addEventListener('click',()=>{if(current){current.photoPage=Math.max(0,(current.photoPage||0)+delta);render();}});
  panel.querySelector('[data-capture-retry]').addEventListener('click', async () => {
    const session = current;
    if (!session || session.busy) return;
    setBusy(session, true);
    try {
      const acknowledgement = await retryRealityCapture(session.serverCapture.captureId);
      assertCurrent(session);
      // Once the server accepts a retry, do not leave the previous failure on
      // screen if the following progress request is delayed or disconnected.
      session.serverCapture = { ...session.serverCapture, status: acknowledgement.status, failure: null };
      panel.querySelector('[data-capture-server-status]').textContent = processingDescription(session.serverCapture);
      render(); scheduleProgress(session);
      try { await fetchProgress(session); }
      catch (error) { if (isCurrent(session)) panel.querySelector('[data-capture-status]').textContent = 'Retry accepted. Your photos are saved; progress will reconnect automatically.'; }
    }
    catch (error) { if (isCurrent(session)) panel.querySelector('[data-capture-status]').textContent = error.message; }
    finally { setBusy(session, false); }
  });
  panel.querySelector('[data-capture-preview]').addEventListener('click', previewResult);
  panel.querySelector('[data-capture-hybrid]').addEventListener('click', previewHybrid);
  panel.querySelectorAll('[data-viewer-action]').forEach(button => button.addEventListener('click', () => {
    const viewer = current?.viewer;
    if (button.dataset.viewerAction === 'rotate') viewer?.rotate();
    if (button.dataset.viewerAction === 'closer') viewer?.zoom(0.8);
    if (button.dataset.viewerAction === 'farther') viewer?.zoom(1.25);
    if (button.dataset.viewerAction === 'reset') viewer?.reset();
  }));
  panel.querySelector('[data-capture-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(panel.querySelector('[data-capture-link]').href);
      panel.querySelector('[data-capture-status]').textContent = 'Phone link copied. Sign in with the same account on your phone.';
    } catch { panel.querySelector('[data-capture-status]').textContent = 'Select and copy the link above.'; }
  });
  panel.querySelectorAll('[data-capture-kind]').forEach((button) => button.addEventListener('click', () => switchKind(button.dataset.captureKind)));
  panel.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-photo]');
    if (remove && current && !current.busy && captureIsEditable(current.serverCapture)) {
      const session = current;
      const id = remove.dataset.removePhoto;
      if (!session.uploadedPhotoIds.has(id)) void deleteLocalCapturePhoto(session.draftId, id).then(() => {
        if (!isCurrent(session)) return;
        session.photos = session.photos.filter(photo => photo.id !== id);
        render();
      });
      return;
    }
    const sectorButton = event.target.closest('[data-sector-index]');
    if (!sectorButton || !current || current.busy) return;
    current.activeSector = Number(sectorButton.dataset.sectorIndex) || 0;
    render();
  });
  return panel;
}

export function buildTarget(appCtx, target) {
  const position = target.position || target.object?.position || { x: 0, z: 0 };
  const geo = appCtx.worldToLatLon?.(finite(position.x), finite(position.z)) || appCtx.worldToGeo?.(finite(position.x), finite(position.z)) || appCtx.LOC || {};
  const building = resolveCanonicalMappedBuilding(appCtx, target);
  const sourceBuildingId = String(building?.sourceBuildingId || '');
  const toGeo = (point) => appCtx.worldToLatLon?.(finite(point?.x), finite(point?.z)) || appCtx.worldToGeo?.(finite(point?.x), finite(point?.z)) || null;
  const footprintGeo = (Array.isArray(building?.pts) ? building.pts : []).slice(0, 64).map(toGeo).filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
  const entrance = appCtx.buildingEntranceByBuilding?.get?.(sourceBuildingId) || null;
  const entranceGeo = entrance ? toGeo(entrance) : null;
  return Object.freeze({
    sourceBuildingId,
    sourceAuthority: String(building?.geometrySource || target.object?.userData?.geometrySource || 'mapped'),
    label: String(target.label || target.object?.userData?.buildingName || 'Mapped building'),
    locationLabel: String(appCtx.LOC?.name || appCtx.LOC?.label || ''),
    worldId: captureWorldScope(worldModificationIdentityForLocation(appCtx.LOC || {})),
    lat: finite(geo.lat, finite(appCtx.LOC?.lat)),
    lon: finite(geo.lon, finite(appCtx.LOC?.lon)),
    footprintGeo,
    entranceGeo,
    spatialContext: captureBuildingContext(building, entrance)
  });
}

async function restore(kind, session = current, capture = null) {
  clearTimeout(session.pollTimer);
  session.viewer?.dispose();
  session.viewer = null;
  const draftId = captureDraftKey(session.uid, session.target, kind, capture?.captureId);
  const restored = await loadLocalCaptureDraft(draftId).catch(() => ({ draft: null, photos: [] }));
  assertCurrent(session);
  session.kind = kind;
  session.exteriorScope = capture?.exteriorScope || restored.draft?.exteriorScope || (capture ? 'building' : 'facade');
  session.draftId = draftId;
  session.activeSector = Math.max(0, Math.min(kind === 'interior_room' ? 5 : 7, finite(restored.draft?.activeSector, 0)));
  session.photos = restored.photos || [];
  session.serverCapture = capture || restored.draft?.serverCapture || null;
  session.remotePhotos = [];
  session.uploadedPhotoIds = new Set(restored.draft?.uploadedPhotoIds || []);
  const panel = ensurePanel();
  panel.querySelector('[data-capture-viewer-controls]').hidden = true;
  const room = capture?.room || restored.draft?.room || {};
  const buildingDetails = capture?.buildingDetails || restored.draft?.buildingDetails || {};
  panel.querySelectorAll('[data-building-details] input, [data-building-details] select').forEach(element => {
    const key = element.getAttributeNames().find(name => name.startsWith('data-building-')).slice('data-building-'.length);
    // HTML attribute names are lowercase; map back to the API field spelling.
    const field = ['floors','units','heightMeters','roofShape','referenceLabel','referenceWidthMeters','referenceHeightMeters'].find(name => name.toLowerCase() === key);
    element.value = buildingDetails[field] ?? (field === 'roofShape' ? 'unknown' : '');
  });
  for (const [selector, value] of Object.entries({
    label: room.label || 'Living room', type: room.type || 'living_room', width: room.widthMeters || 4,
    length: room.lengthMeters || 6, height: room.heightMeters || 2.7, direction: room.entranceDirectionDegrees || 0
  })) panel.querySelector(`[data-room-${selector}]`).value = value;
  panel.querySelector('[data-room-permission]').checked = session.serverCapture?.permissionConfirmed === true || restored.draft?.permissionConfirmed === true;
  panel.querySelector('[data-public-contribution]').checked = session.serverCapture?.publicContributionRequested === true || restored.draft?.publicContributionRequested === true;
  panel.querySelector('[data-capture-link-box]').hidden = true;
  panel.querySelector('[data-capture-server-status]').textContent = '';
  panel.querySelector('[data-capture-status]').textContent = '';
  panel.querySelector('[data-capture-progress]').hidden = true;
  panel.querySelector('.realityCaptureScroll').scrollTop = 0;
  render();
}

function sectors() {
  return current?.kind === 'interior_room' ? INTERIOR_SECTORS : EXTERIOR_SECTORS;
}

function minimumPhotos() {
  return 1;
}

async function loadSavedThumbnail(session,photo,image) {
  session.thumbnailRequests ||= new Map();
  try {
    if(!session.thumbnailRequests.has(photo.id))session.thumbnailRequests.set(photo.id,(async()=>{
      const path=photo.path||`reality-captures/${session.uid}/${session.serverCapture.captureId}/originals/${photo.id}.jpg`;
      const access=await getRealityCaptureAssetAccess(session.serverCapture.captureId,'original',path);assertCurrent(session);
      const response=await fetch(access.url,{cache:'no-store',signal:session.abort.signal});
      if(!response.ok)throw Error('Saved photo unavailable. Close and reopen the photo list to retry.');
      const bitmap=await createImageBitmap(await response.blob());
      try {
        const canvas=document.createElement('canvas'),scale=Math.min(1,240/Math.max(bitmap.width,bitmap.height));
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));
      }finally{bitmap.close();}
    })());
    const blob=await session.thumbnailRequests.get(photo.id);assertCurrent(session);
    if(!image.isConnected||!blob)return;
    if(!session.thumbnailUrls.has(photo.id))session.thumbnailUrls.set(photo.id,URL.createObjectURL(blob));
    image.src=session.thumbnailUrls.get(photo.id);image.alt='Saved photo';
  }catch(error){if(isCurrent(session)&&image.isConnected)image.alt=error.message||'Could not load saved photo';}
  finally{session.thumbnailRequests.delete(photo.id);}
}

function render() {
  const panel = ensurePanel();
  if (!current) return;
  panel.dataset.captureStatus = current.serverCapture?.status || 'draft';
  current.thumbnailUrls ||= new Map();
  const galleryPhotos=allPhotos();
  current.photoPage=Math.min(current.photoPage||0,Math.max(0,Math.ceil(galleryPhotos.length/6)-1));
  const pagePhotos=galleryPhotos.slice(current.photoPage*6,current.photoPage*6+6);
  const ids = new Set(pagePhotos.map(photo => photo.id));
  for (const [id, url] of current.thumbnailUrls) if (!ids.has(id)) { URL.revokeObjectURL(url); current.thumbnailUrls.delete(id); }
  const gallery = panel.querySelector('[data-capture-photo-grid]');
  gallery.replaceChildren();
  pagePhotos.forEach((photo, offset) => {
    const index=current.photoPage*6+offset;
    const item = document.createElement('div');
    if (photo.thumbnail instanceof Blob || current.thumbnailUrls.has(photo.id)) {
      if (!current.thumbnailUrls.has(photo.id)) current.thumbnailUrls.set(photo.id, URL.createObjectURL(photo.thumbnail));
      const image = document.createElement('img');
      image.src = current.thumbnailUrls.get(photo.id); image.alt = `Photo ${index + 1}`; image.loading = 'lazy'; item.appendChild(image);
    } else if(panel.querySelector('[data-capture-gallery]').open) {
      const image=document.createElement('img');image.alt=`Loading saved photo ${index+1}`;item.appendChild(image);
      void loadSavedThumbnail(current,photo,image);
    }
    const label = document.createElement('span'); label.textContent = `Photo ${index + 1} · ${photo.quality?.focus || 'saved'}`; item.appendChild(label);
    if (!current.uploadedPhotoIds.has(photo.id) && captureIsEditable(current.serverCapture)) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.removePhoto = photo.id;
      remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove photo ${index + 1}`); remove.disabled = current.busy; item.appendChild(remove);
    }
    gallery.appendChild(item);
  });
  const photos = allPhotos();
  const sectorList = sectors();
  const bySector = new Map(sectorList.map((_, index) => [index, photos.filter((photo) => photo.sector === index).length]));
  panel.querySelector('[data-capture-label]').textContent = current.target.label;
  panel.querySelector('[data-capture-id]').textContent = current.target.sourceBuildingId;
  panel.querySelector('[data-public-contribution]').closest('label').hidden=current.kind==='interior_room';
  panel.querySelector('[data-capture-count]').textContent = `${photos.length} photos · ${current.remotePhotos.length} saved to account`;
  panel.querySelector('[data-capture-upload]').textContent = current.kind === 'interior_room' ? 'Save room photos' : 'Save and place photos';
  panel.querySelector('[data-capture-account]').textContent = `Account: ${getCurrentUser()?.email || getCurrentUser()?.displayName || 'Signed-in explorer'}`;
  panel.querySelector('[data-capture-refresh]').hidden = !current.serverCapture;
  panel.querySelector('[data-capture-retry]').hidden = true;
  const locked = !captureIsEditable(current.serverCapture);
  panel.querySelector('[data-capture-cancel]').hidden=current.serverCapture?.status==='approved'||!!current.serverCapture?.supersededBy;
  panel.querySelector('[data-capture-live-camera]').style.display=locked?'none':'';
  for(const selector of ['[data-capture-input]','[data-capture-video]'])panel.querySelector(selector).closest('label').style.display=locked?'none':'';
  panel.querySelector('[data-capture-source]').hidden=!current.serverCapture?.reconstructionSourceCaptureId;
  panel.querySelector('[data-capture-additional]').hidden=!locked||!!current.serverCapture?.reconstructionSourceCaptureId;
  panel.querySelectorAll('button:not([data-capture-close]), input, select').forEach((element) => {
    element.disabled = current.busy || (locked && !element.matches('[data-capture-kind], [data-capture-refresh], [data-capture-copy], [data-capture-phone], [data-capture-preview], [data-capture-hybrid], [data-viewer-action], [data-capture-cancel], [data-capture-retry], [data-capture-source], [data-capture-new-set], [data-photo-prev], [data-photo-next]'));
  });
  panel.querySelector('[data-photo-prev]').disabled=current.busy||current.photoPage===0;
  panel.querySelector('[data-capture-library]').disabled=current.busy;
  panel.querySelector('[data-photo-next]').disabled=current.busy||(current.photoPage+1)*6>=galleryPhotos.length;
  panel.querySelector('[data-photo-page]').textContent=galleryPhotos.length?` ${current.photoPage*6+1}–${Math.min((current.photoPage+1)*6,galleryPhotos.length)} of ${galleryPhotos.length} `:'No photos in this set.';
  panel.querySelector('[data-capture-hybrid]').hidden = current.kind === 'exterior' && (!current.remotePhotos.length || !current.serverCapture?.building?.spatialContext?.footprint?.length);
  panel.querySelector('[data-capture-hybrid]').textContent = current.kind === 'interior_room' ? 'Open floor-plan grid' : 'Match photos to building sides';
  panel.querySelector('[data-capture-workspace-help]').textContent=current.kind==='interior_room'?'Draw a known room, then select its walls or floor to add photos. Your interior stays private.':'Choose Home interior to draw your floor plan. For the outside, add photos below, then match them to building sides.';
  panel.querySelector('[data-capture-workspace-permission]').hidden=current.kind!=='interior_room';
  panel.querySelector('[data-capture-result]').hidden = !(current.serverCapture?.hybridSubmission?.modelPath||current.serverCapture?.processed?.optimizedModelPath);
  const manualHome=current.serverCapture?.hybridSubmission?.kind==='home-layout';
  panel.querySelector('[data-capture-result] h2').textContent=manualHome?'Your interior preview':'Your exterior preview';
  panel.querySelector('[data-capture-result] h2 + p').textContent=`${captureWorkflow(current.serverCapture||{}).title}. ${captureWorkflow(current.serverCapture||{}).privacy}. Only the saved version is shown here.`;
  const registration = current.serverCapture?.processed?.registration;
  panel.querySelector('[data-capture-registration]').textContent = current.serverCapture?.hybridSubmission?'Manual photo placement · no paid reconstruction was started.':registration?.status === 'available'
    ? `${registration.registeredCount} of ${registration.submittedCount} photos positioned in 3D. ${registration.registeredCount < registration.submittedCount
      ? 'Some photos could not be positioned; this preview may be incomplete.' : 'Photo matching alone does not confirm that every wall and the roof were reconstructed.'}`
    : 'Coverage unverified: this result has no retained photo-matching report. A finished processing job does not mean a complete building.';
  panel.querySelector('[data-facade-choice]').hidden = true;
  panel.querySelector('[data-building-details]').hidden = current.kind !== 'exterior';
  panel.querySelectorAll('[data-building-details] input, [data-building-details] select').forEach(element => { element.disabled = current.busy || !!current.serverCapture; });
  panel.querySelector('[data-exterior-facade]').checked = current.exteriorScope === 'facade';
  panel.querySelector('[data-exterior-facade]').disabled = current.busy || !!current.serverCapture;
  panel.querySelectorAll('[data-capture-kind], .realityCaptureRoom input:not([data-room-permission]), .realityCaptureRoom select, [data-public-contribution]').forEach((element) => {
    element.disabled = current.busy || (element.matches('[data-capture-kind]') ? false : !!current.serverCapture);
  });
  panel.querySelector('[data-capture-instruction]').textContent = current.kind === 'interior_room'
    ? 'Add photos of your rooms in any order. Open Design your home, choose a room, then click the wall or floor where each photo belongs. Uploading never assigns a photo to a door.'
    : `Photograph the ${sectorList[current.activeSector].toLowerCase()} side. Include the wall edges where possible. One clear photo is enough to start; add other sides later.`;
  panel.querySelector('[data-capture-photo-guide]').innerHTML = '<p>Choose a clear view of the surface you want to improve. One photo is enough to start. Select its actual side in the editor; unassigned photos can be used later.</p>';
  panel.querySelector('[data-capture-photo-guide]').hidden = current.kind === 'interior_room';
  panel.querySelector('.captureVisualGuide').hidden = current.kind === 'interior_room';
  panel.querySelector('[data-capture-sectors]').hidden = true;
  panel.querySelector('[data-capture-sectors]').innerHTML = sectorList.map((label, index) => `
    <button type="button" data-sector-index="${index}" class="${index === current.activeSector ? 'active' : ''} ${bySector.get(index) >= 2 ? 'covered' : ''}">
      <span>${escapeHtml(label)}</span><b>${bySector.get(index)}</b>
    </button>`).join('');
  panel.querySelector('.realityCaptureRoom').hidden = current.kind !== 'interior_room';
  panel.querySelectorAll('[data-capture-kind]').forEach((button) => {
    const active = button.dataset.captureKind === current.kind;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const blurry = current.photos.filter((photo) => ['blurry', 'soft'].includes(photo.quality?.focus)).length;
  const exposure = current.photos.filter((photo) => photo.quality?.exposure !== 'usable').length;
  panel.querySelector('[data-capture-quality]').textContent = current.photos.length
    ? `${current.photos.length} normalized photos saved privately on this device · ${blurry} soft/blurry · ${exposure} exposure warnings`
    : 'New photos stay on this device until you save them to your account.';
  renderProgress(current);
}

async function persist(session = current) {
  if (!session?.draftId) return;
  if (isCurrent(session)) session.form = draftInput(session);
  const input = session.form || {};
  await saveLocalCaptureDraft({
    id: session.draftId, ownerUid: session.uid,
    kind: session.kind, target: session.target, exteriorScope: session.exteriorScope,
    activeSector: session.activeSector, photoCount: session.photos.length,
    serverCapture: session.serverCapture,
    uploadedPhotoIds: [...(session.uploadedPhotoIds || [])],
    room: input.room, permissionConfirmed: input.permissionConfirmed,
    buildingDetails: input.buildingDetails,
    publicContributionRequested: input.publicContributionRequested
  });
}

async function switchKind(kind) {
  if (!['exterior','interior_room'].includes(kind)) return;
  const session = current;
  if (!session || session.busy || kind === session.kind) return;
  setBusy(session, true);
  try {
    await persist(session); assertCurrent(session);
    const result = await listMyRealityCaptures({worldId:session.target.worldId,sourceBuildingId:session.target.sourceBuildingId});
    assertCurrent(session);
    // Older services return the complete owner list when fewer than their
    // documented 60-record cap exists. Filter it below; never infer completeness
    // from a full capped page or silently start a duplicate from that page.
    if(result.buildingScoped!==true&&(!Array.isArray(result.captures)||result.captures.length>=60))throw Error('This account needs the updated capture lookup to safely find this building’s saved work. Your captures are unchanged.');
    if(result.truncated) throw Error('This building has many saved contributions. Open the specific interior from My captures to avoid starting a duplicate.');
    const matches=(result.captures||[]).filter(c=>c.captureKind===kind&&sameCaptureBuilding(c.building,session.target));
    if(matches.length>1) {
      const chooser=document.createElement('dialog');chooser.className='realityCaptureDialog';
      chooser.setAttribute('aria-label','Choose saved work for this building');
      const heading=document.createElement('h2');heading.textContent='Choose your saved work for this building';chooser.append(heading);
      for(const capture of matches){const button=document.createElement('button');button.textContent=captureLabel(capture);button.onclick=()=>{chooser.close(capture.captureId);};chooser.append(button);}
      const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>chooser.close();chooser.append(cancel);document.body.append(chooser);chooser.showModal();
      const abortChoice=()=>chooser.close();session.abort.signal.addEventListener('abort',abortChoice,{once:true});
      const id=await new Promise(resolve=>chooser.addEventListener('close',()=>resolve(chooser.returnValue),{once:true}));session.abort.signal.removeEventListener('abort',abortChoice);chooser.remove();assertCurrent(session);
      if(id)await openRealityCaptureSession(id,session.appCtx);
    } else if(matches.length) await openRealityCaptureSession(matches[0].captureId,session.appCtx);
    else {
      session.resumed=false;
      await restore(kind,session);
      if(session.serverCapture)await fetchProgress(session);
      ensurePanel().querySelector('[data-capture-status]').textContent=kind==='interior_room'?'Add your interior to this same building. Your exterior is unchanged. Interior access stays private.':'Your interior is unchanged. Add exterior photos for this same building.';
    }
  }
  catch (error) { if (isCurrent(session)) ensurePanel().querySelector('[data-capture-status]').textContent = error.message; }
  finally { setBusy(session, false); if(current?.kind===kind){const panel=ensurePanel();panel.querySelector('.realityCaptureScroll').scrollTop=0;panel.querySelector('[data-capture-hybrid]').focus({preventScroll:true});} }
}

async function addPhotos(event) {
  const panel = ensurePanel();
  const files = [...(event.target.files || [])];
  event.target.value = '';
  const session = current;
  if (!session || session.busy || !captureIsEditable(session.serverCapture) || files.length === 0) return;
  const sector = session.activeSector;
  setBusy(session, true);
  const status = panel.querySelector('[data-capture-status]');
  let lastErrorMessage = '';
  let accepted = 0;
  for (let index = 0; index < files.length; index += 1) {
    if (!isCurrent(session)) break;
    if (allPhotos().length >= MAX_PHOTOS) {
      status.textContent = `This V1 capture is limited to ${MAX_PHOTOS} photos. Remove this draft and start again if you need a different set.`;
      break;
    }
    try {
      status.textContent = `Checking photo ${index + 1} of ${files.length}…`;
      const photo = await normalizeCapturePhoto(files[index]);
      assertCurrent(session);
      const saved = { ...photo, sector };
      await saveLocalCapturePhoto(session.draftId, saved, sector);
      assertCurrent(session);
      session.photos.push(saved);
      accepted += 1;
      render();
      await persist();
    } catch (error) {
      lastErrorMessage = error.message || 'That photo could not be used.';
      if (isCurrent(session)) status.textContent = lastErrorMessage;
    }
  }
  if (isCurrent(session)) status.textContent = accepted > 0
    ? `${session.photos.length} photos are saved on this device. Select the next side yourself when you move.${lastErrorMessage ? ` Last issue: ${lastErrorMessage}` : ''}`
    : (lastErrorMessage || 'No photos were added.');
  setBusy(session, false);
  return accepted;
}

async function importVideo(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  const session = current;
  if (!file || !session || session.busy || !captureIsEditable(session.serverCapture)) return;
  const remaining = MAX_PHOTOS - allPhotos().length;
  const status = ensurePanel().querySelector('[data-capture-status]');
  if (remaining <= 0) { status.textContent = 'This capture already has 48 photos. No video frames were added.'; return; }
  setBusy(session, true);
  const sector = session.activeSector;
  try {
    const {extractVideoFrames} = await import('./video-frames.js?v=1');
    status.textContent = 'Reading video on this device…';
    const result = await extractVideoFrames(file, {signal:session.abort.signal, maxFrames:Math.min(remaining,48),
      onFrame: async (frame, metadata) => {
        const photo = await normalizeCapturePhoto(frame); assertCurrent(session);
        const saved = {...photo, sector, inputOrigin:{kind:'video-frame',timestampSeconds:metadata.timestampSeconds}};
        await saveLocalCapturePhoto(session.draftId, saved, sector); assertCurrent(session);
        session.photos.push(saved);
      },
      onProgress: progress => {if(isCurrent(session)) status.textContent = `Checking video frames ${progress.checked}/${progress.total} · ${progress.kept} saved on this device`;}
    });
    await persist(session); assertCurrent(session);
    status.textContent = `${result.kept} video frames saved locally; ${result.duplicates} near-duplicates skipped. Review photos and remove blurred or unwanted frames before uploading. No reconstruction has started.`;
  } catch(error) { if(isCurrent(session)) status.textContent = `${error.message} Frames already saved remain in this draft.`; }
  finally { setBusy(session,false); }
}

function roomInput(panel, selector, fallback) {
  return panel.querySelector(selector)?.value || fallback;
}

function draftInput(session) {
  const panel = ensurePanel();
  const permissionConfirmed = panel.querySelector('[data-room-permission]').checked;
  return {
    captureKind: session.kind, building: session.target, permissionConfirmed,
    exteriorScope: session.exteriorScope,
    buildingDetails: session.serverCapture?.buildingDetails || Object.fromEntries(['floors','units','heightMeters','roofShape','referenceLabel','referenceWidthMeters','referenceHeightMeters'].map(key => [key, panel.querySelector(`[data-building-${key}]`).value])),
    propertyPermissionConfirmed: permissionConfirmed,
    publicContributionRequested: panel.querySelector('[data-public-contribution]').checked,
    termsVersion: 'reality-capture-v1',
    room: session.kind === 'interior_room' ? {
      label: roomInput(panel, '[data-room-label]', 'Room'), type: roomInput(panel, '[data-room-type]', 'room'),
      widthMeters: finite(roomInput(panel, '[data-room-width]', 4), 4),
      lengthMeters: finite(roomInput(panel, '[data-room-length]', 6), 6),
      heightMeters: finite(roomInput(panel, '[data-room-height]', 2.7), 2.7),
      entranceDirectionDegrees: finite(roomInput(panel, '[data-room-direction]', 0), 0)
    } : null
  };
}

async function ensureServerCapture(session) {
  assertCurrent(session);
  if (session.serverCapture) return;
  const input = draftInput(session);
  if (session.kind === 'interior_room' && !input.permissionConfirmed) throw new Error('Confirm permission for this interior first.');
  const response = await createRealityCaptureDraft(input);
  // Keep the response tied to its original account/draft even if the panel closed.
  session.serverCapture = response.capture;
  await persist(session);
  assertCurrent(session);
}

async function fetchProgress(session) {
  // A manual check can join an in-flight poll; do not issue duplicate requests.
  if (session.progressRequest) return session.progressRequest;
  const request = (async () => {
  const result = await getMyRealityCapture(session.serverCapture.captureId);
  assertCurrent(session);
  session.serverCapture = result.capture;
  session.remotePhotos = result.photos || [];
  session.lastCheckedAt = Date.now();
  session.progressError = false;
  // The server listing, not a previous device's local receipt, is authoritative.
  session.uploadedPhotoIds = new Set(session.remotePhotos.map((photo) => photo.id));
  await persist(session);
  assertCurrent(session);
  ensurePanel().querySelector('[data-capture-server-status]').textContent =
    `${session.remotePhotos.length} photos uploaded · ${processingDescription(result.capture)}`;
  render();
  scheduleProgress(session);
  })();
  session.progressRequest = request;
  try { return await request; }
  finally { if (session.progressRequest === request) session.progressRequest = null; }
}

function scheduleProgress(session) {
  clearTimeout(session.pollTimer);
  if (!isCurrent(session) || !['queued', 'processing'].includes(session.serverCapture?.status)) return;
  session.pollTimer = setTimeout(async () => {
    if (!isCurrent(session)) return;
    if (!document.hidden && !session.busy) {
      try { await fetchProgress(session); }
      catch { if (isCurrent(session)) { session.progressError = true; renderProgress(session); } }
    }
    scheduleProgress(session);
  }, 15000);
}

async function previewHybrid() {
  const session=current;if(!session||session.busy)return;
  setBusy(session,true);
  try {
    await ensureServerCapture(session);assertCurrent(session);
    const {openHybridEditor}=await import('./hybrid-editor.js?v=1');
    const {openHomeLayoutEditor}=session.kind==='interior_room'?await import('./home-layout-editor.js'):{};assertCurrent(session);
    session.hybridEditor?.close();
    session.hybridEditor=await (openHomeLayoutEditor||openHybridEditor)({capture:session.serverCapture,photos:session.remotePhotos,signal:session.abort.signal,inWorld:!!session.appCtx,onClose:()=>{if(isCurrent(session)){render();ensurePanel().querySelector('[data-capture-hybrid]').focus();}},
      refreshPhotos:async()=>{
        assertCurrent(session);await fetchProgress(session);assertCurrent(session);
        if(session.remotePhotos.length&&['draft','uploading'].includes(session.serverCapture.status)){
          await finalizeRealityCaptureUpload(session.serverCapture.captureId,'manual');await fetchProgress(session);assertCurrent(session);
        }
        return {photos:session.remotePhotos};
      },
      importPhotos:async files=>{
        assertCurrent(session);
        if(!captureIsEditable(session.serverCapture))throw Error('This submitted photo set is preserved. Existing photos can still be placed here. To add new uploads, close this editor and choose Continue improving this building.');
        const accepted=await addPhotos({target:{files,value:''}});assertCurrent(session);
        if(!accepted)throw Error(ensurePanel().querySelector('[data-capture-status]').textContent||'No photos were accepted.');
        await uploadDraft(false);assertCurrent(session);
        if(session.photos.some(photo=>!session.uploadedPhotoIds.has(photo.id)))throw Error(ensurePanel().querySelector('[data-capture-status]').textContent||'Upload incomplete. Photos remain saved on this device.');
        if(['draft','uploading'].includes(session.serverCapture.status))await finalizeRealityCaptureUpload(session.serverCapture.captureId,'manual');
        await fetchProgress(session);assertCurrent(session);
        return {photos:session.remotePhotos};
      },
      loadPhoto:async(id,signal)=>{
        assertCurrent(session);const item=session.remotePhotos.find(p=>p.id===id);if(!item)throw Error('Unknown capture photo.');
        const path=item.path||`reality-captures/${session.uid}/${session.serverCapture.captureId}/originals/${id}.jpg`;
        const access=await getRealityCaptureAssetAccess(session.serverCapture.captureId,'original',path);assertCurrent(session);
        const response=await fetch(access.url,{cache:'no-store',signal});if(!response.ok)throw Error('Unable to open this saved photo.');
        const blob=await response.blob();assertCurrent(session);return blob;
      },submit:async (revision,publicSharing=false)=>{
        assertCurrent(session);
        const result=await submitRealityCaptureHybrid(session.serverCapture.captureId,revision,true,session.kind==='interior_room'?publicSharing===true:true);
        assertCurrent(session);await fetchProgress(session);return result;
      },save:async preview=>{
        assertCurrent(session);const result=await saveRealityCaptureHybridPreview(session.serverCapture.captureId,preview);assertCurrent(session);
        session.serverCapture.hybridPreview=result.preview;await persist(session);return result;
      }});
  }catch(error){if(isCurrent(session))ensurePanel().querySelector('[data-capture-status]').textContent=error.message;}
  finally{setBusy(session,false);}
}

async function previewResult() {
  const session = current;
  if (!session || session.busy || !(session.serverCapture?.hybridSubmission?.modelPath||session.serverCapture?.processed?.optimizedModelPath)) return;
  setBusy(session, true);
  const panel = ensurePanel();
  panel.querySelector('[data-capture-status]').textContent = 'Opening your saved preview…';
  try {
    const access = await getRealityCaptureAssetAccess(session.serverCapture.captureId);
    assertCurrent(session);
    const response = await fetch(access.url, { cache: 'no-store', signal: session.abort.signal });
    if (!response.ok) throw Error('The model could not be downloaded. Please try again.');
    const bytes = await response.arrayBuffer();
    assertCurrent(session);
    if (bytes.byteLength > 20 * 1024 * 1024) throw Error('This model exceeds the preview limit.');
    const { createCaptureViewer } = await import('./result-viewer.js?v=2');
    assertCurrent(session);
    session.viewer?.dispose();
    const submitted=session.serverCapture.hybridSubmission;
    session.viewer = await createCaptureViewer(panel.querySelector('[data-capture-viewer]'), bytes, session.abort.signal,{
      homeLayout:submitted?.kind==='home-layout'?submitted.layout:null,
      exteriorBuilding:submitted?.kind==='facade-patches'?session.serverCapture.building:null,
      patchHeightMeters:submitted?.heightMeters,
      ...(submitted?.kind==='facade-patches'?{alignment:{},spatialContext:session.serverCapture.building?.spatialContext,streetFacingWall:submitted.streetFacingWall}:{})
    });
    assertCurrent(session);
    panel.querySelector('[data-capture-viewer-controls]').hidden = false;
    panel.querySelector('[data-capture-status]').textContent = 'Drag to rotate. Pinch or scroll to zoom. This preview does not change the public world.';
  } catch (error) { if (isCurrent(session)) panel.querySelector('[data-capture-status]').textContent = error.message; }
  finally { setBusy(session, false); }
}

async function refreshCapture() {
  const session = current;
  if (!session?.serverCapture || session.busy) return;
  session.checkingProgress = true;
  session.progressError = false;
  setBusy(session, true);
  const panel = ensurePanel();
  panel.querySelector('[data-capture-processing-status]').scrollIntoView({ block: 'nearest' });
  try { await fetchProgress(session); }
  catch { if (isCurrent(session)) session.progressError = true; }
  finally { session.checkingProgress = false; setBusy(session, false); }
  if (isCurrent(session) && !session.progressError && session.serverCapture?.processed?.optimizedModelPath) {
    panel.querySelector('[data-capture-result]').scrollIntoView({ block: 'nearest' });
    panel.querySelector('[data-capture-preview]').focus({ preventScroll: true });
  }
}

async function continueOnPhone() {
  const session = current;
  if (!session || session.busy) return;
  const panel = ensurePanel();
  setBusy(session, true);
  try {
    // Check reachability before creating a remote draft. Never share loopback URLs.
    capturePhoneUrl('preflight', location.href);
    await ensureServerCapture(session);
    const url = capturePhoneUrl(session.serverCapture.captureId, location.href);
    const { default: qr } = await import('../../vendor/qrcode/qrcode.js');
    assertCurrent(session);
    await qr.toCanvas(panel.querySelector('[data-capture-qr]'), url, { width: 208, margin: 4 });
    assertCurrent(session);
    const link = panel.querySelector('[data-capture-link]');
    link.href = url;
    link.textContent = url;
    panel.querySelector('[data-capture-link-box]').hidden = false;
    panel.querySelector('[data-capture-status]').textContent = 'Scan with your phone camera, then sign in with this same account. Photos saved only on this device are not transferred by the link.';
  } catch (error) {
    if (isCurrent(session)) panel.querySelector('[data-capture-status]').textContent = error.message;
  } finally { setBusy(session, false); }
}

async function uploadDraft(submit = true) {
  const panel = ensurePanel();
  const session = current;
  if (!session || session.busy || !captureIsEditable(session.serverCapture)) return;
  const status = panel.querySelector('[data-capture-status]');
  const progress = panel.querySelector('[data-capture-progress]');
  if (submit && allPhotos().length < minimumPhotos()) {
    status.textContent = 'Add at least one clear photo to start.';
    return;
  }
  const permissionConfirmed = panel.querySelector('[data-room-permission]').checked;
  if (current.kind === 'interior_room' && !permissionConfirmed) {
    status.textContent = 'Interior upload requires confirmation that you have permission.';
    return;
  }
  setBusy(session, true);
  progress.hidden = false;
  try {
    await ensureServerCapture(session);
    await fetchProgress(session);
    if (!captureIsEditable(session.serverCapture)) throw new Error('This capture has already been submitted. Check its progress above.');
    for (let index = 0; index < session.photos.length; index += 1) {
      assertCurrent(session);
      if (session.uploadedPhotoIds.has(session.photos[index].id)) continue;
      status.textContent = `Uploading protected photo ${index + 1} of ${session.photos.length}…`;
      await uploadRealityCapturePhoto(session.serverCapture, session.photos[index], (fraction) => {
        if (!isCurrent(session)) return;
        const overall = (index + fraction) / session.photos.length;
        progress.querySelector('i').style.width = `${Math.round(overall * 100)}%`;
        progress.querySelector('span').textContent = `${Math.round(overall * 100)}%`;
      }, session.abort.signal);
      assertCurrent(session);
      session.uploadedPhotoIds.add(session.photos[index].id);
      await persist(session);
    }
    if (!submit) {
      await fetchProgress(session);
      status.textContent = 'Photos saved privately to your account. Open the same capture on either device to continue. Processing has not started.';
      return;
    }
    status.textContent = 'Checking your photos for manual placement…';
    assertCurrent(session);
    const result = session.serverCapture.status==='uploaded'?{status:'uploaded'}:await finalizeRealityCaptureUpload(session.serverCapture.captureId, 'manual');
    assertCurrent(session);
    status.textContent = `Upload complete. Status: ${result.status}. Originals remain private.`;
    await deleteLocalCaptureDraft(session.draftId);
    assertCurrent(session);
    session.photos = [];
    session.serverCapture.status = result.status;
    await fetchProgress(session);
    render();
  } catch (error) {
    if (isCurrent(session)) status.textContent = error.message || 'Upload stopped safely. Your local draft is still available.';
  } finally {
    setBusy(session, false);
  }
  if (submit && isCurrent(session) && session.serverCapture?.status === 'uploaded') await previewHybrid();
}

async function clearDraft() {
  const session = current;
  if (!session || session.busy || !globalThis.confirm('Delete this capture and its uploaded photos on all devices, plus the local draft here?')) return;
  const panel = ensurePanel();
  setBusy(session, true);
  try {
    if (session.serverCapture?.captureId) await deleteRealityCapture(session.serverCapture.captureId);
    await deleteLocalCaptureDraft(session.draftId);
    assertCurrent(session);
    session.photos = [];
    session.remotePhotos = [];
    session.serverCapture = null;
    session.uploadedPhotoIds = new Set();
    panel.querySelector('[data-capture-link-box]').hidden = true;
    panel.querySelector('[data-capture-status]').textContent = 'Draft deleted.';
    render();
  } catch (error) {
    if (isCurrent(session)) panel.querySelector('[data-capture-status]').textContent = error.message || 'Could not delete the draft.';
  } finally { setBusy(session, false); }
}

function startSession(appCtx, target) {
  const user = getCurrentUser();
  if (!user || user.isAnonymous) throw new Error('Sign in to your World Explorer account before capturing. Use that same account on your phone.');
  if (current) closeRealityCapture({force:true});
  const session = { appCtx, uid: user.uid, target, kind: 'exterior', draftId: '', activeSector: 0,
    photos: [], remotePhotos: [], serverCapture: null, uploadedPhotoIds: new Set(), abort: new AbortController(), busy: false };
  current = session;
  ensurePanel().classList.toggle('captureInWorld',!!appCtx);
  session.unsubscribe = observeAuth((next) => {
    if (current === session && next?.uid !== session.uid) closeRealityCapture({force:true});
  });
  return session;
}

async function requireContributor(appCtx,target=null){
  if(getCurrentUser()&&!getCurrentUser().isAnonymous)return true;
  rememberCaptureIntent(target);
  const dialog=document.createElement('dialog');dialog.className='realityCaptureDialog';dialog.setAttribute('aria-label','Sign in to contribute');
  dialog.innerHTML='<header><h2>Save your contribution</h2></header><p>Sign in to continue with this building on any device.</p><button data-google>Sign in with Google</button><form><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form><p role="status"></p><button data-cancel>Back to world</button>';
  document.body.append(dialog);dialog.showModal();appCtx?.setPauseReason?.('capture-sign-in',true);
  return await new Promise(resolve=>{
    let done=false;const finish=value=>{if(done)return;done=true;clearCaptureIntent();unsubscribe();dialog.close();dialog.remove();appCtx?.setPauseReason?.('capture-sign-in',false);resolve(value);};
    const unsubscribe=observeAuth(user=>{if(user&&!user.isAnonymous)queueMicrotask(()=>finish(true));});
    const login=async action=>{try{dialog.querySelector('[role=status]').textContent='Signing in…';if(getCurrentUser()?.isAnonymous)await signOutUser();await action();}catch(e){dialog.querySelector('[role=status]').textContent=e.message;}};
    dialog.querySelector('[data-google]').onclick=()=>login(signInWithGoogle);
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;void login(()=>signInWithEmailPassword(f.email.value,f.password.value));};
    dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};
  });
}

export async function openRealityCaptureForBuilding(appCtx, buildingTarget) {
  const panel = ensurePanel();
  const target = buildTarget(appCtx, buildingTarget);
  if (!target.sourceBuildingId || !target.worldId) {
    appCtx.showWorldSelectionNotice?.('Capture unavailable', 'Reality capture attaches only to a stable mapped building identity.');
    return false;
  }
  let session;
  try {
    const user=getCurrentUser();
    if(!user||user.isAnonymous){if(!await requireContributor(appCtx,target))return false;return openRealityCaptureForBuilding(appCtx,buildingTarget);}
    const result=await listMyRealityCaptures({worldId:target.worldId,sourceBuildingId:target.sourceBuildingId});
    if(getCurrentUser()?.uid!==user.uid)throw Error('Account changed. Please open this building again.');
    if(result.truncated||(result.buildingScoped!==true&&(!Array.isArray(result.captures)||result.captures.length>=60)))throw Error('Saved work could not be fully checked. Open My contributions before starting another capture.');
    const saved=(result.captures||[]).filter(c=>sameCaptureBuilding(c.building,target));
    const exteriors=saved.filter(c=>c.captureKind==='exterior');
    if(exteriors.length===1)return openRealityCaptureSession(exteriors[0].captureId,appCtx);
    if(saved.length)return openRealityCaptureLibrary(appCtx,target);
    session = startSession(appCtx, target);
    await restore('exterior', session);
  } catch (error) {
    appCtx.showWorldSelectionNotice?.('Could not open contribution', error.message);
    return false;
  }
  panel.classList.add('show');
  panel.showModal();
  mountCaptureStep(panel,{building:session.target,section:session.kind==='interior_room'?'Interior':'Exterior',requestClose:closeRealityCapture});
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('aria-modal', 'true');
  appCtx.setPauseReason?.('reality_capture', true);
  appCtx.clearControlInputState?.('reality-capture-open');
  document.exitPointerLock?.();
  appCtx.screenLayout ||= getScreenLayoutService();
  appCtx.screenLayout.setPanelLayer('reality-capture', true);
  panel.querySelector('[data-capture-close]').focus();
  if (session.serverCapture) void fetchProgress(session).catch(() => {
    if (isCurrent(session)) panel.querySelector('[data-capture-status]').textContent = 'Your saved capture is open. Use Check progress when the connection returns.';
  });
  return true;
}

// One account library, used in the world without replacing it with device-only drafts.
export async function openRealityCaptureLibrary(appCtx=null,target=null) {
  const user=getCurrentUser();
  if(!user||user.isAnonymous){if(!await requireContributor(appCtx,target))return false;return openRealityCaptureLibrary(appCtx,target);}
  if(current){await persist(current);closeRealityCapture({force:true});}
  document.getElementById('realityCaptureLibrary')?.close();
  const dialog=document.createElement('dialog');dialog.id='realityCaptureLibrary';dialog.className=`realityCaptureDialog${appCtx?' captureInWorld':''}`;
  dialog.innerHTML='<header><h2>Reality Capture · My contributions</h2><button type="button" data-close>Back to world</button></header><p>Exterior contributions are reviewed before appearing publicly. Interiors stay private unless you explicitly choose sharing and they are approved.</p><p data-state role="status">Loading your saved contributions…</p><div data-list></div><button type="button" data-refresh>Refresh saved work</button>';
  document.body.append(dialog);dialog.showModal();
  const stopActivity=mountCaptureActivity(dialog,{open:async id=>{try{await openRealityCaptureSession(id,appCtx);dialog.close();}catch(error){dialog.querySelector('[data-state]').textContent=error.message;}}});
  const environment=document.createElement('p');environment.textContent=`Account: ${user.email||user.displayName||'Explorer'} · ${globalThis.WORLD_EXPLORER_FIREBASE_ENV||'configured'} environment. Saved uploads are shared across devices in this environment.`;dialog.querySelector('[data-state]').before(environment);
  appCtx?.setPauseReason?.('reality_capture_library',true);appCtx?.clearControlInputState?.('capture-library-open');document.exitPointerLock?.();
  let disposed=false,request=0;
  const unsubscribe=observeAuth(next=>{if(next?.uid!==user.uid)dialog.close();});
  dialog.addEventListener('close',()=>{disposed=true;request++;unsubscribe();stopActivity();dialog.remove();appCtx?.setPauseReason?.('reality_capture_library',false);appCtx?.clearControlInputState?.('capture-library-close');},{once:true});
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  async function refresh(){
    const token=++request,list=dialog.querySelector('[data-list]'),status=dialog.querySelector('[data-state]');status.textContent='Checking your account…';list.replaceChildren();
    try{
      const result=await listMyRealityCaptures(target?{worldId:target.worldId,sourceBuildingId:target.sourceBuildingId}:undefined);
      if(disposed||token!==request||getCurrentUser()?.uid!==user.uid)return;
      const records=(result.captures||[]).filter(c=>!target||(sameCaptureBuilding(c.building,target)));
      status.textContent=records.length?`${records.length} saved contributions${result.truncated?' · more records exist; this list is incomplete':''}`:'No saved contributions found for this account'+(target?' at this building.':'. Device-only photo batches are separate from uploaded contributions.');
      const buildings=new Map();
      for(const capture of records){
        const building=capture.building||{},key=captureBuildingKey(building);
        let group=buildings.get(key);
        if(!group){group=document.createElement('section');const title=document.createElement('h3');title.textContent=building.label||'Mapped building';const identity=document.createElement('p');identity.textContent=`Building ${building.sourceBuildingId||'unknown'} · ${building.worldId||'world'}`;group.append(title,identity);buildings.set(key,group);list.append(group);}
        const button=document.createElement('button');button.type='button';button.style.cssText='display:block;width:100%;min-height:48px;margin:8px 0;text-align:left';button.textContent=captureLabel(capture);button.onclick=async()=>{button.disabled=true;try{await openRealityCaptureSession(capture.captureId,appCtx);dialog.close();}catch(error){status.textContent=error.message;button.disabled=false;}};group.append(button);
      }
    }catch(error){if(!disposed&&token===request)status.textContent=`Could not load saved contributions: ${error.message}. Your uploads have not been removed.`;}
  }
  dialog.querySelector('[data-refresh]').onclick=refresh;
  if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&appCtx){
    const advanced=document.createElement('details');advanced.innerHTML='<summary>Advanced · device photo batches</summary><p>Recover or organize a local photo batch. These previews have not been uploaded or submitted for approval.</p><button type="button">Open device photo organizer</button>';advanced.querySelector('button').onclick=async()=>{dialog.close();const {openPhotoSurvey}=await import('./survey-ui.js');await openPhotoSurvey({appCtx,building:target});};dialog.append(advanced);
  }
  void import('../../../js/billing.js?v=58').then(m=>m.getAccountOverview()).then(overview=>{
    if(disposed||getCurrentUser()?.uid!==user.uid||!(overview.isAdmin||overview.adminTesterEligible))return;
    const review=document.createElement('button');review.textContent='Review improvements';review.onclick=async()=>{const {openCaptureReview}=await import('./review-dialog.js');await openCaptureReview({appCtx});};dialog.querySelector('header').after(review);
  }).catch(()=>{});
  await refresh();return true;
}

// Server-resolved identity is used on the phone; do not instantiate the Earth renderer.
export async function openRealityCaptureSession(captureId, appCtx = current?.appCtx || null) {
  const generation = ++openGeneration;
  const user = getCurrentUser();
  if (!user || user.isAnonymous) throw new Error('Sign in with the account that started this capture.');
  const result = await getMyRealityCapture(captureId);
  if (generation !== openGeneration || getCurrentUser()?.uid !== user.uid) throw new Error('Account changed. Open the capture again.');
  const session = startSession(appCtx, result.capture.building);
  appCtx?.setPauseReason?.('reality_capture',true);
  appCtx?.screenLayout?.setPanelLayer('reality-capture',true);
  session.resumed = true;
  await restore(result.capture.captureKind, session, result.capture);
  assertCurrent(session);
  session.remotePhotos = result.photos || [];
  session.lastCheckedAt = Date.now();
  session.uploadedPhotoIds = new Set(session.remotePhotos.map((photo) => photo.id));
  const panel = ensurePanel();
  panel.classList.add('show');
  panel.showModal();
  mountCaptureStep(panel,{building:session.target,section:session.kind==='interior_room'?'Interior':'Exterior',requestClose:closeRealityCapture});
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('aria-modal', 'true');
  panel.querySelector('[data-capture-server-status]').textContent = `${session.remotePhotos.length} photos uploaded · ${processingDescription(result.capture)}`;
  render();
  scheduleProgress(session);
  if(location.pathname.endsWith('/capture.html'))history.replaceState(history.state,'',`#capture=${encodeURIComponent(captureId)}`);
  return true;
}

export function closeRealityCapture(options={}) {
  const panel = ensurePanel();
  if(current?.busy&&!options.force){panel.querySelector('[data-capture-status]').textContent='Wait for the current operation to finish before closing.';return;}
  openGeneration++;
  if(options.force)for(const dialog of [...document.querySelectorAll('dialog[open][data-capture-step]')].reverse())dialog.captureStepDispose?.({skipHistory:true});
  if (current) {
    const session = current;
    void persist(session).catch(() => {});
    session.abort.abort();
    clearTimeout(session.pollTimer);
    session.viewer?.dispose();
    for (const url of session.thumbnailUrls?.values() || []) URL.revokeObjectURL(url);
    session.thumbnailUrls?.clear();
    session.unsubscribe?.();
    session.appCtx?.setPauseReason?.('reality_capture', false);
    session.appCtx?.clearControlInputState?.('reality-capture-close');
    session.appCtx?.screenLayout?.setPanelLayer('reality-capture', false);
    current = null;
  }
  panel.classList.remove('show');
  panel.captureStepDispose?.();panel.close();
  panel.removeAttribute('aria-modal');
  panel.setAttribute('aria-hidden', 'true');
  panel.querySelector('[data-capture-link]').removeAttribute('href');
  panel.querySelector('[data-capture-link]').textContent = '';
  panel.querySelector('[data-capture-link-box]').hidden = true;
  panel.querySelector('[data-capture-viewer-controls]').hidden = true;
}
