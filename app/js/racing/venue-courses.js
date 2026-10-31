import {buildRaceRoadGraph,createRaceCourse,RACE_MAX_ROUTE_EDGES} from './course-rules.js';
import {sameRaceVenueSource} from './venue-course-policy.js';

// A venue path is its reviewed ordered ways, never whichever nearby loop a
// shortest-path recommendation happens to find. Missing spans keep it closed.
export function prepareVenueRacePath(district,venue){
 if(venue?.status!=='source-prepared'||!Array.isArray(venue.sourceFeatureIds)||!venue.sourceFeatureIds.length)throw Error('race_venue_not_prepared');
 if(venue.raceAdmission==='pending-timing-line')throw Error('race_venue_timing_line_pending');
 const graph=buildRaceRoadGraph(district.roads,{metersPerUnit:district.metersPerUnit,venueSource:district.venueSource}),ordered=[],edges=new Map(graph.edges.map(e=>[e.id,e]));
 const stage=graph.venueSource?.stage;
 if(stage&&(!sameRaceVenueSource(venue.venueSource,graph.venueSource)||venue.id!==graph.venueSource.id||venue.sourceSha256!==graph.venueSource.sourceSha256||
  venue.raceDiscipline!=='rally'||venue.mappedLengthMeters!==graph.venueSource.mappedLengthMeters||JSON.stringify(venue.sourceFeatureIds)!==JSON.stringify(graph.venueSource.sourceFeatureIds)||venue.startLine!==undefined||venue.pitSourceFeatureIds!==undefined))throw Error('race_venue_stage_identity_invalid');
 const bySource=new Map();
 for(const road of district.roads){
  if(!bySource.has(road.sourceFeatureId))bySource.set(road.sourceFeatureId,[]);
  const suffix=road.sourceId.slice(road.sourceFeatureId.length+1).split(':').map(Number);
  if(suffix.length!==3||suffix.some(n=>!Number.isFinite(n))||!Number.isInteger(suffix[0])||suffix[0]<0||suffix[1]<0||suffix[2]>1||suffix[1]>=suffix[2])throw Error('race_venue_source_order_missing');
  bySource.get(road.sourceFeatureId).push({road,segment:suffix[0],start:suffix[1],end:suffix[2]});
 }
 function orderedRows(ids){const rows=[];for(const id of ids){
  const roads=bySource.get(id);if(!roads?.length)throw Error('race_venue_surface_incomplete');
  roads.sort((a,b)=>a.segment-b.segment||a.start-b.start);
  for(const row of roads){const edge=edges.get(row.road.sourceId+':forward');if(!edge)throw Error('race_venue_direction_unavailable');rows.push({...row,edge});}
 }return rows;}
 if(stage){
  for(const leg of stage.legs){
   const rows=[];
   for(let segment=leg.startSegment;segment<leg.endSegment;segment++){
    const interval=(bySource.get(leg.sourceFeatureId)||[]).filter(row=>row.segment===segment).sort((a,b)=>a.start-b.start);let cursor=0;
    if(!interval.length)throw Error('race_venue_surface_incomplete');
    for(const row of interval){if(Math.abs(row.start-cursor)>1e-9)throw Error('race_venue_stage_interval_incomplete');cursor=row.end;rows.push(row);}
    if(cursor!==1)throw Error('race_venue_stage_interval_incomplete');
   }
   if(leg.direction==='reverse')rows.reverse();
   for(const row of rows){const edge=edges.get(row.road.sourceId+':'+leg.direction);if(!edge)throw Error('race_venue_direction_unavailable');ordered.push({...row,edge});}
  }
  if(ordered.length>RACE_MAX_ROUTE_EDGES)throw Error('invalid_race_route');
  for(let i=1;i<ordered.length;i++)if(ordered[i-1].edge.to!==ordered[i].edge.from)throw Error('disconnected_race_route');
  if(ordered.at(-1).edge.to===ordered[0].edge.from)throw Error('race_venue_stage_not_open');
  if(Math.abs(ordered.reduce((sum,row)=>sum+row.edge.length,0)-venue.mappedLengthMeters)/venue.mappedLengthMeters>.01)throw Error('race_venue_surface_incomplete');
 }else ordered.push(...orderedRows(venue.sourceFeatureIds));
 const pitPath=venue.pitSourceFeatureIds?orderedRows(venue.pitSourceFeatureIds).map(row=>row.edge.id):undefined;
 let first=0,startOffsetMeters;
 if(venue.startLine){
  const line=venue.startLine;
  if(!venue.sourceFeatureIds.includes(line.sourceFeatureId)||!Number.isInteger(line.segment)||line.segment<0||!Number.isFinite(line.fraction)||line.fraction<=0||line.fraction>=1)throw Error('race_venue_start_line_invalid');
  const matches=ordered.map((row,index)=>({row,index})).filter(({row})=>row.road.sourceFeatureId===line.sourceFeatureId&&row.segment===line.segment&&line.fraction>row.start&&line.fraction<row.end);
  if(matches.length!==1)throw Error('race_venue_start_line_unavailable');
  const {row,index}=matches[0];first=index;startOffsetMeters=row.edge.length*(line.fraction-row.start)/(row.end-row.start);
 }
 const path=[...ordered.slice(first),...ordered.slice(0,first)].map(row=>row.edge.id),label=venue.layoutLabel||'GP';
 return {graph,path,label,...(pitPath?{pitPath}:{}),...(startOffsetMeters!==undefined?{startOffsetMeters}:{}),
  diagnostics:{venue:venue.id,sourceWays:venue.sourceFeatureIds.length,qualifiedSpans:path.length}};
}

export function buildVenueRaceCourses(district,venue){
 const {graph,path,label,pitPath,startOffsetMeters,diagnostics}=prepareVenueRacePath(district,venue);
 if(graph.venueSource?.stage){
  if(!graph.venueSource.stage.rally)throw Error('race_stage_runtime_unavailable');
  const course=createRaceCourse(graph,path,{locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor,
   discipline:'rally',laps:1,participants:4,name:`${venue.name} · ${label} · stage`});
  return {graph,events:[course],diagnostics};
 }
 const discipline=venue.raceDiscipline||'circuit';if(!['circuit','oval'].includes(discipline))throw Error('race_venue_discipline_invalid');
 const settings={locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor,discipline,participants:4,
  ...(pitPath?{pitPath}:{}),
  ...(startOffsetMeters!==undefined?{startOffsetMeters}:{}),
  ...(venue.presentationStatus==='under-construction'?{description:'Venue detail is in progress. Private practice uses a game timing line; times are separate from official venue records.'}:{})};
 const course=createRaceCourse(graph,path,{...settings,laps:1,name:`${venue.name} · ${label} · 1 lap`});
 if(Math.abs(course.lengthMeters-venue.mappedLengthMeters)/venue.mappedLengthMeters>.01)throw Error('race_venue_surface_incomplete');
 return {graph,events:[course,createRaceCourse(graph,path,{...settings,laps:2,name:`${venue.name} · ${label} · 2 laps`})],diagnostics};
}
