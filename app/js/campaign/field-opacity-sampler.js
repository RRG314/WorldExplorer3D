// Explicit field measurements only. A bounded CPU copy of cutout alpha keeps
// leaf rectangles from becoming invented vegetation hits. Texture ownership
// remains with the model lease; this owner releases only its sampled pixels.
export function createFieldOpacitySampler({ maxBytes = 8 * 1024 * 1024, maxEdge = 512 } = {}) {
  const cache = new Map();
  let bytes = 0,
    disposed = false;
  function pixels(texture) {
    const prior = cache.get(texture),
      image = texture.image;
    if (prior && prior.version === texture.version && prior.image === image) {
      cache.delete(texture);
      cache.set(texture, prior);
      return prior;
    }
    if (prior) {
      bytes -= prior.data.byteLength;
      cache.delete(texture);
    }
    const sourceWidth = Number(image?.width || image?.naturalWidth),
      sourceHeight = Number(image?.height || image?.naturalHeight);
    if (!(sourceWidth > 0 && sourceHeight > 0))
      throw Error('Wait for this plant’s texture before taking a field reading.');
    const scale = Math.min(1, maxEdge / sourceWidth, maxEdge / sourceHeight),
      width = Math.max(1, Math.floor(sourceWidth * scale)),
      height = Math.max(1, Math.floor(sourceHeight * scale));
    if (width * height * 4 > maxBytes)
      throw Error('This field texture exceeds the observation memory limit.');
    let data;
    if (
      image.data &&
      (image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) &&
      image.data.length === sourceWidth * sourceHeight * 4
    ) {
      data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const from = (Math.floor(y / scale) * sourceWidth + Math.floor(x / scale)) * 4,
            to = (y * width + x) * 4;
          for (let c = 0; c < 4; c++) data[to + c] = image.data[from + c];
        }
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw Error('Canvas unavailable');
        context.drawImage(image, 0, 0, width, height);
        data = context.getImageData(0, 0, width, height).data;
      } catch {
        throw Error('The plant texture could not be read. Reopen the field station to retry.');
      } finally {
        canvas.width = canvas.height = 1;
      }
    }
    while (bytes + data.byteLength > maxBytes && cache.size) {
      const key = cache.keys().next().value;
      bytes -= cache.get(key).data.byteLength;
      cache.delete(key);
    }
    const row = { image, version: texture.version, width, height, data };
    cache.set(texture, row);
    bytes += data.byteLength;
    return row;
  }
  function channel(texture, uv, index) {
    const p = uv.clone();
    texture.transformUv(p);
    const row = pixels(texture),
      x = Math.max(0, Math.min(row.width - 1, Math.floor(p.x * row.width))),
      y = Math.max(0, Math.min(row.height - 1, Math.floor(p.y * row.height)));
    return row.data[(y * row.width + x) * 4 + index] / 255;
  }
  function accepts(hit) {
    if (disposed) throw Error('The field observation has stopped.');
    const materials = hit?.object?.material,
      material = Array.isArray(materials) ? materials[hit.face?.materialIndex || 0] : materials;
    if (!material || material.visible === false) return false;
    if (!material.transparent && !(material.alphaTest > 0)) return true;
    let alpha = material.opacity ?? 1;
    if ((material.map || material.alphaMap) && !hit.uv)
      throw Error('The plant surface has no readable texture coordinates.');
    if (material.map) alpha *= channel(material.map, hit.uv, 3);
    if (material.alphaMap) alpha *= channel(material.alphaMap, hit.uv, 1);
    return alpha > 0 && alpha >= Math.max(material.alphaTest || 0, material.transparent ? 0.2 : 0);
  }
  return {
    accepts,
    snapshot: () => ({ textures: cache.size, bytes, maxBytes }),
    dispose() {
      disposed = true;
      cache.clear();
      bytes = 0;
    }
  };
}
