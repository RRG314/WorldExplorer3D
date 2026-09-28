import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.THREE = THREE;
globalThis.window = {innerWidth:800,innerHeight:600};
const {ctx} = await import('../app/js/shared-context.js?v=55');
const {checkStarClick} = await import('../app/js/sky/starfield-ui.js');

test('planetary ground clicks cannot select catalog hitboxes behind the horizon',()=>{
 ctx.starField=new THREE.Group();ctx.starField.userData.planetarySurfaceOcclusion=true;
 ctx.camera=new THREE.PerspectiveCamera(60,4/3,.1,10000);ctx.camera.position.set(0,2,0);ctx.camera.lookAt(0,0,-5);ctx.camera.updateMatrixWorld();
 ctx.skyRaycaster=new THREE.Raycaster();let queries=0;
 ctx.skyRaycaster.intersectObjects=()=>{queries++;return [];};ctx.selectedStar=null;
 assert.equal(checkStarClick(400,300),false);assert.equal(queries,0);
 ctx.camera.lookAt(0,4,-5);ctx.camera.updateMatrixWorld();
 assert.equal(checkStarClick(400,300),false);assert.equal(queries,1,'Visible upper sky must remain selectable');
 ctx.starField.userData.planetarySurfaceOcclusion=false;
 ctx.camera.lookAt(0,0,-5);ctx.camera.updateMatrixWorld();
 checkStarClick(400,300);assert.equal(queries,2,'Free space has no surface horizon');
});
