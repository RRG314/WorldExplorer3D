import {traversalSegmentCount,readTraversalSegment}from'../world/traversal-graph-storage.js';
import {minimumRoadWidthOnInterval,roadSegmentIsDriveable}from'../world/road-cross-section-profile.js?v=1';
import {roadMetersPerWorldUnit}from'../world/road-units.js';
import {createBuildingCollisionQuery}from'../physics/building-collision.js?v=5';
import {resolveTunnelSpace}from'../world/compiler/tunnel-space-query.js';
import {drainCooperatively,yieldToWorldFrame}from'../world/cooperative-scheduling.js?v=1';
import {buildRaceRoadGraph,createRaceCourse,shortestRacePath,RACE_MINIMUM_SPAN_METERS}from'./course-rules.js';

// Read published world facts through their existing owners. Qualification never
// replaces a road, runs a provider query, flattens terrain or changes residency.
export async function collectRaceDistrict(context,{locationId,locationLabel,radiusWorld=270,sourceFeatureIds=null,current=()=>true,yieldWork=yieldToWorldFrame}={}){
 const publication=context.worldPublication,traversal=context.buildTraversalNetworks?.()?.drive;
 if(!publication?.requestId||context.worldLoading||!traversal?.segments||!context.SurfaceQuery?.driveAt||!context.sampleFeatureSurfaceY)throw Error('race_world_not_ready');
 const metersPerUnit=Number(context.METERS_PER_WORLD_UNIT)||1.11,envelope={width:2.35,length:6.5,height:2.4};
 const radius=Math.max(100,Math.min(1200,Number(radiusWorld)||270)),checkBuilding=createBuildingCollisionQuery(context),roads=[];
 const selectedSources=sourceFeatureIds?new Set(sourceFeatureIds):null;
 if(selectedSources&&(!selectedSources.size||selectedSources.size>500||[...selectedSources].some(id=>typeof id!=='string'||!id||id.length>180)))throw Error('invalid_race_source_selection');
 const diagnostics={sourceSegments:traversalSegmentCount(traversal.segments),eligible:0,rejected:{},sampledPositions:0};
 const rejected=reason=>{diagnostics.rejected[reason]=(diagnostics.rejected[reason]||0)+1;};
 const active=()=>current()&&context.worldPublication===publication&&!context.worldLoading;
 function* collect(){
  const cursor={};
  for(let index=0;index<diagnostics.sourceSegments;index++){
   if(!active())throw Error('race_world_changed');
   const segment=readTraversalSegment(traversal.segments,index,cursor),feature=segment?.feature;
   if(!feature||!segment.p1||!segment.p2)continue;
   const {p1,p2,segIndex,sourceTStart=0,sourceTEnd=1}=segment;
   if(Math.max(Math.hypot(p1.x,p1.z),Math.hypot(p2.x,p2.z))>radius)continue;
   const length=Math.hypot(p2.x-p1.x,p2.z-p1.z)*metersPerUnit;
   const widthMeters=minimumRoadWidthOnInterval(feature,segIndex,sourceTStart,sourceTEnd)*roadMetersPerWorldUnit(feature);
   if(length<RACE_MINIMUM_SPAN_METERS||widthMeters<6||!roadSegmentIsDriveable(feature,segIndex,sourceTStart,sourceTEnd)){rejected('width_or_access');yield;continue;}
   const sourceFeatureId=String(feature.transportRecord?.identity||feature.sourceFeatureId||feature.sourceRoadId||feature.id||'');
   if(selectedSources&&!selectedSources.has(sourceFeatureId))continue;
   if(!sourceFeatureId){rejected('unstable_source');yield;continue;}
   const structureName=String(feature.structureSemantics?.structureKind||'surface');
   const tunnel=/tunnel/.test(structureName),structure=tunnel?'tunnel':/bridge|elevated|viaduct/.test(structureName)?'bridge':'surface';
   const fx=(p2.x-p1.x)/(length/metersPerUnit),fz=(p2.z-p1.z)/(length/metersPerUnit),samples=[];
   let failure='',minimumClearance=Infinity;
   const steps=Math.max(1,Math.ceil(length/4)),spanMeters=1.2;
   function height(x,z,t){return context.sampleFeatureSurfaceY(feature,x,z,{x,z,dist:0,segIndex,t:sourceTStart+(sourceTEnd-sourceTStart)*t});}
   for(let sample=0;sample<=steps;sample++){
    const t=sample/steps,x=p1.x+(p2.x-p1.x)*t,z=p1.z+(p2.z-p1.z)*t,y=height(x,z,t);diagnostics.sampledPositions++;
    if(!Number.isFinite(y)){failure='missing_surface';break;}
    if(context.transportDetail?.hasReadyCoverageAt?.({x,z},0)===false){failure='road_publication_pending';break;}
    const drive=context.SurfaceQuery.driveAt(x,z,{preferRoad:true,currentY:y});
    if(drive?.kind!=='road'||!Number.isFinite(drive.position?.y)||Math.abs(drive.position.y-y)*metersPerUnit>.35){failure='surface_layer_mismatch';break;}
    const water=context.SurfaceQuery.waterAt?.(x,z),space=tunnel?resolveTunnelSpace(feature,x,z,y+.5):null;
    if(tunnel){if(!space?.inside){failure='unqualified_tunnel';break;}minimumClearance=Math.min(minimumClearance,space.clearance*metersPerUnit);}
    if(water?.feature&&Number.isFinite(water.position?.y)&&water.position.y>y+.15&&!space?.inside){failure='submerged_road';break;}
    for(const along of [-1,0,1]){
     const offset=along*(envelope.length-envelope.width)*.5/metersPerUnit;
     if(checkBuilding(x+fx*offset,z+fz*offset,envelope.width*.5/metersPerUnit,{actorBaseY:y,actorHeight:envelope.height/metersPerUnit}).collision){failure='blocked_clearance';break;}
    }
    if(failure)break;
    const lateral=spanMeters/metersPerUnit,leftY=height(x-fz*lateral,z+fx*lateral,t),rightY=height(x+fz*lateral,z-fx*lateral,t);
    if(!Number.isFinite(leftY)||!Number.isFinite(rightY)){failure='missing_crossfall';break;}
    const previous=samples.at(-1);
    if(previous&&Math.abs(y-previous.y)*metersPerUnit/(length/steps)>.22){failure='steep_grade';break;}
    if(Math.max(Math.abs(y-leftY),Math.abs(y-rightY))*metersPerUnit/spanMeters>.15){failure='steep_crossfall';break;}
    samples.push({t,y,leftY,rightY});
    // Budgeted by the same construction scheduler as the world compiler.
    yield;
   }
   if(failure){rejected(failure);continue;}
   const key=`${sourceFeatureId}:${segIndex}:${sourceTStart.toFixed(6)}:${sourceTEnd.toFixed(6)}`;
   const a={x:p1.x,y:samples[0].y,z:p1.z,connectionLayer:`source-node:${segment.fromId}`},b={x:p2.x,y:samples.at(-1).y,z:p2.z,connectionLayer:`source-node:${segment.toId}`};
   roads.push({sourceId:key,sourceFeatureId,label:String(feature.name||feature.transportRecord?.sourceTags?.name||''),a,b,widthMeters,direction:segment.direction,
    driveable:true,supported:true,structure,clearanceMeters:tunnel?minimumClearance:0,heightSamples:samples,heightSampleSpanMeters:spanMeters,
    sourceAuthority:String(feature.transportRecord?.provenance?.authority||feature.sourceAuthority||'published-world-road')});
   diagnostics.eligible++;yield;
  }
 }
 await drainCooperatively(collect(),{current:active,yieldWork,budgetMs:2});
 if(!active())throw Error('race_world_changed');
 if(!roads.length)throw Error('no_qualified_racing_roads');
 const anchor=publication.location||context.LOC,identity=context.livingWorldPublication?.worldIdentity;
 const loaded=context.worldLoadRuntimeState&&context.worldLoadRuntimeState.sequence===publication.sequence?context.worldLoadRuntimeState.location:null;
 const stableLocationId=identity?.latitudeE7!==undefined?`earth:${identity.latitudeE7}:${identity.longitudeE7}`:
  `earth:${Math.round(Number(anchor?.lat)*1e7)}:${Math.round(Number(anchor?.lon)*1e7)}`;
 return {type:'RaceDistrictFacts',version:1,locationId:String(locationId||stableLocationId).slice(0,80),
  locationLabel:String(locationLabel||loaded?.name||identity?.location?.name||context.LOC?.name||'Mapped district').slice(0,80),anchor:{lat:Number(anchor?.lat),lon:Number(anchor?.lon)},metersPerUnit,
  radiusWorld:radius,vehicleEnvelope:envelope,roads,diagnostics,provenance:{authority:'published-world-road-qualification-v1',requestId:publication.requestId}};
}

export function recommendRaceCourses(district){
 const graph=buildRaceRoadGraph(district.roads,{metersPerUnit:district.metersPerUnit}),events=[],signatures=new Set(),failures={};
 const rejected=error=>{failures[error.message]=(failures[error.message]||0)+1;};
 const starts=graph.edges.filter(e=>e.length>=2).sort((a,b)=>Math.hypot(graph.nodes[a.from].x,graph.nodes[a.from].z)-Math.hypot(graph.nodes[b.from].x,graph.nodes[b.from].z)).slice(0,30);
 const settings={locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor,participants:4};
 for(const first of starts){
  if(events.length>=4)break;
  try{
   const other=first.id.endsWith(':forward')?first.id.replace(/:forward$/,':reverse'):first.id.replace(/:reverse$/,':forward');
   const back=shortestRacePath(graph,first.to,first.from,{excludedEdges:new Set([first.id,other])});
   const signature=[first.id,...back].map(id=>id.replace(/:(forward|reverse)$/,'')).sort().join('|');
   if(back.length&& !signatures.has(signature)){
    const course=createRaceCourse(graph,[first.id,...back],{...settings,discipline:'circuit',laps:2,name:`${district.locationLabel} · Circuit ${events.filter(e=>e.discipline==='circuit').length+1}`});
    signatures.add(signature);events.push(course);
   }
  }catch(error){if(!/race_|disconnected/.test(error.message))throw error;rejected(error);}
 }
 for(const first of starts.slice(0,12)){
  if(events.some(e=>e.discipline==='sprint'))break;
  const targets=[...graph.nodes].sort((a,b)=>Math.hypot(b.x-graph.nodes[first.from].x,b.z-graph.nodes[first.from].z)-Math.hypot(a.x-graph.nodes[first.from].x,a.z-graph.nodes[first.from].z)).slice(0,20);
  for(const target of targets)try{
   const path=[first.id,...shortestRacePath(graph,first.to,target.id,{excludedEdges:new Set([first.id.replace(/:(forward|reverse)$/,first.id.endsWith(':forward')?':reverse':':forward')])})];
   const sprint=createRaceCourse(graph,path,{...settings,discipline:'sprint',name:`${district.locationLabel} · District sprint`});events.push(sprint);
   const trial=createRaceCourse(graph,path,{...settings,participants:1,discipline:'time-trial',name:`${district.locationLabel} · Time trial`});events.push(trial);break;
  }catch(error){if(!/race_|disconnected/.test(error.message))throw error;rejected(error);}
 }
 return {graph,events,diagnostics:{attemptFailures:failures,starts:starts.length,nodes:graph.nodes.length,edges:graph.edges.length}};
}
