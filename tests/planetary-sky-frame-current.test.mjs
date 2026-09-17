import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
// Star alignment allocates scratch vectors at import. This frame-dispatch
// fixture does not invoke alignment or claim to verify its Three.js math.
const previousThree=globalThis.THREE;
globalThis.THREE={Matrix4:class{},Vector3:class{}};
const {updatePlanetarySky}=await import('../app/js/planetary/sky-orientation.js');
globalThis.THREE=previousThree;

function fixture(run) {
  const keys=['ENV','getEnv','starField','camera','scene','sun'];
  const previous=new Map(keys.map(key=>[key,ctx[key]]));
  let env='earth',lookups=0,starMoves=0,domeMoves=0;
  const dome={visible:true,position:{copy:()=>domeMoves++}};
  Object.assign(ctx,{ENV:{EARTH:'earth',MOON:'moon',MARS:'mars',PLANETARY:'planetary',SPACE:'space'},getEnv:()=>env,
    starField:{userData:{},position:{copy:()=>starMoves++}},camera:{position:{x:1,y:2,z:3}},sun:null,
    scene:{getObjectByName:name=>{assert.equal(name,'Planetary atmosphere: mars');lookups++;return dome;}}});
  try {run({setEnv:value=>env=value,counts:()=>({lookups,starMoves,domeMoves})});}
  finally{for(const [key,value]of previous)ctx[key]=value;}
}

test('Earth and space frames do not traverse the scene for an inactive planetary atmosphere',()=>fixture(({setEnv,counts})=>{
  for(const env of ['earth','space',undefined]){setEnv(env);updatePlanetarySky();}
  assert.deepEqual(counts(),{lookups:0,starMoves:0,domeMoves:0});
}));
test('planetary frames still update the shared stars and visible atmosphere',()=>fixture(({setEnv,counts})=>{
  for(const env of ['moon','mars','planetary']){setEnv(env);updatePlanetarySky();}
  assert.deepEqual(counts(),{lookups:3,starMoves:3,domeMoves:3});
}));
