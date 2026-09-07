import { worldModificationIdentityForLocation } from '../editable-world/model.js?v=1';
import {
  createRealityCaptureDraft,
  deleteRealityCapture,
  finalizeRealityCaptureUpload,
  normalizeCapturePhoto,
  uploadRealityCapturePhoto
} from '../../../js/community-reality-capture-api.js?v=3';
import {
  deleteLocalCaptureDraft,
  loadLocalCaptureDraft,
  saveLocalCaptureDraft,
  saveLocalCapturePhoto
} from './local-draft-store.js?v=1';
import { resolveCanonicalMappedBuilding } from './runtime-contract.js?v=1';

const EXTERIOR_SECTORS = Object.freeze(['Front', 'Front right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Front left']);
const INTERIOR_SECTORS = Object.freeze(['Door', 'Wall 1', 'Corner 1', 'Wall 2', 'Corner 2', 'Opposite door']);
const MAX_PHOTOS = 48;
let current = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function draftIdFor(target, kind) {
  return `capture:${kind}:${target.worldId}:${target.sourceBuildingId}`;
}

function ensurePanel() {
  let panel = document.getElementById('realityCapturePanel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'realityCapturePanel';
  panel.className = 'realityCapturePanel';
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('aria-label', 'Improve this place with photos');
  panel.innerHTML = `
    <header><div><span>COMMUNITY REALITY CAPTURE</span><strong>Improve this place</strong></div><button type="button" data-capture-close aria-label="Close">×</button></header>
    <div class="realityCaptureScroll">
      <section class="realityCaptureTarget"><span>SELECTED MAPPED BUILDING</span><strong data-capture-label></strong><small data-capture-id></small></section>
      <div class="realityCaptureKinds" role="tablist" aria-label="Capture type">
        <button type="button" data-capture-kind="exterior" role="tab">Exterior</button>
        <button type="button" data-capture-kind="interior_room" role="tab">One room</button>
      </div>
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
        <div class="realityCaptureSectors" data-capture-sectors></div>
        <label class="realityCaptureCamera">
          <input data-capture-input type="file" accept="image/*" capture="environment" multiple>
          <span>Take or add photos</span>
        </label>
        <p class="realityCaptureQuality" data-capture-quality>No photos leave this device until you choose Upload for review.</p>
      </section>
      <label class="realityCaptureConsent"><input data-public-contribution type="checkbox"> <span>After review, I want this capture considered as a public visual improvement. This never makes a residential interior public.</span></label>
      <section class="realityCaptureActions">
        <button type="button" data-capture-cancel>Delete draft</button>
        <button type="button" data-capture-upload class="primary">Upload for processing</button>
      </section>
      <div class="realityCaptureProgress" data-capture-progress hidden><span></span><i></i></div>
      <p class="realityCaptureStatus" data-capture-status role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(panel);
  panel.querySelector('[data-capture-close]').addEventListener('click', closeRealityCapture);
  panel.querySelector('[data-capture-cancel]').addEventListener('click', clearDraft);
  panel.querySelector('[data-capture-upload]').addEventListener('click', uploadDraft);
  panel.querySelector('[data-capture-input]').addEventListener('change', addPhotos);
  panel.querySelectorAll('[data-capture-kind]').forEach((button) => button.addEventListener('click', () => switchKind(button.dataset.captureKind)));
  panel.addEventListener('click', (event) => {
    const sectorButton = event.target.closest('[data-sector-index]');
    if (!sectorButton || !current) return;
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
    entranceGeo
  });
}

async function restore(kind) {
  const draftId = draftIdFor(current.target, kind);
  const restored = await loadLocalCaptureDraft(draftId).catch(() => ({ draft: null, photos: [] }));
  current.kind = kind;
  current.draftId = draftId;
  current.activeSector = finite(restored.draft?.activeSector, 0);
  current.photos = restored.photos || [];
  current.serverCapture = restored.draft?.serverCapture || null;
  current.uploadedPhotoIds = new Set(restored.draft?.uploadedPhotoIds || []);
  render();
}

function sectors() {
  return current?.kind === 'interior_room' ? INTERIOR_SECTORS : EXTERIOR_SECTORS;
}

function minimumPhotos() {
  return current?.kind === 'interior_room' ? 18 : 20;
}

function render() {
  const panel = ensurePanel();
  if (!current) return;
  const sectorList = sectors();
  const bySector = new Map(sectorList.map((_, index) => [index, current.photos.filter((photo) => photo.sector === index).length]));
  panel.querySelector('[data-capture-label]').textContent = current.target.label;
  panel.querySelector('[data-capture-id]').textContent = current.target.sourceBuildingId;
  panel.querySelector('[data-capture-count]').textContent = `${current.photos.length} / ${minimumPhotos()} minimum`;
  panel.querySelector('[data-capture-instruction]').textContent = current.kind === 'interior_room'
    ? `Stand near ${sectorList[current.activeSector]}. Keep each wall in several neighboring photos and include floor-to-wall and wall-to-ceiling edges.`
    : `Photograph the ${sectorList[current.activeSector].toLowerCase()} side. Walk safely; keep about two-thirds of the previous view in the next photo.`;
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
}

async function persist() {
  if (!current) return;
  await saveLocalCaptureDraft({
    id: current.draftId,
    kind: current.kind,
    target: current.target,
    activeSector: current.activeSector,
    photoCount: current.photos.length,
    serverCapture: current.serverCapture,
    uploadedPhotoIds: [...(current.uploadedPhotoIds || [])]
  }).catch(() => {});
}

async function switchKind(kind) {
  if (!current || kind === current.kind) return;
  await persist();
  await restore(kind);
}

async function addPhotos(event) {
  const panel = ensurePanel();
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!current || files.length === 0) return;
  const status = panel.querySelector('[data-capture-status]');
  let lastErrorMessage = '';
  let accepted = 0;
  for (let index = 0; index < files.length; index += 1) {
    if (current.photos.length >= MAX_PHOTOS) {
      status.textContent = `This V1 capture is limited to ${MAX_PHOTOS} photos. Remove this draft and start again if you need a different set.`;
      break;
    }
    try {
      status.textContent = `Checking photo ${index + 1} of ${files.length}…`;
      const photo = await normalizeCapturePhoto(files[index]);
      const saved = { ...photo, sector: current.activeSector };
      current.photos.push(saved);
      accepted += 1;
      await saveLocalCapturePhoto(current.draftId, saved, current.activeSector);
      if ((current.photos.filter((entry) => entry.sector === current.activeSector).length >= 3) && current.activeSector < sectors().length - 1) {
        current.activeSector += 1;
      }
      render();
      await persist();
    } catch (error) {
      lastErrorMessage = error.message || 'That photo could not be used.';
      status.textContent = lastErrorMessage;
    }
  }
  status.textContent = accepted > 0
    ? `${current.photos.length} photos are saved on this device. Review warnings before upload.${lastErrorMessage ? ` Last issue: ${lastErrorMessage}` : ''}`
    : (lastErrorMessage || 'No photos were added.');
}

function roomInput(panel, selector, fallback) {
  return panel.querySelector(selector)?.value || fallback;
}

async function uploadDraft() {
  const panel = ensurePanel();
  if (!current) return;
  const status = panel.querySelector('[data-capture-status]');
  const button = panel.querySelector('[data-capture-upload]');
  const progress = panel.querySelector('[data-capture-progress]');
  if (current.photos.length < minimumPhotos()) {
    status.textContent = `Add at least ${minimumPhotos()} overlapping photos before upload.`;
    return;
  }
  const underCovered = sectors().filter((_, index) => current.photos.filter((photo) => photo.sector === index).length < 2);
  if (underCovered.length) {
    status.textContent = `Add at least two photos for every coverage section. Missing: ${underCovered.join(', ')}.`;
    return;
  }
  const permissionConfirmed = panel.querySelector('[data-room-permission]').checked;
  if (current.kind === 'interior_room' && !permissionConfirmed) {
    status.textContent = 'Interior upload requires confirmation that you have permission.';
    return;
  }
  button.disabled = true;
  progress.hidden = false;
  try {
    if (!current.serverCapture) {
      status.textContent = 'Creating a private server-authorized capture…';
      const response = await createRealityCaptureDraft({
        captureKind: current.kind,
        building: current.target,
        permissionConfirmed,
        propertyPermissionConfirmed: permissionConfirmed,
        publicContributionRequested: panel.querySelector('[data-public-contribution]').checked,
        termsVersion: 'reality-capture-v1',
        room: current.kind === 'interior_room' ? {
          label: roomInput(panel, '[data-room-label]', 'Room'),
          type: roomInput(panel, '[data-room-type]', 'room'),
          widthMeters: finite(roomInput(panel, '[data-room-width]', 4), 4),
          lengthMeters: finite(roomInput(panel, '[data-room-length]', 6), 6),
          heightMeters: finite(roomInput(panel, '[data-room-height]', 2.7), 2.7),
          entranceDirectionDegrees: finite(roomInput(panel, '[data-room-direction]', 0), 0)
        } : null
      });
      current.serverCapture = response.capture;
      await persist();
    }
    for (let index = 0; index < current.photos.length; index += 1) {
      if (current.uploadedPhotoIds?.has(current.photos[index].id)) continue;
      status.textContent = `Uploading protected photo ${index + 1} of ${current.photos.length}…`;
      await uploadRealityCapturePhoto(current.serverCapture, current.photos[index], (fraction) => {
        const overall = (index + fraction) / current.photos.length;
        progress.querySelector('i').style.width = `${Math.round(overall * 100)}%`;
        progress.querySelector('span').textContent = `${Math.round(overall * 100)}%`;
      });
      current.uploadedPhotoIds ||= new Set();
      current.uploadedPhotoIds.add(current.photos[index].id);
      await persist();
    }
    status.textContent = 'Validating file signatures and queueing reconstruction…';
    const result = await finalizeRealityCaptureUpload(current.serverCapture.captureId);
    status.textContent = `Upload complete. Status: ${result.status}. Originals remain private.`;
    await deleteLocalCaptureDraft(current.draftId);
    current.photos = [];
    current.serverCapture = null;
    current.uploadedPhotoIds = new Set();
    render();
  } catch (error) {
    status.textContent = error.message || 'Upload stopped safely. Your local draft is still available.';
  } finally {
    button.disabled = false;
  }
}

async function clearDraft() {
  if (!current || !globalThis.confirm('Delete this capture draft and its photos from this device?')) return;
  const panel = ensurePanel();
  try {
    if (current.serverCapture?.captureId) await deleteRealityCapture(current.serverCapture.captureId);
    await deleteLocalCaptureDraft(current.draftId);
    current.photos = [];
    current.serverCapture = null;
    current.uploadedPhotoIds = new Set();
    panel.querySelector('[data-capture-status]').textContent = 'Draft deleted.';
    render();
  } catch (error) {
    panel.querySelector('[data-capture-status]').textContent = error.message || 'Could not delete the draft.';
  }
}

export async function openRealityCaptureForBuilding(appCtx, buildingTarget) {
  const panel = ensurePanel();
  const target = buildTarget(appCtx, buildingTarget);
  if (!target.sourceBuildingId || !target.worldId) {
    appCtx.showWorldSelectionNotice?.('Capture unavailable', 'Reality capture attaches only to a stable mapped building identity.');
    return false;
  }
  current = { appCtx, target, kind: 'exterior', draftId: '', activeSector: 0, photos: [], serverCapture: null, uploadedPhotoIds: new Set() };
  await restore('exterior');
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  panel.querySelector('[data-capture-close]').focus();
  return true;
}

export function closeRealityCapture() {
  const panel = ensurePanel();
  void persist();
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
}
