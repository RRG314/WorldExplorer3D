// Offline 1 m RLP DGM source mosaic. Interpolate across actual pixel centres,
// including contributing pixels in adjoining files. No nodata or edge filling.
// The bounded decoded cache is discarded after compilation; the existing
// accepted-ground artifact remains the game's sole delivered height authority.
export function createRlpGroundMosaic({tiles,loadTile,maxResidentTiles=12}={}){
 if(!Array.isArray(tiles)||!tiles.length||tiles.length>256||typeof loadTile!=='function'||
  !Number.isInteger(maxResidentTiles)||maxResidentTiles<1||maxResidentTiles>16)throw Error('rlp_mosaic_configuration_invalid');
 const sources=new Map(),cache=new Map();let preparing=false,disposed=false;
 const stats={loads:0,peakResidentTiles:0};
 for(const tile of tiles){
  if(!Number.isInteger(tile.eastingKm)||!Number.isInteger(tile.northingKm))throw Error('rlp_mosaic_tile_identity_invalid');
  const key=`${tile.eastingKm}:${tile.northingKm}`;
  if(sources.has(key))throw Error('rlp_mosaic_duplicate_tile');sources.set(key,Object.freeze({...tile}));
 }
 function coordinates(easting,northing){
  if(!Number.isFinite(easting)||!Number.isFinite(northing)||Math.abs(easting)>1e8||Math.abs(northing)>1e8)throw Error('rlp_mosaic_coordinates_invalid');
  const x=easting-.5,y=northing-.5,left=Math.floor(x),bottom=Math.floor(y);
  return {left,bottom,tx:x-left,ty:y-bottom};
 }
 function contributors(easting,northing,visit){
  const {left,bottom,tx,ty}=coordinates(easting,northing);
  for(const [dx,dy,weight] of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){
   if(weight<=1e-12)continue;
   const e=left+dx,n=bottom+dy,ek=Math.floor(e/1000),nk=Math.floor(n/1000);
   visit(`${ek}:${nk}`,999-(n-nk*1000),e-ek*1000,weight);
  }
 }
 async function prepareRow(view,{offset=0,count}={}){
  if(disposed)throw Error('rlp_mosaic_disposed');if(preparing)throw Error('rlp_mosaic_row_busy');
  if(!(view instanceof DataView)||!Number.isInteger(offset)||offset<0||!Number.isInteger(count)||count<1||count>8192||(offset+count)*24>view.byteLength)throw Error('rlp_mosaic_row_invalid');
  const needed=new Set();
  for(let i=offset;i<offset+count;i++)contributors(view.getFloat64(i*24,true),view.getFloat64(i*24+8,true),key=>needed.add(key));
  if(needed.size>maxResidentTiles)throw Error('rlp_mosaic_row_exceeds_cache');
  for(const key of needed)if(!sources.has(key))throw Error('rlp_mosaic_missing_tile:'+key);
  preparing=true;
  try{
   for(const key of needed){
    if(cache.has(key))continue;
    while(cache.size>=maxResidentTiles){const victim=[...cache.keys()].find(k=>!needed.has(k));if(!victim)throw Error('rlp_mosaic_cache_exhausted');cache.delete(victim);}
    const source=sources.get(key),raster=await loadTile(source);
    if(disposed)throw Error('rlp_mosaic_disposed');
    if(raster?.width!==1000||raster.height!==1000||raster.origin?.[0]!==source.eastingKm*1000||raster.origin?.[1]!==((source.northingKm+1)*1000)||
      raster.resolution?.[0]!==1||raster.resolution?.[1]!==-1||!(raster.data instanceof Float32Array)||raster.data.length!==1000000)throw Error('rlp_mosaic_tile_grid_mismatch');
    cache.set(key,raster);stats.loads++;stats.peakResidentTiles=Math.max(stats.peakResidentTiles,cache.size);
   }
   // Refresh only used entries. No tile needed by this row can be evicted while
   // its four contributors are sampled, even at an exact four-file corner.
   for(const key of needed){const value=cache.get(key);cache.delete(key);cache.set(key,value);}
  }finally{preparing=false;}
 }
 function sample(easting,northing){
  if(disposed)throw Error('rlp_mosaic_disposed');if(preparing)throw Error('rlp_mosaic_row_busy');
  let height=0;
  contributors(easting,northing,(key,row,column,weight)=>{
   const raster=cache.get(key);if(!raster)throw Error('rlp_mosaic_unprepared_tile:'+key);
   const value=raster.data[row*1000+column];if(!Number.isFinite(value)||value===raster.nodata)throw Error('rlp_mosaic_missing_source_pixel');height+=value*weight;
  });return height;
 }
 return {prepareRow,sample,stats,snapshot:()=>({...stats,residentTiles:cache.size,decodedHeightBytes:cache.size*4000000}),dispose(){disposed=true;cache.clear();}};
}
