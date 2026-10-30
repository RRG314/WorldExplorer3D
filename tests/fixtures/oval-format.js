import {buildRaceRoadGraph,createRaceCourse} from '../../app/js/racing/course-rules.js';
import {BANKED_ROAD_MODEL,PROFILED_ROAD_PAVEMENT_MODEL} from '../../app/js/physics/road-plane-dynamics.js';
// Controlled rule fixture only. This polygon is not a geographic venue or a
// surveyed bank; exact source/ground and venue presentation have separate proofs.
export function createOvalFormatFixture(){
 const points=Array.from({length:40},(_,i)=>({x:300*Math.sin(i*Math.PI/20),y:0,z:300*Math.cos(i*Math.PI/20),connectionLayer:'node:'+i})),sourceFeatureId='controlled:oval',
  roads=points.map((a,i)=>({sourceId:`${sourceFeatureId}:${i}:0.000000:1.000000`,sourceFeatureId,a,b:points[(i+1)%points.length],widthMeters:20,direction:'forward',structure:'surface',supported:true,driveable:true,
   surfaceModel:BANKED_ROAD_MODEL,pavementModel:PROFILED_ROAD_PAVEMENT_MODEL,racingWidthMeters:6,heightSampleSpanMeters:1.2,heightSamples:[0,1].map(t=>({t,y:0,leftY:0,rightY:0,racingOffsetMeters:0,racingWidthMeters:9.8,lateralSamples:[-5,-1.2,0,1.2,5,15].map(offsetMeters=>({offsetMeters,y:0}))}))})),
  length=roads.reduce((n,r)=>n+Math.hypot(r.b.x-r.a.x,r.b.z-r.a.z),0),venueSource={version:1,id:'controlled-oval-format',sourceSha256:'a'.repeat(64),sourceFeatureIds:[sourceFeatureId],mappedLengthMeters:length,qualificationRadiusWorld:1200},
  graph=buildRaceRoadGraph(roads,{metersPerUnit:1,venueSource}),settings={locationId:'controlled-oval',locationLabel:'Controlled rolling format',anchor:{lat:29.185,lon:-81.071},discipline:'oval',laps:2,participants:4},course=createRaceCourse(graph,graph.edges.map(e=>e.id),settings);
 return {roads,graph,course,settings,venueSource};
}
