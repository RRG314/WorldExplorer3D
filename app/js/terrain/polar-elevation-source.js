import { xyzTileBounds, WEB_MERCATOR_RADIUS_METERS } from './source-contract.js?v=2';

export const POLAR_ELEVATION_SOURCE = Object.freeze({
  provider: 'pgc-rema-orthometric', dataset: 'Reference Elevation Model of Antarctica',
  product: 'REMA mosaic, Esri Height Orthometric', representation: 'stereo-derived surface elevation; not classified bare earth',
  projection: 'EPSG:3857 delivery from EPSG:3031', verticalDatum: 'EGM2008',
  runtimeClassification: 'surface-elevation-fallback', effectiveSourceResolution: 'REMA mosaic; resampled delivery grid',
  sourceDocument: 'https://www.pgc.umn.edu/data/rema/'
});
const ENDPOINT = 'https://di-pgc.img.arcgis.com/arcgis/rest/services/rema_latest/ImageServer/exportImage';
export function isPolarElevationTile(z, x, y) {
  const b = xyzTileBounds(x, y, z);
  return b.north <= -60;
}

// Deliberately small decoder for the requested, uncompressed, tiled Float32
// GeoTIFF response. Reject changed encodings rather than interpreting RGB as height.
export function decodeFloatElevationTiff(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16 || buffer.byteLength > 2 * 1024 * 1024) throw Error('Invalid elevation raster size');
  const v = new DataView(buffer), little = v.getUint16(0, true) === 0x4949;
  if (!little && v.getUint16(0, false) !== 0x4d4d) throw Error('Elevation raster is not TIFF');
  if (v.getUint16(2, little) !== 42) throw Error('Unsupported elevation TIFF version');
  const offset = v.getUint32(4, little), count = v.getUint16(offset, little), tags = new Map();
  if (count > 128 || offset + 2 + count * 12 + 4 > buffer.byteLength) throw Error('Invalid TIFF directory');
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12, tag = v.getUint16(at, little), type = v.getUint16(at + 2, little), n = v.getUint32(at + 4, little);
    const bytes = type === 3 ? 2 : type === 4 ? 4 : 0;
    if (!bytes) continue;
    if (n > 65536) throw Error('TIFF tag exceeds budget');
    const start = bytes * n <= 4 ? at + 8 : v.getUint32(at + 8, little);
    if (start + n * bytes > buffer.byteLength) throw Error('Truncated TIFF tag');
    tags.set(tag, Array.from({ length: n }, (_, j) => bytes === 2 ? v.getUint16(start + j * bytes, little) : v.getUint32(start + j * bytes, little)));
  }
  const one = tag => tags.get(tag)?.[0];
  const width = one(256), height = one(257), tw = one(322), th = one(323);
  if (!(width > 0 && width <= 256 && height > 0 && height <= 256 && tw > 0 && th > 0) ||
      one(258) !== 32 || one(259) !== 1 || one(277) !== 1 || one(339) !== 3) throw Error('Unsupported elevation raster encoding');
  const offsets = tags.get(324), lengths = tags.get(325), columns = Math.ceil(width / tw), rows = Math.ceil(height / th);
  if (offsets?.length !== columns * rows || lengths?.length !== offsets.length) throw Error('Missing elevation tiles');
  const values = new Float32Array(width * height);
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < columns; tx++) {
    const index = ty * columns + tx, start = offsets[index];
    if (lengths[index] < tw * th * 4 || start + lengths[index] > buffer.byteLength) throw Error('Truncated elevation pixels');
    for (let y = 0; y < th && ty * th + y < height; y++) for (let x = 0; x < tw && tx * tw + x < width; x++) {
      const value = v.getFloat32(start + (y * tw + x) * 4, little);
      values[(ty * th + y) * width + tx * tw + x] = Number.isFinite(value) && value > -1000 && value < 6000 ? value : NaN;
    }
  }
  return { values, width, height };
}
export function polarElevationUrl(z, x, y) {
  const halfWorld = Math.PI * WEB_MERCATOR_RADIUS_METERS, span = 2 * halfWorld / 2 ** z;
  const west = x * span - halfWorld, north = halfWorld - y * span;
  // Pixel centers match the existing 256-sample, inclusive-edge tile contract.
  const halfPixel = span / 255 / 2;
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ f: 'image', bbox: [west - halfPixel, north - span - halfPixel, west + span + halfPixel, north + halfPixel].join(','),
    bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'tiff', pixelType: 'F32', compression: 'none', noData: '-9999',
    interpolation: 'RSP_BilinearInterpolation', renderingRule: JSON.stringify({ rasterFunction: 'Height Orthometric' }) });
  return url.href;
}

// Bound provider work independently of the existing image tile requests.
let active = 0;
const queue = [];
function pump() {
  while (active < 3 && queue.length) {
    queue.sort((a, b) => a.priority - b.priority);
    const job = queue.shift();
    job.signal?.removeEventListener('abort', job.cancelQueued);
    if (job.signal?.aborted) { job.resolve(null); continue; }
    active++;
    job.run().then(job.resolve, error => { job.onError?.(String(error)); job.resolve(null); }).finally(() => { active--; pump(); });
  }
}
export function fetchPolarElevationTile(z, x, y, { signal, onError, priority = 0 } = {}) {
  if (!isPolarElevationTile(z, x, y)) return Promise.resolve(null);
  return new Promise(resolve => {
    const job = { signal, resolve, onError, priority, async run() {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 4500);
      try {
        const response = await fetch(polarElevationUrl(z, x, y), { signal: controller.signal });
        if (!response.ok || Number(response.headers.get('content-length')) > 2 * 1024 * 1024) throw Error('Polar elevation unavailable');
        const raster = decodeFloatElevationTiff(await response.arrayBuffer());
        if (raster.width !== 256 || raster.height !== 256) throw Error('Polar elevation dimensions changed');
        return raster;
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
    } };
    job.cancelQueued = () => { const index = queue.indexOf(job); if (index >= 0) { queue.splice(index, 1); resolve(null); } };
    queue.push(job);
    signal?.addEventListener('abort', job.cancelQueued, { once: true });
    pump();
  });
}
export function mergePolarElevation(fallback, raster) {
  if (!raster || raster.values.length !== fallback.length) return null;
  const mask = new Uint8Array(fallback.length);
  let count = 0;
  for (let i = 0; i < fallback.length; i++) if (Number.isFinite(raster.values[i])) {
    fallback[i] = raster.values[i]; mask[i] = 1; count++;
  }
  return count ? { mask, count } : null;
}
export function polarSourceAt(tile, u, v) {
  if (!tile?.polarMask) return null;
  const x = Math.min(254, Math.max(0, Math.floor(u * 255))), y = Math.min(254, Math.max(0, Math.floor(v * 255)));
  return [y * 256 + x, y * 256 + x + 1, (y + 1) * 256 + x, (y + 1) * 256 + x + 1].every(i => tile.polarMask[i]) ? POLAR_ELEVATION_SOURCE : null;
}
