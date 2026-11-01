// Native EA pixel centres, not cell corners. Missing source pixels are never
// filled from another provider or silently replaced with zero.
import {nativeRasterMetadata,sampleNativeRaster} from './bare-earth-raster.mjs';
export function eaRasterMetadata(image){
 return nativeRasterMetadata(image,{horizontalEpsg:27700,errorPrefix:'ea'});
}

export function sampleEaRaster(raster,easting,northing){
 return sampleNativeRaster(raster,easting,northing,'ea');
}

export function normalizeEaGrid(raster,coordinates,{sampleCount}={}){
 if(!Number.isSafeInteger(sampleCount)||sampleCount<1||sampleCount>1500000||coordinates.byteLength!==sampleCount*24)throw Error('ea_grid_coordinates_invalid');
 const view=new DataView(coordinates.buffer,coordinates.byteOffset,coordinates.byteLength),heights=new Float64Array(sampleCount);
 let minimum=Infinity,maximum=-Infinity;
 for(let index=0;index<sampleCount;index++){
  const offset=index*24,e=view.getFloat64(offset,true),n=view.getFloat64(offset+8,true),datumOffset=view.getFloat64(offset+16,true);
  const height=sampleEaRaster(raster,e,n)-datumOffset;
  if(!Number.isFinite(height)||height< -30||height>1600)throw Error('ea_grid_elevation_invalid');
  heights[index]=height;minimum=Math.min(minimum,height);maximum=Math.max(maximum,height);
 }
 return {heights,minimum,maximum};
}

export function encodeEaGround(heights,{scaleMeters=.01}={}){
 if(!heights?.length||!Number.isFinite(scaleMeters)||scaleMeters<.001||scaleMeters>.25)throw Error('ea_quantization_invalid');
 let minimum=Infinity;
 for(const height of heights){if(!Number.isFinite(height))throw Error('ea_quantization_nonfinite');minimum=Math.min(minimum,height);}
 const offsetMeters=Math.floor(minimum/scaleMeters)*scaleMeters,bytes=Buffer.alloc(heights.length*2);
 let maximumErrorMeters=0;
 heights.forEach((height,index)=>{
  const integer=Math.round((height-offsetMeters)/scaleMeters);
  if(integer<0||integer>65535)throw Error('ea_quantization_range');
  bytes.writeUInt16LE(integer,index*2);
  maximumErrorMeters=Math.max(maximumErrorMeters,Math.abs(offsetMeters+integer*scaleMeters-height));
 });
 return {type:'row-major-u16-shared-ground-v1',byteOrder:'little-endian',sampleCount:heights.length,offsetMeters,scaleMeters,
  groundElevationMetersBase64:bytes.toString('base64'),maximumErrorMeters};
}
