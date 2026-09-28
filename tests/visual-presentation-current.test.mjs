import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyRenderQuality } from '../app/js/engine/quality.js';
import { applyTerrainReliefMaterialMix, ensureTerrainSurfaceMixAttributes, setNormalizedTerrainAttribute } from '../app/js/terrain/surface-material-blend.js';
import { registerMaterialCompatibility } from '../app/js/assets/gltf-material-compatibility.js';
import {attachShipFurnishing} from '../app/js/expedition/ship-furnishings.js';

test('wall mounts preserve source transforms, and one host releases all of its furnishings',async()=>{
  const prototype=new THREE.Group();prototype.position.set(3,2,-4);prototype.rotation.y=.3;
  prototype.add(new THREE.Mesh(new THREE.BoxGeometry(2,3,1),new THREE.MeshStandardMaterial()));
  class Loader{register(){return this;}load(url,done){queueMicrotask(()=>done({scene:prototype}));}}
  const host=new THREE.Group(),api={...THREE,GLTFLoader:Loader};
  await Promise.all(['solis-bridge-chair','solis-wardroom-chair'].map(asset=>attachShipFurnishing(api,host,asset,{replace:false,mount:'wall',fit:{x:2,y:3,z:1},sourceYaw:.5})));
  assert.equal(await host.userData.furnishingReady,true);
  assert.equal(host.children.length,2);
  for(const visual of host.children){
    const bounds=new THREE.Box3().setFromObject(visual);
    assert.ok(Math.abs(bounds.min.y)<1e-6);
    assert.ok(Math.abs(bounds.min.z)<1e-6,'back must touch mounting plane');
    assert.deepEqual(visual.children[0].children[0].position.toArray(),[3,2,-4]);
  }
  host.userData.disposeShipFurnishing();
  assert.equal(host.children.length,0);
  assert.equal(host.userData.shipFurnishingOwnership.instances.size,0);
  host.userData.disposeShipFurnishing();
});

test('furnishings resolving after disposal cannot reattach to the closed room',async()=>{
  let finish;
  class Loader{register(){return this;}load(url,done){finish=done;}}
  const host=new THREE.Group();
  const pending=attachShipFurnishing({...THREE,GLTFLoader:Loader},host,'solis-crew-lamp');
  host.userData.disposeShipFurnishing();
  finish({scene:new THREE.Group()});
  assert.equal(await pending,false);assert.equal(host.children.length,0);
});

test('quality changes preserve active-world exposure, reflections and authored paint', () => {
  for (const mode of ['earth', 'ship', 'planet']) {
    const indoor = { name: mode }, earth = { name: 'earth-environment' };
    const paint = new THREE.MeshPhysicalMaterial({ roughness: .33, metalness: .12, clearcoat: .4, envMapIntensity: .8 });
    const before = [paint.roughness, paint.metalness, paint.clearcoat, paint.envMapIntensity];
    const ctx = { state: { carPaintMaterial: paint, fallbackEnvMap: earth, ssaoEnabled: true },
      appCtx: { renderer: { toneMappingExposure: 1.17 }, scene: { environment: indoor },
        activeShipInterior: mode === 'ship', activePlanetaryBodyId: mode === 'planet' ? 'mars' : null,
        ssaoPass: {}, bloomPass: {}, smaaPass: {} },
      normalizeRenderQualityLevel: x => x, RENDER_QUALITY_LOW: 'low', RENDER_QUALITY_MED: 'medium', RENDER_QUALITY_HIGH: 'high' };
    for (const level of ['low', 'high', 'medium', 'low']) {
      applyRenderQuality(ctx, level, { persist: false });
      assert.equal(ctx.appCtx.renderer.toneMappingExposure, 1.17);
      assert.equal(ctx.appCtx.scene.environment, mode === 'earth' ? earth : indoor);
      assert.deepEqual([paint.roughness, paint.metalness, paint.clearcoat, paint.envMapIntensity], before);
      assert.equal(ctx.appCtx.ssaoPass.enabled, level === 'high');
    }
  }
});

test('slope redistribution conserves cover and is stable across tile refreshes', () => {
  globalThis.THREE = THREE;
  try {
    for (const up of [.92, .85, .72, .3]) for (const weights of [[.5,0,.5,0,0,0], [0,0,.6,.2,.2,0], [0,.3,.3,0,.1,.3], [0,0,0,0,0,1]]) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0],3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute([Math.sqrt(1-up*up),up,0],3));
      const attributes = ensureTerrainSurfaceMixAttributes(geometry);
      setNormalizedTerrainAttribute(attributes.mixA,0,weights.slice(0,4));
      setNormalizedTerrainAttribute(attributes.mixB,0,weights.slice(4));
      const mesh = { geometry, userData: {} };
      applyTerrainReliefMaterialMix(mesh);
      const first = [...attributes.mixA.array,...attributes.mixB.array];
      assert.ok(first.reduce((a,b)=>a+b,0) <= 258, `non-normalized cover ${first}`);
      assert.equal(first[0],Math.round(weights[0]*255));
      assert.equal(first[1],Math.round(weights[1]*255));
      assert.equal(first[5],Math.round(weights[5]*255));
      for(let i=0;i<10;i++)applyTerrainReliefMaterialMix(mesh);
      assert.deepEqual([...attributes.mixA.array,...attributes.mixB.array],first,'refresh changes appearance');
    }
  } finally { delete globalThis.THREE; }
});

test('r128 adapter preserves authored luminous power, including zero and values above one', async () => {
  for(const value of [0,1,3.0441400304414,10]) {
    let plugin;
    registerMaterialCompatibility({ register(factory) { plugin=factory({json:{materials:[{extensions:{KHR_materials_emissive_strength:{emissiveStrength:value}}}]}}); } });
    const params={};await plugin.extendMaterialParams(0,params);
    assert.equal(params.emissiveIntensity,value);
  }
});
