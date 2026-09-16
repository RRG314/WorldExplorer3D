import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
// This failure-path test never renders furniture. Its import-time lighting
// vectors need only construction; no geometry behavior is mocked as evidence.
const previousThree=globalThis.THREE;
globalThis.THREE={Vector3:class {}};
const {finalizeLoadedWorld}=await import('../app/js/world/load-support.js');
if(previousThree===undefined)delete globalThis.THREE;else globalThis.THREE=previousThree;
import {SurfacePublicationError,isSurfacePublicationError,finishFailedSurfaceLoad} from '../app/js/world/surface-publication-error.js';

test('a failed road publication never marks a partial world playable',async t=>{
  const saved={...ctx};t.after(()=>{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);});
  let marked=false,spawned=false;
  Object.assign(ctx,{terrainEnabled:true,onMoon:false,roads:[{}],publishCompiledTransportMeshes:async()=>{throw new Error('missing support');}});
  await assert.rejects(finalizeLoadedWorld({markLoaded:()=>{marked=true;},spawnPlayer:()=>{spawned=true;}}),error=>isSurfacePublicationError(error)&&error.stage==='roads');
  assert.equal(marked,false);assert.equal(spawned,false);
});

test('surface failure cancels work and retires staging without starting gameplay',()=>{
  const calls=[],runtimeState={sequence:9,status:'loading',activePhases:['roads']};
  const appCtx={worldLoading:true,initialEarthWorldReady:true,
    _cancelStreetPavementBuild:()=>calls.push('pavement-cancel'),streetOverview:{dispose:()=>calls.push('overview-dispose')},
    releaseEarthWorldForTitle:()=>calls.push('world-resources-release'),
    discardEarthWorldSceneLoad:sequence=>calls.push(`discard-${sequence}`),hideLoad:()=>calls.push('hide'),showToast:text=>calls.push(text)};
  const session={appCtx,runtimeState,worldSession:{fail:reason=>calls.push(reason),snapshot:()=>({status:'failed'})},
    abortProviderWork:()=>calls.push('providers-abort'),releaseWorldLoadCancellation:()=>calls.push('release'),finalizePerfLoad:success=>assert.equal(success,false)};
  const result=finishFailedSurfaceLoad(session,new SurfacePublicationError('pavement',new Error('invalid polygon')));
  assert.equal(result.status,'failed');assert.equal(runtimeState.geometryReady,false);
  assert.equal(appCtx.worldLoading,false);assert.equal(appCtx.initialEarthWorldReady,false);
  for(const action of ['providers-abort','pavement-cancel','overview-dispose','discard-9','world-resources-release','release'])assert.ok(calls.includes(action));
  assert.match(runtimeState.error,/invalid polygon/);
});
