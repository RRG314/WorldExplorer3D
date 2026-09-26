import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
const dataDir=path.resolve(process.argv.find(a=>a.startsWith('--data-dir='))?.slice(11)||'output/release-integration/live-checks/london-dtm');
const write=process.argv.includes('--write');
const config=JSON.parse(await fs.readFile('config/ea-london-ground-source.json','utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const raster of config.rasters)for(const file of raster.rasters){
 if(hash(await fs.readFile(path.join(dataDir,file.filename)))!==file.sha256)throw new Error(`EA raster hash mismatch: ${file.filename}`);
}
for(const grid of config.grids){
 if(hash(await fs.readFile(path.join(dataDir,'grids',grid.filename)))!==grid.sha256)throw new Error(`Datum grid hash mismatch: ${grid.filename}`);
}
for(const [command,args] of [
 [process.env.WE3D_DATUM_PYTHON||'.datum-venv/bin/python',['scripts/ea-ground-coordinates.py',dataDir]],
 [process.execPath,['scripts/sample-ea-ground.mjs',dataDir]]
]){
 const r=spawnSync(command,args,{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 if(r.error||r.status!==0)throw r.error||new Error(`Ground preparation failed: ${command}`);
}
const sampled=JSON.parse(await fs.readFile(path.join(dataDir,'samples.json'),'utf8'));
if(sampled.samples.some(s=>s.valid!==s.total||!s.valid||!Number.isFinite(s.meanEgm)))throw new Error('EA ground coverage is incomplete; no invented fill permitted');
const artifactPath='app/assets/ground/london/ground-artifact.json';
const artifact=JSON.parse(await fs.readFile(artifactPath,'utf8'));
artifact.providerId='ea-lidar-composite-dtm-2022';artifact.sourceRelease=config.sourceRelease;
artifact.samples=sampled.samples.map(s=>({
 column:s.column,row:s.row,available:true,
 rawElevationMeters:s.meanEgm,groundElevationMeters:s.meanEgm,
 sourceElevationOdnMeters:s.meanOdn,confidence:.9,
 correctionReason:'bare-earth-dtm-area-mean-and-vertical-datum-normalization',
 provenance:`${config.sourceRelease}:${s.sourceTiles.join(',')}:OSGB36/ODN>WGS84_G1674/EGM2008`,
 normalizationUncertaintyMeters:Math.hypot(sampled.transform.accuracyMeters,config.sourceVerticalRmseMeters,s.stdDev)
}));
const bytes=JSON.stringify(artifact)+'\n';
const manifest={schemaVersion:1,artifactId:artifact.artifactId,providerId:artifact.providerId,sourceRelease:artifact.sourceRelease,
 contentSha256:hash(bytes),spacingMeters:artifact.grid.spacingMeters,coverage:artifact.coverage,verticalDatum:'EGM2008',complete:true,missingSampleCount:0,licenseAttested:true,
 sourceEvidence:{sourceClassification:'bare-earth-dtm',sourceCrs:config.sourceCrs,targetCrs:config.targetCrs,
 resampling:'mean of all valid 2 m pixel centres inside each projected source-grid cell; no missing pixels or interpolation fill',
 sourceConfigurationSha256:hash(await fs.readFile('config/ea-london-ground-source.json')),
 sourceTiles:config.rasters,normalization:{...sampled.transform,grids:config.grids},sourceVerticalRmseMeters:config.sourceVerticalRmseMeters},
 attribution:{notice:config.attribution,licenseDocument:config.licenseDocument,modified:true}};
const accepted=compileGroundArtifact({manifest,artifact});if(accepted.status!=='accepted')throw new Error(JSON.stringify(accepted));
if(write){
 const catalogPath='app/assets/ground/manifest-catalog.json';const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'));
 const entry=catalog.manifests.find(e=>e.artifactId===artifact.artifactId);if(!entry)throw new Error('London catalog entry missing');
 const url=entry.url;for(const key of Object.keys(entry))delete entry[key];Object.assign(entry,manifest,{url});
 await fs.writeFile(artifactPath,bytes);await fs.writeFile('app/assets/ground/london/ground-manifest.json',JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
}
console.log(JSON.stringify({write,artifactId:artifact.artifactId,providerId:artifact.providerId,samples:artifact.samples.length,contentSha256:manifest.contentSha256,normalizationAccuracyMeters:sampled.transform.accuracyMeters}));
