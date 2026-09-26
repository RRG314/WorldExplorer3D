import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildEarthAtmosphereProfile,createAtmosphereMaterial,applyEarthAtmosphereProfile} from '../app/js/sky/earth-atmosphere.js';
test('custom atmosphere uniforms are linear on creation and weather updates',()=>{
 const previous=globalThis.THREE;globalThis.THREE=THREE;
 try {
  const profile=buildEarthAtmosphereProfile({phase:'day',visual:{skyColor:0x87ceeb,fogColor:0xb8d4e8}});
  const material=createAtmosphereMaterial(profile);
  const expected=new THREE.Color(profile.horizonColor).convertSRGBToLinear();
  assert.ok(Math.abs(material.uniforms.weSkyHorizon.value.r-expected.r)<1e-7);
  applyEarthAtmosphereProfile(material,profile);assert.ok(Math.abs(material.uniforms.weSkyHorizon.value.r-expected.r)<1e-7,'no accumulated double conversion');
  assert.ok(((profile.horizonColor>>16)&255)<200,'clear sky must retain blue instead of baking in whiteout');
  const fog=buildEarthAtmosphereProfile({phase:'day',visual:{skyColor:0x87ceeb,fogColor:0xb8d4e8}},{category:'fog',cloudCover:90});
  assert.ok(fog.haze>profile.haze);assert.notEqual(fog.horizonColor,profile.horizonColor);
  material.dispose();
 } finally {if(previous===undefined)delete globalThis.THREE;else globalThis.THREE=previous;}
});
