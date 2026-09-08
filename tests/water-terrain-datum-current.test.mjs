import test from 'node:test';
import assert from 'node:assert/strict';
import {waterTerrainBedY} from '../app/js/terrain/water-terrain-mask.js';
import {normalizeWaterBody} from '../app/js/world/water-body-contract.js';
import {sampleWaterPolygonInteriorHeights} from '../app/js/world/load-landuse-pass.js';
test('partly loaded inland water excludes unavailable samples rather than inventing ocean datum',()=>{
 const ring=[{x:0,z:0},{x:7,z:0},{x:7,z:7},{x:0,z:7}];
 const samples=sampleWaterPolygonInteriorHeights({elevationWorldYAtWorldXZ:x=>x<4?null:965},ring,[],{minX:0,maxX:7,minZ:0,maxZ:7});
 assert.equal(samples.length,18);assert.ok(samples.every(value=>value===965));
});
test('mountain river uses varying profile rather than coercing null to sea level',()=>{
 const river=normalizeWaterBody({shape:'waterway',surfaceY:null,pts:[{x:0,z:0},{x:10,z:0}],surfaceProfile:[{x:0,z:0,y:1000},{x:10,z:0,y:1010}]});
 const sample=(profile,x)=>profile[0].y+x;
 assert.equal(waterTerrainBedY(river,5,0,1005,20,sample),1004.4);
 assert.equal(waterTerrainBedY(river,5,0,1005,0,sample),1005);
 assert.ok(waterTerrainBedY(river,5,0,1005,20,()=>null)>1004);
});
test('known sea-level and inland lake surfaces retain their datum and never raise terrain',()=>{
 assert.equal(waterTerrainBedY({surfaceY:0},0,0,2,20),-.6);
 assert.equal(waterTerrainBedY({surfaceY:1500},0,0,1501,20),1499.4);
 assert.equal(waterTerrainBedY({surfaceY:1500},0,0,1480,20),1480);
});
