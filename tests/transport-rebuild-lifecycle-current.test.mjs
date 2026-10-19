import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import {publishCompiledTransportMeshes} from '../app/js/terrain/rebuild.js';
import {createTransportDetailCompiler,prepareTransportDetailPlan} from '../app/js/terrain/transport-detail-compiler.js';
import {refreshTransportStructureAssembliesForPublishedTerrain} from '../app/js/world/structure-aware.js';
import {compileTunnelSolidBoundaries} from '../app/js/world/compiler/tunnel-solid-publication.js';
import {compileTransportSurfaceModel} from '../app/js/world/compiler/transport-surface-model.js';
import {compileTunnelSystemModels} from '../app/js/world/compiler/tunnel-system-model.js';

function harness(t) {
  const saved={...ctx},previous={THREE:globalThis.THREE,Worker:globalThis.Worker,scheduler:globalThis.scheduler};
  const workers=[],geometries=new Set();let onYield=()=>{};
  globalThis.THREE={...THREE,BufferGeometry:class extends THREE.BufferGeometry {
    constructor(){super();geometries.add(this);this.addEventListener('dispose',()=>geometries.delete(this));}
  }};
  // Real compiler/geometry/contact, controlled message delivery and failure
  // boundaries. The browser check exercises the actual worker separately.
  globalThis.Worker=class {
    constructor(){workers.push(this);this.terminated=false;}
    postMessage(data){queueMicrotask(()=>{
      if(this.terminated)return;
      if(data.type==='plan'){
        this.plan=prepareTransportDetailPlan(data.input);this.onmessage({data:{type:'planned'}});
      }else if(data.type==='prepare'){
        this.compiler=createTransportDetailCompiler({...data.input,preparedPlan:this.plan});this.plan=null;
        this.onmessage({data:{type:'prepared',...this.compiler.initial}});
      }else this.onmessage({data:{type:'region',...this.compiler.compile(data.key)}});
    });}
    terminate(){this.terminated=true;this.compiler?.dispose();this.compiler=null;this.plan=null;}
  };
  globalThis.scheduler={yield:async()=>onYield()};
  for(const key of Object.keys(ctx))delete ctx[key];
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial(),terrainGroup=new THREE.Group();
  const geometry=new THREE.PlaneGeometry(8192,8192);geometry.rotateX(-Math.PI/2);
  const ground=new THREE.Mesh(geometry,material);ground.userData={isFarTerrainClipmap:true,isFixedLocationTerrainLod:true};terrainGroup.add(ground);
  Object.assign(ctx,{terrainEnabled:true,onMoon:false,_worldLoadSequence:1,_roadMeshGeneration:0,
    roads:[{type:'residential',pts:[{x:0,z:32},{x:3500,z:32}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'}}],
    roadMeshes:[],terrainGroup,renderer:{capabilities:{maxTextureSize:4096}},terrainMeshHeightAt:()=>0,
    getFarTerrainSurfaceSnapshot:()=>({grid:{xValues:[-4096,4096],zValues:[-4096,4096],worldYs:[0,0,0,0]},portals:[]}),
    addEarthWorldObject:mesh=>scene.add(mesh),replaceWorldCollection:(key,values)=>{ctx[key]=values;}});
  const deps={getSharedRoadMaterials:()=>({roadMat:material,skirtMat:material,markMat:material}),cachedTerrainHeight:()=>0,
    cachedBaseTerrainHeight:()=>0,subdivideRoadPoints:points=>points,rebuildStructureVisualMeshes:()=>{}};
  t.after(()=>{
    ctx._cancelTransportPreparation?.();ctx.transportDetail?.dispose();ctx.roadContactIndex?.dispose();
    for(const worker of workers)worker.terminate();
    for(const mesh of scene.children.slice()){scene.remove(mesh);mesh.geometry.dispose();}
    for(const item of geometries)item.dispose();geometry.dispose();material.dispose();
    for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);Object.assign(globalThis,previous);
  });
  return {deps,workers,geometries,scene,onYield:callback=>{onYield=callback;}};
}

test('a superseded profile refresh cannot start a worker or cancel the replacement preparation',async t=>{
  const h=harness(t);let replacementCancelled=0;
  ctx.refreshStructureAwareFeatureProfilesCooperatively=async()=>{
    ctx._worldLoadSequence=2;ctx._cancelTransportPreparation=()=>replacementCancelled++;
  };
  await assert.rejects(publishCompiledTransportMeshes(h.deps),{name:'AbortError'});
  assert.equal(h.workers.length,0,'obsolete rebuild must stop before starting any compiler');
  assert.equal(replacementCancelled,0,'obsolete preparation must not cancel the new world');
});

test('a failure after worker preparation releases the compiler and uncommitted road geometry',async t=>{
  const h=harness(t);let failed=false;
  h.onYield(()=>{if(!failed&&h.geometries.size){failed=true;throw Error('controlled contact staging failure');}});
  // Force a cooperative contact slice without changing geometry or the compiler.
  let now=0;t.mock.method(performance,'now',()=>now+=30);
  await assert.rejects(publishCompiledTransportMeshes(h.deps),/controlled contact staging failure/);
  assert.equal(failed,true);assert.equal(h.workers.length,1);
  assert.equal(h.workers[0].terminated,true,'prepared compiler is still locally owned until commit');
  assert.equal(ctx.transportDetail??null,null);assert.equal(ctx.roadContactIndex??null,null);
  assert.equal(h.geometries.size,0);assert.equal(h.scene.children.length,0);
});

test('world replacement during contact staging cannot adopt or retain the cancelled worker',async t=>{
  const h=harness(t),replacement=Object.freeze({worldLoadSequence:2,identity:'replacement'});let replaced=false;
  h.onYield(()=>{if(!replaced&&h.geometries.size){replaced=true;ctx._worldLoadSequence=2;ctx.transportSurfacePublication=replacement;}});
  let now=0;t.mock.method(performance,'now',()=>now+=30);
  await assert.rejects(publishCompiledTransportMeshes(h.deps),/superseded/);
  assert.equal(replaced,true);assert.equal(h.workers[0].terminated,true);
  assert.equal(ctx.transportDetail??null,null);assert.equal(ctx.transportSurfacePublication,replacement);
  assert.equal(h.geometries.size,0);assert.equal(h.scene.children.length,0);
});

test('roads, contacts, summary and the detail controller become observable in one handoff',async t=>{
  const h=harness(t);let checkedDuringYield=false;
  h.onYield(()=>{
    if(ctx.transportDetail||ctx.roadMeshes.length){
      checkedDuringYield=true;
      assert.equal(ctx.transportSurfacePublication?.worldLoadSequence,1,'no partially published road owner between turns');
      assert.ok(ctx.roadContactIndex);assert.ok(ctx.transportDetail);
    }
  });
  const publication=await publishCompiledTransportMeshes(h.deps);
  assert.equal(publication,ctx.transportSurfacePublication);assert.equal(publication.worldLoadSequence,1);
  assert.ok(ctx.roadMeshes.length>0);assert.ok(ctx.transportDetail);assert.equal(h.workers[0].terminated,false);
  assert.ok(Math.abs(ctx.roadContactIndex.sampleAt(10,32)-.18)<1e-5);
  assert.equal(publication.meshCount,ctx.roadMeshes.length);
  assert.equal(checkedDuringYield,false,'the commit has no asynchronous boundary');
});

test('a late structure refresh cannot overwrite the replacement world tunnel and support facts',async t=>{
  harness(t);ctx.roads=[];
  const pending=refreshTransportStructureAssembliesForPublishedTerrain();
  ctx._worldLoadSequence=2;
  const replacement={tunnelSolidCompilation:{identity:'new-tunnels'},transportStructureAssembly:{identity:'new-supports'},colliders:[]};
  Object.assign(ctx,replacement);
  await assert.rejects(pending,{name:'AbortError'});
  for(const [key,value]of Object.entries(replacement))assert.equal(ctx[key],value);
});

test('a late tunnel worker result is rejected before binding it to abandoned features',async t=>{
  harness(t);let worker;
  globalThis.Worker=class {
    constructor(){worker=this;}
    postMessage({id}){ctx._worldLoadSequence=2;queueMicrotask(()=>this.onmessage({data:{id,result:{}}}));}
    terminate(){this.terminated=true;}
  };
  const roads=[[-40,0],[0,40]].map(([start,end],index)=>{
    const road={sourceFeatureId:String(index),pts:[{x:0,z:start},{x:0,z:end}],width:8,
      structureSemantics:{terrainMode:'subgrade',structureKind:'tunnel',isTunnel:true,layer:-1,cutDepth:6},
      transportRecord:{completeness:'lossless',routeState:'complete',safeForDriving:true,rawTags:{layer:'-1'}},
      connectedFeatures:{start:[],end:[]}};
    road.transportSurfaceModel=compileTransportSurfaceModel(road,()=>20);return road;
  });
  roads[0].connectedFeatures.end=[{feature:roads[1]}];roads[1].connectedFeatures.start=[{feature:roads[0]}];
  compileTunnelSystemModels(roads,()=>20);
  await assert.rejects(compileTunnelSolidBoundaries(roads,{current:()=>ctx._worldLoadSequence===1}),{name:'AbortError'});
  assert.equal(worker.terminated,true);assert.ok(roads.every(road=>road.tunnelSolidBoundary===null));
});
