import {createOvalFormatFixture} from './oval-format.js';
import {buildRaceRoadGraph,createRaceCourse} from '../../app/js/racing/course-rules.js';
// A controlled admitted branch, never a substitute for a native venue's pit
// source, ground qualification, entry/exit presentation or gameplay acceptance.
export function createOvalPitFixture(){
 const base=createOvalFormatFixture(),points=[base.roads[10].a,{x:285,y:0,z:-60,connectionLayer:'pit:one'},{x:220,y:0,z:-180,connectionLayer:'pit:two'},base.roads[16].a],sourceFeatureId='controlled:pit',
  pits=points.slice(0,-1).map((a,i)=>({...structuredClone(base.roads[0]),sourceFeatureId,sourceId:`${sourceFeatureId}:${i}:0.000000:1.000000`,a,b:points[i+1],widthMeters:12,heightSamples:[0,1].map(t=>({t,y:0,leftY:0,rightY:0,racingOffsetMeters:0,racingWidthMeters:11.8,lateralSamples:[-6,-1.2,0,1.2,6].map(offsetMeters=>({offsetMeters,y:0}))}))})),
  roads=[...base.roads,...pits],venueSource={...base.venueSource,pitSourceFeatureIds:[sourceFeatureId]},graph=buildRaceRoadGraph(roads,{metersPerUnit:1,venueSource}),path=base.roads.map(r=>r.sourceId+':forward'),pitPath=pits.map(r=>r.sourceId+':forward'),course=createRaceCourse(graph,path,{...base.settings,pitPath});
 return {...base,roads,graph,venueSource,path,pitPath,course};
}
