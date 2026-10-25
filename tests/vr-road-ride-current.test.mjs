import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLocalRoadRide,createLocalRoadRide} from '../app/js/vr/road-ride.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
function fixture(){
  const abort=new AbortController(),publication=Object.freeze({sequence:1,requestId:'world-one'}),edge={id:'lane-one',p1:{x:-2,z:0},p2:{x:-2,z:100},length:100,roadWidth:10,centerlineOffset:-2,
    sourceFeatureId:'road-one',sourceSegIndex:0,sourceTStart:0,sourceTEnd:1,direction:'forward',sourceDirection:'both',provenance:'mapped_transport',structure:{terrainMode:'at_grade'}};
  const feature={name:'Mapped street',pts:[{x:0,z:0},{x:0,z:100}],width:10,metersPerWorldUnit:1,transportRecord:{safeForDriving:true},transportGraphRef:{driveable:true,graphId:'graph-one',routeState:'complete'}};
  const runtime={publication:{requestId:'world-one',trafficGraph:{type:'TrafficGraph',schemaVersion:2,edges:[edge]}},trafficCompilation:{runtimeFeatureByEdge:new Map([[edge.id,feature]])},population:{nearbyVehicles:()=>[],nearbyPedestrians:()=>[]}};
  const calls=[],ctx={getEnv:()=> 'EARTH',gameStarted:true,initialEarthWorldReady:true,_worldLoadSequence:1,worldPublication:publication,
    worldLoadRuntimeState:{sequence:1,status:'ready',geometryReady:true,gameplayRuntimesReady:true,publication,session:{state:'published',requestId:'world-one'}},
    WORLD_UNITS_PER_METER:1,METERS_PER_WORLD_UNIT:1,carMesh:{},car:{x:0,y:2.2,z:0,angle:0,speed:0},roads:[feature],transportNetworkModel:{id:'graph-one'},livingWorldRuntime:runtime,
    sampleFeatureSurfaceY:()=>1,roadContactIndex:{sampleAt:()=>1},transportDetail:{hasReadyCoverageAt:()=>true},checkBuildingCollision:()=>({collision:false}),
    activateSurfaceActivity(mode,start,options){calls.push({mode,start,options});Object.assign(ctx.car,{x:start.x,y:start.y+1.2,z:start.z,angle:start.yaw});return true;}};
  return {ctx,edge,feature,runtime,calls,abort,create:plan=>createLocalRoadRide(ctx,plan,{captureSession:()=>({signal:abort.signal,isCurrent:()=>ctx._worldLoadSequence===1})})};
}
test('the preview uses the directed compiled lane and admits only through the existing surface activity owner',()=>{
  const f=fixture(),before=JSON.stringify(f.ctx.car),plan=inspectLocalRoadRide(f.ctx);assert.equal(JSON.stringify(f.ctx.car),before);assert.ok(Object.isFrozen(plan));assert.equal(plan.start.x,-2);assert.equal(plan.start.z,8);assert.equal(plan.end.z,88);
  const ride=f.create(plan);assert.equal(ride.admit(),true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].mode,'drive');assert.equal(f.calls[0].options.maxDistance,.25);ride.dispose();
});
test('unmapped fallback, wrong direction/version, tunnels, narrow or missing physical support cannot become a ride',()=>{
  for(const change of [f=>f.edge.provenance='display-fallback',f=>f.edge.sourceDirection='reverse',f=>f.feature.transportGraphRef.graphId='old',f=>f.edge.structure.terrainMode='subgrade',
    f=>f.feature.width=4,f=>f.ctx.roadContactIndex.sampleAt=()=>null,f=>f.ctx.transportDetail.hasReadyCoverageAt=()=>false,f=>f.ctx.sampleFeatureSurfaceY=(_feature,_x,z)=>z*.2]){
    const f=fixture();change(f);assert.equal(inspectLocalRoadRide(f.ctx),null);assert.equal(f.calls.length,0);
  }
});
test('preparation rechecks support and refuses rejected or changed arrivals before enabling movement',()=>{
  const f=fixture(),plan=inspectLocalRoadRide(f.ctx);f.ctx.roadContactIndex.sampleAt=()=>null;assert.throws(()=>f.create(plan),/no longer available/);
  const denied=fixture(),ride=denied.create(inspectLocalRoadRide(denied.ctx));denied.ctx.activateSurfaceActivity=()=>false;assert.equal(ride.admit(),false);assert.equal(ride.readActions('drive'),null);ride.dispose();
});
test('guidance produces bounded ordinary car actions, stays still while paused and yields to slight manual steering',()=>{
  const f=fixture(),ride=f.create(inspectLocalRoadRide(f.ctx));ride.admit();const before=JSON.stringify(f.ctx.car);ride.step({timestamp:0},false);assert.equal(ride.readActions('drive'),null);
  ride.step({timestamp:20},true);const action=ride.readActions('drive');assert.ok(action.throttle>0&&action.throttle<=.12);assert.equal(action.steer,0);assert.equal(action.reverse,0);assert.equal(JSON.stringify(f.ctx.car),before);
  assert.equal(ride.readActions('drive',{steer:.03}),null);assert.equal(ride.snapshot().status,'manual');assert.equal(ride.readActions('drive'),null);
});
test('completion brakes to a stopped endpoint and releases route ownership; obstacles and coverage loss stop visibly',()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount,f=fixture(),plan=inspectLocalRoadRide(f.ctx),ride=f.create(plan);ride.admit();f.ctx.car.z=plan.end.z-5;f.ctx.car.speed=8;
  ride.step({timestamp:0},true);assert.ok(ride.readActions('drive').serviceBrake>0);f.ctx.car.z=plan.end.z-1;f.ctx.car.speed=0;f.ctx.car.vFwd=0;ride.step({timestamp:200},true);assert.equal(ride.snapshot().status,'complete');assert.equal(ride.snapshot().progress,1);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
  ride.takeManual();assert.equal(ride.snapshot().status,'manual');assert.equal(ride.readActions('drive'),null);
  for(const change of [g=>g.ctx.transportDetail.hasReadyCoverageAt=()=>false,g=>g.ctx.car.isAirborne=true,g=>g.runtime.population.nearbyVehicles=()=>[{x:g.ctx.car.x,y:1,z:g.ctx.car.z+3}]]){
    const g=fixture(),r=g.create(inspectLocalRoadRide(g.ctx));r.admit();change(g);r.step({timestamp:0},true);assert.ok(['road-unavailable','path-blocked'].includes(r.snapshot().status));assert.equal(r.readActions('drive'),null);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
  }
});
test('world/actor replacement, mode handoff and environment abort revoke an admitted ride',()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount;
  for(const change of [f=>f.ctx._worldLoadSequence++,f=>f.ctx.carMesh={},f=>f.ctx.boatMode={active:true},f=>f.abort.abort()]){
    const f=fixture(),ride=f.create(inspectLocalRoadRide(f.ctx));ride.admit();change(f);ride.step({timestamp:0},true);assert.equal(ride.readActions('drive'),null);assert.equal(ride.snapshot().status,'world-changed');assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
  }
});
