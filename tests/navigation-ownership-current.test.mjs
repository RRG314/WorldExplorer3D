import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ctx} from '../app/js/shared-context.js?v=55';
import {createNavigationState} from '../app/js/game/navigation-state.js';
import {navigateToPOI,createNavigationRoute,clearNavigation,updateNavigationRoute,navigationDestinationSnapshot} from '../app/js/game/navigation-ui.js?v=2';
import {startActivity,stopActivity,updateActivityRuntime} from '../app/js/activity-discovery/runtime.js?v=9';

test('navigation retains immutable destination facts and rejects invalid replacements',()=>{
  const state=createNavigationState(),building={x:90,z:80,label:'Museum',mesh:{}};
  state.select(building,{owner:'poi',world:3});building.x=100;
  assert.equal(state.current().x,90);assert.equal('mesh' in state.current(),false);assert.ok(Object.isFrozen(state.current()));
  assert.equal(state.select({x:NaN,z:1}),false);assert.equal(state.current().label,'Museum');
  assert.equal(state.clear('activity'),false);assert.equal(state.current().owner,'poi');
  assert.equal(state.clear(),true);assert.equal(state.current(),null);
});

test('activity, map inspection and walking POI routes have independent intent and scoped cleanup',()=>{
  const previous={THREE:globalThis.THREE,document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const sandbox=vm.createContext({console});vm.runInContext(readFileSync('app/vendor/three/build/three.min.js','utf8'),sandbox);
  const elements=new Map(),frames=new Map();let frameId=0;
  Object.assign(globalThis,{THREE:sandbox.THREE,document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:''});return elements.get(id);}},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id)});
  Object.assign(ctx,{scene:new THREE.Scene(),car:{x:0,z:0},Walk:{state:{mode:'walk',walker:{x:30,y:1.7,z:10,yaw:0}}},_worldLoadSequence:1,getEnv:()=> 'EARTH',getCurrentTravelMode:()=> 'walk',createNavigationRoute,clearNavigation});
  ctx.activateSurfaceActivity=(_mode,start)=>{Object.assign(ctx.Walk.state.walker,{x:start.x,y:start.y+1.7,z:start.z});return true;};
  try {
    createNavigationRoute(30,10,100,100,true,{label:'Home',owner:'property'});
    ctx.selectedProperty={x:100,z:100,label:'Home'};
    assert.equal(startActivity({id:'ownership-route',title:'Harbor walk',traversalMode:'walk',requiresNearbyStart:false,anchors:[{id:'start',typeId:'start',x:30,y:0,z:10},{id:'view',typeId:'checkpoint',label:'Waterfront view',x:-80,y:0,z:60},{id:'finish',typeId:'finish',label:'Finish',x:-160,y:0,z:60}]}),true);
    ctx.selectedProperty={x:120,z:130,label:'Another home'};
    updateNavigationRoute();
    assert.deepEqual({...ctx.navigationRoutePoints.at(-1)},{x:-80,z:60});
    assert.equal(elements.get('navDestination').textContent,'Waterfront view');
    ctx.Walk.state.walker.x=-80;ctx.Walk.state.walker.z=60;
    updateActivityRuntime(.05);updateNavigationRoute();
    assert.equal(navigationDestinationSnapshot().label,'Finish');
    assert.equal(navigationDestinationSnapshot().owner,'activity');
    assert.equal(navigateToPOI(80,60,'Aquarium'),true);updateNavigationRoute();
    assert.deepEqual({...ctx.navigationRoutePoints[0]},{x:-80,z:60});
    assert.equal(elements.get('navigationHud').style.display,'block');
    assert.equal(elements.get('navDestination').textContent,'Aquarium');
    stopActivity();updateNavigationRoute();
    assert.equal(navigationDestinationSnapshot().owner,'poi','stopping the activity cannot cancel a newer player route');
    ctx.Walk.state.walker.x=78;updateNavigationRoute();
    assert.equal(elements.get('navDistance').textContent,'✓ Arrived!');
    assert.equal(ctx.scene.children.length,2);assert.equal(frames.size,1);
    ctx._worldLoadSequence++;updateNavigationRoute();
    assert.equal(navigationDestinationSnapshot(),null);assert.equal(ctx.scene.children.length,0);assert.equal(frames.size,0);
    assert.equal(elements.get('navigationHud').style.display,'none');
  } finally {
    stopActivity();clearNavigation();Object.assign(globalThis,previous);
    for(const key of Object.keys(ctx))delete ctx[key];
  }
});
