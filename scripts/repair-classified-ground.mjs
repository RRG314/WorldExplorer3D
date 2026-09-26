import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {reconstructClassifiedGround} from './lib/ground-reconstruction.mjs';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'app/assets/ground');
const catalog=JSON.parse(await fs.readFile(path.join(directory,'manifest-catalog.json'),'utf8'));
const write=process.argv.includes('--write');
const method='worldexplorer-pmf-boundary-reconstruction-v3';
const pending=[],report=[];
for(const entry of catalog.manifests){
  if(!/^worldexplorer-pmf-grid-v[12]$/.test(entry.sourceEvidence?.correctionMethod||''))continue;
  const artifactPath=path.resolve(directory,entry.url),text=await fs.readFile(artifactPath,'utf8');
  if(crypto.createHash('sha256').update(text).digest('hex')!==entry.contentSha256)throw new Error(`Ground hash mismatch: ${entry.artifactId}`);
  const artifact=JSON.parse(text),grid=artifact.grid;
  if(!Array.isArray(artifact.samples))throw new Error(`Unsupported sample encoding: ${entry.artifactId}`);
  const width=grid.maxColumn-grid.minColumn+1,height=grid.maxRow-grid.minRow+1;
  const ordered=new Array(width*height);
  for(const sample of artifact.samples)ordered[(sample.row-grid.minRow)*width+sample.column-grid.minColumn]=sample;
  if(ordered.filter(Boolean).length!==width*height||ordered.length!==artifact.samples.length)throw new Error(`Incomplete ground: ${entry.artifactId}`);
  const raw=Float64Array.from(ordered,s=>s.rawElevationMeters);
  const removed=Uint8Array.from(ordered,s=>s.rawElevationMeters-s.groundElevationMeters>1e-6);
  const result=reconstructClassifiedGround(raw,removed,width,height);
  let changed=0,maximumChange=0;
  for(let i=0;i<ordered.length;i++){
    const sample=ordered[i],delta=result.ground[i]-sample.groundElevationMeters;
    if(Math.abs(delta)<1e-6)continue;
    changed++;maximumChange=Math.max(maximumChange,Math.abs(delta));
    sample.groundElevationMeters=result.ground[i];
    sample.correctionReason='classified-surface-ground-boundary-reconstruction';
    sample.provenance=`${sample.provenance}:${method}`;
    // Do not upgrade confidence merely because interpolation is smoother.
  }
  const output=JSON.stringify(artifact)+'\n';
  const manifestPath=path.join(path.dirname(artifactPath),'ground-manifest.json');
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  manifest.contentSha256=crypto.createHash('sha256').update(output).digest('hex');
  manifest.sourceEvidence={...manifest.sourceEvidence,correctionMethod:method,classificationMethod:entry.sourceEvidence.correctionMethod,reconstruction:{method:'harmonic-ground-boundary',toleranceMeters:1e-5,exteriorPolicy:'retain-source-observation',sourceArtifactSha256:entry.contentSha256}};
  const accepted=compileGroundArtifact({manifest,artifact});
  if(accepted.status!=='accepted')throw new Error(`Reconstructed ground rejected: ${entry.artifactId}/${accepted.reason}`);
  pending.push({artifactPath,output,manifestPath,manifest});
  Object.assign(entry,manifest);
  report.push({artifactId:entry.artifactId,samples:ordered.length,changed,maximumChangeMeters:maximumChange,iterations:result.iterations,residualMeters:result.residual});
}
// Validate every candidate before replacing any catalog entries. Local source
// control preserves the previous artifacts; no provider fetch or deployment.
if(write){
  for(const item of pending){await fs.writeFile(item.artifactPath,item.output);await fs.writeFile(item.manifestPath,JSON.stringify(item.manifest,null,2)+'\n');}
  await fs.writeFile(path.join(directory,'manifest-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
}
console.log(JSON.stringify({mode:write?'write':'dry-run',method,artifacts:report},null,2));
