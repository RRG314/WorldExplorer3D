// Local video decode only. No upload, microphone request or alternate photo store.
function mediaEvent(video, type, signal, start) {
  return new Promise((resolve, reject) => {
    const done = error => { clearTimeout(timer); video.removeEventListener(type, ok); video.removeEventListener('error', bad); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const ok = () => done();
    const bad = () => done(new Error('This browser could not decode the video. Try a short MP4 clip or use photos.'));
    const abort = () => done(new DOMException('Video import stopped.', 'AbortError'));
    const timer = setTimeout(() => done(new Error('Video decoding took too long. Try a shorter clip or use photos.')), 15000);
    video.addEventListener(type, ok, {once:true}); video.addEventListener('error', bad, {once:true}); signal.addEventListener('abort', abort, {once:true});
    if (signal.aborted) return abort();
    try { start(); } catch (error) { done(error); }
  });
}

export async function extractVideoFrames(file, {signal, maxFrames = 24, onFrame, onProgress = () => {}}) {
  if (!(file instanceof Blob) || file.size < 1 || file.size > 150 * 1024 * 1024 || !/^video\//.test(file.type)) throw Error('Choose a video smaller than 150 MB.');
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 48 || typeof onFrame !== 'function') throw Error('No room for more frames in this capture.');
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  const sample = document.createElement('canvas'); sample.width = 32; sample.height = 32;
  const small = sample.getContext('2d', {willReadFrequently:true});
  let kept = 0, duplicates = 0, previous = null;
  try {
    await mediaEvent(video, 'loadedmetadata', signal, () => {video.src = url;});
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 90) throw Error('Use clips up to 90 seconds. Record several short passes for a long building.');
    if (Math.max(video.videoWidth, video.videoHeight) < 1280 || video.videoWidth * video.videoHeight > 34_000_000) throw Error('Use a video at least 1280 pixels on its long edge, up to 8K resolution.');
    const scale = Math.min(1, 4096 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', {alpha:false});
    const count = Math.min(maxFrames, Math.max(1, Math.ceil(video.duration / 1.5)));
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      const timestamp = video.duration * (i + 0.5) / count;
      await mediaEvent(video, 'seeked', signal, () => {video.currentTime = timestamp;});
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      small.drawImage(canvas, 0, 0, 32, 32);
      const pixels = small.getImageData(0, 0, 32, 32).data;
      let difference = 0;
      if (previous) for (let k=0;k<pixels.length;k+=4) difference += Math.abs(pixels[k]-previous[k])+Math.abs(pixels[k+1]-previous[k+1])+Math.abs(pixels[k+2]-previous[k+2]);
      if (previous && difference / (32*32*3) < 1.5) duplicates++;
      else {
        const blob = await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Could not extract video frame.')), 'image/jpeg', .94));
        signal.throwIfAborted();
        await onFrame(new File([blob], `video-frame-${i+1}.jpg`, {type:'image/jpeg'}), {timestampSeconds:timestamp});
        previous = pixels; kept++;
      }
      onProgress({checked:i+1,total:count,kept,duplicates});
    }
    return {kept, duplicates, sampled:count, method:'time-sampled-near-duplicate-filter', coverageVerified:false};
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); canvas.width = canvas.height = 0; }
}
