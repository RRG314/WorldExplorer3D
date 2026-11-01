import {geographicVenueDistance} from './venue-layout.js';

// A conservative game corridor, not an edit to OSM or a surveyed boundary.
// The lower Silverstone pit apron is alongside the mapped line; the retained
// native EA DTM resolves the rising pit wall on its other side.
export function reviewedVenuePitAlignment(source,descriptor,pit,wayId){
 const profile=descriptor.pitUsableAlignment;if(profile===undefined)return null;
 const fail=()=>{throw Error('venue_pit_alignment_invalid');};
 if(!pit||pit.wayIds.length!==1||pit.wayIds[0]!==profile.sourceWayId)fail();
 if(profile.sourceWayId!==wayId)return null;
 const way=source.ways.find(w=>w.id===wayId),stations=profile.stations;
 if(descriptor.raceDiscipline!=='circuit'||profile.sourceVersion!==way.version||profile.sourceSha256!==descriptor.sourceSha256||
  profile.groundContentSha256!==descriptor.groundContentSha256||profile.interpretation!=='authored-usable-pit-corridor'||
  !Array.isArray(stations)||stations.length<2||stations.length>16||stations[0].distanceMeters!==0||stations[0].offsetMeters!==0||stations.at(-1).offsetMeters!==0)fail();
 for(let i=0;i<stations.length;i++){const s=stations[i];if(!Number.isFinite(s.distanceMeters)||!Number.isFinite(s.offsetMeters)||Math.abs(s.offsetMeters)>4||i&&s.distanceMeters<=stations[i-1].distanceMeters)fail();}
 let distance=0;
 const offsets=way.geometry.map((p,i)=>{
  if(i)distance+=geographicVenueDistance(way.geometry[i-1],p);
  let j=1;while(j<stations.length-1&&stations[j].distanceMeters<distance)j++;
  const a=stations[j-1],b=stations[j],t=Math.max(0,Math.min(1,(distance-a.distanceMeters)/(b.distanceMeters-a.distanceMeters))),offset=a.offsetMeters+(b.offsetMeters-a.offsetMeters)*t;
  if(offset&&source.ways.some(other=>other.id!==wayId&&other.nodes.includes(way.nodes[i])))fail();
  return offset;
 });
 if(stations.at(-1).distanceMeters>distance||offsets[0]!==0||offsets.at(-1)!==0)fail();
 return Object.freeze({interpretation:profile.interpretation,sourceSha256:descriptor.sourceSha256,nodeOffsetsMeters:Object.freeze(offsets)});
}
