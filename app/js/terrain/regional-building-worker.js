import { getVectorTileLib } from '../world/shortbread-source.js?v=20';
import { createRegionalBuildingCompiler } from './regional-building-compiler.js';

let compiler = null, busy = false;
self.onmessage = async ({ data }) => {
  const id = data.id;
  try {
    if (busy) throw new Error('Regional compiler accepts one job at a time');
    busy = true;
    let result;
    if (data.type === 'start') {
      if (compiler) throw new Error('Regional compiler already owns a request');
      // Older browsers can keep the existing main-thread road rasterizer while
      // still offloading buildings. Never fail a world for missing OffscreenCanvas.
      let roadWorkerEnabled = false;
      try { roadWorkerEnabled = Boolean(data.options.roadFrame && typeof OffscreenCanvas === 'function' && new OffscreenCanvas(1,1).getContext('2d')); } catch {}
      compiler = createRegionalBuildingCompiler({...data.options,roadFrame:roadWorkerEnabled ? data.options.roadFrame : null});
      result = {roadWorkerEnabled};
    } else if (data.type === 'tile' && compiler) {
      const { Pbf, VectorTile } = await getVectorTileLib();
      result = compiler.addTile({ ...data.tile, tile: new VectorTile(new Pbf(data.tile.bytes)) });
    } else if (data.type === 'finish' && compiler) {
      result = compiler.finish(); compiler = null;
    } else throw new Error('Invalid regional compiler request');
    const transfer = result.data ? [result.data.buffer] : [];
    if (result.roadPacket) transfer.push(result.roadPacket.masks.buffer);
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error.message) });
  } finally { busy = false; }
};
