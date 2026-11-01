#!/usr/bin/env node
// Reproducible offline source adapter. Outputs go through the existing ground
// grid, datum preparation, quantization and accepted-ground compiler.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fromArrayBuffer} from 'geotiff';
import {createGroundGridPatch} from './lib/ground-artifact-builder.mjs';
import {nativeRasterMetadata} from './lib/bare-earth-raster.mjs';
import {createRlpGroundMosaic} from './lib/rlp-ground-mosaic.mjs';
import {encodeEaGround} from './lib/ea-ground-grid.mjs';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';

const flag=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const configPath=flag('--config'),dataDir=flag('--data-dir'),outputDir=flag('--output-dir'),selected=flag('--patch');
if(!configPath||!dataDir||!outputDir)throw Error('--config=FILE --data-dir=DIR --output-dir=NEW_DIR [--patch=ID] required');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),idOk=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,100}$/.test(id);
const configBytes=await fs.readFile(configPath),config=JSON.parse(configBytes);
if(config.schemaVersion!==1||!idOk(config.venueId)||config.providerId!=='rlp-lidar-dgm1'||!config.sourceRelease||
 !Array.isArray(config.grids)||config.grids.length!==2||!Array.isArray(config.rasters)||!config.rasters.length||config.rasters.length>256||
 !Array.isArray(config.patches)||!config.patches.length||config.patches.length>8||config.patches.some(p=>!idOk(p.id))||
 !(config.sourceVerticalUncertaintyMeters>=0&&config.sourceVerticalUncertaintyMeters<=1))throw Error('invalid_rlp_venue_configuration');
const patches=selected?config.patches.filter(p=>p.id===selected):config.patches;
if(!patches.length)throw Error('unknown_rlp_ground_patch');
if(await fs.stat(outputDir).catch(()=>null))throw Error('output_directory_already_exists');
const inputPath=name=>{
 if(typeof name!=='string'||!name||path.isAbsolute(name)||name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('invalid_rlp_source_path');
 return path.join(dataDir,name);
};
async function verifyFile(item){
 if(!Number.isSafeInteger(item.bytes)||item.bytes<=0||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('invalid_rlp_source_integrity');
 const file=inputPath(item.filename),stat=await fs.stat(file);if(stat.size!==item.bytes)throw Error('rlp_source_size_mismatch');
 const digest=crypto.createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);
 if(digest.digest('hex')!==item.sha256)throw Error('rlp_source_integrity_failed');
}
async function diskGuard(){const space=await fs.statfs(outputDir);if(space.bavail*space.bsize<1024**3)throw Error('rlp_ground_disk_guard');}
for(const item of [...config.grids,...config.rasters])await verifyFile(item);
await fs.mkdir(outputDir,{recursive:true});
const work=path.join(outputDir,'work');await fs.mkdir(work);
const mosaic=createRlpGroundMosaic({tiles:config.rasters,loadTile:async source=>{
 if(source.bytes>8*1024**2)throw Error('rlp_source_tile_too_large');
 const bytes=await fs.readFile(inputPath(source.filename));
 if(bytes.length!==source.bytes||hash(bytes)!==source.sha256)throw Error('rlp_source_changed_during_compilation');
 const tiff=await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 try{
  const image=await tiff.getImage(),metadata=nativeRasterMetadata(image,{horizontalEpsg:25832,verticalEpsg:7837,errorPrefix:'rlp'});
  return {...metadata,data:await image.readRasters({interleave:true})};
 }finally{await tiff.close();}
}});
const manifests=[];
try{
 for(const patch of patches){
  await diskGuard();const part=createGroundGridPatch({...patch,maxSamples:1500000}),grid=part.grid;
  const coordinatePlan={id:patch.id,grid,coverage:part.coverage,targetCrs:'EPSG:25832+7837'};
  const planFile=path.join(work,patch.id+'.plan.json');await fs.writeFile(planFile,JSON.stringify(coordinatePlan)+'\n');
  const result=spawnSync(process.env.WE3D_DATUM_PYTHON||'.datum-venv/bin/python',[
   'scripts/ea-ground-coordinates.py',dataDir,planFile,work],{stdio:'inherit',timeout:120000,
   env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PROJ_NETWORK:'OFF'}});
  if(result.error||result.status!==0)throw result.error||Error('rlp_coordinate_preparation_failed');
  const transform=JSON.parse(await fs.readFile(path.join(work,patch.id+'.transform.json')));
  if(transform.target!=='EPSG:25832+7837'||!(transform.accuracyMeters>=0))throw Error('rlp_datum_transform_invalid');
  const bytes=await fs.readFile(path.join(work,patch.id+'.coordinates.f64'));
  if(bytes.length!==grid.sampleCount*24)throw Error('rlp_coordinates_incomplete');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),heights=new Float64Array(grid.sampleCount),columns=grid.maxColumn-grid.minColumn+1;
  let minimum=Infinity,maximum=-Infinity;
  for(let offset=0;offset<grid.sampleCount;offset+=columns){
   await mosaic.prepareRow(view,{offset,count:columns});
   for(let i=offset;i<offset+columns;i++){
    const y=mosaic.sample(view.getFloat64(i*24,true),view.getFloat64(i*24+8,true))-view.getFloat64(i*24+16,true);
    if(!Number.isFinite(y)||y< -100||y>2000)throw Error('rlp_ground_elevation_invalid');
    heights[i]=y;minimum=Math.min(minimum,y);maximum=Math.max(maximum,y);
   }
  }
  const encoded=encodeEaGround(heights,{scaleMeters:patch.quantizationMeters??.01});
  const artifact={schemaVersion:1,artifactId:patch.id,districtId:config.venueId,providerId:config.providerId,sourceRelease:config.sourceRelease,
   verticalDatum:'EGM2008',coverage:part.coverage,grid,minimumConfidence:.75,sampleEncoding:{...encoded,shared:{available:true,confidence:.9,
    correctionReason:'bare-earth-dgm1-pixel-centre-mosaic-datum-normalization-and-quantization',provenance:config.sourceRelease,
    normalizationUncertaintyMeters:Math.hypot(config.sourceVerticalUncertaintyMeters,transform.accuracyMeters,encoded.scaleMeters/2)}}};
  const text=JSON.stringify(artifact)+'\n',manifest={schemaVersion:1,artifactId:patch.id,providerId:artifact.providerId,sourceRelease:artifact.sourceRelease,
   contentSha256:hash(text),spacingMeters:grid.spacingMeters,coverage:part.coverage,verticalDatum:'EGM2008',complete:true,missingSampleCount:0,licenseAttested:true,
   sourceEvidence:{sourceClassification:'bare-earth-dtm',sourceCrs:'EPSG:25832+7837',targetCrs:'EPSG:9056+3855',sourceConfigurationSha256:hash(configBytes),
    rasters:config.rasters,resampling:'bilinear at native 1m pixel centres, including actual adjoining tile contributors; no nodata or edge fill',
    sourceAccuracyStatement:config.sourceAccuracyStatement,sourceVerticalUncertaintyMeters:config.sourceVerticalUncertaintyMeters,
    quantization:{scaleMeters:encoded.scaleMeters,maximumErrorMeters:encoded.maximumErrorMeters},normalization:{...transform,grids:config.grids}},
   attribution:{notice:config.attribution,licenseDocument:config.licenseDocument,sourceDocument:config.sourceDocument,modified:true}};
  const compiled=compileGroundArtifact({manifest,artifact});if(compiled.status!=='accepted')throw Error('rlp_ground_compiler_rejected:'+compiled.reason);
  await diskGuard();await fs.writeFile(path.join(outputDir,patch.id+'.json'),text);await fs.writeFile(path.join(outputDir,patch.id+'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  manifests.push({...manifest,url:patch.id+'.json'});
  console.log(JSON.stringify({artifactId:patch.id,samples:grid.sampleCount,bytes:Buffer.byteLength(text),minimum,maximum,contentSha256:manifest.contentSha256,sourceCache:mosaic.snapshot()}));
 }
 await fs.writeFile(path.join(outputDir,'manifest-catalog.json'),JSON.stringify({schemaVersion:1,manifests},null,2)+'\n');
}finally{mosaic.dispose();}
