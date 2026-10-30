// Optional extent of an explicitly reviewed mapped venue. Ordinary districts
// retain their existing fences and immutable identities. This portable header
// grants no world authority: intake still requires the private source survey,
// accepted published pavement and a current world publication.
const fail=()=>{throw Error('race_invalid_venue_extent');};
const sourceId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,179}$/.test(value);
export function normalizeRaceVenueSource(value){
 if(value===undefined)return undefined;
 if(!value||value.version!==1||typeof value.id!=='string'||! /^[a-z0-9][a-z0-9-]{0,99}$/.test(value.id)||
  !/^[a-f0-9]{64}$/.test(value.sourceSha256)||!Number.isFinite(value.mappedLengthMeters)||value.mappedLengthMeters<200||value.mappedLengthMeters>30000||
  !Number.isFinite(value.qualificationRadiusWorld)||value.qualificationRadiusWorld<1200||value.qualificationRadiusWorld>6000||
  !Array.isArray(value.sourceFeatureIds)||!value.sourceFeatureIds.length||value.sourceFeatureIds.length>500||
  value.sourceFeatureIds.some(id=>!sourceId(id))||new Set(value.sourceFeatureIds).size!==value.sourceFeatureIds.length)fail();
 return Object.freeze({version:1,id:value.id,sourceSha256:value.sourceSha256,mappedLengthMeters:value.mappedLengthMeters,
  qualificationRadiusWorld:value.qualificationRadiusWorld,sourceFeatureIds:Object.freeze([...value.sourceFeatureIds])});
}
export function sameRaceVenueSource(a,b){return JSON.stringify(normalizeRaceVenueSource(a))===JSON.stringify(normalizeRaceVenueSource(b));}
export function assertRaceVenueRoads(roads,venue,{partial=false}={}){
 if(!venue)return;
 const allowed=new Set(venue.sourceFeatureIds),found=new Set();
 for(const road of roads){
  if(!allowed.has(road.sourceFeatureId)||!sourceId(road.sourceId)||!road.sourceId.startsWith(road.sourceFeatureId+':')||
   [road.a,road.b].some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.hypot(p.x,p.z)>venue.qualificationRadiusWorld+.002))fail();
  found.add(road.sourceFeatureId);
 }
 if(!partial&&found.size!==allowed.size)fail();
}
export const raceVenueMaximumLength=venue=>venue?Math.max(8000,Math.min(30000,venue.mappedLengthMeters*1.01)):8000;
