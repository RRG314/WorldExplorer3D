import {buildRaceRoadGraph,createRaceCourse} from './course-rules.js';

// A venue path is its reviewed ordered ways, never whichever nearby loop a
// shortest-path recommendation happens to find. Missing spans keep it closed.
export function buildVenueRaceCourses(district,venue){
 if(venue?.status!=='source-prepared'||!Array.isArray(venue.sourceFeatureIds)||!venue.sourceFeatureIds.length)throw Error('race_venue_not_prepared');
 if(venue.raceAdmission==='pending-timing-line')throw Error('race_venue_timing_line_pending');
 const graph=buildRaceRoadGraph(district.roads,{metersPerUnit:district.metersPerUnit,venueSource:district.venueSource}),path=[],edges=new Map(graph.edges.map(e=>[e.id,e]));
 const bySource=new Map();
 for(const road of district.roads){
  if(!bySource.has(road.sourceFeatureId))bySource.set(road.sourceFeatureId,[]);
  const suffix=road.sourceId.slice(road.sourceFeatureId.length+1).split(':').map(Number);
  if(suffix.length!==3||suffix.some(n=>!Number.isFinite(n))||!Number.isInteger(suffix[0])||suffix[0]<0||suffix[1]<0||suffix[2]>1||suffix[1]>=suffix[2])throw Error('race_venue_source_order_missing');
  bySource.get(road.sourceFeatureId).push({road,segment:suffix[0],start:suffix[1]});
 }
 for(const id of venue.sourceFeatureIds){
  const roads=bySource.get(id);if(!roads?.length)throw Error('race_venue_surface_incomplete');
  roads.sort((a,b)=>a.segment-b.segment||a.start-b.start);
  for(const {road} of roads){const edge=edges.get(road.sourceId+':forward');if(!edge)throw Error('race_venue_direction_unavailable');path.push(edge.id);}
 }
 const settings={locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor,discipline:'circuit',participants:4};
 const course=createRaceCourse(graph,path,{...settings,laps:1,name:`${venue.name} · GP · 1 lap`});
 if(Math.abs(course.lengthMeters-venue.mappedLengthMeters)/venue.mappedLengthMeters>.01)throw Error('race_venue_surface_incomplete');
 return {graph,events:[course,createRaceCourse(graph,path,{...settings,laps:2,name:`${venue.name} · GP · 2 laps`})],diagnostics:{venue:venue.id,sourceWays:venue.sourceFeatureIds.length,qualifiedSpans:path.length}};
}
