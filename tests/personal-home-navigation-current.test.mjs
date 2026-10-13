import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ctx} from '../app/js/shared-context.js?v=55';
import {getNavigationTargetForDestination,navigationDestinationLabel,updateNavigationRoute} from '../app/js/game/navigation-ui.js';
const sceneContext=vm.createContext({console});vm.runInContext(readFileSync('app/vendor/three/build/three.min.js','utf8'),sceneContext);

test('home guidance keeps the exterior entrance through route refreshes and accepts structured or absent addresses',()=>{
  const old={THREE:globalThis.THREE,document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const elements=new Map();globalThis.THREE=sceneContext.THREE;globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:''});return elements.get(id);}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  const home={id:'home:42',x:100,z:100,label:'Research workspace',address:{formatted:'42 Field Lane'}},copy=structuredClone(home);
  const exterior={x:90,z:95};Object.assign(ctx,{selectedProperty:home,selectedHistoric:null,showNavigation:true,scene:new THREE.Scene(),Walk:{state:{mode:'walk',walker:{x:0,z:0,y:1.7,yaw:0}}},resolveBuildingEntrySupport:()=>({enterable:true,entryAnchor:{x:96,z:98},exteriorEntrance:exterior}),findTraversalRoute:(x,z,tx,tz)=>({points:[{x,z},{x:tx,z:tz}],distance:Math.hypot(tx-x,tz-z)})});
  try{
    assert.deepEqual(getNavigationTargetForDestination(home).x,90);
    updateNavigationRoute();assert.equal(elements.get('navDestination').textContent,'Research workspace');
    assert.deepEqual({...ctx.navigationRoutePoints.at(-1)},exterior);
    ctx.Walk.state.walker.x=4;updateNavigationRoute();assert.equal(ctx._navigationRouteState.toX,90);assert.equal(ctx._navigationRouteState.toZ,95);
    assert.deepEqual(home,copy);assert.equal(ctx.scene.children.length,2,'Refreshing guidance releases the prior route and marker');
    assert.equal(navigationDestinationLabel({address:{formatted:'42 Field Lane'}}),'42 Field Lane');
    assert.equal(navigationDestinationLabel({address:'A plain address'}),'A plain address');
    assert.equal(navigationDestinationLabel({}),'Destination');
  }finally{Object.assign(globalThis,old);for(const key of Object.keys(ctx))delete ctx[key];}
});
