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

test('manual time presets publish the visual profile consumed by weather',async()=>{
 const previousThree=globalThis.THREE,previousDocument=globalThis.document;globalThis.THREE=THREE;globalThis.document={getElementById:()=>null};
 const {ctx}=await import('../app/js/shared-context.js?v=55');const old={...ctx};
 try {
  Object.assign(ctx,{scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),hemiLight:new THREE.HemisphereLight(),fillLight:new THREE.DirectionalLight(),ambientLight:new THREE.AmbientLight(),renderer:{toneMappingExposure:1}});
  const {setTimeOfDay}=await import('../app/js/sky/astronomical-state.js');
  let calls=0;ctx.applyWeatherPresentation=()=>{calls++;assert.equal(ctx.skyState.visual.phase,ctx.skyState.phase);assert.ok(Number.isFinite(ctx.skyState.visual.exposure));};
  for(const mode of ['night','day','sunset','sunrise','day']){setTimeOfDay(mode);assert.equal(ctx.skyMode,mode);assert.equal(ctx.skyState.source,'manual');}
  assert.equal(calls,5);
 }finally{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,old);globalThis.THREE=previousThree;globalThis.document=previousDocument;}
});


test('night illumination remains independent of the sky through weather and dawn; manual ocean state agrees', async()=>{
 const previousThree=globalThis.THREE,previousDocument=globalThis.document;
 globalThis.THREE=THREE;globalThis.document={getElementById:()=>null};
 const {ctx}=await import('../app/js/shared-context.js?v=55');const old={...ctx};
 try {
  const {setTimeOfDay,buildVisualPresetForState}=await import('../app/js/sky/astronomical-state.js');
  const {applyWeatherPresentation}=await import('../app/js/weather.js');
  const oceanStates=[];
  Object.assign(ctx,{scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),hemiLight:new THREE.HemisphereLight(),fillLight:new THREE.DirectionalLight(),ambientLight:new THREE.AmbientLight(),renderer:{toneMappingExposure:1},oceanMode:{active:true},applyOceanSkyState:s=>oceanStates.push(s),applyWeatherPresentation});
  setTimeOfDay('night');
  assert.equal(oceanStates.at(-1).sun.daylightFactor,0,'manual night must not advertise daylight');
  assert.notEqual(ctx.hemiLight.color.getHex(),ctx.skyState.visual.skyColor);
  for(const [mode,cloudCover] of [['clear',8],['overcast',92],['storm',100]]){
   ctx.weatherMode=mode;ctx.weatherState={category:mode,cloudCover,source:'controlled-visual-check'};applyWeatherPresentation();
   const color=ctx.hemiLight.color;
   assert.ok((color.r+color.g+color.b)*ctx.hemiLight.intensity>.85,`${mode} restored an almost black hemisphere`);
   assert.ok(ctx.renderer.toneMappingExposure>=1.02);
  }
  // Automatic dawn blends the incident light smoothly instead of using the
  // dark sky until the phase label abruptly changes.
  const before=buildVisualPresetForState(-8,true);
  const after=buildVisualPresetForState(-7.9,true);
  const a=new THREE.Color(before.hemisphereColor),b=new THREE.Color(after.hemisphereColor);
  assert.ok(Math.abs(a.r-b.r)+Math.abs(a.g-b.g)+Math.abs(a.b-b.b)<.03);
  ctx.weatherMode='clear';ctx.weatherState=null;
  setTimeOfDay('day');assert.equal(oceanStates.at(-1).sun.daylightFactor,1);
  assert.equal(ctx.skyState.visual.sunIntensity,1.3,'daylight brightness is unchanged');
  assert.equal(ctx.skyState.visual.exposure,1.08);
  const prior=ctx.hemiLight.color.clone();ctx.activeShipInterior={};ctx.weatherMode='storm';applyWeatherPresentation();
  assert.equal(ctx.hemiLight.color.getHex(),prior.getHex(),'weather must not relight the ship interior');
 } finally {for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,old);globalThis.THREE=previousThree;globalThis.document=previousDocument;}
});
