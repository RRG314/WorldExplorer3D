import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
// Use the current sky setup path, then check camera updates reuse its cached
// atmosphere. Numerical astronomical alignment is covered separately.
const previousThree=globalThis.THREE;
globalThis.THREE=THREE;
const {updatePlanetarySky,setPlanetarySky,clearPlanetarySky}=await import('../app/js/planetary/sky-orientation.js');
globalThis.THREE=previousThree;

function fixture(run) {
  const keys=['ENV','getEnv','starField','camera','scene','sun','planetarySkyOrientation'];
  const previous=new Map(keys.map(key=>[key,ctx[key]]));
  globalThis.THREE=THREE;
  let env='earth',lookups=0,starMoves=0,domeMoves=0;
  const dome={visible:true,position:{copy:()=>domeMoves++}};
  const stars=new THREE.Group();stars.position.copy=()=>{starMoves++;return stars.position;};
  Object.assign(ctx,{ENV:{EARTH:'earth',MOON:'moon',MARS:'mars',PLANETARY:'planetary',SPACE:'space'},getEnv:()=>env,
    starField:stars,camera:{position:{x:1,y:2,z:3}},sun:null,
    scene:{getObjectByName:name=>{assert.equal(name,'Planetary atmosphere: mars');lookups++;return dome;}}});
  try {run({setEnv:value=>env=value,prepareMars:()=>{setPlanetarySky('mars');starMoves=0;domeMoves=0;},counts:()=>({lookups,starMoves,domeMoves})});}
  finally{clearPlanetarySky();for(const [key,value]of previous)ctx[key]=value;globalThis.THREE=previousThree;}
}

test('Earth and space frames do not traverse the scene for an inactive planetary atmosphere',()=>fixture(({setEnv,counts})=>{
  for(const env of ['earth','space',undefined]){setEnv(env);updatePlanetarySky();}
  assert.deepEqual(counts(),{lookups:0,starMoves:0,domeMoves:0});
}));
test('planetary frames update shared stars and the cached atmosphere without scene searches',()=>fixture(({setEnv,prepareMars,counts})=>{
  prepareMars();
  for(const env of ['moon','mars','planetary']){setEnv(env);updatePlanetarySky();}
  assert.deepEqual(counts(),{lookups:1,starMoves:3,domeMoves:3});
}));


test('explicit daylight exposure hides stars on known bodies and later night entry restores them',()=>fixture(()=>{
 setPlanetarySky('moon',new Date(),{starOpacity:.02});assert.equal(ctx.starField.visible,false);
 setPlanetarySky('moon',new Date(),{starOpacity:.9});assert.equal(ctx.starField.visible,true);
}));
