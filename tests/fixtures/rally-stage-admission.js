// Controlled reviewed-source fixture, not a geographic release pack.
import {stageSourceFixture} from './racing-stage-source.mjs';
import {createRallyStageFixture} from './rally-stage-format.js';
import {loadRacingVenueSource,prepareVenueSourceMerge} from '../../app/js/racing/venue-source-packs.js';
import {normalizeTransportSource} from '../../app/js/world/compiler/transport-source-normalizer.js?v=4';
import {roadSourceSurvey,reviewedRoadTransportRecord} from '../../app/js/world/road-source-survey.js';
import {earthCoordinateFrame} from '../../app/js/earth-core/coordinate-frame.js';
import {sha256Text} from '../../app/js/terrain/ground-artifact.js?v=4';
import {compileTransportSurfaceModel,attachCompiledTransportSurface,sampleTransportSurfaceAtDistance} from '../../app/js/world/compiler/transport-surface-model.js?v=25';
import {compileTransportNetworkModel} from '../../app/js/world/compiler/transport-network-model.js';
import {initWorldTraversal,buildTraversalNetworks,invalidateTraversalNetworks} from '../../app/js/world/traversal.js';
import {createRoadContactIndex} from '../../app/js/terrain/road-contact-index.js';
import {sampleFeatureSurfaceY} from '../../app/js/structure-semantics.js?v=63';
import {collectRaceDistrict} from '../../app/js/racing/world-course-source.js';
import {buildVenueRaceCourses} from '../../app/js/racing/venue-courses.js';
export async function createRallyStageAdmissionFixture(){
 const raw=stageSourceFixture();raw.layout.rally=structuredClone(createRallyStageFixture().district.venueSource.stage.rally);
 const privateWay=raw.ways[1],points=new Map(raw.ways.flatMap(w=>w.nodes.map((id,i)=>[id,w.geometry[i]])));
 // The private mapped way continues beyond both timed endpoints. Its explicit
 // motor ban must remain effective on those unselected source intervals.
 privateWay.nodes=[8,...privateWay.nodes,1];privateWay.geometry=privateWay.nodes.map(id=>({...points.get(id)}));privateWay.tags.width='8';
 for(const row of [...raw.layout.rally.splits,...raw.layout.rally.paceNotes])if(row.legIndex===1)row.segment++;
 const text=JSON.stringify(raw),descriptor={id:raw.venueId,name:'Controlled stage intake',sourceUrl:'/app/assets/racing/controlled/source.json',
  sourceSha256:await sha256Text(text),groundArtifactId:'controlled-stage-ground',groundContentSha256:'b'.repeat(64),
  raceDiscipline:'rally',routeExtent:'mapped-venue-v1',pavementWidthPolicy:'mapped',motorAccess:'virtual-stage-v1',maximumCrossfall:.15,qualificationRadiusWorld:1200};
 const source=await loadRacingVenueSource(descriptor,{fetchImpl:async()=>new Response(text)}),ground={status:'accepted',artifactIds:[descriptor.groundArtifactId],contentSha256s:[descriptor.groundContentSha256]},
  prepared=prepareVenueSourceMerge({},source,descriptor,ground),frame=earthCoordinateFrame({lat:45,lon:5.005},100000),features=prepared.data.elements.filter(w=>roadSourceSurvey(w)).map(way=>{
   const raw=source.ways.find(w=>w.id===way.id),survey=roadSourceSurvey(way),original=normalizeTransportSource({sourceId:'osm:way:'+way.id,id:way.id,type:'way',providerNamespace:'osm',completeness:'lossless'},way.tags),
    record=reviewedRoadTransportRecord(original,survey),ids=way.nodes.map(String);
   return {way,original,survey,feature:{type:way.tags.highway,transportRecord:record,surfaceSurveyEvidence:survey,sourceFeatureId:record.identity,
    originalSourceNodeIds:ids,sourceNodeIds:[...ids],sourceTopologyNodes:ids.map((id,i)=>({id,...frame.toWorld(raw.geometry[i].lat,raw.geometry[i].lon)})),
    pts:raw.geometry.map(p=>({...frame.toWorld(p.lat,p.lon),y:0})),width:record.crossSection.widthMeters/1.11,metersPerWorldUnit:1.11,
    driveable:record.safeForDriving,walkable:record.access.pedestrian!=='prohibited',structureSemantics:{terrainMode:'at_grade'}}};
  });
 return {source,raw,descriptor,ground,prepared,features};
}
// Use the actual surface compiler, topology, traversal and published triangle
// query. Only this fixture's declared flat ground/source data are controlled.
export async function qualifyRallyStageAdmissionFixture(){
 const f=await createRallyStageAdmissionFixture(),features=f.features.map(row=>row.feature),positions=[];
 for(const feature of features){
  const model=compileTransportSurfaceModel(feature,()=>0,{surfaceBias:.18,sampleStep:2});attachCompiledTransportSurface(feature,model);
  let distance=0;
  for(let i=1;i<feature.pts.length;i++){
   const a=feature.pts[i-1],b=feature.pts[i],length=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length,half=feature.width/2;
   for(const [point,lateral,d]of [[a,-half,distance],[a,half,distance],[b,half,distance+length],[a,-half,distance],[b,half,distance+length],[b,-half,distance+length]]){
    positions.push(point.x+nx*lateral,sampleTransportSurfaceAtDistance(model,d),point.z+nz*lateral);
   }
   distance+=length;
  }
 }
 compileTransportNetworkModel(features);
 initWorldTraversal({runtimeRoadFeatures:()=>features,enableLinearFeatures:()=>false,isVehicleRoad:f=>f.driveable===true,
  isFiniteWorldPointXZ:p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z),featureTraversalKey:f=>f.sourceFeatureId});
 invalidateTraversalNetworks('controlled-stage-source');const traversal=buildTraversalNetworks(),position=Float32Array.from(positions),
  contacts=createRoadContactIndex([{geometry:{attributes:{position:{array:position}},getIndex:()=>null},userData:{terrainMode:'at_grade'}}]),
  context={METERS_PER_WORLD_UNIT:1.11,worldPublication:{requestId:'controlled-stage-source',sequence:1,location:{lat:45,lon:5.005}},
   worldLoadRuntimeState:{sequence:1,venuePack:f.prepared.metadata},buildings:[],buildTraversalNetworks:()=>traversal,roadContactIndex:contacts,
   sampleFeatureSurfaceY,transportDetail:{hasReadyCoverageAt:()=>true},SurfaceQuery:{driveAt:(x,z,options)=>{
    const y=contacts.sampleAt(x,z,options.currentY);return {kind:Number.isFinite(y)?'road':'terrain',position:{y}};
   }}};
 try{
  const district=await collectRaceDistrict(context,{yieldWork:async()=>{}}),events=buildVenueRaceCourses(district,f.prepared.metadata).events;
  return {...f,district,events,context,positions:position,dispose(){contacts.dispose();
   initWorldTraversal({runtimeRoadFeatures:()=>[],enableLinearFeatures:()=>false,isVehicleRoad:()=>false,isFiniteWorldPointXZ:()=>false,featureTraversalKey:()=>''});
   invalidateTraversalNetworks('controlled-stage-source-disposed');buildTraversalNetworks();
  }};
 }catch(error){contacts.dispose();throw error;}
}
