// Offline source decoding only. Every output still enters the existing
// accepted-ground compiler; this module owns no runtime height or actor state.
export function nativeRasterMetadata(image,{horizontalEpsg,verticalEpsg=null,errorPrefix='ground'}={}){
 const keys=image.getGeoKeys(),matrix=image.fileDirectory.getValue('ModelTransformation');
 const fail=reason=>{throw Error(`${errorPrefix}_raster_${reason}`);};
 if(!Number.isSafeInteger(horizontalEpsg)||keys.ProjectedCSTypeGeoKey!==horizontalEpsg||keys.GTRasterTypeGeoKey!==1||
  verticalEpsg!==null&&keys.VerticalCSTypeGeoKey!==verticalEpsg)fail('crs_or_grid_invalid');
 // geotiff 3 negates the Y coefficient reported by getResolution for this
 // affine form. Read the actual signed matrix, preserving north-up geometry.
 if(matrix&&(matrix.length!==16||matrix[1]!==0||matrix[4]!==0||matrix[2]!==0||matrix[6]!==0))fail('rotated_grid_unsupported');
 const origin=matrix?[matrix[3],matrix[7]]:image.getOrigin().slice(0,2);
 const resolution=matrix?[matrix[0],matrix[5]]:image.getResolution().slice(0,2);
 if(!origin.every(Number.isFinite)||!resolution.every(Number.isFinite)||resolution[0]<=0||resolution[1]>=0)fail('axes_invalid');
 return {origin,resolution,width:image.getWidth(),height:image.getHeight(),nodata:image.getGDALNoData()};
}

export function sampleNativeRaster(raster,easting,northing,errorPrefix='ground'){
 const {origin,resolution,width,height,data,nodata}=raster;
 const x=(easting-origin[0])/resolution[0]-.5,y=(northing-origin[1])/resolution[1]-.5;
 const left=Math.floor(x),top=Math.floor(y),tx=x-left,ty=y-top;
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>width-1||y>height-1)throw Error(`${errorPrefix}_grid_outside_source`);
 let value=0;
 for(const [dx,dy,weight] of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){
  if(weight<=1e-12)continue;
  const sample=data[(top+dy)*width+left+dx];
  if(!Number.isFinite(sample)||sample===nodata)throw Error(`${errorPrefix}_grid_missing_source`);
  value+=sample*weight;
 }
 return value;
}
