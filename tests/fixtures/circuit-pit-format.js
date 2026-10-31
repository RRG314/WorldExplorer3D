import {createOvalPitFixture} from './oval-pit-format.js';
import {buildRaceRoadGraph,createRaceCourse} from '../../app/js/racing/course-rules.js';
import {geographicVenueDistance} from '../../app/js/racing/venue-layout.js';
// Controlled ordinary published pavement. This is not a real venue pack.
export function createCircuitPitFixture({finishInPit=false}={}){
 const base=createOvalPitFixture(),roads=base.roads.map(raw=>{
  const {pavementModel,racingWidthMeters,surfaceModel,...road}=structuredClone(raw);
  return {...road,heightSamples:road.heightSamples.map(({t,y,leftY,rightY})=>({t,y,leftY,rightY}))};
 }),graph=buildRaceRoadGraph(roads,{metersPerUnit:1,venueSource:base.venueSource}),
  path=finishInPit?[...base.path.slice(13),...base.path.slice(0,13)]:base.path,
  settings={...base.settings,discipline:'circuit',laps:1},course=createRaceCourse(graph,path,{...settings,pitPath:base.pitPath});
 return {...base,roads,graph,path,settings,course};
}

export function circuitPitSourceFixture(){
 const base=createCircuitPitFixture(),main=base.roads.filter(r=>r.sourceFeatureId==='controlled:oval'),pit=base.roads.filter(r=>r.sourceFeatureId==='controlled:pit'),
  geo=p=>({lat:45-p.z/111195,lon:5+p.x/(111195*Math.cos(Math.PI/4))}),
  mainGeometry=[...main.map(r=>geo(r.a)),geo(main[0].a)],mainNodes=[...main.map((r,i)=>i+1),1],pitGeometry=[...pit.map(r=>geo(r.a)),geo(pit.at(-1).b)],
  length=mainGeometry.slice(1).reduce((sum,p,i)=>sum+geographicVenueDistance(mainGeometry[i],p),0),
  source={schemaVersion:1,venueId:'controlled-circuit-pit',license:'ODbL-1.0',source:{observedAt:'2026-10-30T12:00:00Z',coverage:{south:44.99,west:4.99,north:45.01,east:5.01}},
   layout:{closed:true,wayIds:[101],referenceLengthMeters:length,usableWidthMeters:12},
   ways:[{id:101,version:1,nodes:mainNodes,geometry:mainGeometry,tags:{highway:'raceway',width:'20',oneway:'yes'}},
    {id:102,version:1,nodes:[11,5001,5002,17],geometry:pitGeometry,tags:{highway:'raceway',raceway:'pit_lane',width:'8',oneway:'yes'}}]},
  descriptor={id:source.venueId,name:'Controlled circuit pit',sourceSha256:'a'.repeat(64),groundArtifactId:'controlled-ground',groundContentSha256:'b'.repeat(64),
   routeExtent:'mapped-venue-v1',qualificationRadiusWorld:1200,raceDiscipline:'circuit',pitWayIds:[102],pitUsableWidthMeters:6,pitPavementWidthPolicy:'mapped',maximumCrossfall:.15},
  ground={status:'accepted',artifactIds:[descriptor.groundArtifactId],contentSha256s:[descriptor.groundContentSha256]};
 return {source,descriptor,ground};
}
