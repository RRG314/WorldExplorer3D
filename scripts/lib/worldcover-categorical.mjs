// ESA WorldCover v200 Map classes, not RGB display-map colors.
// Reads only intersecting COG windows/overviews; never allows a full-file response.
export function worldCoverSourceTile(latitude, longitude) {
  const lat = Math.floor(latitude / 3) * 3;
  const lon = Math.floor(longitude / 3) * 3;
  const id = `${lat < 0 ? 'S' : 'N'}${String(Math.abs(lat)).padStart(2,'0')}${lon < 0 ? 'W' : 'E'}${String(Math.abs(lon)).padStart(3,'0')}`;
  return { lat, lon, id, url: `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${id}_Map.tif` };
}

export async function readWorldCoverClasses(bounds, size, signal, decoder) {
  if (!Number.isInteger(size) || size < 1 || size > 128) throw new Error('Unsupported WorldCover raster size');
  const {latS, latN, lonW, lonE} = bounds;
  if (![latS,latN,lonW,lonE].every(Number.isFinite) || latS < -90 || latN > 90 || lonW < -180 || lonE > 180 || latN <= latS || lonE <= lonW || latN-latS>3 || lonE-lonW>3) throw new Error('Unsupported WorldCover bounds');
  const result = new Uint8Array(size * size);
  const groups = new Map();
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const lat=latN-(y+.5)/size*(latN-latS), lon=lonW+(x+.5)/size*(lonE-lonW);
    const tile=worldCoverSourceTile(lat,lon);
    let g=groups.get(tile.id);
    if(!g){g={tile,minX:x,maxX:x,minY:y,maxY:y};groups.set(tile.id,g);}
    g.minX=Math.min(g.minX,x);g.maxX=Math.max(g.maxX,x);g.minY=Math.min(g.minY,y);g.maxY=Math.max(g.maxY,y);
  }
  const api=decoder || await import('geotiff');
  // At most four intersecting 3-degree source tiles, read serially per request.
  for(const g of groups.values()) {
    signal?.throwIfAborted();
    const tiff=await api.fromUrl(g.tile.url,{allowFullFile:false,blockSize:65536,cacheSize:16},signal);
    const bbox=[lonW+g.minX/size*(lonE-lonW),latN-(g.maxY+1)/size*(latN-latS),lonW+(g.maxX+1)/size*(lonE-lonW),latN-g.minY/size*(latN-latS)];
    const width=g.maxX-g.minX+1,height=g.maxY-g.minY+1;
    const data=await tiff.readRasters({bbox,width,height,samples:[0],interleave:true,resampleMethod:'nearest',signal});
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) result[(g.minY+y)*size+g.minX+x]=data[y*width+x];
  }
  return result;
}
