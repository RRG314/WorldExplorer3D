import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {applyDisplayColorPolicy} from '../app/js/engine/display-color-policy.js';

test('bundled legacy display policy preserves scene exposure, tone mapping and lights',()=>{
  const renderer={outputEncoding:THREE.LinearEncoding,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:.92,physicallyCorrectLights:false};
  assert.equal(applyDisplayColorPolicy(renderer,THREE),true);
  assert.equal(renderer.outputEncoding,THREE.sRGBEncoding);
  assert.equal(renderer.toneMapping,THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure,.92);
  assert.equal(renderer.physicallyCorrectLights,false);
  const snapshot={...renderer};applyDisplayColorPolicy(renderer,THREE);assert.deepEqual(renderer,snapshot);
  assert.equal('outputColorSpace' in renderer,false,'Do not add an ineffective modern property to r128');
});
test('modern output uses the supported property without reading deprecated legacy getters',()=>{
  const renderer={outputColorSpace:'linear',get outputEncoding(){throw Error('deprecated getter');},set outputEncoding(_){throw Error('deprecated setter');}};
  assert.equal(applyDisplayColorPolicy(renderer,{SRGBColorSpace:'srgb',sRGBEncoding:3001}),true);
  assert.equal(renderer.outputColorSpace,'srgb');
});
test('missing renderer and unsupported runtime are explicit no-ops',()=>{
  assert.equal(applyDisplayColorPolicy(null,THREE),false);
  const renderer={toneMappingExposure:1};assert.equal(applyDisplayColorPolicy(renderer,{}),false);
  assert.deepEqual(renderer,{toneMappingExposure:1});
});
test('every renderer constructor reaches the display policy directly or through the auxiliary factory',()=>{
  for(const file of ['engine/scene-bootstrap.js','engine/webgl-lifecycle.js','ar/presentation.js','reality-capture/result-viewer.js']){
    const source=readFileSync(new URL(`../app/js/${file}`,import.meta.url),'utf8');
    assert.match(source,/import \{ applyDisplayColorPolicy \}/,file);
    assert.match(source,/applyDisplayColorPolicy\((?:appCtx\.)?renderer, (THREE|T)\)/,file);
  }
  for(const file of ['space/scene.js','ocean.js','ui/globe-selector/scene.js']){
    const source=readFileSync(new URL(`../app/js/${file}`,import.meta.url),'utf8');
    assert.match(source,/createAuxiliaryRenderer\(\{/,file);
    assert.doesNotMatch(source,/renderer\.output(?:Encoding|ColorSpace)\s*=/,file);
  }
});
