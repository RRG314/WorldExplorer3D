// Synthetic contract fixture, not a geographic release pack or driving proof.
import {compileMappedVenueLayout} from '../../app/js/racing/venue-layout.js';
import {normalizeRaceVenueSource} from '../../app/js/racing/venue-course-policy.js';
import {earthCoordinateFrame} from '../../app/js/earth-core/coordinate-frame.js';

export function stageSourceFixture(){
 const nodes=Array.from({length:8},(_,i)=>({id:i+1,lat:45,lon:4.998+i*.002})),byId=new Map(nodes.map(n=>[n.id,n]));
 const way=(id,ids,tags)=>({id,version:1,nodes:ids,geometry:ids.map(n=>({lat:byId.get(n).lat,lon:byId.get(n).lon})),tags});
 return {schemaVersion:2,venueId:'controlled-open-stage-2026',license:'ODbL-1.0',
  source:{observedAt:'2026-10-30T12:00:00Z',coverage:{south:44.99,west:4.99,north:45.01,east:5.02}},
  layout:{kind:'open-stage-v1',closed:false,referenceLengthMeters:786.27,usableWidthMeters:3.5,
   legs:[{wayId:101,startNodeId:2,endNodeId:4},{wayId:102,startNodeId:4,endNodeId:6},{wayId:103,startNodeId:6,endNodeId:7}]},
  ways:[way(101,[1,2,3,4],{highway:'tertiary',width:'3.5',surface:'asphalt'}),
   way(102,[6,5,4],{highway:'track',width:'3.5',surface:'gravel',access:'private',motor_vehicle:'no'}),
   way(103,[6,7,8],{highway:'unclassified',width:'3.5',oneway:'yes',surface:'asphalt'})]};
}

export function stagePathFixture(){
 const source=stageSourceFixture(),layout=compileMappedVenueLayout(source),anchor={lat:45,lon:5.005},metersPerUnit=1.11,
  frame=earthCoordinateFrame(anchor,100000),venueSource=normalizeRaceVenueSource({version:2,id:source.venueId,sourceSha256:'a'.repeat(64),
   mappedLengthMeters:layout.lengthMeters,qualificationRadiusWorld:1200,sourceFeatureIds:layout.wayIds.map(id=>`osm:way:${id}`),stage:layout.stage}),roads=[];
 for(const leg of layout.stage.legs){const way=layout.ways.get(Number(leg.sourceFeatureId.slice(8)));
  for(let segment=leg.startSegment;segment<leg.endSegment;segment++)roads.push({sourceFeatureId:leg.sourceFeatureId,sourceId:`${leg.sourceFeatureId}:${segment}:0.000000:1.000000`,
   a:{...frame.toWorld(way.geometry[segment].lat,way.geometry[segment].lon),y:0,connectionLayer:'source-node:'+way.nodes[segment]},
   b:{...frame.toWorld(way.geometry[segment+1].lat,way.geometry[segment+1].lon),y:0,connectionLayer:'source-node:'+way.nodes[segment+1]},
   widthMeters:3.5,direction:way.tags.oneway==='yes'?'forward':'both',driveable:true,supported:true,structure:'surface',clearanceMeters:0,
   heightSampleSpanMeters:1.2,heightSamples:[{t:0,y:0,leftY:0,rightY:0},{t:1,y:0,leftY:0,rightY:0}]});
 }
 const venue={id:source.venueId,name:'Controlled stage',status:'source-prepared',sourceSha256:venueSource.sourceSha256,
  mappedLengthMeters:layout.lengthMeters,sourceFeatureIds:venueSource.sourceFeatureIds,raceDiscipline:'rally',venueSource};
 return {source,layout,venue,district:{type:'RaceDistrictFacts',version:1,locationId:'earth:450000000:50050000',locationLabel:'Controlled stage',anchor,metersPerUnit,venueSource,roads}};
}
