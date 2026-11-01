#!/usr/bin/env node
// Initial bounded acquisition. Published manifests are subsequently reproduced
// by extract-native-ground-window.mjs. Neither tool owns runtime terrain.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {fromUrl} from 'geotiff';
import {nativeRasterMetadata,decodeNativeRasterWindow,nad83UtmNavd88HorizontalEpsg} from '../lib/bare-earth-raster.mjs';
const flag=n=>process.argv.find(a=>a.startsWith(n+'='))?.slice(n.length+1),headerFile=flag('--header'),coordinatesFile=flag('--coordinates'),transformFile=flag('--transform'),out=flag('--output-dir');
if(!headerFile||!coordinatesFile||!transformFile||!out)throw Error('--header=FILE --coordinates=FILE --transform=FILE --output-dir=NEW_DIR required');
const header=JSON.parse(await fs.readFile(headerFile)),transform=JSON.parse(await fs.readFile(transformFile)),horizontalEpsg=nad83UtmNavd88HorizontalEpsg(transform.target),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!horizontalEpsg||header.keys?.ProjectedCSTypeGeoKey!==horizontalEpsg||
 !header.sourceUrl?.startsWith('https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/')||
 typeof header.etag!=='string'||!Number.isSafeInteger(header.sourceFileBytes)||header.sourceFileBytes<1||
 !Array.isArray(header.sourceDimensions)||header.sourceDimensions.length!==2||header.sourceDimensions.some(n=>!Number.isSafeInteger(n)||n<1)||
 !(transform.accuracyMeters>=0)||transform.source!=='EPSG:9056+3855')throw Error('native_window_preparation_source_invalid');
if(await fs.stat(out).catch(()=>null))throw Error('preserve_existing_native_window');
const space=await fs.statfs(path.dirname(out));if(space.bavail*space.bsize<1024**3)throw Error('native_window_disk_guard');
const coordinates=await fs.readFile(coordinatesFile);
if(!coordinates.length||coordinates.length%24||coordinates.length>1500000*24)throw Error('native_window_coordinate_capacity');
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
for(let i=0;i<coordinates.length;i+=24){const x=coordinates.readDoubleLE(i),y=coordinates.readDoubleLE(i+8);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('native_window_coordinate_invalid');minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
await fs.mkdir(out);const original=globalThis.fetch,requests=[];let total=0,tiff;
globalThis.fetch=async(input,init={})=>{
 if(requests.length>=512)throw Error('native_window_request_capacity');
 const response=await original(input,{...init,signal:AbortSignal.timeout(25000)});
 if(response.status!==206||response.headers.get('etag')!==header.etag||!response.headers.get('content-range')?.endsWith('/'+header.sourceFileBytes)){
  await response.body?.cancel();throw Error('native_window_source_changed');
 }
 const reader=response.body.getReader(),parts=[];let count=0;
 try{for(;;){const next=await reader.read();if(next.done)break;count+=next.value.byteLength;if(count>1024**2||total+count>64*1024**2)throw Error('native_window_download_capacity');parts.push(next.value);}}
 finally{await reader.cancel();}
 const bytes=Buffer.concat(parts),file='range-'+requests.length+'.bin';total+=bytes.length;
 requests.push({range:new Headers(init.headers).get('range'),status:206,contentRange:response.headers.get('content-range'),etag:header.etag,bytes:bytes.length,sha256:hash(bytes),file});await fs.writeFile(path.join(out,file),bytes);
 return new Response(bytes,{status:206,headers:response.headers});
};
try{
 tiff=await fromUrl(header.sourceUrl,{headers:{'If-Match':header.etag},allowFullFile:false,blockSize:65536,cacheSize:128});
 const image=await tiff.getImage(),native=nativeRasterMetadata(image,{horizontalEpsg,errorPrefix:'usgs'}),[ox,oy]=native.origin;
 if(native.width!==header.sourceDimensions[0]||native.height!==header.sourceDimensions[1]||native.resolution[0]!==1||native.resolution[1]!==-1||native.origin.some((v,i)=>v!==header.origin[i]))throw Error('native_window_grid_changed');
 const window=[Math.floor(minX-ox)-2,Math.floor(oy-maxY)-2,Math.ceil(maxX-ox)+2,Math.ceil(oy-minY)+2],width=window[2]-window[0],height=window[3]-window[1];
 if(window.some(n=>n<0)||window[2]>native.width||window[3]>native.height||width*height>3000000)throw Error('native_window_footprint_capacity');
 const data=await image.readRasters({window,interleave:true,samples:[0]});if(!(data instanceof Float32Array))throw Error('native_window_sample_type');
 const bytes=Buffer.alloc(data.length*4);let minimum=Infinity,maximum=-Infinity,missing=0;
 for(let i=0;i<data.length;i++){const n=data[i];bytes.writeFloatLE(n,i*4);if(!Number.isFinite(n)||n===native.nodata)missing++;else{minimum=Math.min(minimum,n);maximum=Math.max(maximum,n);}}
 const metadata={schemaVersion:1,encoding:'float32-native-window-v1',byteOrder:'little-endian',sourceUrl:header.sourceUrl,sourceEtag:header.etag,sourceFileBytes:header.sourceFileBytes,
  sourceWindow:window,sourceOrigin:image.getOrigin(),origin:[ox+window[0],oy-window[1]],resolution:native.resolution,width,height,keys:image.getGeoKeys(),nodata:native.nodata,
  filename:'native-window.f32',bytes:bytes.length,sha256:hash(bytes),minimum,maximum,missing,nativeValuesUnchanged:true,sourceClassification:'bare-earth-dtm',sourceCrs:transform.target,
  preparationCoordinateSha256:hash(coordinates)};
 decodeNativeRasterWindow(metadata,bytes,{horizontalEpsg,sourceDimensions:header.sourceDimensions,errorPrefix:'usgs'});
 await fs.writeFile(path.join(out,metadata.filename),bytes);await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
 console.log(JSON.stringify({width,height,bytes:bytes.length,sha256:metadata.sha256,missing,minimum,maximum,requests:requests.length,downloadedBytes:total}));
}finally{await tiff?.close();globalThis.fetch=original;await fs.writeFile(path.join(out,'range-receipt.json'),JSON.stringify({url:header.sourceUrl,etag:header.etag,totalBytes:total,requests},null,2)+'\n');}
