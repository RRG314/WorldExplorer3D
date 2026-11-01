#!/usr/bin/env node
// Offline, reproducible intake. No production asset is overwritten. The output
// must pass the existing ground compiler before it can be added to its catalogue.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fromFile} from 'geotiff';
import {createGroundBuildPlan} from './lib/ground-artifact-builder.mjs';
import {eaRasterMetadata,normalizeEaGrid,encodeEaGround} from './lib/ea-ground-grid.mjs';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';

const flag=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const configPath=flag('--config'),dataDir=flag('--data-dir'),outputDir=flag('--output-dir');
if(!configPath||!dataDir||!outputDir)throw Error('--config=FILE --data-dir=DIR --output-dir=NEW_DIR required');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const configBytes=await fs.readFile(configPath),config=JSON.parse(configBytes);
if(config.schemaVersion!==1||!Array.isArray(config.grids)||!Array.isArray(config.patches)||!config.patches.length||config.patches.length>8)throw Error('invalid_ea_venue_source_configuration');
if((await fs.stat(outputDir).catch(()=>null)))throw Error('output_directory_already_exists');
for(const grid of config.grids){
 const bytes=await fs.readFile(path.join(dataDir,'grids',grid.filename));
 if(bytes.length!==grid.bytes||hash(bytes)!==grid.sha256)throw Error('ea_datum_grid_integrity');
}
await fs.mkdir(outputDir,{recursive:true});
const manifests=[];
for(const patch of config.patches){
 const rasterBytes=await fs.readFile(path.join(dataDir,patch.raster.filename));
 if(rasterBytes.length!==patch.raster.bytes||hash(rasterBytes)!==patch.raster.sha256)throw Error('ea_raster_integrity');
 const plan=createGroundBuildPlan({...patch,districtId:patch.id,maxSamples:1500000,includePoints:false});
 if(plan.parts.length!==1)throw Error('ea_venue_grid_must_not_cross_antimeridian');
 const part=plan.parts[0],grid=part.grid,coordinatePlan={id:patch.id,grid,coverage:part.coverage};
 const coordinatePlanPath=path.join(dataDir,patch.id+'.plan.json');
 await fs.writeFile(coordinatePlanPath,JSON.stringify(coordinatePlan)+'\n');
 const result=spawnSync(process.env.WE3D_DATUM_PYTHON||'.datum-venv/bin/python',['scripts/ea-ground-coordinates.py',dataDir,coordinatePlanPath],{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PROJ_NETWORK:'OFF'}});
 if(result.error||result.status!==0)throw result.error||Error('ea_coordinate_preparation_failed');
 const transform=JSON.parse(await fs.readFile(path.join(dataDir,patch.id+'.transform.json')));
 const file=await fromFile(path.join(dataDir,patch.raster.filename));
 let normalized,rasterMetadata;
 try{
  const image=await file.getImage();
  rasterMetadata=eaRasterMetadata(image);const {resolution}=rasterMetadata;
  if(Math.abs(resolution[0]-patch.raster.spacingMeters)>.01||Math.abs(resolution[1]+patch.raster.spacingMeters)>.01)throw Error('ea_raster_resolution_mismatch');
  const data=await image.readRasters({interleave:true});
  if(data.length!==rasterMetadata.width*rasterMetadata.height)throw Error('ea_raster_band_count_invalid');
  normalized=normalizeEaGrid({...rasterMetadata,data},await fs.readFile(path.join(dataDir,patch.id+'.coordinates.f64')),{sampleCount:grid.sampleCount});
 }finally{await file.close();}
 const encoded=encodeEaGround(normalized.heights,{scaleMeters:patch.quantizationMeters});
 const artifact={schemaVersion:1,artifactId:patch.id,districtId:config.venueId,providerId:'ea-lidar-composite-dtm-2022',sourceRelease:config.sourceRelease,verticalDatum:'EGM2008',coverage:part.coverage,grid,minimumConfidence:.75,
  sampleEncoding:{...encoded,
   shared:{available:true,confidence:.9,correctionReason:'bare-earth-dtm-pixel-centre-bilinear-datum-normalization-and-quantization',provenance:`${config.sourceRelease}:${patch.raster.sha256}:OSGB36/ODN>WGS84_G1674/EGM2008`,normalizationUncertaintyMeters:Math.hypot(config.sourceVerticalRmseMeters,transform.accuracyMeters,encoded.scaleMeters/2)}}};
 const bytes=JSON.stringify(artifact)+'\n';
 const manifest={schemaVersion:1,artifactId:artifact.artifactId,providerId:artifact.providerId,sourceRelease:artifact.sourceRelease,contentSha256:hash(bytes),spacingMeters:grid.spacingMeters,coverage:part.coverage,verticalDatum:'EGM2008',complete:true,missingSampleCount:0,licenseAttested:true,
  sourceEvidence:{sourceClassification:'bare-earth-dtm',sourceCrs:'EPSG:7405',targetCrs:'EPSG:9056+3855',sourceConfigurationSha256:hash(configBytes),raster:patch.raster,rasterMetadata,resampling:'bilinear at native pixel centres; every contributing pixel required; no nodata fill',quantization:{scaleMeters:encoded.scaleMeters,maximumErrorMeters:encoded.maximumErrorMeters},normalization:{...transform,grids:config.grids},sourceVerticalRmseMeters:config.sourceVerticalRmseMeters},
  attribution:{notice:config.attribution,licenseDocument:config.licenseDocument,modified:true}};
 const accepted=compileGroundArtifact({manifest,artifact});if(accepted.status!=='accepted')throw Error(JSON.stringify(accepted));
 const artifactName=patch.id+'.json';
 await fs.writeFile(path.join(outputDir,artifactName),bytes);
 await fs.writeFile(path.join(outputDir,patch.id+'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 manifests.push({...manifest,url:artifactName});
 console.log(JSON.stringify({artifactId:patch.id,samples:grid.sampleCount,bytes:Buffer.byteLength(bytes),minimum:normalized.minimum,maximum:normalized.maximum,contentSha256:manifest.contentSha256}));
}
await fs.writeFile(path.join(outputDir,'manifest-catalog.json'),JSON.stringify({schemaVersion:1,manifests},null,2)+'\n');
