import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransportContinuityRepairAnchors,auditTransportJunctionContinuity} from '../app/js/world/compiler/transport-junction-profile.js';
import {compileTransportSurfaceModel,attachCompiledTransportSurface} from '../app/js/world/compiler/transport-surface-model.js';
import {sampleFeatureSurfaceY} from '../app/js/structure-semantics.js';

function fixture(){
 // Measured failure shape: Baltimore National Pike's 103.43-unit bridge
 // spans 17.28 units of DEM elevation but permits an 8.5% grade. The joint
 // solution must include its real approaches, not pin a one-sample cliff.
 const length=103.42683940530412,lo=53.59649658203125,hi=70.87711334228516,bias=.18;
 const ground=(x)=>lo-bias+(hi-lo)*Math.max(0,Math.min(1,x/length));
 const make=(id,start,end,mode)=>({sourceFeatureId:id,type:'primary',pts:[{x:start,z:0},{x:end,z:0}],width:6,surfaceBias:bias,
  structureSemantics:{terrainMode:mode,isBridge:mode==='elevated',featureCategory:'road',deckClearance:0},
  transportRecord:{identity:id,completeness:'generalized',routeState:'complete',sourceTags:{highway:'primary'}},transportGraphRef:{featureId:id},structureStations:[],structureTransitionAnchors:[]});
 const a=make('approach',-200,0,'at_grade'),b=make('bridge',0,length,'elevated'),c=make('exit',length,length+200,'at_grade');
 const anchor=(distance,endpoint,targetSurfaceY)=>({distance,endpoint,targetSurfaceY,targetOffset:0,span:24,source:'transport_graph_node'});
 b.structureTransitionAnchors=[anchor(0,'start',lo),anchor(length,'end',hi)];
 const side=(f,endpoint)=>({featureId:f.sourceFeatureId,point:f.pts[endpoint==='start'?0:1],segmentIndex:0,segmentT:endpoint==='start'?0:1,distanceAlong:endpoint==='start'?0:f.pts[1].x-f.pts[0].x,endpoint});
 const network={connections:[{id:'west',left:side(a,'end'),right:side(b,'start')},{id:'east',left:side(b,'end'),right:side(c,'start')}]};
 const features=[a,b,c];const compile=f=>attachCompiledTransportSurface(f,compileTransportSurfaceModel(f,ground,{sampleStep:2}));features.forEach(compile);
 const solve=()=>{const result=buildTransportContinuityRepairAnchors(features,network,sampleFeatureSurfaceY,{sampleTerrainY:ground});for(const[f,anchors]of result.anchorsByFeature){const keys=new Set(anchors.map(a=>a.distance));f.structureTransitionAnchors=f.structureTransitionAnchors.filter(a=>!keys.has(a.distance)).concat(anchors);compile(f)}return result};
 return {features,network,solve,lo,hi};
}
test('complete generalized bridge and approach solve shared heights and grade together without an endpoint cliff',()=>{
 const f=fixture();
 assert.ok(auditTransportJunctionContinuity(f.features,f.network,sampleFeatureSurfaceY).discontinuityCount>0);
 f.solve();const audit=auditTransportJunctionContinuity(f.features,f.network,sampleFeatureSurfaceY);
 assert.equal(audit.sampledConnectionCount,2);assert.equal(audit.discontinuityCount,0);
 for(const road of f.features)assert.ok(road.transportSurfaceModel.stats.maximumGrade<=.08501,`${road.sourceFeatureId} violates design grade`);
 assert.ok(Math.abs(f.features[0].transportSurfaceModel.centerHeights[0]-f.lo)<.001,'far end of approach returns to terrain');
 const before=f.features.map(r=>[...r.transportSurfaceModel.centerHeights]);f.solve();assert.deepEqual(f.features.map(r=>[...r.transportSurfaceModel.centerHeights]),before,'repeat solve must not lift the city');
});
test('incomplete routes cannot become a constraint authority',()=>{
 const f=fixture();f.features.forEach(r=>r.transportRecord.routeState='incomplete');
 assert.equal(f.solve().anchorsByFeature.size,0);
});

test('nearby terrain and obstruction samples cannot displace exact shared road nodes',()=>{
 // Actual Baltimore failure: a surface crossing 4.9 mm before the Central
 // Avenue approach node replaced its station during sample deduplication.
 // That made a feasible 8.5% profile look infeasible and discarded all ties.
 const length=17.75103230740185, middle=10.992434576769382;
 const low=-1.4986537945414529, mid=-.5642968555160554, high=.010183951587704465;
 for(const auxiliary of ['ordinary','obstruction']){
  const road={type:'service',width:5,surfaceBias:.08,pts:[{x:0,z:0},{x:length,z:0}],
   structureSemantics:{terrainMode:'at_grade'},
   structureTransitionAnchors:[[0,low,'start'],[middle,mid,null],[length,high,'end']].map(([distance,targetSurfaceY,endpoint])=>({
    distance,targetSurfaceY,endpoint,span:length,source:'transport_graph_node',engineeredApproach:true
   }))};
  if(auxiliary==='ordinary')road.ordinaryStreetAnchors=[{distance:middle-.004897592523930072,targetSurfaceY:3.34}];
  else road.tunnelObstructionLimits=[{start:middle-.004897592523930072,end:middle+.004,maximumSurfaceY:3.34}];
  const model=compileTransportSurfaceModel(road,()=>3.24);
  assert.ok([...model.distances].includes(middle),`${auxiliary} displaced the authoritative station`);
  for(const anchor of road.structureTransitionAnchors){
   const i=[...model.distances].indexOf(anchor.distance);
   assert.ok(i>=0);assert.ok(Math.abs(model.centerHeights[i]-anchor.targetSurfaceY)<1e-6,auxiliary);
  }
  assert.ok(model.stats.maximumGrade<=.08501,'the shared height must not introduce a vertical cliff');
 }
});
