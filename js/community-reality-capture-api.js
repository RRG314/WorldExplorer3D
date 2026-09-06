import { postAppCheckedFunction, postProtectedFunction } from './function-api.js?v=3';
import { initFirebase } from './firebase-init.js?v=57';
import {
  ref as storageRef,
  uploadBytesResumable
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

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
  return Object.freeze({
    id: randomHex(),
    blob,
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

export function listMyRealityCaptures() {
  return endpoint('/listMyRealityCaptures');
}

export function finalizeRealityCaptureUpload(captureId) {
  return endpoint('/finalizeRealityCaptureUpload', { captureId });
}

export function deleteRealityCapture(captureId) {
  return endpoint('/deleteRealityCapture', { captureId });
}

export function resolvePrivateSpaceEntry(spaceId, roomId = '') {
  return endpoint('/resolvePrivateSpaceEntry', { spaceId, roomId });
}

export function resolveBuildingInteriorRepresentation(sourceBuildingId, worldId, roomId = '') {
  return endpoint('/resolveBuildingInteriorRepresentation', { sourceBuildingId, worldId, roomId });
}

export function resolveBuildingExteriorRepresentation(sourceBuildingId, worldId) {
  return postAppCheckedFunction('/resolveBuildingExteriorRepresentation', { sourceBuildingId, worldId }, { label: 'Reality Capture' });
}

export function listApprovedExteriorRepresentations(worldId) {
  return postAppCheckedFunction('/listApprovedExteriorRepresentations', { worldId }, { label: 'Reality Capture' });
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

export function listRealityCaptureModeration(status = 'review_required') {
  return endpoint('/listRealityCaptureModeration', { status });
}

export function getRealityCaptureModerationDetail(captureId) {
  return endpoint('/getRealityCaptureModerationDetail', { captureId });
}

export function moderateRealityCapture(captureId, decision, note = '', alignment = {}) {
  return endpoint('/moderateRealityCapture', { captureId, decision, note, alignment });
}

export function uploadRealityCapturePhoto(capture, photo, onProgress = null) {
  const services = initFirebase();
  if (!services?.storage) throw new Error('Secure capture storage is not configured for this app.');
  const ownerUid = String(capture?.ownerUid || '');
  const captureId = String(capture?.captureId || '');
  if (!ownerUid || !captureId || !(photo?.blob instanceof Blob)) throw new Error('Capture upload identity is incomplete.');
  const path = `reality-captures/${ownerUid}/${captureId}/originals/${photo.id}.jpg`;
  const task = uploadBytesResumable(storageRef(services.storage, path), photo.blob, {
    contentType: 'image/jpeg',
    cacheControl: 'private, no-store, max-age=0',
    customMetadata: {
      ownerUid,
      captureId,
      captureSchemaVersion: '1',
      width: String(photo.width),
      height: String(photo.height),
      clientFocus: String(photo.quality?.focus || 'unknown'),
      clientExposure: String(photo.quality?.exposure || 'unknown')
    }
  });
  return new Promise((resolve, reject) => task.on(
    'state_changed',
    (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
    reject,
    () => resolve({ path, bytes: task.snapshot.totalBytes })
  ));
}

export { CLIENT_LIMITS };
