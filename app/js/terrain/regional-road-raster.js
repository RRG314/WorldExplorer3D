import { pavementMaskLayout } from '../world/compiler/pavement-mask.js';

// The same ordered Canvas2D strokes as the terrain publisher, compiled off the
// gameplay thread. Only bounded byte masks cross the worker boundary.
export function rasterizeRegionalRoadPlan(plan, maxTextureSize = 4096, canvasFactory = size => new OffscreenCanvas(size, size)) {
  try {
    if (plan.stats.budgetExceeded) throw new Error('Regional surface-road coverage exceeded its bounded input budget');
    const keys = [...plan.cells.keys()];
    if (!keys.length) return null;
    const layout = pavementMaskLayout(keys, Math.min(4096, maxTextureSize));
    const size = layout.resolution, cellPixels = size * size;
    const masks = new Uint8Array(keys.length * cellPixels);
    const context = canvasFactory(size).getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Road coverage canvas unavailable');
    context.strokeStyle = '#ffffff'; context.lineCap = 'round'; context.lineJoin = 'round';
    let index = 0;
    for (const [key, segments] of plan.cells) {
      const [ix, iz] = key.split(':').map(Number), scale = size / plan.stats.cellSize;
      context.clearRect(0, 0, size, size);
      for (const [x0, z0, x1, z1, width] of segments) {
        context.lineWidth = width * scale; context.beginPath();
        context.moveTo((x0 - ix * plan.stats.cellSize) * scale, (z0 - iz * plan.stats.cellSize) * scale);
        context.lineTo((x1 - ix * plan.stats.cellSize) * scale, (z1 - iz * plan.stats.cellSize) * scale);
        context.stroke();
      }
      const pixels = context.getImageData(0, 0, size, size).data, offset = index++ * cellPixels;
      for (let i = 0; i < cellPixels; i++) masks[offset + i] = pixels[i * 4 + 3];
      plan.cells.delete(key);
    }
    return { keys, layout, masks, stats: { ...plan.stats } };
  } finally { plan.dispose(); }
}

export function ownRegionalRoadPacket(packet) {
  if (!packet || !Array.isArray(packet.keys) || packet.keys.length > 24000 ||
      !(packet.masks instanceof Uint8Array) || !packet.stats ||
      (!packet.error && (!packet.layout || ![8,16,32,64].includes(packet.layout.resolution) ||
        packet.masks.length !== packet.keys.length * packet.layout.resolution ** 2 ||
        packet.keys.some(key => !/^-?\d+:-?\d+$/.test(key)) || new Set(packet.keys).size !== packet.keys.length))) {
    throw new TypeError('Invalid regional road worker packet');
  }
  let disposed = false;
  return { packet, stats: packet.stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof packet.masks?.buffer.transfer === 'function') packet.masks.buffer.transfer(0);
      packet.masks = null; packet.keys.length = 0;
    }
  };
}
