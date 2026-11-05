import test from 'node:test';
import assert from 'node:assert/strict';
import { setWalkingNearClip, walkingInteriorCeiling } from '../app/js/walking/near-camera.js';
import { voyageHudLocation } from '../app/js/hud/location-label.js';
test('indoor camera stays under the occupied floor ceiling while outdoor overhead remains free',()=>{
  assert.equal(walkingInteriorCeiling(null,20),null);
  assert.ok(Math.abs(walkingInteriorCeiling({floorPlan:{storyHeight:3.5}},20)-23.26)<1e-9);
  assert.ok(Math.abs(walkingInteriorCeiling({activeLevel:1,floorPlan:{floors:[{height:3.5},{height:2.8}]}},20)-22.56)<1e-9);
  assert.ok(Math.abs(walkingInteriorCeiling({ceilingY:24},20)-23.76)<1e-9);
});
test('walking close projection changes once and restores the borrowed near plane', () => {
  let updates = 0;
  const camera = {
    near: 0.5,
    updateProjectionMatrix() {
      updates++;
    },
  };
  setWalkingNearClip(camera, true);
  setWalkingNearClip(camera, true);
  assert.equal(camera.near, 0.08);
  assert.equal(updates, 1);
  setWalkingNearClip(camera, false);
  setWalkingNearClip(camera, false);
  assert.equal(camera.near, 0.5);
  assert.equal(updates, 2);
});
test('walking release cannot overwrite a later camera owner', () => {
  const camera = { near: 0.5, updateProjectionMatrix() {} };
  setWalkingNearClip(camera, true);
  camera.near = 0.04;
  setWalkingNearClip(camera, false);
  assert.equal(camera.near, 0.04);
});
test('the HUD uses only the currently controlled aboard voyage, leaving unrelated saves and city state intact', () => {
  const current = {
      stage: 'aboard',
      site: { name: 'Coral Shelf Reserve', lat: -18.2861, lon: 147.7 },
      ship: { transportEntityId: 'original-vessel' },
    },
    ctx = {
      boatMode: { active: true, transportEntityId: 'original-vessel' },
      oceanVoyage: { current },
      selLoc: 'Baltimore',
    },
    before = structuredClone(ctx);
  assert.equal(voyageHudLocation(ctx), 'Coral Shelf Reserve');
  assert.deepEqual(ctx, before);
  assert.equal(
    voyageHudLocation({ ...ctx, boatMode: { active: true, transportEntityId: 'other-vessel' } }),
    ''
  );
  assert.equal(
    voyageHudLocation({
      ...ctx,
      boatMode: { active: false, transportEntityId: 'original-vessel' },
    }),
    ''
  );
  assert.equal(
    voyageHudLocation({ ...ctx, oceanVoyage: { current: { ...current, stage: 'underwater' } } }),
    ''
  );
});
