import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseLocationModels} from '../app/js/world/release-location-models.js';

test('reset retires location models and callbacks that outlive render collections',()=>{
  const oldRoad={pts:[{x:1,z:2},{x:3,z:4}]},oldBuilding={id:'old-building'};
  const ctx={transportNetworkModel:{features:[oldRoad]},transportStructureModel:{id:'old'},transportJunctionProfile:{nodes:[oldRoad]},
    poiLifecycle:{byBuilding:new Map([[oldBuilding,[]]])},refreshActiveFunctionalPois:()=>[oldBuilding],
    functionalPoiRecords:[oldBuilding],activeFunctionalPois:[oldBuilding],poiTenanciesByBuilding:new Map([[oldBuilding,[]]]),
    settings:{volume:.4}};
  releaseLocationModels(ctx);
  assert.equal(ctx.transportNetworkModel,null);assert.equal(ctx.transportStructureModel,null);
  assert.equal(ctx.transportJunctionProfile,null);assert.equal(ctx.poiLifecycle,null);assert.equal(ctx.refreshActiveFunctionalPois,null);
  assert.deepEqual(ctx.activeFunctionalPois,[]);assert.deepEqual(ctx.functionalPoiRecords,[]);assert.equal(ctx.poiTenanciesByBuilding.size,0);
  assert.deepEqual(ctx.settings,{volume:.4});
  releaseLocationModels(ctx);assert.equal(ctx.transportNetworkModel,null);
});

test('the full reset invokes model retirement after runtime consumers stop',()=>{
  const source=readFileSync(new URL('../app/js/world/load-reset.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('releaseLocationModels(appCtx)')>source.indexOf("disposeWorldDiscoveryRuntime?.('world_reload')"));
});
