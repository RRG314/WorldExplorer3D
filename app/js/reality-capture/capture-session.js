// One capture document across devices. No login tokens or private media in URLs.
export function captureDraftKey(uid, target, kind, captureId = '') {
  if (!uid) throw new Error('Sign in to save a private capture.');
  return JSON.stringify(['capture-account-v2', uid, captureId || [target.worldId, target.sourceBuildingId, kind]]);
}

export function capturePhoneUrl(captureId, base) {
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(captureId || '')) throw new Error('Invalid capture link.');
  const url = new URL('capture.html', base);
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Phone handoff needs this version on a reachable HTTPS address. A localhost link opens the phone itself, not this computer.');
  }
  url.search = '';
  url.hash = `capture=${encodeURIComponent(captureId)}`;
  return url.href;
}

export function mergedCapturePhotos(local = [], remote = []) {
  return [...new Map([...remote, ...local].map((photo) => [photo.id, photo])).values()];
}

export function captureIsEditable(capture) {
  return !capture || ['draft', 'uploading'].includes(capture.status) ||
    (capture.status === 'uploaded' && !capture.hybridSubmission && !capture.processed && !capture.queuedAt);
}
