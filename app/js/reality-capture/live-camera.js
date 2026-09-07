// Camera pixels and the previous-frame overlay stay on this device. Upload uses
// the existing capture session; this component never creates another media store.
export async function openCaptureCamera({ kind, viewLabel, signal, onPhoto, onRetake }) {
  if (!navigator.mediaDevices?.getUserMedia) throw Error('Live camera is unavailable here. Use Add photos from your camera or library instead.');
  const returnFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'captureLiveCamera';
  dialog.setAttribute('aria-label', 'Guided photo camera');
  dialog.innerHTML = `<header><strong>Guided photo camera</strong><button type="button" data-camera-close aria-label="Close camera">×</button></header>
    <p data-camera-view></p>
    <div class="captureCameraStage">
      <video autoplay muted playsinline aria-label="Live rear camera"></video>
      <canvas class="capturePreviousFrame" hidden aria-label="Previous saved photo for overlap reference"></canvas>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="captureFrameOutline" d="M8 25V8H25 M75 8H92V25 M92 75V92H75 M25 92H8V75"/><path class="captureFrameGrid" d="M33 8V92 M67 8V92 M8 33H92 M8 67H92"/></svg>
    </div>
    <p data-camera-hint></p>
    <label><input type="checkbox" data-camera-ghost disabled> Show previous photo to help overlap</label>
    <p class="captureCameraCaution">Keep shared details in view while moving a little between shots. The outline is a framing aid—not automatic coverage or alignment detection.</p>
    <p data-camera-status role="status" aria-live="polite">Starting rear camera…</p>
    <footer><button type="button" data-camera-shutter disabled>Take photo</button><button type="button" data-camera-retake disabled>Retake last</button><button type="button" data-camera-done>Done</button></footer>`;
  dialog.querySelector('[data-camera-view]').textContent = `Current view: ${viewLabel}`;
  dialog.querySelector('[data-camera-hint]').textContent = kind === 'interior_room'
    ? 'Frame a wall with its floor edge and a corner or doorway. Keep neighboring details in the next photo.'
    : 'Frame the wall inside the corner marks. Keep windows, doors or edges shared between photos; use overlapping rows if the facade is tall.';
  document.body.appendChild(dialog);
  const video = dialog.querySelector('video');
  const ghost = dialog.querySelector('canvas');
  const toggle = dialog.querySelector('[data-camera-ghost]');
  const shutter = dialog.querySelector('[data-camera-shutter]');
  const retake = dialog.querySelector('[data-camera-retake]');
  const status = dialog.querySelector('[data-camera-status]');
  let stream, closed = false, taking = false, saved = 0;
  let lastPhotoId = '';
  const close = () => {
    if (closed) return;
    closed = true; stream?.getTracks().forEach(track => track.stop()); video.srcObject = null;
    document.removeEventListener('visibilitychange', hidden);
    signal.removeEventListener('abort', close);
    dialog.close(); dialog.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  };
  const hidden = () => { if (document.hidden) close(); };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.querySelector('[data-camera-close]').onclick = close;
  dialog.querySelector('[data-camera-done]').onclick = close;
  toggle.onchange = () => { ghost.hidden = !toggle.checked; };
  signal.addEventListener('abort', close, { once: true });
  document.addEventListener('visibilitychange', hidden);
  dialog.showModal();
  if (signal.aborted) { close(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
    if (closed) { stream.getTracks().forEach(track => track.stop()); return; }
    video.srcObject = stream;
    await video.play();
    if (closed) return;
    shutter.disabled = false;
    status.textContent = 'Camera ready. Photos stay on this device until you save or upload.';
  } catch (error) {
    if (closed) return;
    stream?.getTracks().forEach(track => track.stop());
    status.textContent = error.name === 'NotAllowedError'
      ? 'Camera permission was not granted. Close this camera and use Add photos, or allow camera access in your browser settings.'
      : 'The camera could not start. Close this camera and use Add photos from your camera or library.';
  }
  shutter.onclick = async () => {
    if (taking || closed || !video.videoWidth) return;
    taking = true; shutter.disabled = true; retake.disabled = true;
    try {
      const frame = document.createElement('canvas');
      frame.width = video.videoWidth; frame.height = video.videoHeight;
      frame.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(resolve => frame.toBlob(resolve, 'image/jpeg', 0.94));
      if (!blob) throw Error('The camera could not save that frame. Try again.');
      if (closed) return;
      status.textContent = 'Checking and saving photo…';
      const result = await onPhoto(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      const accepted = typeof result === 'number' ? result : result?.accepted;
      if (closed) return;
      if (!accepted) throw Error('Photo was not added. Close the camera to check the capture message or photo limit.');
      saved++;
      lastPhotoId = result?.id || '';
      ghost.width = frame.width; ghost.height = frame.height;
      ghost.getContext('2d').drawImage(frame, 0, 0);
      toggle.disabled = false; ghost.hidden = !toggle.checked;
      const warnings = [];
      if (['soft', 'blurry'].includes(result?.quality?.focus)) warnings.push('Looks soft or blurry—hold still and consider retaking.');
      if (result?.quality?.exposure === 'too_dark') warnings.push('Looks dark—use more even light.');
      if (result?.quality?.exposure === 'too_bright') warnings.push('Looks overexposed—avoid glare.');
      status.textContent = `${saved} photo${saved === 1 ? '' : 's'} saved. ${warnings.length ? warnings.join(' ') + ' These are estimates; check the photo.' : 'Move slightly, keep shared details, then hold still.'} Close the camera to change the view label.`;
    } catch (error) { if (!closed) status.textContent = error.message; }
    finally { taking = false; if (!closed) { shutter.disabled = false; retake.disabled = !lastPhotoId || !onRetake; } }
  };
  retake.onclick = async () => {
    if (taking || closed || !lastPhotoId || !onRetake) return;
    taking = true; shutter.disabled = true; retake.disabled = true;
    try {
      await onRetake(lastPhotoId);
      if (closed) return;
      saved = Math.max(0, saved - 1); lastPhotoId = ''; ghost.hidden = true; toggle.checked = false; toggle.disabled = true;
      status.textContent = 'Last local photo removed. Hold still and take its replacement.';
    } catch (error) { if (!closed) status.textContent = error.message; }
    finally { taking = false; if (!closed) { shutter.disabled = false; retake.disabled = !lastPhotoId; } }
  };
  return { close };
}
