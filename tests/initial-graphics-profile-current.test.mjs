import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyGraphicsTier,initialRenderQuality} from '../app/js/engine/initial-graphics-profile.js';

test('the observed base M1 renderer uses an integrated tier without including different Apple models',()=>{
  assert.equal(classifyGraphicsTier('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',1280*900),'mid');
  for(const model of ['M1 Pro','M1 Max','M1 Ultra','M2','M4'])assert.equal(classifyGraphicsTier(`ANGLE (Apple, ANGLE Metal Renderer: Apple ${model}, Unspecified Version)`),'high');
});
test('known mobile, software and integrated renderer profiles retain distinct hardware tiers',()=>{
  for(const name of ['Adreno 740','Mali-G78','Apple GPU','ANGLE SwiftShader','llvmpipe'])assert.equal(classifyGraphicsTier(name),'low');
  for(const name of ['Intel UHD Graphics 630','Intel Iris Xe','Mesa Intel'])assert.equal(classifyGraphicsTier(name),'mid');
  assert.equal(classifyGraphicsTier('NVIDIA GeForce RTX 4070'),'high');
  assert.equal(classifyGraphicsTier('NVIDIA GeForce RTX 4070',390*844),'low');
});
test('first-run defaults choose the existing performance setting on constrained graphics',()=>{
  for(const gpuTier of ['low','mid'])assert.equal(initialRenderQuality({gpuTier}),'low');
  assert.equal(initialRenderQuality({gpuTier:'high',mobile:true}),'low');
  assert.equal(initialRenderQuality({gpuTier:'high'}),'med');
});
test('a player saved graphics choice takes precedence over every first-run recommendation',()=>{
  for(const savedQuality of ['low','med','high'])for(const gpuTier of ['low','mid','high'])for(const mobile of [true,false])
    assert.equal(initialRenderQuality({savedQuality,gpuTier,mobile}),savedQuality);
});
