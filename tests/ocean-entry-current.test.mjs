import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanEntryDecision, hasOceanEntry } from '../app/js/ocean/entry-policy.js';
import { createGlobeSelectorLaunch } from '../app/js/ui/globe-selector/launch.js';
import {startOceanExploration} from '../app/js/ocean/start-exploration.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
test('fresh ocean exploration boards the research deck; saved dives and boat deployments retain their authority',async()=>{
 const calls=[];const ctx={startOceanMode:async options=>{calls.push(['ocean',options]);return true},startSurfaceResearchVoyage:async options=>{calls.push(['vessel',options]);return true}};
 assert.equal(await startOceanExploration(ctx,{launchSite:{lat:1,lon:2}}),true);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'vessel');
 const saved=prepareSurfaceVoyage({lat:10,lon:20});
 calls.length=0;assert.equal(await startOceanExploration(ctx,{voyageResume:saved}),true);assert.equal(calls[0][0],'vessel');
 for(const options of [{voyageResume:{...saved,stage:'underwater'}},{parentVessel:{transportEntityId:'own-ship'}}]){
  calls.length=0;assert.equal(await startOceanExploration(ctx,options),true);assert.equal(calls.length,1);assert.equal(calls[0][0],'ocean');
 }
 calls.length=0;ctx.startSurfaceResearchVoyage=async()=>false;assert.equal(await startOceanExploration(ctx,{}),false);assert.equal(calls.length,0);
 ctx.startOceanMode=async()=>false;assert.equal(await startOceanExploration(ctx,{parentVessel:{}}),false);
 for(const voyageResume of [{...saved,version:99},{...saved,site:{lat:NaN,lon:20}}])assert.equal(await startOceanExploration(ctx,{voyageResume}),false);
});
const site = { lat: -18.2861, lon: 147.7 };
const evidence = (elevationMeters, kind = 'open_ocean') => ({ verified: true, source: 'gebco-elevation-sample', kind, elevationMeters });
test('land, shallow, unknown, invalid and reverse-name-only sites cannot start an ocean', () => {
  for (const surface of [null, evidence(30, 'land'), evidence(-2), evidence(null), evidence(NaN),
    { verified: true, kind: 'open_ocean', source: 'structured-reverse-water-feature' },
    { verified: true, kind: 'cryosphere' }]) assert.equal(oceanEntryDecision(site, surface).allowed, false);
  for (const invalid of [{ lat: null, lon: 1 }, { lat: 91, lon: 1 }, { lat: 2, lon: Infinity }]) {
    assert.equal(oceanEntryDecision(invalid, evidence(-80)).allowed, false);
  }
});
test('coastal and offshore modeled water are eligible; permission is pinned to the coordinate', () => {
  for (const depth of [-5, -30, -4500]) {
    const decision = oceanEntryDecision(site, evidence(depth));
    assert.equal(decision.allowed, true);
    assert.equal(hasOceanEntry(site, decision.entry), true);
    assert.equal(hasOceanEntry({ ...site, lat: site.lat + .000001 }, decision.entry), false);
    assert.equal(hasOceanEntry(site, null), false);
  }
});
test('mapped boat clearance can admit water without claiming measured depth', () => {
  assert.equal(hasOceanEntry(site, { ...site, source: 'mapped-boat-water', kind: 'mapped-water-area' }), true);
});
function coordinator() {
  const state = { closed: 0, busy: false, status: '' };
  const api = createGlobeSelectorLaunch({
    close: () => state.closed++, isOpen: () => true,
    setStartButtonBusy() {}, setShortcutButtonsBusy: value => state.busy = value,
    setStatus: value => state.status = value
  });
  return { api, state };
}
test('shortcut catches synchronous failure and permits a retry', async () => {
  const { api, state } = coordinator();
  assert.equal(await api.startEnvironment(() => { throw new Error('offline'); }, 'Ocean'), false);
  assert.match(state.status, /offline/); assert.equal(state.busy, false);
  assert.equal(await api.startEnvironment(() => true, 'Ocean'), true);
  assert.equal(state.closed, 1);
});
test('cancel during water resolution invalidates launch and prevents close; duplicate press does not launch twice', async () => {
  const { api, state } = coordinator();
  let release; const pending = new Promise(resolve => release = resolve);
  let launches = 0;
  const first = api.startEnvironment(async isCurrent => {
    await pending;
    if (!isCurrent()) return false;
    launches++; return true;
  }, 'Ocean');
  await Promise.resolve();
  assert.equal(await api.startEnvironment(() => { launches++; return true; }, 'Ocean'), false);
  api.cancel(); release();
  assert.equal(await first, false);
  assert.equal(launches, 0); assert.equal(state.closed, 0); assert.equal(state.busy, false);
});
