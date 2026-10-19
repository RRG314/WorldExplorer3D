// The bitmap already contains the canonical canvas rasterization. Drawing those
// pixels, rather than rerasterizing vector paths, preserves shoreline antialiasing.
self.onmessage = ({data: bitmap}) => {
  let canvas;
  try {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if (!context) throw Error('Canvas readback unavailable');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const red = new Uint8Array(canvas.width * canvas.height);
    for (let y = 0; y < canvas.height; y += 256) {
      const rgba = context.getImageData(0, y, canvas.width, Math.min(256, canvas.height - y)).data;
      for (let source = 0; source < rgba.length; source += 4) red[y * canvas.width + source / 4] = rgba[source];
    }
    self.postMessage({red}, [red.buffer]);
  } catch (error) {
    self.postMessage({error:String(error?.message || error)});
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
};
