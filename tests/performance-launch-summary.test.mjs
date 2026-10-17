import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {performanceLaunchSummary} from '../scripts/verification/performance-launch-summary.mjs';

test('launch evidence never serializes or reads retained world graphs', () => {
  const forbidden = {enumerable:true, get(){throw new Error('World geometry must not be read by timing metadata');}};
  const load = {sequence:4, status:'ready', geometryReady:true, gameplayRuntimesReady:true,
    transportProviderDecision:{selected:'shortbread-vector', exactTransportLoaded:false},
    firstRender:{durationMs:50}, gameplayStartupDurationsMs:{living:25}};
  for (const key of ['session','transportFacilities','publication','geometry']) Object.defineProperty(load,key,forbidden);
  const state = {worldLoadRuntimeState:load, perfStats:{mode:'walk',lastLoad:{roadsFinal:100,buildingColliders:200},live:{fps:40}},
    transportSurfacePublication:{roadCount:100,meshCount:20,phaseDurationsMs:{compile:15}},museumProgramPreparation:{status:'prepared'}};
  Object.defineProperty(state.transportSurfacePublication,'geometry',forbidden);
  // Exercise the same isolated function serialization used by page.evaluate.
  const result = vm.runInNewContext(`(${performanceLaunchSummary.toString()})()`, {__WE3D_PERF_CONTEXT__:state});
  const copied = JSON.parse(JSON.stringify(result));
  assert.equal(copied.worldLoad.status,'ready');
  assert.equal(copied.worldLoad.transportProviderDecision.exactTransportLoaded,false);
  assert.equal(copied.performance.lastLoad.buildingColliders,200);
  assert.equal(copied.transportCompilation.roadCount,100);
  assert.ok(JSON.stringify(copied).length < 2000);
  assert.equal(load.sequence,4);
});

test('missing optional diagnostics stay explicitly absent', () => {
  assert.deepEqual(performanceLaunchSummary({}),{worldLoad:null,performance:null,transportCompilation:null});
});
