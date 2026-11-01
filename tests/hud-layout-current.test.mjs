import test from 'node:test';
import assert from 'node:assert/strict';
import {hudLaneHeight,bindHudLaneLayout} from '../app/js/ui/hud-layout.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
test('HUD lanes reserve only obstacles in their horizontal space, including swapped thumb controls',()=>{
  const left=rect(8,110,150,0),right=rect(200,110,180,0),nav=rect(0,766,390,78);
  const move=rect(10,630,122,122),look=rect(272,516,108,108);
  assert.equal(hudLaneHeight(left,[nav,move,look],844),512);
  assert.equal(hudLaneHeight(right,[nav,move,look],844),398);
  assert.equal(hudLaneHeight(left,[nav,rect(10,516,108,108),rect(260,630,122,122)],844),398);
});
test('an obstacle already crossing a lane admits no overlapping space; an obstacle above it does not block recovery',()=>{
  const lane=rect(200,300,180,0);
  assert.equal(hudLaneHeight(lane,[rect(250,290,100,100)],844),0);
  assert.equal(hudLaneHeight(lane,[rect(250,200,100,80)],844),536);
  assert.equal(hudLaneHeight(rect(200,850,180,0),[],844),0);
});
test('owned HUD geometry recovers a zero-height lane, avoids repeated writes and releases observation',()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount,values=new Map([['--wx-hud-map-height','999px']]);let writes=0,callback,disconnected=false;
  const nodes={hud:rect(8,8,374,740),hudMap:rect(8,113,150,0),hudUtilities:rect(200,113,182,0),floatMenuContainer:rect(0,766,390,78),mobileTouchControls:rect(0,0,390,844),mobileMovePad:rect(10,630,122,122),mobileLookPad:rect(272,516,108,108)};
  for(const [id,geometry]of Object.entries(nodes))nodes[id]={getBoundingClientRect:()=>geometry,geometry};
  nodes.hud.style={getPropertyValue:key=>values.get(key)||'',setProperty:(key,value)=>{writes++;values.set(key,value);},removeProperty:key=>values.delete(key)};
  const host=new EventTarget();host.innerHeight=844;host.getComputedStyle=()=>({display:'block',visibility:'visible'});
  host.ResizeObserver=class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}};
  const binding=bindHudLaneLayout({getElementById:id=>nodes[id]},host);
  assert.equal(values.get('--wx-hud-map-height'),'509px');assert.equal(values.get('--wx-hud-utility-height'),'395px');
  const firstWrites=writes;binding.refresh();assert.equal(writes,firstWrites);
  Object.assign(nodes.mobileLookPad.geometry,rect(272,100,108,108));callback();assert.equal(values.get('--wx-hud-utility-height'),'0px');
  Object.assign(nodes.mobileLookPad.geometry,rect(272,600,108,108));callback();assert.equal(values.get('--wx-hud-utility-height'),'479px');
  values.set('--wx-hud-utility-height','37px');binding.dispose();assert.equal(disconnected,true);assert.equal(values.get('--wx-hud-map-height'),'999px');assert.equal(values.get('--wx-hud-utility-height'),'37px');
  const stoppedWrites=writes;callback();assert.equal(writes,stoppedWrites);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
});

test('resize delivery coalesces one owned frame and cancels it when the HUD is released',()=>{
  const oldFrame=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
  const frames=new Map(),values=new Map();let sequence=0,callback;
  globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const geometry=rect(200,113,182,0),root={style:{getPropertyValue:k=>values.get(k)||'',setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
  const utility={getBoundingClientRect:()=>geometry},nodes={hud:root,hudUtilities:utility};root.getBoundingClientRect=()=>rect(8,8,374,740);
  const host=new EventTarget();host.innerHeight=844;host.getComputedStyle=()=>({display:'block',visibility:'visible'});
  host.ResizeObserver=class{constructor(fn){callback=fn;}observe(){}disconnect(){}};
  let binding;
  try {
    binding=bindHudLaneLayout({getElementById:id=>nodes[id]},host);
    assert.equal(values.get('--wx-hud-utility-height'),'723px');
    callback();callback();assert.equal(frames.size,1);
    geometry.top=200;assert.equal(values.get('--wx-hud-utility-height'),'723px');
    const [id,frame]=frames.entries().next().value;frames.delete(id);frame(0);
    assert.equal(values.get('--wx-hud-utility-height'),'636px');
    callback();assert.equal(frames.size,1);binding.dispose();assert.equal(frames.size,0);
    callback();assert.equal(frames.size,0);
  } finally {
    binding?.dispose();
    if(oldFrame===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldFrame;
    if(oldCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=oldCancel;
  }
});
