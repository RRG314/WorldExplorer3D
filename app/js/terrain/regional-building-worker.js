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
      compiler = createRegionalBuildingCompiler(data.options); result = {};
    } else if (data.type === 'tile' && compiler) {
      const { Pbf, VectorTile } = await getVectorTileLib();
      result = compiler.addTile({ ...data.tile, tile: new VectorTile(new Pbf(data.tile.bytes)) });
    } else if (data.type === 'finish' && compiler) {
      result = compiler.finish(); compiler = null;
    } else throw new Error('Invalid regional compiler request');
    self.postMessage({ id, result }, result.data ? [result.data.buffer] : []);
  } catch (error) {
    self.postMessage({ id, error: String(error.message) });
  } finally { busy = false; }
};
