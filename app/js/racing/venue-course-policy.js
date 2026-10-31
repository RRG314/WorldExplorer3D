// Optional extent of an explicitly reviewed mapped venue. Ordinary districts
// retain their existing fences and immutable identities. This portable header
// grants no world authority: intake still requires the private source survey,
// accepted published pavement and a current world publication.
const fail=()=>{throw Error('race_invalid_venue_extent');};
const sourceId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,179}$/.test(value);
export function normalizeRaceVenueSource(value){
 if(value===undefined)return undefined;
 if(!value||![1,2].includes(value.version)||typeof value.id!=='string'||! /^[a-z0-9][a-z0-9-]{0,99}$/.test(value.id)||
  !/^[a-f0-9]{64}$/.test(value.sourceSha256)||!Number.isFinite(value.mappedLengthMeters)||value.mappedLengthMeters<200||value.mappedLengthMeters>30000||
  !Number.isFinite(value.qualificationRadiusWorld)||value.qualificationRadiusWorld<1200||value.qualificationRadiusWorld>6000||
  !Array.isArray(value.sourceFeatureIds)||!value.sourceFeatureIds.length||value.sourceFeatureIds.length>500||
  value.sourceFeatureIds.some(id=>!sourceId(id))||new Set(value.sourceFeatureIds).size!==value.sourceFeatureIds.length)fail();
 const pits=value.pitSourceFeatureIds;
 if(pits!==undefined&&(!Array.isArray(pits)||!pits.length||pits.length>50||pits.some(id=>!sourceId(id)||value.sourceFeatureIds.includes(id))||new Set(pits).size!==pits.length))fail();
 if(value.version===1&&value.stage!==undefined||value.version===2&&pits!==undefined)fail();
 const stage=value.version===2?normalizeStage(value.stage,value.sourceFeatureIds):undefined;
 return Object.freeze({version:value.version,id:value.id,sourceSha256:value.sourceSha256,mappedLengthMeters:value.mappedLengthMeters,
  qualificationRadiusWorld:value.qualificationRadiusWorld,sourceFeatureIds:Object.freeze([...value.sourceFeatureIds]),...(pits?{pitSourceFeatureIds:Object.freeze([...pits])}:{}),...(stage?{stage}:{})});
}
function normalizeStage(value,sourceIds){
 if(value?.kind!=='open-stage-v1'||!Number.isFinite(value.minimumWidthMeters)||value.minimumWidthMeters<3||value.minimumWidthMeters>30||
  !Number.isSafeInteger(value.startNodeId)||value.startNodeId<=0||!Number.isSafeInteger(value.finishNodeId)||value.finishNodeId<=0||value.startNodeId===value.finishNodeId||
  !Array.isArray(value.legs)||!value.legs.length||value.legs.length>500)fail();
 const ids=[],used=new Set(),legs=[];
 for(const leg of value.legs){
  if(!/^osm:way:[1-9][0-9]*$/.test(leg?.sourceFeatureId)||!sourceIds.includes(leg.sourceFeatureId)||!Number.isInteger(leg.startSegment)||leg.startSegment<0||
   !Number.isInteger(leg.endSegment)||leg.endSegment<=leg.startSegment||leg.endSegment>30000||!['forward','reverse'].includes(leg.direction))fail();
  if(!ids.includes(leg.sourceFeatureId))ids.push(leg.sourceFeatureId);
  for(let segment=leg.startSegment;segment<leg.endSegment;segment++){
   const key=leg.sourceFeatureId+':'+segment;if(used.has(key)||used.size>=30000)fail();used.add(key);
  }
  legs.push(Object.freeze({sourceFeatureId:leg.sourceFeatureId,startSegment:leg.startSegment,endSegment:leg.endSegment,direction:leg.direction}));
 }
 if(JSON.stringify(ids)!==JSON.stringify(sourceIds))fail();
 return Object.freeze({kind:'open-stage-v1',minimumWidthMeters:value.minimumWidthMeters,startNodeId:value.startNodeId,finishNodeId:value.finishNodeId,legs:Object.freeze(legs)});
}
// Callers normalize the header before using its scoped admission policy.
export const raceVenueMinimumWidth=venue=>venue?.version===2?venue.stage.minimumWidthMeters:6;
export function raceVenueContainsInterval(venue,id,segment,start=0,end=1){
 return !venue?.stage||Number.isInteger(segment)&&Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end<=1&&start<end&&
  venue.stage.legs.some(leg=>leg.sourceFeatureId===id&&segment>=leg.startSegment&&segment<leg.endSegment);
}
export function sameRaceVenueSource(a,b){return JSON.stringify(normalizeRaceVenueSource(a))===JSON.stringify(normalizeRaceVenueSource(b));}
export function assertRaceVenueRoads(roads,venue,{partial=false}={}){
 if(!venue)return;
 const allowed=new Set([...venue.sourceFeatureIds,...venue.pitSourceFeatureIds||[]]),found=new Set();
 for(const road of roads){
  if(!allowed.has(road.sourceFeatureId)||!sourceId(road.sourceId)||!road.sourceId.startsWith(road.sourceFeatureId+':')||
   [road.a,road.b].some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.hypot(p.x,p.z)>venue.qualificationRadiusWorld+.002))fail();
  if(venue.stage){const parts=road.sourceId.slice(road.sourceFeatureId.length+1).split(':').map(Number);
   if(parts.length!==3||!raceVenueContainsInterval(venue,road.sourceFeatureId,...parts))fail();
  }
  found.add(road.sourceFeatureId);
 }
 if(!partial&&found.size!==allowed.size)fail();
}
export const raceVenueMaximumLength=venue=>venue?Math.max(8000,Math.min(30000,venue.mappedLengthMeters*1.01)):8000;
