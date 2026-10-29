// Native EA pixel centres, not cell corners. Missing source pixels are never
// filled from another provider or silently replaced with zero.
export function eaRasterMetadata(image){
 const keys=image.getGeoKeys(),matrix=image.fileDirectory.getValue('ModelTransformation');
 if(keys.ProjectedCSTypeGeoKey!==27700||keys.GTRasterTypeGeoKey!==1)throw Error('ea_raster_crs_or_grid_invalid');
 // geotiff 3 getResolution negates the Y coefficient of an axis-aligned
 // ModelTransformation. Use the actual affine here, including its sign.
 if(matrix&&(matrix.length!==16||matrix[1]!==0||matrix[4]!==0||matrix[2]!==0||matrix[6]!==0))throw Error('ea_raster_rotated_grid_unsupported');
 const origin=matrix?[matrix[3],matrix[7]]:image.getOrigin().slice(0,2);
 const resolution=matrix?[matrix[0],matrix[5]]:image.getResolution().slice(0,2);
 if(!origin.every(Number.isFinite)||!resolution.every(Number.isFinite)||resolution[0]<=0||resolution[1]>=0)throw Error('ea_raster_axes_invalid');
 return {origin,resolution,width:image.getWidth(),height:image.getHeight(),nodata:image.getGDALNoData()};
}

export function sampleEaRaster(raster,easting,northing){
 const {origin,resolution,width,height,data,nodata}=raster;
 const x=(easting-origin[0])/resolution[0]-.5,y=(northing-origin[1])/resolution[1]-.5;
 const left=Math.floor(x),top=Math.floor(y),tx=x-left,ty=y-top;
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>width-1||y>height-1)throw Error('ea_grid_outside_source');
 let value=0;
 for(const [dx,dy,weight] of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){
  if(weight<=1e-12)continue;
  const sample=data[(top+dy)*width+left+dx];
  if(!Number.isFinite(sample)||sample===nodata)throw Error('ea_grid_missing_source');
  value+=sample*weight;
 }
 return value;
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
