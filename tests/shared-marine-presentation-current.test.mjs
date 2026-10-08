import test from 'node:test';import assert from 'node:assert/strict';
import {sampleMarinePresentation} from '../app/js/ocean/shared-marine-presentation.js';
import {marineVoyageRecord} from '../app/js/ocean/shared-marine-runtime.js';
import {validateOceanVoyage} from '../app/js/ocean/voyage-store.js';
test('crew movement interpolates at a continuous speed and never extrapolates after connection loss',()=>{
 const samples=[{at:1000,pose:{x:0,y:-12,z:0,yaw:3.1}},{at:3500,pose:{x:25,y:-12,z:0,yaw:-3.1}}];
 const a=sampleMarinePresentation(samples,4700),b=sampleMarinePresentation(samples,4800);assert.ok(Math.abs(b.x-a.x-1)<1e-8);assert.ok(Math.abs(b.yaw-a.yaw)<.01);assert.equal(sampleMarinePresentation(samples,9000).x,25);assert.equal(sampleMarinePresentation([],0),null);
});
test('shared state maps to the existing traversal identity without cargo, receipts or crew in local records',()=>{
 const s={id:'room-voyage',revision:3,updatedAtMs:10000,stage:'complete',site:{lat:-18.2861,lon:147.7},ship:{id:'ship:room-voyage',catalogId:'ocean-research-vessel',yaw:0,anchor:{lat:-18.2861,lon:147.7}},submarine:{id:'sub:room-voyage',pose:{x:0,y:-12,z:-65,yaw:0}},manifest:[{id:'table-garden'}]};
 const v=marineVoyageRecord(s);assert.ok(validateOceanVoyage(v));assert.equal(v.stage,'aboard');assert.equal(v.subId,s.submarine.id);assert.equal('manifest' in v,false);
});
