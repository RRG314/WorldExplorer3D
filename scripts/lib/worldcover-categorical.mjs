// Offline COG preparation shares the browser's source-grid contract.
import {worldCoverWindows} from '../../app/js/terrain/worldcover-categorical.js';
export {worldCoverSourceTile} from '../../app/js/terrain/worldcover-categorical.js';
export async function readWorldCoverClasses(bounds,size,signal,decoder) {
  const windows=worldCoverWindows(bounds,size);
  const api=decoder || await import('geotiff');
  const result=new Uint8Array(size*size);
  for(const g of windows) {
    signal?.throwIfAborted();
    const tiff=await api.fromUrl(g.tile.url,{allowFullFile:false,blockSize:65536,cacheSize:16},signal);
    const data=await tiff.readRasters({bbox:g.bbox,width:g.width,height:g.height,samples:[0],interleave:true,resampleMethod:'nearest',signal});
    for(let y=0;y<g.height;y++) result.set(data.subarray(y*g.width,(y+1)*g.width),(g.minY+y)*size+g.minX);
  }
  return result;
}
