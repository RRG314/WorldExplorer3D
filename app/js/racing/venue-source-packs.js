import {compileMappedVenueLayout,geographicVenueDistance} from './venue-layout.js';
import {annotateRoadSourceSurvey} from '../world/road-source-survey.js';
import {sha256Text} from '../terrain/ground-artifact.js?v=4';

// A reviewed source package is not a playable-catalogue flag. Admission still
// requires the existing world publication and racing surface qualification.
export const RACING_VENUE_SOURCES=Object.freeze([Object.freeze({
 id:'silverstone-grand-prix',name:'Silverstone',anchor:Object.freeze({lat:52.0713,lon:-1.0168}),
 sourceUrl:'/app/assets/racing/silverstone/source.json',sourceSha256:'c41a9f0d43e21af306fbf3261996e997a036778205acaa28df2697ef424c2b00',
 groundArtifactId:'silverstone-gp-fine-v1',groundContentSha256:'1b1f66af6f8bcbd9db84abe0b123d69bb016955d06afcb55d2a0aee782c306bd',
 maximumCrossfall:.15,qualificationRadiusWorld:1200
})]);
export function racingVenueSourceAt(location){
 if(!location||!Number.isFinite(location.lat)||!Number.isFinite(location.lon))return null;
 return RACING_VENUE_SOURCES.find(pack=>geographicVenueDistance(pack.anchor,location)<=15)||null;
}
const inside=(point,bounds)=>point&&point.lat>=bounds.south&&point.lat<=bounds.north&&point.lon>=bounds.west&&point.lon<=bounds.east;
export function prepareVenueSourceMerge(data,source,descriptor,ground){
 const index=ground?.artifactIds?.indexOf(descriptor.groundArtifactId)??-1;
 if(ground?.status!=='accepted'||index<0||ground.contentSha256s?.[index]!==descriptor.groundContentSha256)throw Error('venue_ground_not_ready');
 const layout=compileMappedVenueLayout(source);
 if(layout.venueId!==descriptor.id||!(source.layout.usableWidthMeters>=6&&source.layout.usableWidthMeters<=30))throw Error('venue_source_identity_mismatch');
 const original=Array.isArray(data?.elements)?data.elements:[],existingNodes=new Map(original.filter(e=>e.type==='node').map(e=>[e.id,e]));
 const sourceWays=new Map(source.ways.map(w=>[w.id,w])),layoutWays=new Set(layout.wayIds),bounds=source.source?.coverage;
 if(!bounds||!['south','north','west','east'].every(k=>Number.isFinite(bounds[k]))||bounds.south>=bounds.north||bounds.west>=bounds.east)throw Error('venue_source_coverage_invalid');
 const elements=new Map();let retiredGeneralized=0;
 for(const item of original){
  if(item.type==='way'&&sourceWays.has(item.id)){
   const pinned=sourceWays.get(item.id);
   if(Number(item.version)>pinned.version)throw Error('venue_source_revision_obsolete');
   continue;
  }
  // The extract explicitly contains ALL raceways in this finite query area.
  // Replace only fully contained generalized raceways, preserving public
  // roads, other decks, buildings, waterways and partially covered source ways.
  if(item.type==='way'&&item.tags?.highway==='raceway'&&item.tags?._sourceCompleteness==='generalized'&&item.nodes?.length>=2&&
    item.nodes.every(id=>inside(existingNodes.get(id),bounds))){retiredGeneralized++;continue;}
  elements.set(`${item.type}:${item.id}`,item);
 }
 for(const [id,point] of layout.nodes){
  const old=existingNodes.get(id);
  if(old&&geographicVenueDistance(old,point)>.02)throw Error('venue_source_node_revision_conflict');
  elements.set(`node:${id}`,{...old,type:'node',id,lat:point.lat,lon:point.lon});
 }
 for(const raw of source.ways){
  const sourceFeatureId=`osm:way:${raw.id}`,way={type:'way',id:raw.id,version:raw.version,nodes:[...raw.nodes],tags:{...raw.tags,_sourceFeatureId:sourceFeatureId,_sourceCompleteness:'lossless',...(!layoutWays.has(raw.id)?{_regionalContext:'fixed-location'}:{})}};
  if(layoutWays.has(raw.id))annotateRoadSourceSurvey(way,{version:1,venueId:descriptor.id,sourceFeatureId,
   usableWidthMeters:source.layout.usableWidthMeters,maximumCrossfall:descriptor.maximumCrossfall,
   groundArtifactId:descriptor.groundArtifactId,groundContentSha256:descriptor.groundContentSha256});
  elements.set(`way:${raw.id}`,way);
 }
 return {data:{...data,elements:[...elements.values()]},metadata:Object.freeze({id:descriptor.id,name:descriptor.name,status:'source-prepared',
  sourceSha256:descriptor.sourceSha256,sourceDate:source.source.osmBase,layoutWayIds:Object.freeze([...layout.wayIds]),
  sourceFeatureIds:Object.freeze(layout.wayIds.map(id=>`osm:way:${id}`)),mappedLengthMeters:layout.lengthMeters,
  referenceLengthMeters:layout.referenceLengthMeters,qualificationRadiusWorld:descriptor.qualificationRadiusWorld,
  groundArtifactId:descriptor.groundArtifactId,groundContentSha256:descriptor.groundContentSha256,retiredGeneralized})};
}
export async function loadRacingVenueSource(descriptor,{fetchImpl=globalThis.fetch,signal}={}){
 const response=await fetchImpl(descriptor.sourceUrl,{signal});
 if(!response.ok)throw Error('venue_source_fetch_failed');
 const text=await response.text();
 if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
 if(text.length>2000000||await sha256Text(text)!==descriptor.sourceSha256)throw Error('venue_source_integrity_failed');
 if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
 return JSON.parse(text);
}
