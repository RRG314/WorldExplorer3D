#!/usr/bin/env node
// Reproduce a hash-pinned native USGS pixel window without downloading its
// complete raster. Every response must be a bounded range of the same object.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fromUrl} from 'geotiff';
import {nativeRasterMetadata,decodeNativeRasterWindow,nad83UtmNavd88HorizontalEpsg} from '../lib/bare-earth-raster.mjs';
const flag=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1),manifestPath=flag('--manifest'),out=flag('--output-dir');
if(!manifestPath||!out)throw Error('--manifest=FILE --output-dir=NEW_DIR required');
const manifest=JSON.parse(await fs.readFile(manifestPath)),m=manifest.sourceEvidence?.nativeWindow,s=manifest.sourceEvidence?.raster;
const horizontalEpsg=nad83UtmNavd88HorizontalEpsg(manifest.sourceEvidence?.sourceCrs);
if(manifest.providerId!=='usgs-3dep-best-available'||!horizontalEpsg||m?.sourceCrs!==manifest.sourceEvidence.sourceCrs||!m||!s||m.sourceUrl!==s.sourceUrl||m.sourceEtag!==s.sourceEtag||
 !m.sourceUrl.startsWith('https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/')||
 !Number.isSafeInteger(m.sourceFileBytes)||m.sourceFileBytes<1||m.bytes>16*1024**2||!/^[-a-zA-Z0-9_.]+$/.test(m.filename))throw Error('invalid_native_window_source');
if(await fs.stat(out).catch(()=>null))throw Error('preserve_existing_native_window');
const space=await fs.statfs(path.dirname(out));if(space.bavail*space.bsize<1024**3)throw Error('native_window_disk_guard');
await fs.mkdir(out);const original=globalThis.fetch,requests=[],hash=b=>crypto.createHash('sha256').update(b).digest('hex');let total=0,tiff;
globalThis.fetch=async(input,init={})=>{
 if(requests.length>=512)throw Error('native_window_request_capacity');
 const range=new Headers(init.headers).get('range'),response=await original(input,{...init,signal:AbortSignal.timeout(25000)});
 if(response.status!==206||response.headers.get('etag')!==m.sourceEtag||!response.headers.get('content-range')?.endsWith('/'+m.sourceFileBytes))throw Error('native_window_source_changed');
 const reader=response.body.getReader(),parts=[];let count=0;
 try{for(;;){const next=await reader.read();if(next.done)break;count+=next.value.byteLength;if(count>1024**2||total+count>64*1024**2)throw Error('native_window_download_capacity');parts.push(next.value);}}
 finally{await reader.cancel();}
 const bytes=Buffer.concat(parts);total+=bytes.length;const file='range-'+requests.length+'.bin';
 requests.push({range,status:206,contentRange:response.headers.get('content-range'),etag:m.sourceEtag,bytes:bytes.length,sha256:hash(bytes),file});await fs.writeFile(path.join(out,file),bytes);
 return new Response(bytes,{status:206,headers:response.headers});
};
try{
 tiff=await fromUrl(m.sourceUrl,{headers:{'If-Match':m.sourceEtag},allowFullFile:false,blockSize:65536,cacheSize:128});const image=await tiff.getImage(),native=nativeRasterMetadata(image,{horizontalEpsg,errorPrefix:'usgs'});
 if(image.getWidth()!==s.sourceDimensions[0]||image.getHeight()!==s.sourceDimensions[1]||native.origin.some((v,i)=>v!==m.sourceOrigin[i])||native.resolution.some((v,i)=>v!==m.resolution[i])||native.nodata!==m.nodata)throw Error('native_window_grid_changed');
 const data=await image.readRasters({window:m.sourceWindow,interleave:true,samples:[0]});if(!(data instanceof Float32Array)||data.byteLength!==m.bytes)throw Error('native_window_shape');
 const bytes=Buffer.alloc(data.byteLength);for(let i=0;i<data.length;i++)bytes.writeFloatLE(data[i],i*4);
 if(hash(bytes)!==s.sha256||hash(bytes)!==m.sha256)throw Error('native_window_pixels_changed');
 decodeNativeRasterWindow(m,bytes,{horizontalEpsg,sourceDimensions:s.sourceDimensions,errorPrefix:'usgs'});
 const metadata=JSON.stringify(m,null,2)+'\n';if(hash(metadata)!==s.metadata.sha256)throw Error('native_window_metadata_changed');
 await fs.writeFile(path.join(out,m.filename),bytes);await fs.writeFile(path.join(out,'metadata.json'),metadata);
 console.log(JSON.stringify({bytes:bytes.length,sha256:hash(bytes),requests:requests.length,downloadedBytes:total}));
}finally{await tiff?.close();globalThis.fetch=original;await fs.writeFile(path.join(out,'range-receipt.json'),JSON.stringify({url:m.sourceUrl,etag:m.sourceEtag,totalBytes:total,requests},null,2)+'\n');}
