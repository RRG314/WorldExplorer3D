import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyVegetationObstacles,prepareVegetationObstacleIndex,publishVegetationObstacleIndex} from '../app/js/world/vegetation-obstacle-index.js';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {pointInPolygon} from '../app/js/world/navigation.js';
test('nearby trunks join existing collision authority without buildings, obey height and clear on replacement',()=>{
 const ctx={vegetationFeatures:[{x:0,z:0,baseY:2,scale:1}],pointInPolygon};
 const query=createBuildingCollisionQuery(ctx);
 assert.equal(query(0,0,1,{actorBaseY:2}).collision,true);
 assert.equal(query(0,0,1,{actorBaseY:20}).collision,false);
 assert.equal(query(2,0,.2,{actorBaseY:2}).collision,false);
 assert.equal(query(.5,0,.2,{actorBaseY:2}).collision,true);
 assert.equal(nearbyVegetationObstacles(ctx,10000,10000).length,0);
 ctx.vegetationFeatures=[];assert.equal(query(0,0).collision,false);
});
test('earth trunks do not leak into space or planetary movement',()=>{
 const ctx={vegetationFeatures:[{x:0,z:0,baseY:0}],ENV:{EARTH:'earth'},isEnv:()=>false};
 assert.equal(nearbyVegetationObstacles(ctx,0,0).length,0);
});

test('staged trunk index preserves contacts and removes index construction from the first movement query',async()=>{
 const features=Array.from({length:200},(_,i)=>({x:i*2,z:0,scale:1}));
 let samples=0,yields=0;
 const ctx={vegetationFeatures:[],terrainMeshHeightAt:()=>{samples++;return 3;}};
 const index=await prepareVegetationObstacleIndex(ctx,features,{budgetMs:0,yieldWork:async()=>{yields++;}});
 assert.equal(samples,200);assert.ok(yields>=200);
 assert.equal(nearbyVegetationObstacles(ctx,0,0).length,0);
 assert.throws(()=>publishVegetationObstacleIndex(ctx,index),/match/);
 ctx.vegetationFeatures=features;publishVegetationObstacleIndex(ctx,index);
 const expected=nearbyVegetationObstacles({...ctx},0,0);
 samples=0;const actual=nearbyVegetationObstacles(ctx,0,0);
 assert.deepEqual(actual,expected);assert.equal(samples,0);
});
