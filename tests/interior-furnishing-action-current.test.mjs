import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {onKey} from '../app/js/input.js';
import {handleInteriorAction,nearestInteriorInteraction,registerInteriorFurnishingAction} from '../app/js/interiors/runtime.js?v=20';

test('the keyboard and interior prompt choose the desk instead of an overlapping exit',async()=>{
  const saved={...ctx};let opened=0,worldActions=0,available=true;
  const walker={x:0,z:0,y:1.7};
  const exit={kind:'exit',level:0,x:1.8,z:0,radius:2.25,label:'Exit home'};
  const desk={kind:'furnishing',level:0,x:0,z:0,radius:1.4,label:'Open field record',
    available:()=>available,perform:async()=>{opened++;return true;}};
  const active={floorBaseY:0,activeLevel:0,interactions:[exit]};
  try{
    Object.assign(ctx,{gameStarted:true,activeInterior:active,fishingGame:null,
      Walk:{state:{mode:'walk',walker},CFG:{eyeHeight:1.7}},
      keyMatchesControlAction:(code,action)=>code==='KeyE'&&action==='interact',
      handleInteriorAction:()=>handleInteriorAction({}),
      handlePrimaryContextInteraction:()=>{worldActions++;return true;},
      registerContextInteraction:undefined});
    const retire=registerInteriorFurnishingAction(active,desk);
    assert.equal(nearestInteriorInteraction(active,walker).label,'Open field record');
    onKey('KeyE',{repeat:false});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(opened,1);assert.equal(worldActions,0);assert.equal(ctx.activeInterior,active);
    walker.x=1.8;
    assert.equal(nearestInteriorInteraction(active,walker).kind,'exit','Walking to the doorway still selects the exit');
    walker.x=0;available=false;
    assert.equal(nearestInteriorInteraction(active,walker).kind,'exit','Unavailable furniture cannot mask an exit');
    available=true;walker.y=5.1;
    assert.equal(nearestInteriorInteraction(active,walker),null,'The downstairs desk cannot trigger from another floor');
    retire();retire();walker.y=1.7;
    assert.equal(nearestInteriorInteraction(active,walker).kind,'exit','Retired furniture leaves no interaction behind');
    const retiredRoom={interactions:[]};
    registerInteriorFurnishingAction(retiredRoom,desk);
    assert.deepEqual(retiredRoom.interactions,[],'A late asset cannot publish into a retired room');
  }finally{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);}
});
