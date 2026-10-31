#!/usr/bin/env node
// Bounded offline USGS native-window adapter. Datum preparation, delivered grid,
// quantization and runtime admission reuse the existing shared ground pipeline.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createGroundGridPatch} from './lib/ground-artifact-builder.mjs';
import {decodeNativeRasterWindow,sampleNativeRaster,nad83UtmNavd88HorizontalEpsg} from './lib/bare-earth-raster.mjs';
import {encodeEaGround} from './lib/ea-ground-grid.mjs';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
const flag=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1),configPath=flag('--config'),dataDir=flag('--data-dir'),outputDir=flag('--output-dir');
if(!configPath||!dataDir||!outputDir)throw Error('--config=FILE --data-dir=DIR --output-dir=NEW_DIR required');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),configBytes=await fs.readFile(configPath),config=JSON.parse(configBytes),source=config.raster;
const horizontalEpsg=nad83UtmNavd88HorizontalEpsg(config.sourceCrs);
if(config.schemaVersion!==1||config.providerId!=='usgs-3dep-best-available'||!config.venueId||!config.sourceRelease||
 !horizontalEpsg||config.sourceClassification!=='bare-earth-dtm'||!source||
 !Array.isArray(config.grids)||config.grids.length!==6||!Array.isArray(config.patches)||config.patches.length!==1||
 config.sourceVerticalAccuracyMeters!==null||!config.sourceAccuracyStatement)throw Error('invalid_usgs_venue_configuration');
if(await fs.stat(outputDir).catch(()=>null))throw Error('output_directory_already_exists');
const inputPath=name=>{if(typeof name!=='string'||!name||path.isAbsolute(name)||name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('invalid_usgs_source_path');return path.join(dataDir,name);};
for(const item of [...config.grids,source,source.metadata,source.authorityMetadata]){
 const limit=config.grids.includes(item)?128*1024**2:item===source?16*1024**2:1024**2;
 if(!Number.isSafeInteger(item?.bytes)||item.bytes<=0||item.bytes>limit||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('invalid_usgs_source_integrity');
 const file=inputPath(item.filename);if((await fs.stat(file)).size!==item.bytes)throw Error('usgs_source_size_mismatch');
 const digest=crypto.createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);if(digest.digest('hex')!==item.sha256)throw Error('usgs_source_integrity_failed');
}
const metadata=JSON.parse(await fs.readFile(inputPath(source.metadata.filename))),bytes=await fs.readFile(inputPath(source.filename));
if(metadata.sha256!==source.sha256||metadata.sourceCrs!==config.sourceCrs||metadata.sourceClassification!==config.sourceClassification||metadata.sourceUrl!==source.sourceUrl||metadata.sourceEtag!==source.sourceEtag)throw Error('usgs_native_source_binding');
const raster=decodeNativeRasterWindow(metadata,bytes,{horizontalEpsg,sourceDimensions:source.sourceDimensions,errorPrefix:'usgs'});
await fs.mkdir(outputDir,{recursive:true});const work=path.join(outputDir,'work');await fs.mkdir(work);
const patch=config.patches[0],part=createGroundGridPatch({...patch,maxSamples:1500000}),grid=part.grid,planFile=path.join(work,patch.id+'.plan.json');
const space=await fs.statfs(outputDir);if(space.bavail*space.bsize<1024**3)throw Error('usgs_ground_disk_guard');
await fs.writeFile(planFile,JSON.stringify({id:patch.id,grid,coverage:part.coverage,targetCrs:config.sourceCrs})+'\n');
const result=spawnSync(process.env.WE3D_DATUM_PYTHON||'.datum-venv/bin/python',['scripts/ea-ground-coordinates.py',dataDir,planFile,work],{stdio:'inherit',timeout:120000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PROJ_NETWORK:'OFF'}});
if(result.error||result.status!==0)throw result.error||Error('usgs_coordinate_preparation_failed');
const transform=JSON.parse(await fs.readFile(path.join(work,patch.id+'.transform.json')));
if(transform.target!==config.sourceCrs||!(transform.accuracyMeters>=0))throw Error('usgs_datum_transform_invalid');
const coordinates=await fs.readFile(path.join(work,patch.id+'.coordinates.f64'));if(coordinates.length!==grid.sampleCount*24)throw Error('usgs_coordinates_incomplete');
const view=new DataView(coordinates.buffer,coordinates.byteOffset,coordinates.byteLength),heights=new Float64Array(grid.sampleCount);let minimum=Infinity,maximum=-Infinity;
for(let i=0;i<heights.length;i++){
 const y=sampleNativeRaster(raster,view.getFloat64(i*24,true),view.getFloat64(i*24+8,true),'usgs')-view.getFloat64(i*24+16,true);
 if(!Number.isFinite(y)||y< -100||y>2000)throw Error('usgs_ground_elevation_invalid');heights[i]=y;minimum=Math.min(minimum,y);maximum=Math.max(maximum,y);
}
const encoded=encodeEaGround(heights,{scaleMeters:patch.quantizationMeters}),artifact={schemaVersion:1,artifactId:patch.id,districtId:config.venueId,providerId:config.providerId,sourceRelease:config.sourceRelease,verticalDatum:'EGM2008',coverage:part.coverage,grid,minimumConfidence:.75,
 sampleEncoding:{...encoded,shared:{available:true,confidence:.85,correctionReason:'bare-earth-native-window-bilinear-datum-normalization-and-quantization',provenance:config.sourceRelease,normalizationUncertaintyMeters:Math.hypot(transform.accuracyMeters,encoded.scaleMeters/2)}}};
const text=JSON.stringify(artifact)+'\n',manifest={schemaVersion:1,artifactId:patch.id,providerId:artifact.providerId,sourceRelease:artifact.sourceRelease,contentSha256:hash(text),spacingMeters:grid.spacingMeters,coverage:part.coverage,verticalDatum:'EGM2008',complete:true,missingSampleCount:0,licenseAttested:true,
 sourceEvidence:{sourceClassification:config.sourceClassification,sourceCrs:config.sourceCrs,targetCrs:'EPSG:9056+3855',sourceConfigurationSha256:hash(configBytes),raster:source,nativeWindow:metadata,resampling:'bilinear at native one-metre pixel centres; every contributor required; no nodata or edge fill',sourceVerticalAccuracyMeters:null,sourceAccuracyStatement:config.sourceAccuracyStatement,normalizationUncertaintyIncludesSourceAccuracy:false,quantization:{scaleMeters:encoded.scaleMeters,maximumErrorMeters:encoded.maximumErrorMeters},normalization:{...transform,grids:config.grids}},
 attribution:{notice:config.attribution,licenseDocument:config.licenseDocument,sourceDocument:config.sourceDocument,modified:true}};
const compiled=compileGroundArtifact({manifest,artifact});if(compiled.status!=='accepted')throw Error('usgs_ground_compiler_rejected:'+compiled.reason);
await fs.writeFile(path.join(outputDir,patch.id+'.json'),text);await fs.writeFile(path.join(outputDir,patch.id+'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(outputDir,'manifest-catalog.json'),JSON.stringify({schemaVersion:1,manifests:[{...manifest,url:patch.id+'.json'}]},null,2)+'\n');
console.log(JSON.stringify({artifactId:patch.id,samples:grid.sampleCount,bytes:Buffer.byteLength(text),minimum,maximum,contentSha256:manifest.contentSha256,datumOperationUncertaintyMeters:transform.accuracyMeters,sourceVerticalAccuracyMeters:null}));
