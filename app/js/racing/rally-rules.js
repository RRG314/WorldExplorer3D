// Original game policy, not a claim about an official championship's tyres,
// start intervals or penalties. Conditions belong to the approved source;
// controls, textures and vehicle setup cannot substitute a grip coefficient.
export const RALLY_START_INTERVAL_MS=30000;
export const RALLY_RECOVERY_PENALTY_MS=15000;
export const RALLY_RECOVERY_COOLDOWN_MS=10000;
export const RALLY_MAXIMUM_RECOVERIES=3;
export const RALLY_MAXIMUM_FLIGHT_HEIGHT_METERS=20;
const surface=(topSpeed,rolling,accel,grip,drift)=>Object.freeze({topSpeed,rolling,accel,grip,drift});
export const RALLY_SURFACES=Object.freeze({
 'asphalt-dry':surface(1,1,1,1,1),
 'asphalt-wet':surface(.93,1,1,.72,1.08),
 'gravel-dry':surface(.85,1.8,.88,.62,1.15),
 'snow-ice':surface(.7,2.1,.72,.3,1.28)
});
const calls=new Set(['left-1','left-2','left-3','left-4','left-5','left-6','right-1','right-2','right-3','right-4','right-5','right-6',
 'hairpin-left','hairpin-right','crest','jump','caution','keep-left','keep-right']);
export function normalizeRallyStage(value,legs){
 if(value===undefined)return undefined;
 const fail=()=>{throw Error('race_invalid_rally_stage');};
 if(value?.version!==1||!Array.isArray(value.legSurfaces)||value.legSurfaces.length!==legs.length||
  value.legSurfaces.some(id=>!Object.hasOwn(RALLY_SURFACES,id))||!Array.isArray(value.splits)||!value.splits.length||value.splits.length>16||
  !Array.isArray(value.paceNotes)||value.paceNotes.length>128)fail();
 const position=(row,kind)=>{
  const leg=legs[row?.legIndex];
  if(!Number.isInteger(row?.legIndex)||!leg||!Number.isInteger(row.segment)||row.segment<leg.startSegment||row.segment>=leg.endSegment||
   !Number.isFinite(row.fraction)||row.fraction<0||row.fraction>1)fail();
  const text=kind==='call'?row.call:row.label;
  if(typeof text!=='string'||(kind==='call'?!calls.has(text):!text.trim()||text.length>40||/[\u0000-\u001f\u007f]/.test(text)))fail();
  return Object.freeze({legIndex:row.legIndex,segment:row.segment,fraction:row.fraction,[kind]:text});
 };
 return Object.freeze({version:1,legSurfaces:Object.freeze([...value.legSurfaces]),
  splits:Object.freeze(value.splits.map(row=>position(row,'label'))),paceNotes:Object.freeze(value.paceNotes.map(row=>position(row,'call')))});
}

// Validate the complete directed source intervals, including tessellated spans.
// A saved route cannot label a shortened stage as the same competition.
export function prepareRallyRoute(venue,edges){
 const stage=venue?.stage,policy=stage?.rally;
 if(!policy)throw Error('race_stage_runtime_unavailable');
 const rows=[],surfaces=[];let cursor=0,distance=0;
 for(const [legIndex,leg]of stage.legs.entries()){
  const reverse=leg.direction==='reverse',segments=Array.from({length:leg.endSegment-leg.startSegment},(_,i)=>leg.startSegment+i);
  if(reverse)segments.reverse();
  for(const segment of segments){let fraction=reverse?1:0;
   do{
    const edge=edges[cursor++],prefix=leg.sourceFeatureId+':',parts=edge?.sourceId.startsWith(prefix)?edge.sourceId.slice(prefix.length).split(':').map(Number):[];
    if(!edge||parts.length!==3||parts.some(n=>!Number.isFinite(n))||parts[0]!==segment||parts[1]<0||parts[2]>1||parts[1]>=parts[2]||
     !edge.id.endsWith(':'+leg.direction)||Math.abs(fraction-(reverse?parts[2]:parts[1]))>1e-9)throw Error('race_rally_path_incomplete');
    fraction=reverse?parts[1]:parts[2];rows.push({legIndex,segment,start:parts[1],end:parts[2],reverse,distance,length:edge.length});
    surfaces.push(policy.legSurfaces[legIndex]);distance+=edge.length;
   }while(Math.abs(fraction-(reverse?0:1))>1e-9);
  }
 }
 if(cursor!==edges.length||Math.abs(distance-venue.mappedLengthMeters)/venue.mappedLengthMeters>.01)throw Error('race_rally_path_incomplete');
 const locate=(row)=>{
  const match=rows.find(r=>r.legIndex===row.legIndex&&r.segment===row.segment&&row.fraction>=r.start-1e-9&&row.fraction<=r.end+1e-9);
  if(!match)throw Error('race_rally_timing_unavailable');
  return match.distance+match.length*(match.reverse?match.end-row.fraction:row.fraction-match.start)/(match.end-match.start);
 };
 const ordered=(values,spacing)=>{
  const result=values.map(row=>({...row,distanceMeters:locate(row)}));
  if(result.some((row,i)=>row.distanceMeters<15||row.distanceMeters>distance-15||i>0&&row.distanceMeters-result[i-1].distanceMeters<spacing))throw Error('race_rally_timing_order');
  return result;
 };
 return {version:1,startIntervalMs:RALLY_START_INTERVAL_MS,recoveryPenaltyMs:RALLY_RECOVERY_PENALTY_MS,
  segmentSurfaces:surfaces,splits:ordered(policy.splits,20),paceNotes:ordered(policy.paceNotes,5)};
}
export function rallySurfaceDynamics(course,index,base){
 if(course.discipline!=='rally')return base;
 const value=RALLY_SURFACES[course.rally?.segmentSurfaces[index]];if(!value)throw Error('race_rally_surface_missing');
 return {...value,grip:value.grip*base.grip};
}
export function rallyPaceNoteText(player){
 const note=player?.rally?.nextPaceNote;if(!note)return '';
 const distance=note.distanceMeters-(player.vehicleState?.raceSupportDistanceMeters||0);
 return distance>=0&&distance<=200?`${Math.ceil(distance/10)*10} m · ${note.call.replaceAll('-',' ')}`:'';
}
