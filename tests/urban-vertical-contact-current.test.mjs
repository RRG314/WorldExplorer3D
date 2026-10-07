import test from 'node:test';
import assert from 'node:assert/strict';
import {urbanTargetOverlapsHeight,urbanTargetVerticalSpan} from '../app/js/urban-sandbox/vertical-contact.js';
import {VEHICLE_ROOT_TO_GROUND_METERS as pivot} from '../app/js/engine/vehicle-catalog.js';
test('traffic above or beneath a tunnel cannot stop or damage its occupant',()=>{
 for(const kind of ['vehicle','ambient_vehicle','responder_vehicle','npc','ambient_npc','responder_officer']){
  const vehicle=kind.includes('vehicle');
  const target={kind,y:30+(vehicle&&kind!=='ambient_vehicle'?pivot:0),variant:{height:2.1}};
  assert.equal(urbanTargetVerticalSpan(target).base,30);
  assert.equal(urbanTargetOverlapsHeight(target,24),false,kind);
  assert.equal(urbanTargetOverlapsHeight(target,34),false,kind);
  assert.equal(urbanTargetOverlapsHeight(target,30),true,kind);
  assert.equal(urbanTargetOverlapsHeight(target,29),true,kind);
 }
});
test('a jumping player can pass over a car but tall vehicles still block their real clearance',()=>{
 assert.equal(urbanTargetOverlapsHeight({kind:'ambient_vehicle',y:0,variant:{height:1.45}},2),false);
 assert.equal(urbanTargetOverlapsHeight({kind:'ambient_vehicle',y:0,variant:{height:3.05}},2),true);
 assert.equal(urbanTargetOverlapsHeight({kind:'npc',y:0,heightScale:1.2},2),true);
 assert.equal(urbanTargetOverlapsHeight({kind:'npc',y:undefined},0),true);
});
