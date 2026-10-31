// Offline source decoding only. Every output still enters the existing
// accepted-ground compiler; this module owns no runtime height or actor state.
// USGS standard CONUS one-metre products declare NAD83 UTM plus NAVD88.
// The declared zone must still match the actual pinned TIFF/window keys.
export function nad83UtmNavd88HorizontalEpsg(crs){
 const match=/^EPSG:(269(?:0[1-9]|1[0-9]|2[0-3]))\+5703$/.exec(crs);
 return match?Number(match[1]):null;
}
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

// A bounded, unchanged native pixel window is an offline source product, not a
// resampled DEM. Its exact source window and affine are required for decoding.
export function decodeNativeRasterWindow(metadata,bytes,{horizontalEpsg,sourceDimensions,errorPrefix='ground'}={}){
 const fail=()=>{throw Error(`${errorPrefix}_native_window_invalid`);},m=metadata,w=m?.sourceWindow,r=m?.resolution,o=m?.sourceOrigin;
 if(m?.schemaVersion!==1||m.encoding!=='float32-native-window-v1'||m.byteOrder!=='little-endian'||m.nativeValuesUnchanged!==true||
  m.keys?.ProjectedCSTypeGeoKey!==horizontalEpsg||m.keys?.GTRasterTypeGeoKey!==1||
  !Array.isArray(sourceDimensions)||sourceDimensions.length!==2||sourceDimensions.some(n=>!Number.isSafeInteger(n)||n<1)||
  !Array.isArray(w)||w.length!==4||w.some(n=>!Number.isSafeInteger(n)||n<0)||w[2]>sourceDimensions[0]||w[3]>sourceDimensions[1]||
  !Array.isArray(r)||r.length!==2||r[0]!==1||r[1]!==-1||!Array.isArray(o)||o.length!==3||!o.slice(0,2).every(Number.isFinite)||
  m.width!==w[2]-w[0]||m.height!==w[3]-w[1]||m.width<=0||m.height<=0||m.width*m.height>3000000||
  !Array.isArray(m.origin)||m.origin.length!==2||m.origin.some((n,i)=>!Number.isFinite(n)||Math.abs(n-(o[i]+w[i]*r[i]))>1e-9)||
  !(bytes instanceof Uint8Array)||bytes.byteLength!==m.width*m.height*4||m.bytes!==bytes.byteLength||!Number.isFinite(m.nodata))fail();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),data=new Float32Array(m.width*m.height);
 for(let i=0;i<data.length;i++)data[i]=view.getFloat32(i*4,true);
 return {origin:m.origin,resolution:r,width:m.width,height:m.height,nodata:m.nodata,data};
}
