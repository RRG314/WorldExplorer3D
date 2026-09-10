import { postAppCheckedFunction, postProtectedFunction } from './function-api.js?v=3';
import { initFirebase } from './firebase-init.js?v=57';


const CLIENT_LIMITS = Object.freeze({
  maxInputBytes: 32 * 1024 * 1024,
  maxLongEdge: 4096,
  minLongEdge: 1280,
  jpegQuality: 0.91
});

function endpoint(path, body = {}) {
  return postProtectedFunction(path, body, { label: 'Reality Capture' });
}

function randomHex(bytes = 16) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function canvasBlob(canvas, type = 'image/jpeg', quality = CLIENT_LIMITS.jpegQuality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not normalize this photo.')),
    type,
    quality
  ));
}

function analyzePixels(context, width, height) {
  const sampleWidth = Math.min(160, width);
  const sampleHeight = Math.min(160, height);
  const sample = document.createElement('canvas');
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleContext = sample.getContext('2d', { willReadFrequently: true });
  sampleContext.drawImage(context.canvas, 0, 0, width, height, 0, 0, sampleWidth, sampleHeight);
  const { data } = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
  const gray = new Float32Array(sampleWidth * sampleHeight);
  let brightnessSum = 0;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const value = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    gray[pixel] = value;
    brightnessSum += value;
  }
  let laplacianSum = 0;
  let laplacianSquared = 0;
  let samples = 0;
  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const index = y * sampleWidth + x;
      const laplacian = 4 * gray[index] - gray[index - 1] - gray[index + 1] - gray[index - sampleWidth] - gray[index + sampleWidth];
      laplacianSum += laplacian;
      laplacianSquared += laplacian * laplacian;
      samples += 1;
    }
  }
  const mean = samples ? laplacianSum / samples : 0;
  const sharpness = samples ? Math.max(0, laplacianSquared / samples - mean * mean) : 0;
  const brightness = brightnessSum / Math.max(1, gray.length);
  return Object.freeze({
    brightness: Number(brightness.toFixed(1)),
    sharpness: Number(sharpness.toFixed(1)),
    exposure: brightness < 38 ? 'too_dark' : brightness > 224 ? 'too_bright' : 'usable',
    focus: sharpness < 55 ? 'blurry' : sharpness < 110 ? 'soft' : 'usable'
  });
}

export async function normalizeCapturePhoto(file) {
  if (!(file instanceof Blob)) throw new Error('Choose a photo first.');
  if (file.size <= 0 || file.size > CLIENT_LIMITS.maxInputBytes) throw new Error('Each source photo must be between 1 byte and 32 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(String(file.type || '').toLowerCase())) {
    throw new Error('Use a JPEG, PNG, WebP, HEIC, or HEIF camera photo.');
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    throw new Error('This browser could not decode that photo. Try taking a JPEG instead.');
  }
  const sourceLongEdge = Math.max(bitmap.width, bitmap.height);
  if (sourceLongEdge < CLIENT_LIMITS.minLongEdge) {
    bitmap.close?.();
    throw new Error('That photo is too small. Use a camera image at least 1280 pixels on its long edge.');
  }
  const scale = Math.min(1, CLIENT_LIMITS.maxLongEdge / sourceLongEdge);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const quality = analyzePixels(context, width, height);
  // Re-encoding strips EXIF/GPS/device metadata before data leaves the device.
  const blob = await canvasBlob(canvas);
  if (blob.size > 12 * 1024 * 1024) throw new Error('The normalized photo is still too large to upload.');
  const preview = document.createElement('canvas');
  preview.width = 160;
  preview.height = Math.max(1, Math.round(160 * height / width));
  preview.getContext('2d').drawImage(canvas, 0, 0, preview.width, preview.height);
  const thumbnail = await canvasBlob(preview, 'image/jpeg', 0.7);
  return Object.freeze({
    id: randomHex(),
    blob,
    thumbnail,
    width,
    height,
    contentType: 'image/jpeg',
    quality,
    sourceBytes: file.size,
    normalizedBytes: blob.size
  });
}

export function createRealityCaptureDraft(input) {
  return endpoint('/createRealityCaptureDraft', input);
}

export async function listMyRealityCaptures(building) {
  const captures=new Map(),seen=new Set();let cursor=null,result;
  do{
    result=await endpoint('/listMyRealityCaptures',{...(building?{building}:{}),...(cursor?{cursor}:{})});
    for(const capture of result.captures||[])captures.set(capture.captureId,capture);
    cursor=result.nextCursor||null;
    if(cursor&&seen.has(cursor))throw Error('The contribution list could not finish loading. Refresh to retry; your saved work is unchanged.');
    if(cursor)seen.add(cursor);
  }while(cursor);
  return {...result,captures:[...captures.values()].sort((a,b)=>(b.updatedAtMs||0)-(a.updatedAtMs||0))};
}

export function getMyRealityCapture(captureId) {
  return endpoint('/getMyRealityCapture', { captureId });
}

export function finalizeRealityCaptureUpload(captureId, mode = 'manual') {
  return endpoint('/finalizeRealityCaptureUpload', { captureId, mode });
}

export function retryRealityCapture(captureId) {
  return endpoint('/retryRealityCapture', { captureId });
}

export function deleteRealityCapture(captureId) {
  return endpoint('/deleteRealityCapture', { captureId });
}

export function resolvePrivateSpaceEntry(spaceId, roomId = '') {
  return endpoint('/resolvePrivateSpaceEntry', { spaceId, roomId });
}

export function resolveBuildingInteriorRepresentation(sourceBuildingId, worldId, roomId = '',spaceId='') {
  return endpoint('/resolveBuildingInteriorRepresentation', { sourceBuildingId, worldId, roomId,spaceId });
}

export function resolveBuildingExteriorRepresentation(sourceBuildingId, worldId) {
  return postAppCheckedFunction('/resolveBuildingExteriorRepresentation', { sourceBuildingId, worldId }, { label: 'Reality Capture' });
}

export function listApprovedExteriorRepresentations(worldId, sourceBuildingIds) {
  return postAppCheckedFunction('/listApprovedExteriorRepresentations', { worldId, ...(sourceBuildingIds?{sourceBuildingIds}:{}) }, { label: 'Reality Capture' });
}

export function requestPrivateSpaceAccess(spaceId, roomId = '', message = '') {
  return endpoint('/requestPrivateSpaceAccess', { spaceId, roomId, message });
}

export function updatePrivateSpaceAccess(input) {
  return endpoint('/updatePrivateSpaceAccess', input);
}

export function getRealityCaptureAssetAccess(captureId, assetKind = 'processed', path = '') {
  return endpoint('/getRealityCaptureAssetAccess', { captureId, assetKind, path });
}

export function saveRealityCaptureHybridPreview(captureId, preview) {
  return endpoint('/saveRealityCaptureHybridPreview', {captureId, preview});
}
export function submitRealityCaptureHybrid(captureId, revision, consent, publicSharing = false) {
  return endpoint('/submitRealityCaptureHybrid', {captureId,revision,consent,publicSharing:publicSharing===true});
}

export function listRealityCaptureModeration(status = 'review_required') {
  return endpoint('/listRealityCaptureModeration', { status });
}

export function getRealityCaptureModerationDetail(captureId) {
  return endpoint('/getRealityCaptureModerationDetail', { captureId });
}

export function moderateRealityCapture(captureId, decision, note = '', alignment = {}, revision) {
  return endpoint('/moderateRealityCapture', { captureId, decision, note, alignment, ...(revision!==undefined?{revision}:{}) });
}
export function retryRealityCaptureReviewEmail(captureId) {
  return endpoint('/retryRealityCaptureReviewEmail', {captureId});
}

export async function uploadRealityCapturePhoto(capture, photo, onProgress = null, signal = null) {
  const services = initFirebase();
  if (!services?.storage) throw new Error('Secure capture storage is not configured for this app.');
  const ownerUid = String(capture?.ownerUid || '');
  const captureId = String(capture?.captureId || '');
  if (!ownerUid || !captureId || !(photo?.blob instanceof Blob)) throw new Error('Capture upload identity is incomplete.');
  if (services.auth?.currentUser?.uid !== ownerUid) throw new Error('Sign in to the account that started this capture.');
  signal?.throwIfAborted();
  await endpoint('/reserveRealityCapturePhoto', { captureId, photoId: photo.id });
  signal?.throwIfAborted();
  if (services.auth?.currentUser?.uid !== ownerUid) throw new Error('The signed-in account changed.');
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await photo.blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const ticket=await endpoint('/createRealityCaptureUploadUrl',{captureId,photoId:photo.id,size:photo.blob.size,sector:photo.sector??-1,sha256});
  signal?.throwIfAborted();if(services.auth?.currentUser?.uid!==ownerUid)throw Error('The signed-in account changed.');
  if(ticket.existing){onProgress?.(1);return {path:ticket.path,bytes:photo.blob.size};}
  return await new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();request.open('PUT',ticket.url);
    for(const [key,value]of Object.entries(ticket.headers))request.setRequestHeader(key,value);
    const cancel=()=>request.abort(),cleanup=()=>signal?.removeEventListener('abort',cancel);
    signal?.addEventListener('abort',cancel,{once:true});
    request.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(e.loaded/e.total);};
    request.onerror=()=>{cleanup();reject(Error('Upload interrupted. Your photo stays on this device; retry to continue.'));};
    request.onabort=()=>{cleanup();reject(new DOMException('Upload cancelled','AbortError'));};
    request.onload=()=>{cleanup();if(request.status>=200&&request.status<300){onProgress?.(1);resolve({path:ticket.path,bytes:photo.blob.size});}else reject(Error('Upload did not finish. Retry this photo; existing originals cannot be overwritten.'));};
    request.send(photo.blob);if(signal?.aborted)cancel();
  });
}

export { CLIENT_LIMITS };
