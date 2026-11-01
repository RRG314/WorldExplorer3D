import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {aircraftGroundOffset} from '../app/js/transport/aircraft-visual-recipe.js';
import {getAviationCatalogEntry} from '../app/js/transport/aviation-catalog.js';

function flight() {
  const source = fs.readFileSync(new URL('../app/js/plane-mode.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export \{.*$/gm, '').replace(/^export (?=function|const|let)/gm, '');
  const appCtx = {camera:{up:{set(){}}},setCameraMode(){},METERS_PER_WORLD_UNIT:1,buildings:[]};
  const context = {appCtx, getAviationCatalogEntry, aircraftGroundOffset, updateAircraftVisual(){},
    activeActorPose:()=>({x:100,y:180,z:200,yaw:.4}), Math, Number, Object, String};
  vm.createContext(context); vm.runInContext(source, context);
  vm.runInContext(`Object.assign(state,{active:true,airborne:true,x:100,y:180,z:200,yaw:.4,pitch:.15,roll:.2,speed:65,throttle:.8});
    state.mesh={userData:{transportCatalogId:'business-jet'},visible:false};
    samplePlaneSurface=()=>-30; syncPlaneMesh=()=>{};`, context);
  return {appCtx,context,prepare:options=>appCtx.preparePlaneMode(options),start:(options,entry)=>appCtx.startPlaneMode(options,entry)};
}

test('choosing another aircraft over the sea continues the live flight through prepare/start',()=>{
  const h=flight(),options={transportCatalogId:'business-jet',source:'ui_button'};
  const prepared=h.prepare(options);
  assert.equal(h.start(options,prepared),true);
  const p=h.appCtx.planeMode;
  assert.equal(p.transportCatalogId,'business-jet');
  assert.equal(p.y,180);assert.equal(p.x,100);assert.equal(p.z,200);
  assert.equal(p.speed,65);assert.equal(p.throttle,.8);assert.equal(p.airborne,true);
  assert.equal(p.pitch,.15);assert.equal(p.roll,.2);
});

test('explicit airport/arrival entries retain their placement and reset rules',()=>{
  for(const options of [
    {transportCatalogId:'business-jet',x:1,y:8,z:2,anchorFacilityId:'mapped-airport'},
    {transportCatalogId:'business-jet',anchorFacilityId:'mapped-airport'},
    {transportCatalogId:'business-jet',airportPassenger:true}
  ]){
    const h=flight(),prepared=h.prepare(options);
    assert.equal(prepared.flightContinuation,null);
    if(Number.isFinite(options.y)){
      assert.equal(h.start(options,prepared),true);
      assert.equal(h.appCtx.planeMode.y,8);assert.equal(h.appCtx.planeMode.x,1);
      assert.equal(h.appCtx.planeMode.speed,0);
    }
  }
});

test('dedicated environment admission still rejects an aircraft choice before touching the flight',()=>{
  for(const blocked of [{oceanMode:{active:true}},{spaceFlight:{active:true}},{worldLoading:true},{onMoon:true},{onMars:true}]){
    const h=flight();Object.assign(h.appCtx,blocked);
    assert.equal(h.prepare({transportCatalogId:'business-jet'}),false);
    assert.equal(h.appCtx.planeMode.y,180);assert.equal(h.appCtx.planeMode.speed,65);
  }
});

test('grounded aircraft starts reject mapped water above the drive surface without blocking valid flight or dry land',()=>{
 const h=flight();vm.runInContext('state.active=false;state.airborne=false;',h.context);
 h.appCtx.SurfaceQuery={waterAt:()=>({feature:{type:'water'},position:{y:0}}),driveAt:()=>({position:{y:-30}})};
 assert.equal(h.prepare({transportCatalogId:'business-jet'}),false);
 h.appCtx.SurfaceQuery.driveAt=()=>({position:{y:1}});
 assert.ok(h.prepare({transportCatalogId:'business-jet'}));
 h.appCtx.SurfaceQuery.driveAt=()=>({position:{y:-30}});
 assert.ok(h.prepare({transportCatalogId:'business-jet',x:100,y:180,z:200}));
});

test('explicit dry airport arrivals query the destination even when the departure is over water',()=>{
 const h=flight();vm.runInContext('state.active=false;state.airborne=false;',h.context);
 const queried=[];h.appCtx.SurfaceQuery={waterAt:(x,z)=>{queried.push([x,z]);return x===1?null:{feature:{},position:{y:0}};},driveAt:()=>({position:{y:8}})};
 assert.ok(h.prepare({transportCatalogId:'business-jet',x:1,y:8,z:2,anchorFacilityId:'dry-airport'}));
 assert.deepEqual(queried,[[1,2]]);
});
