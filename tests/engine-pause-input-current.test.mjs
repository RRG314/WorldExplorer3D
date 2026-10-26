import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEngineInputHandlers } from '../app/js/engine/input-handlers.js';

test('Escape resumes a keyboard-focused pause dialog without enabling movement from form controls', () => {
  const keys = [];
  const handlers = new Map();
  const names = ['window', 'document', 'addEventListener', 'removeEventListener'];
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let paused = true;
  const backpackButton = { tagName: 'BUTTON' };
  const equipment = { equipmentOpen: false, equipmentUi: { root: { contains: target => target === backpackButton } } };
  const journalButton = {tagName:'BUTTON'}, journalSearch = {tagName:'INPUT'};
  const journal = {open:false};
  let scope;
  try {
    globalThis.window = globalThis;
    globalThis.document = new EventTarget();
    globalThis.document.getElementById = id => id==='discoveryPanel' ? {contains:target=>target===journalButton||target===journalSearch} : null;
    globalThis.addEventListener = (name, handler) => handlers.set(name, handler);
    globalThis.removeEventListener = (name) => handlers.delete(name);
    scope = setupEngineInputHandlers({
      keys: {}, gameStarted: true,
      urbanSandboxRuntime: equipment,
      worldDiscoveryRuntime: {ui:journal},
      hasPauseReason: reason => reason === 'manual_pause' && paused,
      onKey: code => { keys.push(code); if (code === 'Escape') { if (journal.open) journal.open=false; else if (equipment.equipmentOpen) equipment.equipmentOpen = false; else paused = !paused; } }
    });
    const key = (code, tagName = 'BUTTON') => handlers.get('keydown')({ code, target: { tagName }, preventDefault() {} });
    key('KeyW');
    assert.deepEqual(keys, []);
    key('Escape');
    assert.equal(paused, false, 'Escape must reach the pause handler from its focused Resume button');
    key('KeyW', 'INPUT');
    key('Escape', 'INPUT');
    assert.deepEqual(keys, ['Escape'], 'Unpaused form controls retain their keyboard ownership');
    equipment.equipmentOpen = true;
    key('Escape', 'INPUT');
    assert.equal(equipment.equipmentOpen, true, 'A control outside the Backpack keeps its input ownership');
    handlers.get('keydown')({ code: 'KeyV', target: backpackButton, preventDefault() {} });
    assert.deepEqual(keys, ['Escape'], 'A focused Backpack control cannot accidentally fire equipment');
    handlers.get('keydown')({ code: 'Escape', target: backpackButton, preventDefault() {} });
    assert.equal(equipment.equipmentOpen, false, 'Escape closes the Backpack after its Equip button receives focus');
    assert.equal(paused, false, 'Dismissing the Backpack must not toggle game pause');
    journal.open=true;
    const beforeJournal=keys.length;
    handlers.get('keydown')({code:'KeyF',target:journalButton,preventDefault(){}});
    key('Escape','INPUT');
    assert.equal(keys.length,beforeJournal,'Journal buttons and unrelated inputs cannot dispatch world commands');
    handlers.get('keydown')({code:'Escape',target:journalButton,preventDefault(){}});
    assert.equal(journal.open,false,'Escape reaches the Journal owner from its focused button');
    journal.open=true;
    handlers.get('keydown')({code:'Escape',target:journalSearch,preventDefault(){}});
    assert.equal(journal.open,false,'The Journal search field has the same owned close command');
    assert.equal(paused,false,'Journal close does not toggle manual pause');
    key('Escape', 'BODY');
    assert.equal(paused, true);
  } finally {
    scope?.dispose();
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]);
      else delete globalThis[name];
    });
  }
});

// The same shell action is used by menus and HUD controls. Test its current
// presentation contract without rendering another city or relaxing form input.
import {bindWorldFocusControls} from '../app/js/ui/world-focus.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
function focusFixture(t) {
  const elements=Object.fromEntries(['returnToWorldBtn','floatMenuContainer','hud','minimapZoomControls','worldQuickControls'].map(id=>[id,new EventTarget()]));
  const document={activeElement:null,getElementById:id=>elements[id]};
  const canvas=id=>({id,isConnected:true,tabIndex:-1,focus(){document.activeElement=this;}});
  const main=canvas('main'),ocean=canvas('ocean'),space=canvas('space');let closes=0;
  const context={gameStarted:true,renderer:{domElement:main},oceanMode:{active:false,renderer:{domElement:ocean}},spaceFlight:{active:false,renderer:{domElement:space}},keys:{},screenLayout:{snapshot:()=>({})}};
  const baseline=getLifecycleRegistrySnapshot().resourceCount;
  const action=bindWorldFocusControls(context,()=>closes++,document);
  t.after(()=>{action.dispose();assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);});
  const key=(id,key='Escape',tagName='BUTTON')=>{const event=new Event('keydown',{cancelable:true});Object.defineProperties(event,{key:{value:key},target:{value:{tagName}}});elements[id].dispatchEvent(event);return event.defaultPrevented;};
  return {context,document,main,ocean,space,action,key,closes:()=>closes};
}
test('HUD/menu/map actions return to the current Earth, Ocean, Space or ship-interior canvas',t=>{
  const f=focusFixture(t);
  for(const id of ['floatMenuContainer','hud','minimapZoomControls','worldQuickControls']){
    f.document.activeElement=null;assert.equal(f.key(id),true);assert.equal(f.document.activeElement,f.main);
  }
  f.context.oceanMode.active=true;assert.equal(f.action.focusWorld(),true);assert.equal(f.document.activeElement,f.ocean);
  f.context.spaceFlight.active=true;assert.equal(f.action.focusWorld(),true);assert.equal(f.document.activeElement,f.space);
  f.context.activeShipInterior={};assert.equal(f.action.focusWorld(),true);assert.equal(f.document.activeElement,f.main);
  assert.equal(f.ocean.tabIndex,0);assert.deepEqual(f.context.keys,{});
});
test('world return keeps typing, active panels, transitions, pause and immersive presentation isolated',t=>{
  const f=focusFixture(t);
  for(const tag of ['INPUT','TEXTAREA','SELECT'])assert.equal(f.key('hud','Escape',tag),false);
  assert.equal(f.key('hud','w'),false);assert.equal(f.closes(),0);
  for(const flag of ['paused','worldLoading','titleLaunchPending','earthResumePending']){
    f.context[flag]=true;assert.equal(f.action.focusWorld(),false,flag);f.context[flag]=false;
  }
  f.context.gameStarted=false;assert.equal(f.action.focusWorld(),false);f.context.gameStarted=true;
  for(const state of [{panelLayer:'backpack'},{activityLayer:'fishing'}]){f.context.screenLayout.snapshot=()=>state;assert.equal(f.action.focusWorld(),false);}
  f.context.screenLayout.snapshot=()=>({});f.context.vrPresentation={active:true};assert.equal(f.action.focusWorld(),false);
  f.context.vrPresentation=null;f.main.isConnected=false;assert.equal(f.action.focusWorld(),false);assert.equal(f.closes(),0);
});
test('disposing the world-return view removes its events and prevents late refocus',t=>{
  const f=focusFixture(t);f.action.dispose();assert.equal(f.key('hud'),false);assert.equal(f.action.focusWorld(),false);assert.equal(f.document.activeElement,null);
});
