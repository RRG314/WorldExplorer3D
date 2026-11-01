#!/usr/bin/env node
// Reproduce the reviewed core-fit product from pinned normalized observations.
// This does not classify other DOM returns, enable a venue or create a sampler.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {annotateReviewedVenueDecks} from '../../app/js/racing/venue-deck-source.js';
const flag=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const configPath=flag('--config'),output=flag('--output');
if(!configPath||!output)throw Error('--config=FILE --output=NEW_FILE required');
if(await fs.stat(output).catch(()=>null))throw Error('venue_deck_output_already_exists');
const config=JSON.parse(await fs.readFile(configPath)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes=await fs.readFile(config.sourceFile),observationsBytes=await fs.readFile(config.normalizedObservations.file);
if(config.version!==1||hash(sourceBytes)!==config.sourceSha256||hash(observationsBytes)!==config.normalizedObservations.sha256)throw Error('venue_deck_input_integrity');
const source=JSON.parse(sourceBytes),observations=JSON.parse(observationsBytes);
if(observations.schemaVersion!==1||observations.sourceCrs!=='EPSG:25832+7837'||observations.targetCrs!=='EPSG:9056+3855'||
 observations.normalization.pyprojVersion!=='3.7.2'||observations.normalization.projVersion!=='9.5.1'||
 config.observedCoreWidthMeters!==4||!(config.maximumCoreResidualMeters>0&&config.maximumCoreResidualMeters<=.05))throw Error('venue_deck_observations_invalid');
function fitStations(stations,{excludeRough=false}={}){
 let maximumCoreResidualMeters=0;const samples=[],excludedReturns=[];
 for(const s of stations){
  const core=s.samples.filter(p=>Math.abs(p.sourceLateralMeters)<=2);
  if(core.length!==9||core.some((p,i)=>p.sourceLateralMeters!==-2+i*.5||!Number.isFinite(p.heightMetersEgm2008)))throw Error('venue_deck_core_missing');
  const mean=core.reduce((sum,p)=>sum+p.heightMetersEgm2008/core.length,0);
  const slope=core.reduce((sum,p)=>sum+p.sourceLateralMeters*(p.heightMetersEgm2008-mean),0)/core.reduce((sum,p)=>sum+p.sourceLateralMeters**2,0);
  const residual=Math.max(...core.map(p=>Math.abs(p.heightMetersEgm2008-mean-slope*p.sourceLateralMeters)));
  if(residual>config.maximumCoreResidualMeters){
   if(!excludeRough)throw Error('venue_deck_core_review_required');
   excludedReturns.push({sourceSegment:s.sourceSegment,fraction:s.fraction,maximumCoreResidualMeters:residual});continue;
  }
  maximumCoreResidualMeters=Math.max(maximumCoreResidualMeters,residual);
  const normal=core.find(p=>p.sourceLateralMeters===1);
  samples.push({sourceSegment:s.sourceSegment,fraction:s.fraction,latitude:s.latitude,longitude:s.longitude,heightMetersEgm2008:mean,
   positiveNormal:{latitude:normal.latitude,longitude:normal.longitude,heightMetersEgm2008:mean+slope}});
 }
 return {maximumCoreResidualMeters,samples,...(excludeRough?{excludedReturns}:{})};
}
const bridges=observations.bridges.map(bridge=>{
 const way=source.ways.find(w=>w.id===bridge.sourceWayId);if(!way||way.version!==bridge.sourceVersion||bridge.observedCoreWidthMeters!==4)throw Error('venue_deck_way_changed');
 return {sourceWayId:way.id,sourceVersion:way.version,nodeIds:way.nodes,observedCoreWidthMeters:4,reconstructedWidthMeters:bridge.mappedWidthMeters,...fitStations(bridge.stations)};
});
let pavements;
if(config.pavementObservations){
 if(config.maximumReconstructedSpanMeters!==8.05)throw Error('venue_pavement_gap_policy_invalid');
 const bytes=await fs.readFile(config.pavementObservations.file);if(hash(bytes)!==config.pavementObservations.sha256)throw Error('venue_pavement_input_integrity');
 const input=JSON.parse(bytes);
 if(input.schemaVersion!==1||input.targetCrs!==observations.targetCrs||input.normalization.definition!==observations.normalization.definition||input.normalization.direction!=='inverse'||
  input.normalization.pyprojVersion!=='3.7.2'||input.normalization.projVersion!=='9.5.1'||!(config.maximumPavementAdjustmentMeters>0&&config.maximumPavementAdjustmentMeters<=.05))throw Error('venue_pavement_observations_invalid');
 pavements=input.roads.map(road=>{const way=source.ways.find(w=>w.id===road.sourceWayId);if(!way||way.version!==road.sourceVersion)throw Error('venue_pavement_way_changed');
  return {sourceWayId:way.id,sourceVersion:way.version,nodeIds:way.nodes,observedCoreWidthMeters:4,reconstructedWidthMeters:road.mappedWidthMeters,
   maximumAdjustmentMeters:config.maximumPavementAdjustmentMeters,...fitStations(road.stations,{excludeRough:true})};});
}
const artifact={type:'ReviewedVenueDeckSource',version:1,venueId:config.venueId,sourceSha256:config.sourceSha256,
 targetCrs:observations.targetCrs,license:config.license,licenseUrl:config.licenseUrl,attribution:config.attribution,
 limitations:'Four-metre observed pavement core; wider planar camber is reconstructed. Rough returns are excluded; bounded gaps up to 8.05 m are reconstructed between retained stations. Source DOM can contain vehicles, rails and vegetation. Datum operation uncertainty is separate from delivery precision. Not official timing or a completed venue.',
 normalizedObservationsSha256:config.normalizedObservations.sha256,sourceFiles:config.sourceFiles,normalization:{...observations.normalization,direction:'inverse'},
 groundArtifacts:config.groundArtifacts,recipe:'scripts/racing/build-venue-decks.mjs',bridges,
 ...(pavements?{normalizedPavementObservationsSha256:config.pavementObservations.sha256,pavements}:{})};
const text=JSON.stringify(artifact)+'\n',contentSha256=hash(text);
annotateReviewedVenueDecks(source,artifact,{descriptor:{id:config.venueId,sourceSha256:config.sourceSha256},requiredArtifacts:config.groundArtifacts,contentSha256});
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,text);
console.log(JSON.stringify({venueId:artifact.venueId,bridges:bridges.length,samples:bridges.reduce((n,b)=>n+b.samples.length,0),
 maximumCoreResidualMeters:Math.max(...bridges.map(b=>b.maximumCoreResidualMeters)),pavements:pavements?.length||0,
 pavementSamples:pavements?.reduce((n,p)=>n+p.samples.length,0)||0,excludedReturns:pavements?.reduce((n,p)=>n+p.excludedReturns.length,0)||0,
 bytes:Buffer.byteLength(text),contentSha256}));
