import test from 'node:test';
import assert from 'node:assert/strict';
import {vesselWaterAdmission,submarineDeploymentAdmission} from '../app/js/transport/maritime-admission.js';
import {getMaritimeCatalogEntry} from '../app/js/transport/maritime-catalog.js';
import {createBoatModePolicy} from '../app/js/boat-mode/policy.js';
const water={type:'area',waterKind:'lake'};
const admit=(id,extra={})=>vesselWaterAdmission({catalog:getMaritimeCatalogEntry(id),candidate:water,x:0,z:0,contains:(x,z)=>Math.abs(x)<6&&Math.abs(z)<12,...extra});

test('small water admits the runabout but not the research vessel at any heading',()=>{
 for(const yaw of [0,.3,Math.PI/2,Math.PI]){
  assert.equal(admit('marina-runabout',{yaw}).allowed,true);
  assert.equal(admit('ocean-research-vessel',{yaw}).allowed,false);
 }
 assert.equal(admit('ocean-research-vessel',{contains:()=>true}).allowed,true,'A large lake is not excluded merely by its name');
});
test('boarding includes bow corners and scales metre dimensions into world units',()=>{
 assert.equal(admit('marina-runabout',{contains:(x,z)=>!(x>1&&z>3)}).allowed,false);
 assert.equal(admit('marina-runabout',{metersPerUnit:.1}).allowed,false);
 assert.equal(admit('ocean-research-vessel',{metersPerUnit:10}).allowed,false,'Geographic conversion must not shrink the admitted hull below its rendered extent');
 assert.equal(admit('marina-runabout',{contains:null}).allowed,false);
});
test('known depth constrains draft and unknown depth does not become a measured claim',()=>{
 const broad={contains:()=>true};
 assert.equal(admit('ocean-research-vessel',{...broad,candidate:{...water,source:{depthEvidence:{truthType:'modeled',depthMeters:5}}}}).allowed,false);
 assert.equal(admit('ocean-research-vessel',{...broad,candidate:{...water,source:{depthEvidence:{truthType:'modeled',depthMeters:12}}}}).allowed,true);
 assert.equal(admit('marina-runabout').depthStatus,'unknown');
 assert.equal(admit('marina-runabout',{candidate:{...water,shorelineDistance:900}}).depthStatus,'unknown');
});
test('submarine deployment requires actual vessel capability, stopped control and marine water',()=>{
 const options={catalog:getMaritimeCatalogEntry('ocean-research-vessel'),speedMetersPerSecond:0,waterKind:'coastal',waterType:'area',shorelineDistance:100,requiredShorelineDistance:25};
 assert.equal(submarineDeploymentAdmission(options).allowed,true);
 for(const extra of [{catalog:getMaritimeCatalogEntry('marina-runabout')},{speedMetersPerSecond:2},{waterKind:'lake'},{waterKind:'river'},{shorelineDistance:10}])assert.equal(submarineDeploymentAdmission({...options,...extra}).allowed,false);
});
test('the actual boat policy rejects a small boat before transfer and explains its swimming alternative',()=>{
 let notice='';const appCtx={boatMode:{active:true,transportCatalogId:'marina-runabout',currentWater:{type:'area',waterKind:'open_ocean'},shorelineDistance:200},boat:{speed:0},METERS_PER_WORLD_UNIT:1};
 const policy=createBoatModePolicy({appCtx,minimumBoatShorelineDistance:()=>20,setPromptSignature:()=>{},showBoatPrompt:s=>notice=s});
 assert.equal(policy.canDiveBoatMode(),false);assert.match(notice,/swimming ladder/);
 appCtx.boatMode.transportCatalogId='ocean-research-vessel';assert.equal(policy.canDiveBoatMode(),true);
 appCtx.boat.speed=1;assert.equal(policy.canDiveBoatMode(),false);assert.match(notice,/Stop/);
});
