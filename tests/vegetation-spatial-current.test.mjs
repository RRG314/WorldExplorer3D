import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyVegetationCells,semanticForestWeightAt,vegetationIdentitySeed,terrainForestAttributeWeight} from '../app/js/world/vegetation-spatial.js';
test('Three r128 normalized byte attributes are read as fractions, not 0..255 density',()=>{
 const attribute={array:new Uint8Array([0,0,128,0]),itemSize:4,normalized:true};
 assert.equal(terrainForestAttributeWeight(attribute,0),128/255);
});
test('large mapped forest spends bounded placement budget near the player, without duplicate cells',()=>{
 const cells=[...nearbyVegetationCells({minX:-100000,maxX:100000,minZ:-100000,maxZ:100000},20,180)];
 assert.equal(cells.length,180);
 assert.equal(new Set(cells.map(p=>`${p.cx}:${p.cz}`)).size,180);
 assert.ok(cells.every(p=>Math.hypot(p.cx,p.cz)*20<250));
 assert.equal(vegetationIdentitySeed('osm:way:123'),vegetationIdentitySeed('osm:way:123'));
});
test('jittered points must still be supported by the accepted forest field',()=>{
 const mesh={position:{x:100,z:100},geometry:{parameters:{width:20,height:20,widthSegments:1,heightSegments:1},attributes:{terrainSurfaceMixA:{count:4,getZ:i=>[1,0,1,0][i]}}}};
 assert.equal(semanticForestWeightAt(mesh,90,100),1);
 assert.equal(semanticForestWeightAt(mesh,110,100),0);
 assert.equal(semanticForestWeightAt(mesh,130,100),0);
 assert.equal(semanticForestWeightAt(mesh,100,100),.5);
});
