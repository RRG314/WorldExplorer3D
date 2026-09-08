const DATA_API = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/';
export const WORLD_COVER_CLASS_MIME = 'application/vnd.we3d.worldcover-classes';

export function worldCoverSourceTile(latitude, longitude) {
  const lat = Math.floor(latitude / 3) * 3, lon = Math.floor(longitude / 3) * 3;
  const id = `${lat < 0 ? 'S' : 'N'}${String(Math.abs(lat)).padStart(2,'0')}${lon < 0 ? 'W' : 'E'}${String(Math.abs(lon)).padStart(3,'0')}`;
  return {lat,lon,id,url:`https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${id}_Map.tif`};
}

export function worldCoverWindows(bounds, size) {
  if (!Number.isInteger(size) || size < 1 || size > 128) throw new Error('Unsupported WorldCover raster size');
  const {latS,latN,lonW,lonE} = bounds;
  if (![latS,latN,lonW,lonE].every(Number.isFinite) || latS < -90 || latN > 90 || lonW < -180 || lonE > 180 || latN <= latS || lonE <= lonW || latN-latS>3 || lonE-lonW>3) throw new Error('Unsupported WorldCover bounds');
  const groups = new Map();
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const tile=worldCoverSourceTile(latN-(y+.5)/size*(latN-latS),lonW+(x+.5)/size*(lonE-lonW));
    let g=groups.get(tile.id);
    if(!g){g={tile,minX:x,maxX:x,minY:y,maxY:y};groups.set(tile.id,g);}
    g.minX=Math.min(g.minX,x);g.maxX=Math.max(g.maxX,x);g.minY=Math.min(g.minY,y);g.maxY=Math.max(g.maxY,y);
  }
  return [...groups.values()].map(g=>({...g,width:g.maxX-g.minX+1,height:g.maxY-g.minY+1,
    bbox:[lonW+g.minX/size*(lonE-lonW),latN-(g.maxY+1)/size*(latN-latS),lonW+(g.maxX+1)/size*(lonE-lonW),latN-g.minY/size*(latN-latS)]}));
}

export function decodeWorldCoverNpy(buffer, width, height) {
  const bytes=new Uint8Array(buffer), view=new DataView(buffer);
  if(bytes.length<12 || bytes[0]!==147 || new TextDecoder().decode(bytes.slice(1,6))!=='NUMPY') throw new Error('Invalid class raster signature');
  const version=bytes[6];
  if(version!==1 && version!==2) throw new Error('Unsupported class raster version');
  const offset=version===1 ? 10 : 12;
  const length=version===1 ? view.getUint16(8,true) : view.getUint32(8,true);
  if(length>4096 || offset+length>bytes.length) throw new Error('Invalid class raster header');
  const header=new TextDecoder().decode(bytes.slice(offset,offset+length));
  const shape=header.match(/'shape':\s*\(([^)]*)\)/)?.[1].split(',').map(v=>v.trim()).filter(Boolean).map(Number);
  if(!/'descr':\s*'\|u1'/.test(header) || !/'fortran_order':\s*False/.test(header) || JSON.stringify(shape)!==JSON.stringify([1,height,width]) || bytes.length!==offset+length+width*height) throw new Error('Unexpected class raster layout');
  const result=bytes.slice(offset+length);
  const classes=new Set([0,10,20,30,40,50,60,70,80,90,95,100]);
  if(result.some(value=>!classes.has(value))) throw new Error('Unknown WorldCover class byte');
  return result;
}

export async function fetchWorldCoverClasses(bounds,size,signal,fetchImpl=globalThis.fetch) {
  const windows=worldCoverWindows(bounds,size);
  const result=new Uint8Array(size*size);
  for(const g of windows) {
    signal?.throwIfAborted();
    const query=new URLSearchParams({collection:'esa-worldcover',item:`ESA_WorldCover_10m_2021_v200_${g.tile.id}`,assets:'map',resampling:'nearest',reproject:'nearest',return_mask:'false'});
    const response=await fetchImpl(`${DATA_API}${g.bbox.join(',')}/${g.width}x${g.height}.npy?${query}`,{signal,credentials:'omit'});
    if(!response.ok) throw Object.assign(new Error(`WorldCover numeric HTTP ${response.status}`),{status:response.status});
    const reader=response.body.getReader();
    const chunks=[];let length=0;
    try {
      for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>32768){await reader.cancel();throw new Error('Class raster exceeds bounded payload');}chunks.push(part.value);}
    } finally {reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const data=decodeWorldCoverNpy(bytes.buffer,g.width,g.height);
    for(let y=0;y<g.height;y++) result.set(data.subarray(y*g.width,(y+1)*g.width),(g.minY+y)*size+g.minX);
  }
  return result;
}
