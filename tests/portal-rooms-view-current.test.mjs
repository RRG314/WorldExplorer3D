import test from 'node:test';
import assert from 'node:assert/strict';
import {portalPublicRooms,createPortalRoomsView} from '../app/js/portal/rooms-view.js';
import {createLifecycleScope} from '../app/js/runtime/lifecycle-scope.js';
import {readAccessibilityPreferences,applyAccessibilityPreferences} from '../app/js/ui/accessibility.js';
const room=(code='ABC123',patch={})=>({code,name:'Harbor crew',visibility:'public',world:{kind:'earth',lat:39.2,lon:-76.6},locationTag:{city:'Baltimore'},ownerUid:'private-owner',mods:{},...patch});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('Portal lists only bounded public room metadata, leaving weekly admission, presence and identity with their existing owners',()=>{
  const result=portalPublicRooms([room(),room(),room('PRI123',{visibility:'private'}),room('WEEKLY',{systemKind:'weekly'}),room('../bad'),room('OTHER1',{world:{kind:'unsupported'}})]);
  assert.deepEqual(result,[{code:'ABC123',name:'Harbor crew',city:'Baltimore',kind:'earth'}]);
  assert.equal(portalPublicRooms(Array.from({length:30},(_,i)=>room('ABC'+String(i).padStart(3,'0')))).length,8);
  assert.equal(portalPublicRooms(null).length,0);
});
test('mode switching and repeated refresh share one read and never publish into a hidden or disposed Portal',async()=>{
  const scope=createLifecycleScope('portal-room-fixture'),waiting=deferred();let reads=0,changes=0;
  const view=createPortalRoomsView({scope,readRooms:()=>{reads++;return waiting.promise;},onChange:()=>changes++,now:()=>1000});
  view.setVisible(true);const first=view.refresh();assert.equal(first,view.refresh());await Promise.resolve();assert.equal(reads,1);
  view.setVisible(false);const hidden=changes;waiting.resolve([room()]);await first;assert.equal(changes,hidden);
  view.setVisible(true);assert.equal(reads,1);assert.equal(view.snapshot().rooms[0].code,'ABC123');
  scope.dispose();assert.equal(await view.refresh(),false);assert.equal(view.snapshot().status,'closed');assert.equal(reads,1);
});
test('failed and offline refresh retain the last checked public list without pretending it is current or starting background reads',async()=>{
  const scope=createLifecycleScope('portal-room-recovery');let online=true,fail=false,reads=0;
  const view=createPortalRoomsView({scope,readRooms:async()=>{reads++;if(fail)throw Error('network');return[room()];},isOnline:()=>online,now:()=>2000});
  view.setVisible(true);await view.refresh();fail=true;assert.equal(await view.refresh(),false);assert.equal(view.snapshot().status,'error');assert.equal(view.snapshot().checkedAt,2000);assert.equal(view.snapshot().rooms.length,1);
  online=false;assert.equal(await view.refresh(),false);assert.equal(view.snapshot().status,'offline');assert.equal(reads,2);
  scope.dispose();
});
test('late directory completion cannot revive a retired page',async()=>{
  const scope=createLifecycleScope('portal-room-retired'),waiting=deferred();let changes=0;
  const view=createPortalRoomsView({scope,readRooms:()=>waiting.promise,onChange:()=>changes++});view.setVisible(true);const work=view.refresh();await Promise.resolve();scope.dispose();const before=changes;waiting.resolve([room()]);assert.equal(await work,false);assert.equal(changes,before);assert.deepEqual(view.snapshot().rooms,[]);
});
test('standalone pages apply the existing saved accessibility preferences without writing another settings store',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let writes=0;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>{assert.equal(key,'worldExplorer3D.accessibility.v1');return JSON.stringify({textScale:'200',highContrast:true,reducedMotion:true});},setItem:()=>writes++}});
  try{const root={dataset:{}};applyAccessibilityPreferences(readAccessibilityPreferences(),root);assert.equal(root.dataset.we3dTextScale,'200');assert.equal(root.dataset.we3dContrast,'more');assert.equal(root.dataset.we3dMotion,'reduce');assert.equal(writes,0);}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
