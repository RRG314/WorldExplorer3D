import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {linearRibbonStations} from '../app/js/world/linear-ribbon-stations.js';
import {buildFeatureRibbonEdges} from '../app/js/structure-semantics.js?v=63';
import {publishLinearFeaturePresentation} from '../app/js/world/linear-feature-presentation.js';

test('long hillside paths sample the intervening valley instead of spanning a chord', () => {
  const points = [{x:0,z:0},{x:90,z:0}];
  const feature = {kind:'footway',pts:points,width:2,surfaceBias:.08,structureSemantics:{terrainMode:'at_grade'}};
  const ground = x => 20 + Math.abs(x-45)*.2;
  globalThis.THREE = THREE;
  const ctx = {scene:new THREE.Scene(),linearFeatureMeshes:[],addEarthWorldObject(mesh){this.scene.add(mesh);}};
  publishLinearFeaturePresentation({appCtx:ctx,features:[feature],buildFeatureRibbonEdges,worldBaseTerrainY:ground});
  const mesh=ctx.linearFeatureMeshes[0],p=mesh.geometry.attributes.position;
  assert.ok(p.count>=92);
  for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-ground(p.getX(i))-.08)<1e-5);
  for(let i=2;i<p.count;i+=2)assert.ok(p.getX(i)-p.getX(i-2)<=2.00001);
  assert.equal(p.getX(0),0);assert.equal(p.getX(p.count-1),90);
  mesh.geometry.dispose();mesh.material.dispose();delete globalThis.THREE;
});

test('resampling preserves bends, source identity and exact vertical-profile stations', () => {
  const points=[{x:0,z:0},{x:8,z:0},{x:8,z:5}];
  const feature={pts:points,transportSurfaceModel:{distances:new Float64Array([0,1.3,7.7,8,10.2,13])}};
  const original=JSON.stringify(feature);
  const result=linearRibbonStations(feature,points);
  assert.equal(result[0],points[0]);assert.equal(result.at(-1),points.at(-1));
  assert.ok(result.includes(points[1]));
  for(const x of [1.3,7.7])assert.ok(result.some(p=>p.x===x&&p.z===0));
  assert.ok(result.some(p=>Math.abs(p.z-2.2)<1e-8&&p.x===8));
  for(let i=1;i<result.length;i++)assert.ok(Math.hypot(result[i].x-result[i-1].x,result[i].z-result[i-1].z)<=2.000001);
  assert.equal(JSON.stringify(feature),original);
});

test('clipped ordinary path segments retain their own endpoints without replaying full-route stations', () => {
  const feature={pts:[{x:0,z:0},{x:100,z:0}],transportSurfaceModel:{distances:new Float64Array([0,1,3,100])}};
  const clipped=[{x:80,z:0},{x:100,z:0}];
  const points=linearRibbonStations(feature,clipped);
  assert.equal(points.length,11);assert.equal(points[0],clipped[0]);assert.equal(points.at(-1),clipped[1]);
});
