import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliveryHandling, deliveryDistinction } from '../app/js/campaign/delivery-handling.js';
import { transitionHarborRun } from '../app/js/campaign/harbor-run.js';
import { applyPlayerCarFinish } from '../app/js/engine/player-car-finish.js';

function drive(patch = () => ({})) {
  const tracker = createDeliveryHandling();
  for (let i = 0; i <= 120; i++) tracker.sample({ speed: 10, mode: 'drive', road: true, yaw: 0, ...patch(i) }, .2, i ? 2 : 0);
  return tracker;
}
test('a measured smooth road delivery earns a distinction, stationary gate visits do not', () => {
  assert.equal(deliveryDistinction(drive().snapshot(), 240), 'steady-cargo');
  assert.equal(deliveryDistinction(drive(() => ({speed: 0})).snapshot(), 240), null);
  assert.equal(deliveryDistinction(null, 240), null);
});
test('speeding, harsh braking, sharp turns, leaving the road and missing samples cannot earn steady cargo', () => {
  for (const patch of [i=>({speed: i>50?15:10}), i=>({speed:i===90?0:10}), i=>({yaw:i===90?1:0}), i=>({road:i!==90})]) {
    assert.equal(deliveryDistinction(drive(patch).snapshot(), 240), null);
  }
  const reloaded = createDeliveryHandling(drive().snapshot());
  assert.equal(deliveryDistinction(reloaded.snapshot(), 240), null);
  const interrupted = drive(); interrupted.interrupt(); assert.equal(deliveryDistinction(interrupted.snapshot(),240),null);
  const invalid = drive(); invalid.sample({speed:NaN},1,100); assert.equal(deliveryDistinction(invalid.snapshot(),240),null);
});
test('handling metrics count separate incidents rather than frames', () => {
  const value=drive(i=>({road:i<20||i>30})).snapshot();
  assert.equal(value.roadDepartures,1);
});
test('finish choice requires the completed job and its current revision', () => {
  assert.throws(()=>transitionHarborRun({}, {type:'finish',finishId:'slate',revision:0}), /Complete/);
  const saved={schemaVersion:1,phase:'complete',revision:6,route:{id:'kept'},completedAt:1000,cargo:'delivered'};
  const next=transitionHarborRun(saved,{type:'finish',finishId:'slate',revision:6});
  assert.equal(next.finishId,'slate'); assert.equal(next.revision,7); assert.equal(next.completedAt,1000);
  assert.throws(()=>transitionHarborRun(next,{type:'finish',finishId:'white',revision:6}),/another window/);
  assert.throws(()=>transitionHarborRun(next,{type:'finish',finishId:'unknown',revision:7}),/Complete/);
  assert.equal(saved.finishId,undefined);
});
test('finish changes only the body atlas; a late load retains the chosen finish', () => {
  const ctx={}; assert.equal(applyPlayerCarFinish(ctx,'slate'),false); assert.equal(ctx.playerCarFinish,'slate');
  const white={},slate={},body={isMesh:true,material:{name:'.001',map:white}},inside={isMesh:true,material:{name:'.002',map:{}}};
  const original=inside.material.map;
  ctx.carMesh={userData:{curatedVehicleVisual:{userData:{finishMaps:{white,slate}},traverse:fn=>[body,inside].forEach(fn)}}};
  assert.equal(applyPlayerCarFinish(ctx,'slate'),true); assert.equal(body.material.map,slate); assert.equal(inside.material.map,original);
  applyPlayerCarFinish(ctx,'white'); assert.equal(body.material.map,white);
  assert.equal(applyPlayerCarFinish(ctx,'bad'),false); assert.equal(body.material.map,white);
});
