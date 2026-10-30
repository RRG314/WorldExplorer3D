import {buildRaceRoadGraph,createRaceCourse} from './course-rules.js';

// A venue path is its reviewed ordered ways, never whichever nearby loop a
// shortest-path recommendation happens to find. Missing spans keep it closed.
export function buildVenueRaceCourses(district,venue){
 if(venue?.status!=='source-prepared'||!Array.isArray(venue.sourceFeatureIds)||!venue.sourceFeatureIds.length)throw Error('race_venue_not_prepared');
 if(venue.raceAdmission==='pending-timing-line')throw Error('race_venue_timing_line_pending');
 const graph=buildRaceRoadGraph(district.roads,{metersPerUnit:district.metersPerUnit,venueSource:district.venueSource}),ordered=[],edges=new Map(graph.edges.map(e=>[e.id,e]));
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
 ordered.push(...orderedRows(venue.sourceFeatureIds));
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
 const discipline=venue.raceDiscipline||'circuit';if(!['circuit','oval'].includes(discipline))throw Error('race_venue_discipline_invalid');
 const settings={locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor,discipline,participants:4,
  ...(pitPath?{pitPath}:{}),
  ...(startOffsetMeters!==undefined?{startOffsetMeters}:{}),
  ...(venue.presentationStatus==='under-construction'?{description:'Venue detail is in progress. Private practice uses a game timing line; times are separate from official venue records.'}:{})};
 const course=createRaceCourse(graph,path,{...settings,laps:1,name:`${venue.name} · ${label} · 1 lap`});
 if(Math.abs(course.lengthMeters-venue.mappedLengthMeters)/venue.mappedLengthMeters>.01)throw Error('race_venue_surface_incomplete');
 return {graph,events:[course,createRaceCourse(graph,path,{...settings,laps:2,name:`${venue.name} · ${label} · 2 laps`})],diagnostics:{venue:venue.id,sourceWays:venue.sourceFeatureIds.length,qualifiedSpans:path.length}};
}
