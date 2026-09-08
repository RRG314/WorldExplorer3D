import { worldModificationIdentityForLocation } from '../editable-world/model.js?v=1';
import {
  createRealityCaptureDraft,
  getMyRealityCapture,
  getRealityCaptureAssetAccess,
  saveRealityCaptureHybridPreview,
  submitRealityCaptureHybrid,
  retryRealityCapture,
  deleteRealityCapture,
  finalizeRealityCaptureUpload,
  normalizeCapturePhoto,
  uploadRealityCapturePhoto
} from '../../../js/community-reality-capture-api.js?v=4';
import { getCurrentUser, observeAuth } from '../../../js/auth-ui.js?v=55';
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
  if (capture?.status === 'queued') return 'Queued for reconstruction. You can close this page and return later.';
  if (capture?.status === 'processing') return 'Processing your 3D model. Your photos are saved; you can return on either device.';
  if (capture?.status === 'review_required') return 'Your reconstruction is ready to inspect below.';
  if (capture?.status === 'processing_failed') {
    const capacity = /capacity/.test(capture.failure?.code || '');
    return capacity ? 'Today’s processing capacity is full. Your photos are still saved.' : 'Processing stopped before a usable model was saved. Your photos are still saved; you can retry without uploading again. This message does not mean your photos were the cause.';
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
    : ready ? 'Preview ready · coverage needs review'
    : status === 'processing' ? 'Reconstruction in progress'
    : status === 'queued' ? 'Waiting to start'
    : status === 'processing_failed' ? 'Processing needs attention' : 'Photos saved';
  panel.querySelector('[data-capture-server-status]').textContent = session.progressError
    ? 'The status could not be refreshed. This does not mean your upload was lost. Check again when your connection returns.'
    : session.serverCapture.reconstructionSourceCaptureId ? 'This reconstruction test reused your earlier photo set. Choose Open my original photos below to view them or take more.'
    : `${session.remotePhotos.length} photos uploaded · ${processingDescription(session.serverCapture)}`;
  const stamp = session.lastCheckedAt ? new Date(session.lastCheckedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
  panel.querySelector('[data-capture-checked]').textContent = stamp ? `Last successful check: ${stamp}` : '';
  panel.querySelector('[data-capture-progress-help]').textContent = ready ? 'Choose View my 3D result below to inspect it.'
    : active ? 'This page checks every 15 seconds while visible. You can close it and return later. No reliable percentage or finish time is available yet.'
    : status === 'processing_failed' ? 'Use Retry below to try again with your saved photos.'
    : 'Saving photos does not start reconstruction. Choose Upload for processing when your photo set is ready.';
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
        <p>Use this same account on your phone. Your building, room and uploaded photos stay together.</p>
        <button type="button" data-capture-phone>Continue on phone</button>
        <div data-capture-link-box hidden><canvas data-capture-qr aria-label="Scan to continue this capture on your phone"></canvas><a data-capture-link></a><button type="button" data-capture-copy>Copy phone link</button></div>
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
        <section data-capture-additional hidden><p>This submitted photo set is preserved. To take more photos or video for this building, start another photo set. Nothing is processed until you choose to upload for processing.</p><button type="button" class="captureGuidedCameraButton" data-capture-new-set>Take more photos for this building</button></section>
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
        <button type="button" data-capture-kind="interior_room" role="tab">One room</button>
      </div>
      <label class="realityCaptureConsent" data-facade-choice><input data-exterior-facade type="checkbox" checked> <span>One facade / accessible wall only. Reconstruct what I can see, not the entire building.</span></label>
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
        <div class="realityCaptureGrid">
          <label>Room name<input data-room-label maxlength="100" value="Living room"></label>
          <label>Room type<select data-room-type><option value="living_room">Living room</option><option value="bedroom">Bedroom</option><option value="kitchen">Kitchen</option><option value="office">Office</option><option value="other">Other</option></select></label>
          <label>Width (m)<input data-room-width type="number" min="1.5" max="80" step="0.1" value="4"></label>
          <label>Length (m)<input data-room-length type="number" min="1.5" max="80" step="0.1" value="6"></label>
          <label>Height (m)<input data-room-height type="number" min="1.8" max="12" step="0.1" value="2.7"></label>
          <label>Door direction<input data-room-direction type="number" min="0" max="359" step="1" value="0"></label>
        </div>
        <label class="realityCaptureConsent"><input data-room-permission type="checkbox"> <span>I have permission to capture and upload this interior.</span></label>
      </section>
      <section class="realityCaptureGuide">
        <div><span>GUIDED COVERAGE</span><strong data-capture-count>0 photos</strong></div>
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
        <p class="realityCaptureQuality" data-capture-quality>No photos leave this device until you save or upload them.</p>
        <details data-capture-gallery><summary>View saved and new photos</summary><div data-capture-photo-grid></div><button type="button" class="captureGuidedCameraButton" data-photo-prev>Previous photos</button><span data-photo-page></span><button type="button" class="captureGuidedCameraButton" data-photo-next>Next photos</button></details>
      </section>
      <label class="realityCaptureConsent"><input data-public-contribution type="checkbox"> <span>After review, I want this capture considered as a public visual improvement. This never makes a residential interior public.</span></label>
      <section class="realityCaptureActions">
        <button type="button" data-capture-cancel>Delete draft</button>
        <button type="button" data-capture-save>Save photos to account</button>
        <button type="button" data-capture-upload class="primary">Upload for processing</button>
      </section>
      <div class="realityCaptureProgress" data-capture-progress hidden><span></span><i></i></div>
      <p class="realityCaptureStatus" data-capture-status role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(panel);
  panel.addEventListener('cancel', event => { event.preventDefault(); closeRealityCapture(); });
  panel.querySelector('[data-capture-close]').addEventListener('click', closeRealityCapture);
  panel.querySelector('[data-capture-cancel]').addEventListener('click', clearDraft);
  panel.querySelector('[data-capture-upload]').addEventListener('click', () => uploadDraft(true));
  panel.querySelector('[data-capture-save]').addEventListener('click', () => uploadDraft(false));
  panel.querySelector('[data-capture-input]').addEventListener('change', addPhotos);
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
      if(location.pathname.endsWith('/capture.html'))history.replaceState(null,'',`#capture=${encodeURIComponent(id)}`);
    }).catch(error=>{panel.querySelector('[data-capture-status]').textContent=error.message;});
  });
  panel.querySelector('[data-capture-new-set]').addEventListener('click', async () => {
    const session=current;if(!session||session.busy)return;
    setBusy(session,true);
    try {
      const response=await createRealityCaptureDraft({...draftInput(session),publicContributionRequested:false});
      assertCurrent(session);
      await openRealityCaptureSession(response.capture.captureId);
      if(location.pathname.endsWith('/capture.html'))history.replaceState(null,'',`#capture=${encodeURIComponent(response.capture.captureId)}`);
      ensurePanel().querySelector('[data-capture-status]').textContent='New photo set ready. Your previous photos and result are unchanged. Open the camera, choose a video, or add photos below.';
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

function buildTarget(appCtx, target) {
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
    worldId: worldModificationIdentityForLocation(appCtx.LOC || {}),
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
  return current?.kind === 'interior_room' ? 18 : 20;
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
  panel.querySelector('[data-capture-count]').textContent = `${photos.length} / ${minimumPhotos()} minimum`;
  panel.querySelector('[data-capture-account]').textContent = `Account: ${getCurrentUser()?.email || getCurrentUser()?.displayName || 'Signed-in explorer'}`;
  panel.querySelector('[data-capture-refresh]').hidden = !current.serverCapture;
  panel.querySelector('[data-capture-retry]').hidden = current.serverCapture?.status !== 'processing_failed' || !current.serverCapture?.uploadSummary;
  const locked = !captureIsEditable(current.serverCapture);
  panel.querySelector('[data-capture-live-camera]').style.display=locked?'none':'';
  for(const selector of ['[data-capture-input]','[data-capture-video]'])panel.querySelector(selector).closest('label').style.display=locked?'none':'';
  panel.querySelector('[data-capture-source]').hidden=!current.serverCapture?.reconstructionSourceCaptureId;
  panel.querySelector('[data-capture-additional]').hidden=!locked||!!current.serverCapture?.reconstructionSourceCaptureId;
  panel.querySelectorAll('button:not([data-capture-close]), input, select').forEach((element) => {
    element.disabled = current.busy || (locked && !element.matches('[data-capture-refresh], [data-capture-copy], [data-capture-phone], [data-capture-preview], [data-capture-hybrid], [data-viewer-action], [data-capture-cancel], [data-capture-retry], [data-capture-source], [data-capture-new-set], [data-photo-prev], [data-photo-next]'));
  });
  panel.querySelector('[data-photo-prev]').disabled=current.busy||current.photoPage===0;
  panel.querySelector('[data-photo-next]').disabled=current.busy||(current.photoPage+1)*6>=galleryPhotos.length;
  panel.querySelector('[data-photo-page]').textContent=galleryPhotos.length?` ${current.photoPage*6+1}–${Math.min((current.photoPage+1)*6,galleryPhotos.length)} of ${galleryPhotos.length} `:'No photos in this set.';
  panel.querySelector('[data-capture-hybrid]').hidden = current.kind !== 'exterior' || !current.remotePhotos.length || !current.serverCapture?.building?.spatialContext?.footprint?.length;
  panel.querySelector('[data-capture-result]').hidden = !current.serverCapture?.processed?.optimizedModelPath;
  const registration = current.serverCapture?.processed?.registration;
  panel.querySelector('[data-capture-registration]').textContent = registration?.status === 'available'
    ? `${registration.registeredCount} of ${registration.submittedCount} photos positioned in 3D. ${registration.registeredCount < registration.submittedCount
      ? 'Some photos could not be positioned; this preview may be incomplete.' : 'Photo matching alone does not confirm that every wall and the roof were reconstructed.'}`
    : 'Coverage unverified: this result has no retained photo-matching report. A finished processing job does not mean a complete building.';
  panel.querySelector('[data-facade-choice]').hidden = current.kind !== 'exterior';
  panel.querySelector('[data-building-details]').hidden = current.kind !== 'exterior';
  panel.querySelectorAll('[data-building-details] input, [data-building-details] select').forEach(element => { element.disabled = current.busy || !!current.serverCapture; });
  panel.querySelector('[data-exterior-facade]').checked = current.exteriorScope === 'facade';
  panel.querySelector('[data-exterior-facade]').disabled = current.busy || !!current.serverCapture;
  panel.querySelectorAll('[data-capture-kind], .realityCaptureRoom input:not([data-room-permission]), .realityCaptureRoom select, [data-public-contribution]').forEach((element) => {
    element.disabled = current.busy || (element.matches('[data-capture-kind]') ? !!current.resumed : !!current.serverCapture);
  });
  panel.querySelector('[data-capture-instruction]').textContent = current.kind === 'interior_room'
    ? `Stand near ${sectorList[current.activeSector]}. Keep each wall in several neighboring photos and include floor-to-wall and wall-to-ceiling edges.`
    : `Photograph the ${sectorList[current.activeSector].toLowerCase()} side. Walk safely; keep about two-thirds of the previous view in the next photo.`;
  panel.querySelector('[data-capture-photo-guide]').innerHTML = photoGuideMarkup(current.kind, current.activeSector, current.exteriorScope);
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
    : 'No photos leave this device until you choose Upload for processing.';
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
  const session = current;
  if (!session || session.busy || session.resumed || kind === session.kind) return;
  setBusy(session, true);
  try { await persist(session); assertCurrent(session); await restore(kind, session); }
  catch (error) { if (isCurrent(session)) ensurePanel().querySelector('[data-capture-status]').textContent = error.message; }
  finally { setBusy(session, false); }
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
  const session=current;if(!session||session.busy||!session.serverCapture)return;
  setBusy(session,true);
  try {
    const {openHybridEditor}=await import('./hybrid-editor.js?v=1');assertCurrent(session);
    session.hybridEditor?.close();
    session.hybridEditor=await openHybridEditor({capture:session.serverCapture,photos:session.remotePhotos,signal:session.abort.signal,
      loadPhoto:async(id,signal)=>{
        assertCurrent(session);const item=session.remotePhotos.find(p=>p.id===id);if(!item)throw Error('Unknown capture photo.');
        const path=item.path||`reality-captures/${session.uid}/${session.serverCapture.captureId}/originals/${id}.jpg`;
        const access=await getRealityCaptureAssetAccess(session.serverCapture.captureId,'original',path);assertCurrent(session);
        const response=await fetch(access.url,{cache:'no-store',signal});if(!response.ok)throw Error('Unable to open this saved photo.');
        const blob=await response.blob();assertCurrent(session);return blob;
      },submit:async revision=>{
        assertCurrent(session);
        const result=await submitRealityCaptureHybrid(session.serverCapture.captureId,revision,true);
        assertCurrent(session);return result;
      },save:async preview=>{
        assertCurrent(session);const result=await saveRealityCaptureHybridPreview(session.serverCapture.captureId,preview);assertCurrent(session);
        session.serverCapture.hybridPreview=result.preview;await persist(session);return result;
      }});
  }catch(error){if(isCurrent(session))ensurePanel().querySelector('[data-capture-status]').textContent=error.message;}
  finally{setBusy(session,false);}
}

async function previewResult() {
  const session = current;
  if (!session || session.busy || !session.serverCapture?.processed?.optimizedModelPath) return;
  setBusy(session, true);
  const panel = ensurePanel();
  panel.querySelector('[data-capture-status]').textContent = 'Opening your private reconstruction…';
  try {
    const access = await getRealityCaptureAssetAccess(session.serverCapture.captureId);
    assertCurrent(session);
    const response = await fetch(access.url, { cache: 'no-store', signal: session.abort.signal });
    if (!response.ok) throw Error('The model could not be downloaded. Please try again.');
    const bytes = await response.arrayBuffer();
    assertCurrent(session);
    if (bytes.byteLength > 20 * 1024 * 1024) throw Error('This model exceeds the preview limit.');
    const { createCaptureViewer } = await import('./result-viewer.js?v=1');
    assertCurrent(session);
    session.viewer?.dispose();
    session.viewer = await createCaptureViewer(panel.querySelector('[data-capture-viewer]'), bytes, session.abort.signal);
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
    status.textContent = `Add at least ${minimumPhotos()} overlapping photos before upload.`;
    return;
  }
  const underCovered = sectors().filter((_, index) => allPhotos().filter((photo) => photo.sector === index).length < 2);
  if (submit && underCovered.length && !(session.kind === 'exterior' && session.exteriorScope === 'facade')) {
    status.textContent = `Add at least two photos for every coverage section. Missing: ${underCovered.join(', ')}.`;
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
    status.textContent = 'Validating file signatures and queueing reconstruction…';
    assertCurrent(session);
    const result = await finalizeRealityCaptureUpload(session.serverCapture.captureId);
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
  if (current) closeRealityCapture();
  const session = { appCtx, uid: user.uid, target, kind: 'exterior', draftId: '', activeSector: 0,
    photos: [], remotePhotos: [], serverCapture: null, uploadedPhotoIds: new Set(), abort: new AbortController(), busy: false };
  current = session;
  session.unsubscribe = observeAuth((next) => {
    if (current === session && next?.uid !== session.uid) closeRealityCapture();
  });
  return session;
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
    session = startSession(appCtx, target);
    await restore('exterior', session);
  } catch (error) {
    appCtx.showWorldSelectionNotice?.('Sign in to capture', error.message);
    return false;
  }
  panel.classList.add('show');
  panel.showModal();
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

// Server-resolved identity is used on the phone; do not instantiate the Earth renderer.
export async function openRealityCaptureSession(captureId) {
  const generation = ++openGeneration;
  const user = getCurrentUser();
  if (!user || user.isAnonymous) throw new Error('Sign in with the account that started this capture.');
  const result = await getMyRealityCapture(captureId);
  if (generation !== openGeneration || getCurrentUser()?.uid !== user.uid) throw new Error('Account changed. Open the capture again.');
  const session = startSession(null, result.capture.building);
  session.resumed = true;
  await restore(result.capture.captureKind, session, result.capture);
  assertCurrent(session);
  session.remotePhotos = result.photos || [];
  session.lastCheckedAt = Date.now();
  session.uploadedPhotoIds = new Set(session.remotePhotos.map((photo) => photo.id));
  const panel = ensurePanel();
  panel.classList.add('show');
  panel.showModal();
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('aria-modal', 'true');
  panel.querySelector('[data-capture-server-status]').textContent = `${session.remotePhotos.length} photos uploaded · ${processingDescription(result.capture)}`;
  render();
  scheduleProgress(session);
  return true;
}

export function closeRealityCapture() {
  openGeneration++;
  const panel = ensurePanel();
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
  panel.close();
  panel.removeAttribute('aria-modal');
  panel.setAttribute('aria-hidden', 'true');
  panel.querySelector('[data-capture-link]').removeAttribute('href');
  panel.querySelector('[data-capture-link]').textContent = '';
  panel.querySelector('[data-capture-link-box]').hidden = true;
  panel.querySelector('[data-capture-viewer-controls]').hidden = true;
}
